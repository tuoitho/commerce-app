//go:build integration

package repository

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"

	"commerce-backend/internal/domain"
)

const (
	favUserA        = "11111111-2222-3333-4444-555555555551"
	favUserB        = "11111111-2222-3333-4444-555555555552"
	favCategory     = "10000000-0000-0000-0000-000000000001"
	favProductA     = "aaaaaaaa-1111-1111-1111-111111111111"
	favProductB     = "bbbbbbbb-2222-2222-2222-222222222222"
	favProductC     = "cccccccc-3333-3333-3333-333333333333"
	favVariantA1    = "aaaaaaaa-1111-1111-1111-111111111112"
	favVariantA2    = "aaaaaaaa-1111-1111-1111-111111111113"
	favVariantB1    = "bbbbbbbb-2222-2222-2222-222222222223"
	favVariantC1    = "cccccccc-3333-3333-3333-333333333334"
	favImageA       = "aaaaaaaa-1111-1111-1111-111111111114"
)

func TestFavoriteRepositoryIntegration(t *testing.T) {
	ctx := context.Background()
	container, err := postgres.Run(ctx, "postgres:17.6-alpine", postgres.WithDatabase("commerce"), postgres.WithUsername("commerce"), postgres.WithPassword("commerce"))
	if err != nil {
		t.Fatalf("Docker/Testcontainers is required: %v", err)
	}
	t.Cleanup(func() {
		if err := testcontainers.TerminateContainer(container); err != nil {
			t.Errorf("terminate container: %v", err)
		}
	})
	dbURL, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	conn := connectIntegrationDB(t, ctx, dbURL)
	defer conn.Close(ctx)

	for _, m := range []string{
		"000001_create_users.up.sql",
		"000002_create_catalog.up.sql",
		"000003_phone_variants_cart.up.sql",
		"000004_int64_stock_quantity.up.sql",
		"000005_add_user_roles.up.sql",
		"000006_add_brand_to_products.up.sql",
		"000007_soft_delete_variant_integrity.up.sql",
		"000008_category_admin_index.up.sql",
		"000009_order_placement.up.sql",
		"000010_order_returns.up.sql",
		"000011_create_product_favorites.up.sql",
	} {
		applyMigration(t, ctx, conn, m)
	}

	seedPath := filepath.Join("..", "..", "db", "seed", "catalog.sql")
	seedCatalog(t, ctx, conn, seedPath)

	// Seed test users, products, variants
	if _, err := conn.Exec(ctx, `
		INSERT INTO users(id, email, password_hash) VALUES
			($1, 'fav-user-a@example.com', 'hash'),
			($2, 'fav-user-b@example.com', 'hash');

		INSERT INTO products(id, category_id, name, model, brand, price, currency, active) VALUES
			($3, $6, 'Galaxy S24', 'SM-S921B', 'Samsung', 20000000, 'VND', true),
			($4, $6, 'iPhone 15', 'A3090', 'Apple', 22000000, 'VND', true),
			($5, $6, 'Pixel 8', 'G9BQD', 'Google', 18000000, 'VND', true);

		INSERT INTO product_images(id, product_id, url, position) VALUES
			($7, $3, 'https://example.com/s24.jpg', 0);

		INSERT INTO product_variants(id, product_id, price_vnd, stock_quantity, active) VALUES
			($8, $3, 20000000, 10, true),
			($9, $3, 23000000, 5, true),
			($10, $4, 22000000, 0, true),
			($11, $5, 18000000, 8, true);
	`, favUserA, favUserB, favProductA, favProductB, favProductC, favCategory, favImageA, favVariantA1, favVariantA2, favVariantB1, favVariantC1); err != nil {
		t.Fatalf("seed favorite test data: %v", err)
	}

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	repo := NewFavoriteRepository(pool)

	t.Run("empty list returns non-nil empty slice", func(t *testing.T) {
		items, err := repo.List(ctx, favUserA)
		if err != nil {
			t.Fatalf("List error = %v", err)
		}
		if items == nil || len(items) != 0 {
			t.Fatalf("expected empty slice []domain.FavoriteProduct{}, got %v", items)
		}
	})

	t.Run("add valid public product projects live fields and returns collection", func(t *testing.T) {
		items, err := repo.Add(ctx, favUserA, favProductA)
		if err != nil {
			t.Fatalf("Add error = %v", err)
		}
		if len(items) != 1 {
			t.Fatalf("expected 1 item, got %d", len(items))
		}
		fav := items[0]
		if fav.ID != favProductA || fav.Name != "Galaxy S24" || fav.Model != "SM-S921B" || fav.Brand != "Samsung" {
			t.Errorf("unexpected product fields: %+v", fav)
		}
		if fav.Category.ID != favCategory || fav.Category.Name != "Điện thoại" {
			t.Errorf("unexpected category: %+v", fav.Category)
		}
		if fav.PrimaryImageURL != "https://example.com/s24.jpg" {
			t.Errorf("unexpected image URL: %q", fav.PrimaryImageURL)
		}
		if fav.Availability != domain.FavoriteActive {
			t.Errorf("unexpected availability: %q", fav.Availability)
		}
		if fav.MinPriceVND == nil || *fav.MinPriceVND != "20000000" {
			t.Errorf("unexpected min price: %v", fav.MinPriceVND)
		}
		if fav.MaxPriceVND == nil || *fav.MaxPriceVND != "23000000" {
			t.Errorf("unexpected max price: %v", fav.MaxPriceVND)
		}
		if fav.InStock == nil || *fav.InStock != true {
			t.Errorf("unexpected inStock: %v", fav.InStock)
		}
	})

	t.Run("add multiple products maintains favorited_at DESC ordering", func(t *testing.T) {
		time.Sleep(10 * time.Millisecond)
		items, err := repo.Add(ctx, favUserA, favProductB)
		if err != nil {
			t.Fatalf("Add error = %v", err)
		}
		if len(items) != 2 {
			t.Fatalf("expected 2 items, got %d", len(items))
		}
		// Most recently favorited first
		if items[0].ID != favProductB || items[1].ID != favProductA {
			t.Fatalf("expected order [%s, %s], got [%s, %s]", favProductB, favProductA, items[0].ID, items[1].ID)
		}
		// Product B has active variant with stock 0 -> InStock should be false, Availability active
		if items[0].Availability != domain.FavoriteActive || items[0].InStock == nil || *items[0].InStock != false {
			t.Errorf("out-of-stock product should be active with inStock=false, got %+v", items[0])
		}
	})

	t.Run("duplicate add is idempotent and does not change ordering", func(t *testing.T) {
		time.Sleep(10 * time.Millisecond)
		items, err := repo.Add(ctx, favUserA, favProductA) // already favorited
		if err != nil {
			t.Fatalf("Add duplicate error = %v", err)
		}
		if len(items) != 2 {
			t.Fatalf("expected 2 items, got %d", len(items))
		}
		// Product B should still be first because Product A's timestamp was not updated
		if items[0].ID != favProductB || items[1].ID != favProductA {
			t.Fatalf("duplicate add changed order: [%s, %s]", items[0].ID, items[1].ID)
		}
	})

	t.Run("add non-existent or non-public product returns ErrProductNotFound", func(t *testing.T) {
		// Non-existent product
		_, err := repo.Add(ctx, favUserA, "99999999-9999-9999-9999-999999999999")
		if err != domain.ErrProductNotFound {
			t.Errorf("expected ErrProductNotFound for non-existent product, got %v", err)
		}

		// Inactive product
		if _, err := conn.Exec(ctx, `INSERT INTO products(id, category_id, name, model, brand, price, currency, active) VALUES ('eeeeeeee-4444-4444-4444-444444444444', $1, 'Inactive', 'M', 'B', 100, 'VND', false)`, favCategory); err != nil {
			t.Fatal(err)
		}
		if _, err := conn.Exec(ctx, `INSERT INTO product_variants(id, product_id, price_vnd, stock_quantity, active) VALUES ('eeeeeeee-4444-4444-4444-444444444445', 'eeeeeeee-4444-4444-4444-444444444444', 100, 5, true)`); err != nil {
			t.Fatal(err)
		}
		_, err = repo.Add(ctx, favUserA, "eeeeeeee-4444-4444-4444-444444444444")
		if err != domain.ErrProductNotFound {
			t.Errorf("expected ErrProductNotFound for inactive product, got %v", err)
		}

		// Product with 0 active variants
		if _, err := conn.Exec(ctx, `INSERT INTO products(id, category_id, name, model, brand, price, currency, active) VALUES ('ffffffff-5555-5555-5555-555555555555', $1, 'No Variant', 'M', 'B', 100, 'VND', true)`, favCategory); err != nil {
			t.Fatal(err)
		}
		if _, err := conn.Exec(ctx, `INSERT INTO product_variants(id, product_id, price_vnd, stock_quantity, active) VALUES ('ffffffff-5555-5555-5555-555555555556', 'ffffffff-5555-5555-5555-555555555555', 100, 5, false)`); err != nil {
			t.Fatal(err)
		}
		_, err = repo.Add(ctx, favUserA, "ffffffff-5555-5555-5555-555555555555")
		if err != domain.ErrProductNotFound {
			t.Errorf("expected ErrProductNotFound for product with 0 active variants, got %v", err)
		}
	})

	t.Run("absent remove is idempotent and returns current list", func(t *testing.T) {
		items, err := repo.Remove(ctx, favUserA, favProductC) // not in favorites
		if err != nil {
			t.Fatalf("Remove absent error = %v", err)
		}
		if len(items) != 2 {
			t.Fatalf("expected 2 items, got %d", len(items))
		}
	})

	t.Run("remove existing favorite removes relation and returns updated list", func(t *testing.T) {
		items, err := repo.Remove(ctx, favUserA, favProductB)
		if err != nil {
			t.Fatalf("Remove error = %v", err)
		}
		if len(items) != 1 || items[0].ID != favProductA {
			t.Fatalf("expected [favProductA], got %v", items)
		}
	})

	t.Run("user isolation", func(t *testing.T) {
		// User B list is empty
		itemsB, err := repo.List(ctx, favUserB)
		if err != nil || len(itemsB) != 0 {
			t.Fatalf("User B should have 0 items, got %v err=%v", itemsB, err)
		}
		// User B adds Product C
		itemsB, err = repo.Add(ctx, favUserB, favProductC)
		if err != nil || len(itemsB) != 1 {
			t.Fatalf("User B Add error=%v, items=%v", err, itemsB)
		}
		// User A still has only Product A
		itemsA, err := repo.List(ctx, favUserA)
		if err != nil || len(itemsA) != 1 || itemsA[0].ID != favProductA {
			t.Fatalf("User A affected by User B: %v", itemsA)
		}
	})

	t.Run("live projection, soft-delete, and variant deactivation", func(t *testing.T) {
		// Add Product C to User A as well
		_, err := repo.Add(ctx, favUserA, favProductC)
		if err != nil {
			t.Fatal(err)
		}

		// Update Product C name and price live in catalog tables
		if _, err := conn.Exec(ctx, `UPDATE products SET name='Pixel 8 Pro' WHERE id=$1`, favProductC); err != nil {
			t.Fatal(err)
		}
		if _, err := conn.Exec(ctx, `UPDATE product_variants SET price_vnd=19500000 WHERE id=$1`, favVariantC1); err != nil {
			t.Fatal(err)
		}

		items, err := repo.List(ctx, favUserA)
		if err != nil {
			t.Fatal(err)
		}
		var favC *domain.FavoriteProduct
		for _, it := range items {
			if it.ID == favProductC {
				c := it
				favC = &c
			}
		}
		if favC == nil || favC.Name != "Pixel 8 Pro" || favC.MinPriceVND == nil || *favC.MinPriceVND != "19500000" {
			t.Fatalf("live projection failed: %+v", favC)
		}

		// Soft-delete Product C
		if _, err := conn.Exec(ctx, `UPDATE products SET active=false WHERE id=$1`, favProductC); err != nil {
			t.Fatal(err)
		}

		items, err = repo.List(ctx, favUserA)
		if err != nil {
			t.Fatal(err)
		}
		favC = nil
		for _, it := range items {
			if it.ID == favProductC {
				c := it
				favC = &c
			}
		}
		if favC == nil || favC.Availability != domain.FavoriteDeleted || favC.MinPriceVND != nil || favC.MaxPriceVND != nil || favC.InStock != nil {
			t.Fatalf("soft-deleted projection failed: %+v", favC)
		}

		// Deactivate all variants of Product A
		if _, err := conn.Exec(ctx, `UPDATE product_variants SET active=false WHERE product_id=$1`, favProductA); err != nil {
			t.Fatal(err)
		}

		items, err = repo.List(ctx, favUserA)
		if err != nil {
			t.Fatal(err)
		}
		var favA *domain.FavoriteProduct
		for _, it := range items {
			if it.ID == favProductA {
				a := it
				favA = &a
			}
		}
		if favA == nil || favA.Availability != domain.FavoriteUnavailable || favA.MinPriceVND != nil || favA.MaxPriceVND != nil || favA.InStock != nil {
			t.Fatalf("unavailable projection failed: %+v", favA)
		}
	})

	t.Run("cascade on user and product hard delete", func(t *testing.T) {
		// Hard delete User B
		if _, err := conn.Exec(ctx, `DELETE FROM users WHERE id=$1`, favUserB); err != nil {
			t.Fatal(err)
		}
		var count int
		if err := conn.QueryRow(ctx, `SELECT count(*) FROM product_favorites WHERE user_id=$1`, favUserB).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 0 {
			t.Fatalf("user deletion did not cascade favorite rows, count=%d", count)
		}

		// Hard delete Product C
		if _, err := conn.Exec(ctx, `DELETE FROM product_variants WHERE product_id=$1; DELETE FROM products WHERE id=$1`, favProductC); err != nil {
			t.Fatal(err)
		}
		if err := conn.QueryRow(ctx, `SELECT count(*) FROM product_favorites WHERE product_id=$1`, favProductC).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 0 {
			t.Fatalf("product hard deletion did not cascade favorite rows, count=%d", count)
		}
	})

	t.Run("down and up migration", func(t *testing.T) {
		applyMigration(t, ctx, conn, "000011_create_product_favorites.down.sql")
		var tableExists bool
		if err := conn.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='product_favorites')`).Scan(&tableExists); err != nil {
			t.Fatal(err)
		}
		if tableExists {
			t.Fatal("down migration did not drop product_favorites table")
		}
		applyMigration(t, ctx, conn, "000011_create_product_favorites.up.sql")
		if err := conn.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='product_favorites')`).Scan(&tableExists); err != nil {
			t.Fatal(err)
		}
		if !tableExists {
			t.Fatal("up migration did not recreate product_favorites table")
		}
	})
}
