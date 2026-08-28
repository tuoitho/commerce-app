//go:build integration

package repository

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"

	"commerce-backend/internal/domain"
)

const (
	revIntegUserA     = "11111111-1111-1111-1111-111111111111"
	revIntegUserB     = "22222222-2222-2222-2222-222222222222"
	revIntegCategory  = "12000000-0000-0000-0000-000000000001"
	revIntegProduct1  = "13000000-0000-0000-0000-000000000001"
	revIntegProduct2  = "13000000-0000-0000-0000-000000000002"
	revIntegVariant1  = "14000000-0000-0000-0000-000000000001"
	revIntegVariant2  = "14000000-0000-0000-0000-000000000002"
	revIntegOrder1    = "17000000-0000-0000-0000-000000000001"
	revIntegOrder2    = "17000000-0000-0000-0000-000000000002"
	revIntegItem1     = "19000000-0000-0000-0000-000000000001"
	revIntegItem2     = "19000000-0000-0000-0000-000000000002"
	revIntegItem3     = "19000000-0000-0000-0000-000000000003"
	revIntegReview1   = "21000000-0000-0000-0000-000000000001"
	revIntegReview2   = "21000000-0000-0000-0000-000000000002"
	revIntegReview3   = "21000000-0000-0000-0000-000000000003"
)

func TestReviewRepository_OwnerHistory_Integration(t *testing.T) {
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
	for _, migration := range []string{
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
		"000011_product_favorites.up.sql",
		"000012_product_reviews.up.sql",
	} {
		applyMigration(t, ctx, conn, migration)
	}

	// Seed users
	if _, err := conn.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, role) VALUES
		($1, 'user-a@example.com', 'hash', 'customer'),
		($2, 'user-b@example.com', 'hash', 'customer');
	`, revIntegUserA, revIntegUserB); err != nil {
		t.Fatal(err)
	}

	// Seed category & products (Product 1 is active, Product 2 is inactive)
	if _, err := conn.Exec(ctx, `
		INSERT INTO categories (id, name) VALUES ($1, 'Smartphones');
		INSERT INTO products (id, category_id, name, description, price, currency, stock_quantity, active) VALUES
		($2, $1, 'Active Phone', 'Description', 10000000, 'VND', 10, true),
		($3, $1, 'Inactive Phone', 'Description', 12000000, 'VND', 0, false);
		INSERT INTO product_variants (id, product_id, sku, price_vnd, stock_quantity, active) VALUES
		($4, $2, 'SKU-1', 10000000, 10, true),
		($5, $3, 'SKU-2', 12000000, 0, false);
	`, revIntegCategory, revIntegProduct1, revIntegProduct2, revIntegVariant1, revIntegVariant2); err != nil {
		t.Fatal(err)
	}

	// Seed orders & items
	if _, err := conn.Exec(ctx, `
		INSERT INTO orders (id, user_id, status, total_amount_vnd, shipping_address_snapshot) VALUES
		($1, $2, 'delivered', 10000000, '{"street":"123"}'::jsonb),
		($3, $4, 'delivered', 12000000, '{"street":"456"}'::jsonb);

		INSERT INTO order_items (id, order_id, variant_id, product_id, brand_name, product_name, options, unit_price_vnd, quantity, line_total_vnd) VALUES
		($5, $1, $6, $7, 'Brand', 'Purchased Active Phone', '[{"groupLabel":"Color","valueLabel":"Black"}]'::jsonb, 10000000, 1, 10000000),
		($8, $1, $9, $10, 'Brand', 'Purchased Inactive Phone', '[]'::jsonb, 12000000, 1, 12000000),
		($11, $3, $6, $7, 'Brand', 'Purchased Active Phone B', '[]'::jsonb, 10000000, 1, 10000000);
	`, revIntegOrder1, revIntegUserA, revIntegOrder2, revIntegUserB,
		revIntegItem1, revIntegVariant1, revIntegProduct1,
		revIntegItem2, revIntegVariant2, revIntegProduct2,
		revIntegItem3); err != nil {
		t.Fatal(err)
	}

	// Seed reviews (User A has 2 reviews: on Product 1 and Product 2; User B has 1 review on Product 1)
	if _, err := conn.Exec(ctx, `
		INSERT INTO product_reviews (id, order_item_id, user_id, product_id, variant_id, rating, comment, created_at, updated_at) VALUES
		($1, $2, $3, $4, $5, 5, 'Great active phone', '2026-08-28 10:00:00+00', '2026-08-28 10:00:00+00'),
		($6, $7, $3, $8, $9, 4, 'Good inactive phone', '2026-08-28 11:00:00+00', '2026-08-28 11:00:00+00'),
		($10, $11, $12, $4, $5, 3, 'User B review', '2026-08-28 12:00:00+00', '2026-08-28 12:00:00+00');
	`, revIntegReview1, revIntegItem1, revIntegUserA, revIntegProduct1, revIntegVariant1,
		revIntegReview2, revIntegItem2, revIntegUserA, revIntegProduct2, revIntegVariant2,
		revIntegReview3, revIntegItem3, revIntegUserB); err != nil {
		t.Fatal(err)
	}

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	repo := NewReviewRepository(pool)

	t.Run("Owner isolation: User A sees only A's reviews in updated_at DESC order", func(t *testing.T) {
		items, total, err := repo.ListOwnerReviews(ctx, revIntegUserA, 1, 10)
		if err != nil {
			t.Fatal(err)
		}
		if total != 2 {
			t.Fatalf("expected total 2, got %d", total)
		}
		if len(items) != 2 {
			t.Fatalf("expected 2 items, got %d", len(items))
		}
		// First should be Review 2 (updated at 11:00)
		if items[0].Review.ID != revIntegReview2 {
			t.Errorf("expected first item to be review2, got %s", items[0].Review.ID)
		}
		// Second should be Review 1 (updated at 10:00)
		if items[1].Review.ID != revIntegReview1 {
			t.Errorf("expected second item to be review1, got %s", items[1].Review.ID)
		}
	})

	t.Run("Active product has publicPath, inactive product has null publicPath", func(t *testing.T) {
		items, _, err := repo.ListOwnerReviews(ctx, revIntegUserA, 1, 10)
		if err != nil {
			t.Fatal(err)
		}
		// Review 2 is for inactive product2
		if items[0].Product.PublicPath != nil {
			t.Errorf("expected inactive product publicPath to be nil, got %v", *items[0].Product.PublicPath)
		}
		if items[0].Product.Name != "Purchased Inactive Phone" {
			t.Errorf("expected retained name 'Purchased Inactive Phone', got %s", items[0].Product.Name)
		}

		// Review 1 is for active product1
		if items[1].Product.PublicPath == nil || *items[1].Product.PublicPath != "/products/"+revIntegProduct1 {
			t.Errorf("expected active product publicPath '/products/%s', got %v", revIntegProduct1, items[1].Product.PublicPath)
		}
		if items[1].Product.Name != "Purchased Active Phone" {
			t.Errorf("expected retained name 'Purchased Active Phone', got %s", items[1].Product.Name)
		}
	})

	t.Run("Viewer state has isOwner true, canEdit true, remainingEdits 1 before edit", func(t *testing.T) {
		items, _, err := repo.ListOwnerReviews(ctx, revIntegUserA, 1, 10)
		if err != nil {
			t.Fatal(err)
		}
		for _, item := range items {
			if item.Review.Viewer == nil || !item.Review.Viewer.IsOwner || !item.Review.Viewer.CanEdit || item.Review.Viewer.RemainingEdits != 1 {
				t.Errorf("expected editable viewer state, got %+v", item.Review.Viewer)
			}
		}
	})

	t.Run("Editing review updates viewer state to canEdit false and remainingEdits 0", func(t *testing.T) {
		time.Sleep(10 * time.Millisecond)
		updated, _, err := repo.UpdateReview(ctx, revIntegReview1, revIntegUserA, 4, "Updated comment", nil)
		if err != nil {
			t.Fatal(err)
		}
		if updated.Rating != 4 || updated.Comment != "Updated comment" {
			t.Errorf("expected updated rating 4 and comment, got %d, %s", updated.Rating, updated.Comment)
		}

		items, total, err := repo.ListOwnerReviews(ctx, revIntegUserA, 1, 10)
		if err != nil {
			t.Fatal(err)
		}
		if total != 2 {
			t.Fatalf("expected total 2, got %d", total)
		}
		// Now Review 1 was updated most recently, so it should be first
		if items[0].Review.ID != revIntegReview1 {
			t.Errorf("expected review1 to be first after update, got %s", items[0].Review.ID)
		}
		if items[0].Review.Viewer.CanEdit || items[0].Review.Viewer.RemainingEdits != 0 {
			t.Errorf("expected canEdit false and remainingEdits 0, got %+v", items[0].Review.Viewer)
		}
	})
}
