//go:build integration

package repository

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
)

// DB-CATALOG-DISCOVERY@1: migration 000026 up -> down -> up round-trip, f_unaccent, specs constraint,
// flash_sales EXCLUDE USING gist overlap constraint, and flash sale views.
func TestCatalogDiscovery_Migration000026RoundTripAndConstraints(t *testing.T) {
	ctx := context.Background()
	conn, _ := startAuthRecoveryIntegrationDB(t)

	// Verify objects exist after up migration
	var specsColExists bool
	require.NoError(t, conn.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'specs'
		)
	`).Scan(&specsColExists))
	require.True(t, specsColExists, "products.specs must exist after up migration")

	var fsExists bool
	require.NoError(t, conn.QueryRow(ctx, `SELECT to_regclass('public.flash_sales') IS NOT NULL`).Scan(&fsExists))
	require.True(t, fsExists, "flash_sales must exist after up migration")

	// Roll back 000027 first because 000027 adds order_items.flash_sale_id referencing flash_sales(id),
	// then run 000026 down migration to verify all 000026 objects are removed cleanly.
	execMigrationFile(t, ctx, conn, "000027_vouchers_shipping_timeline.down.sql")
	execMigrationFile(t, ctx, conn, "000026_catalog_specs_search_flash_sales.down.sql")
	require.NoError(t, conn.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'specs'
		)
	`).Scan(&specsColExists))
	require.False(t, specsColExists, "products.specs must be removed after down migration")
	require.NoError(t, conn.QueryRow(ctx, `SELECT to_regclass('public.flash_sales') IS NOT NULL`).Scan(&fsExists))
	require.False(t, fsExists, "flash_sales must be removed after down migration")

	// Re-apply 000026 and 000027 up migrations
	execMigrationFile(t, ctx, conn, "000026_catalog_specs_search_flash_sales.up.sql")
	execMigrationFile(t, ctx, conn, "000027_vouchers_shipping_timeline.up.sql")
	require.NoError(t, conn.QueryRow(ctx, `SELECT to_regclass('public.flash_sale_active_variant_prices') IS NOT NULL`).Scan(&fsExists))
	require.True(t, fsExists, "flash_sale_active_variant_prices view must exist after re-applying up migration")

	// Verify f_unaccent handles Vietnamese tones and đ/Đ
	var folded string
	require.NoError(t, conn.QueryRow(ctx, `SELECT f_unaccent('Điện Thoại Đặc Biệt Đỉnh Cao')`).Scan(&folded))
	assert.Equal(t, "dien thoai dac biet dinh cao", folded)

	// Verify products_specs_array_check rejects non-array JSON
	catID := uuid.NewString()
	_, err := conn.Exec(ctx, `INSERT INTO categories (id, name) VALUES ($1, 'Test Spec Cat')`, catID)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `INSERT INTO products (category_id, name, price, currency, specs) VALUES ($1, 'Bad Specs', 1000, 'VND', '{}'::jsonb)`, catID)
	require.Error(t, err, "object specs must violate products_specs_array_check")

	// Verify flash_sales EXCLUDE USING gist prevents overlapping active campaigns
	now := time.Now().UTC().Truncate(time.Second)
	fs1 := uuid.NewString()
	_, err = conn.Exec(ctx, `
		INSERT INTO flash_sales (id, name, starts_at, ends_at, active)
		VALUES ($1, 'FS Active 1', $2, $3, true)
	`, fs1, now.Add(-1*time.Hour), now.Add(2*time.Hour))
	require.NoError(t, err)

	// Overlapping active campaign must fail
	_, err = conn.Exec(ctx, `
		INSERT INTO flash_sales (name, starts_at, ends_at, active)
		VALUES ('FS Overlap', $1, $2, true)
	`, now, now.Add(3*time.Hour))
	require.Error(t, err, "overlapping active flash sale must violate EXCLUDE USING gist")

	// Adjacent [ends_at, ...) active campaign succeeds
	_, err = conn.Exec(ctx, `
		INSERT INTO flash_sales (name, starts_at, ends_at, active)
		VALUES ('FS Adjacent', $1, $2, true)
	`, now.Add(2*time.Hour), now.Add(4*time.Hour))
	require.NoError(t, err)

	// Overlapping inactive campaign succeeds
	_, err = conn.Exec(ctx, `
		INSERT INTO flash_sales (name, starts_at, ends_at, active)
		VALUES ('FS Inactive Overlap', $1, $2, false)
	`, now, now.Add(3*time.Hour))
	require.NoError(t, err)

	// Verify flash_sale_running_variants vs flash_sale_active_variant_prices
	prodID := uuid.NewString()
	vAvail := uuid.NewString()
	vSoldOut := uuid.NewString()
	vNotDiscounted := uuid.NewString()
	_, err = conn.Exec(ctx, `INSERT INTO products (id, category_id, name, price, currency, active) VALUES ($1, $2, 'FS Phone', 20000000, 'VND', true)`, prodID, catID)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `
		INSERT INTO product_variants (id, product_id, price_vnd, stock_quantity, active) VALUES
		($1, $4, 20000000, 10, true),
		($2, $4, 20000000, 10, true),
		($3, $4, 20000000, 10, true)
	`, vAvail, vSoldOut, vNotDiscounted, prodID)
	require.NoError(t, err)

	_, err = conn.Exec(ctx, `
		INSERT INTO flash_sale_items (flash_sale_id, product_id, variant_id, flash_price_vnd, quota, sold_quantity, position) VALUES
		($1, $2, $3, 15000000, 10, 3, 0),
		($1, $2, $4, 15000000, 5, 5, 1),
		($1, $2, $5, 20000000, 5, 0, 2)
	`, fs1, prodID, vAvail, vSoldOut, vNotDiscounted)
	require.NoError(t, err)

	var runningCount, activePriceCount int
	require.NoError(t, conn.QueryRow(ctx, `SELECT COUNT(*) FROM flash_sale_running_variants WHERE product_id = $1`, prodID).Scan(&runningCount))
	require.NoError(t, conn.QueryRow(ctx, `SELECT COUNT(*) FROM flash_sale_active_variant_prices WHERE product_id = $1`, prodID).Scan(&activePriceCount))
	assert.Equal(t, 2, runningCount, "running variants includes sold-out item (excluding non-discounted)")
	assert.Equal(t, 1, activePriceCount, "active variant prices excludes sold-out item")
}

// Requirements 2.5, 5.1, 6.1, 6.2, 6.3: real PostgreSQL queries for Vietnamese unaccented/trigram search,
// server-side sorting, min_rating filter, stats aggregation, specs round-trip, and variant flashSale mapping.
func TestCatalogDiscovery_SearchSortMinRatingSpecsFlashSale(t *testing.T) {
	ctx, tx := beginUserAdminTx(t)
	repo := NewCatalogRepository(tx)

	catID := uuid.NewString()
	_, err := tx.Exec(ctx, `INSERT INTO categories (id, name) VALUES ($1, 'Điện thoại Đặc biệt')`, catID)
	require.NoError(t, err)

	userID := uuid.NewString()
	_, err = tx.Exec(ctx, `INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, 'hash', 'customer')`, userID, uniqueEmailToken()+"@test.local")
	require.NoError(t, err)

	t1 := time.Date(2026, 11, 1, 10, 0, 0, 0, time.UTC)
	t2 := time.Date(2026, 11, 2, 10, 0, 0, 0, time.UTC)
	t3 := time.Date(2026, 11, 3, 10, 0, 0, 0, time.UTC)

	p1 := uuid.NewString() // Alpha: price 20M, sold 30, avg 4.0 (1 review)
	p2 := uuid.NewString() // Beta Đặc Biệt: price 10M, sold 100, avg 4.7 (3 reviews: 5, 5, 4 -> 4.7)
	p3 := uuid.NewString() // Gamma Mới: price 30M, sold 0, 0 reviews, newest

	v1 := uuid.NewString()
	v2 := uuid.NewString()
	v2SoldOut := uuid.NewString()
	v3 := uuid.NewString()

	specsP2 := `[{"group":"Màn hình","items":[{"label":"Kích thước","value":"6.7 inch OLED"}]},{"group":"Pin & Sạc","items":[{"label":"Dung lượng","value":"5000 mAh"}]}]`

	_, err = tx.Exec(ctx, `
		INSERT INTO products (id, category_id, name, model, brand, description, price, currency, stock_quantity, featured, specs, active, created_at, updated_at) VALUES
		($1, $4, 'Alpha Đỉnh', 'AL-100', 'Apple', '', 20000000, 'VND', 10, true, '[]'::jsonb, true, $5, $5),
		($2, $4, 'Beta Đặc Biệt', 'BT-200', 'Samsung', '', 10000000, 'VND', 15, false, $8::jsonb, true, $6, $6),
		($3, $4, 'Gamma Mới Nhất', 'GM-300', 'Xiaomi', '', 30000000, 'VND', 5, false, '[]'::jsonb, true, $7, $7)
	`, p1, p2, p3, catID, t1, t2, t3, specsP2)
	require.NoError(t, err)

	_, err = tx.Exec(ctx, `
		INSERT INTO product_variants (id, product_id, price_vnd, stock_quantity, active) VALUES
		($1, $5, 20000000, 10, true),
		($2, $6, 10000000, 10, true),
		($3, $6, 12000000, 5, true),
		($4, $7, 30000000, 5, true)
	`, v1, v2, v2SoldOut, v3, p1, p2, p3)
	require.NoError(t, err)

	// Orders for sold_count: delivered (counted), partially_returned (counted), cancelled/returned (NOT counted)
	ordDelivered := uuid.NewString()
	ordPartialRet := uuid.NewString()
	ordCancelled := uuid.NewString()
	ordReturned := uuid.NewString()
	_, err = tx.Exec(ctx, `
		INSERT INTO orders (id, user_id, status, payment_method, subtotal_vnd, shipping_fee_vnd, total_vnd, recipient_name, phone, province_name, ward_name, detail_address) VALUES
		($1, $5, 'delivered', 'cod', 1000, 0, 1000, 'A', '0900000001', 'HN', 'Ba Dinh', '1'),
		($2, $5, 'partially_returned', 'cod', 1000, 0, 1000, 'A', '0900000001', 'HN', 'Ba Dinh', '1'),
		($3, $5, 'cancelled', 'cod', 1000, 0, 1000, 'A', '0900000001', 'HN', 'Ba Dinh', '1'),
		($4, $5, 'returned', 'cod', 1000, 0, 1000, 'A', '0900000001', 'HN', 'Ba Dinh', '1')
	`, ordDelivered, ordPartialRet, ordCancelled, ordReturned, userID)
	require.NoError(t, err)

	oi1 := uuid.NewString()
	oi2a := uuid.NewString()
	oi2b := uuid.NewString()
	oi2c := uuid.NewString()
	oiCancel := uuid.NewString()
	oiRet := uuid.NewString()
	_, err = tx.Exec(ctx, `
		INSERT INTO order_items (id, order_id, variant_id, product_id, brand_name, product_name, unit_price_vnd, quantity, line_total_vnd) VALUES
		($1, $7, $11, $13, 'Apple', 'Alpha Đỉnh', 20000000, 30, 600000000),
		($2, $7, $12, $14, 'Samsung', 'Beta Đặc Biệt', 10000000, 60, 600000000),
		($3, $8, $12, $14, 'Samsung', 'Beta Đặc Biệt', 10000000, 40, 400000000),
		($4, $7, $12, $14, 'Samsung', 'Beta Đặc Biệt', 10000000, 0 + 1, 10000000),
		($5, $9, $11, $13, 'Apple', 'Alpha Đỉnh', 20000000, 999, 1000000),
		($6, $10, $15, $16, 'Xiaomi', 'Gamma Mới Nhất', 30000000, 500, 1000000)
	`, oi1, oi2a, oi2b, oi2c, oiCancel, oiRet, ordDelivered, ordPartialRet, ordCancelled, ordReturned, v1, v2, p1, p2, v3, p3)
	require.NoError(t, err)

	// Normalize oi2a quantity back to 59 so total for p2 = 59 + 40 + 1 = 100
	_, err = tx.Exec(ctx, `UPDATE order_items SET quantity = 59 WHERE id = $1`, oi2a)
	require.NoError(t, err)

	// Reviews: p1 gets [4] -> avg 4.0 (1 review); p2 gets [5, 5, 4] -> avg 4.7 (3 reviews)
	_, err = tx.Exec(ctx, `
		INSERT INTO product_reviews (order_item_id, rating, comment) VALUES
		($1, 4, 'Tot'),
		($2, 5, 'Xuat sac'),
		($3, 5, 'Rat tot'),
		($4, 4, 'On')
	`, oi1, oi2a, oi2b, oi2c)
	require.NoError(t, err)

	t.Run("Vietnamese unaccented and trigram search", func(t *testing.T) {
		// Category "Điện thoại Đặc biệt" matched with unaccented "dien thoai" and accented "điện thoại"
		for _, q := range []string{"dien thoai", "điện thoại", "dac biet"} {
			res, err := repo.ListProducts(ctx, domain.ProductFilter{CategoryIDs: []string{catID}, Query: q})
			require.NoError(t, err)
			if q == "dac biet" {
				// All 3 belong to "Điện thoại Đặc biệt" category!
				require.Len(t, res, 3)
			} else {
				require.Len(t, res, 3)
			}
		}

		// đ -> d on product name "Alpha Đỉnh"
		resDinh, err := repo.ListProducts(ctx, domain.ProductFilter{CategoryIDs: []string{catID}, Query: "dinh"})
		require.NoError(t, err)
		require.Len(t, resDinh, 1)
		assert.Equal(t, p1, resDinh[0].ID)

		// Trigram word_similarity fuzzy match ("samsug" -> "Samsung")
		resTypo, err := repo.ListProducts(ctx, domain.ProductFilter{CategoryIDs: []string{catID}, Query: "samsug"})
		require.NoError(t, err)
		require.Len(t, resTypo, 1)
		assert.Equal(t, p2, resTypo[0].ID)
	})

	t.Run("stats aggregation and min_rating filter", func(t *testing.T) {
		res, err := repo.ListProducts(ctx, domain.ProductFilter{CategoryIDs: []string{catID}})
		require.NoError(t, err)
		require.Len(t, res, 3)
		// Default order: p1, p2, p3 alphabetically
		assert.Equal(t, 4.0, res[0].AverageRating)
		assert.Equal(t, int64(1), res[0].ReviewCount)
		assert.Equal(t, int64(30), res[0].SoldCount)

		assert.Equal(t, 4.7, res[1].AverageRating)
		assert.Equal(t, int64(3), res[1].ReviewCount)
		assert.Equal(t, int64(100), res[1].SoldCount)

		assert.Equal(t, 0.0, res[2].AverageRating)
		assert.Equal(t, int64(0), res[2].ReviewCount)
		assert.Equal(t, int64(0), res[2].SoldCount)

		min45 := 4.5
		filtered, err := repo.ListProducts(ctx, domain.ProductFilter{CategoryIDs: []string{catID}, MinRating: &min45})
		require.NoError(t, err)
		require.Len(t, filtered, 1)
		assert.Equal(t, p2, filtered[0].ID)
	})

	t.Run("server-side sort modes", func(t *testing.T) {
		checkSort := func(mode domain.ProductSort, wantIDs []string) {
			t.Helper()
			got, err := repo.ListProducts(ctx, domain.ProductFilter{CategoryIDs: []string{catID}, Sort: mode})
			require.NoError(t, err)
			require.Len(t, got, len(wantIDs))
			for i, w := range wantIDs {
				assert.Equal(t, w, got[i].ID, "sort=%q pos=%d", mode, i)
			}
		}
		checkSort(domain.ProductSortDefault, []string{p1, p2, p3})
		checkSort(domain.ProductSortBestselling, []string{p2, p1, p3})
		checkSort(domain.ProductSortNewest, []string{p3, p2, p1})
		checkSort(domain.ProductSortPriceAsc, []string{p2, p1, p3})
		checkSort(domain.ProductSortPriceDesc, []string{p3, p1, p2})
		checkSort(domain.ProductSortRatingDesc, []string{p2, p1, p3})
	})

	t.Run("specs round-trip and variant flashSale mapping", func(t *testing.T) {
		// Create + Get + Update specs round-trip
		created, err := repo.CreateProduct(ctx, domain.SaveProductInput{
			Name:          "Specs Phone",
			Model:         "SP-1",
			Brand:         "Aura",
			CategoryID:    catID,
			Price:         "15000000",
			StockQuantity: 7,
			Specs: []domain.SpecGroup{
				{Group: "Màn hình", Items: []domain.SpecItem{{Label: "Tấm nền", Value: "AMOLED 120Hz"}}},
			},
		})
		require.NoError(t, err)
		require.Len(t, created.Specs, 1)
		assert.Equal(t, "AMOLED 120Hz", created.Specs[0].Items[0].Value)

		updated, err := repo.UpdateProduct(ctx, created.ID, domain.SaveProductInput{
			Name:          "Specs Phone",
			Model:         "SP-1",
			Brand:         "Aura",
			CategoryID:    catID,
			Price:         "14000000",
			StockQuantity: 6,
			Specs: []domain.SpecGroup{
				{Group: "Pin & Sạc", Items: []domain.SpecItem{{Label: "Dung lượng", Value: "5500 mAh"}}},
			},
		})
		require.NoError(t, err)
		require.Len(t, updated.Specs, 1)
		assert.Equal(t, "Pin & Sạc", updated.Specs[0].Group)

		// Add running flash sale on p2 (v2 has remaining quota; v2SoldOut is at quota=sold_quantity)
		// Clear any overlapping pre-existing active flash sales in tx first
		_, err = tx.Exec(ctx, `UPDATE flash_sales SET active = false WHERE active = true`)
		require.NoError(t, err)
		fsID := uuid.NewString()
		endsAt := time.Now().UTC().Add(2 * time.Hour).Truncate(time.Second)
		_, err = tx.Exec(ctx, `
			INSERT INTO flash_sales (id, name, starts_at, ends_at, active)
			VALUES ($1, 'Flash Sale Giờ Vàng', now() - interval '1 hour', $2, true)
		`, fsID, endsAt)
		require.NoError(t, err)
		_, err = tx.Exec(ctx, `
			INSERT INTO flash_sale_items (flash_sale_id, product_id, variant_id, flash_price_vnd, quota, sold_quantity, position) VALUES
			($1, $2, $3, 8500000, 20, 7, 0),
			($1, $2, $4, 9900000, 5, 5, 1)
		`, fsID, p2, v2, v2SoldOut)
		require.NoError(t, err)

		detail, err := repo.GetProductByID(ctx, p2)
		require.NoError(t, err)
		assert.Equal(t, 4.7, detail.AverageRating)
		assert.Equal(t, int64(3), detail.ReviewCount)
		assert.Equal(t, int64(100), detail.SoldCount)
		require.Len(t, detail.Specs, 2)
		assert.Equal(t, "Màn hình", detail.Specs[0].Group)
		require.Len(t, detail.Variants, 2)

		var gotAvail, gotSoldOut *domain.VariantFlashSale
		for _, v := range detail.Variants {
			if v.ID == v2 {
				gotAvail = v.FlashSale
			}
			if v.ID == v2SoldOut {
				gotSoldOut = v.FlashSale
			}
		}
		require.NotNil(t, gotAvail)
		assert.Equal(t, fsID, gotAvail.FlashSaleID)
		assert.Equal(t, "Flash Sale Giờ Vàng", gotAvail.CampaignName)
		assert.Equal(t, domain.MoneyVND("8500000"), gotAvail.FlashPriceVND)
		assert.Equal(t, 20, gotAvail.Quota)
		assert.Equal(t, 7, gotAvail.SoldQuantity)
		assert.True(t, gotAvail.EndsAt.Equal(endsAt))

		require.NotNil(t, gotSoldOut, "sold-out variant in running campaign still exposes flashSale metadata for 'Đã hết suất'")
		assert.Equal(t, 5, gotSoldOut.SoldQuantity)
		assert.Equal(t, 5, gotSoldOut.Quota)
	})
}
