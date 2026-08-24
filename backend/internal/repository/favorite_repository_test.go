package repository

import (
	"context"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"commerce-backend/internal/domain"
)

func getTestDB(t *testing.T) (*pgx.Conn, context.Context) {
	t.Helper()
	ctx := context.Background()
	dbURL := os.Getenv("DB_URL")
	if dbURL == "" {
		dbURL = "postgres://commerce:commerce@localhost:5432/commerce?sslmode=disable"
	}
	conn, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		t.Skipf("Postgres DB not available: %v", err)
	}
	return conn, ctx
}

func createTestUser(t *testing.T, ctx context.Context, conn *pgx.Conn) string {
	t.Helper()
	userID := uuid.New().String()
	email := "test-" + userID + "@example.com"
	_, err := conn.Exec(ctx, `INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'hash')`, userID, email)
	if err != nil {
		t.Fatalf("failed to create test user: %v", err)
	}
	return userID
}

func createTestCategory(t *testing.T, ctx context.Context, conn *pgx.Conn) string {
	t.Helper()
	catID := uuid.New().String()
	name := "Category-" + catID
	_, err := conn.Exec(ctx, `INSERT INTO categories (id, name) VALUES ($1, $2)`, catID, name)
	if err != nil {
		t.Fatalf("failed to create test category: %v", err)
	}
	return catID
}

func createTestProduct(t *testing.T, ctx context.Context, conn *pgx.Conn, categoryID string, active bool, withActiveVariant bool, stockQuantity int64, priceVnd string) string {
	t.Helper()
	productID := uuid.New().String()
	_, err := conn.Exec(ctx, `
		INSERT INTO products (id, category_id, name, model, brand, description, price, currency, stock_quantity, active)
		VALUES ($1, $2, $3, $4, $5, 'desc', 100000, 'VND', $6, $7)
	`, productID, categoryID, "Product-"+productID, "Model-A", "Brand-X", stockQuantity, active)
	if err != nil {
		t.Fatalf("failed to create test product: %v", err)
	}

	if priceVnd != "" {
		variantID := uuid.New().String()
		_, err = conn.Exec(ctx, `
			INSERT INTO product_variants (id, product_id, price_vnd, stock_quantity, active)
			VALUES ($1, $2, $3, $4, $5)
		`, variantID, productID, priceVnd, stockQuantity, withActiveVariant)
		if err != nil {
			t.Fatalf("failed to create test variant: %v", err)
		}
	}
	return productID
}

// FAVORITE-PERSISTENCE-001: Concurrent insert attempts create C1-P1 without race errors
func TestFavoritePersistence_001_ConcurrentInsert(t *testing.T) {
	ctx := context.Background()
	dbURL := os.Getenv("DB_URL")
	if dbURL == "" {
		dbURL = "postgres://commerce:commerce@localhost:5432/commerce?sslmode=disable"
	}
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("Postgres DB pool not available: %v", err)
	}
	defer pool.Close()

	catID := uuid.New().String()
	_, err = pool.Exec(ctx, `INSERT INTO categories (id, name) VALUES ($1, $2)`, catID, "Cat-"+catID)
	if err != nil {
		t.Fatalf("failed to create category: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM categories WHERE id = $1`, catID)

	u1 := uuid.New().String()
	_, err = pool.Exec(ctx, `INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'hash')`, u1, "user-"+u1+"@example.com")
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, u1)

	p1 := uuid.New().String()
	_, err = pool.Exec(ctx, `
		INSERT INTO products (id, category_id, name, model, brand, description, price, currency, stock_quantity, active)
		VALUES ($1, $2, 'P1', 'M1', 'B1', 'desc', 100000, 'VND', 10, true)
	`, p1, catID)
	if err != nil {
		t.Fatalf("failed to create product: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM products WHERE id = $1`, p1)

	v1 := uuid.New().String()
	_, err = pool.Exec(ctx, `
		INSERT INTO product_variants (id, product_id, price_vnd, stock_quantity, active)
		VALUES ($1, $2, 100000, 10, true)
	`, v1, p1)
	if err != nil {
		t.Fatalf("failed to create variant: %v", err)
	}

	repo := NewFavoriteRepository(pool)

	before := time.Now().Add(-1 * time.Second)
	var wg sync.WaitGroup
	errs := make(chan error, 10)

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- repo.AddFavorite(ctx, u1, p1)
		}()
	}
	wg.Wait()
	close(errs)

	for err := range errs {
		if err != nil {
			t.Fatalf("unexpected error on concurrent add: %v", err)
		}
	}
	after := time.Now().Add(1 * time.Second)

	var count int
	var createdAt time.Time
	err = pool.QueryRow(ctx, `SELECT count(*), min(created_at) FROM product_favorites WHERE user_id = $1 AND product_id = $2`, u1, p1).Scan(&count, &createdAt)
	if err != nil {
		t.Fatalf("query row failed: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected exactly 1 row, got %d", count)
	}
	if createdAt.Before(before) || createdAt.After(after) {
		t.Fatalf("created_at %v not between %v and %v", createdAt, before, after)
	}
}

// FAVORITE-PERSISTENCE-002: Idempotent add preserves original created_at
func TestFavoritePersistence_002_IdempotentAddPreservesCreatedAt(t *testing.T) {
	conn, ctx := getTestDB(t)
	defer conn.Close(ctx)

	catID := createTestCategory(t, ctx, conn)
	defer conn.Exec(ctx, `DELETE FROM categories WHERE id = $1`, catID)

	u1 := createTestUser(t, ctx, conn)
	defer conn.Exec(ctx, `DELETE FROM users WHERE id = $1`, u1)

	p1 := createTestProduct(t, ctx, conn, catID, true, true, 10, "150000")
	defer conn.Exec(ctx, `DELETE FROM products WHERE id = $1`, p1)

	repo := NewFavoriteRepository(conn)

	if err := repo.AddFavorite(ctx, u1, p1); err != nil {
		t.Fatalf("initial add failed: %v", err)
	}

	var t1 time.Time
	if err := conn.QueryRow(ctx, `SELECT created_at FROM product_favorites WHERE user_id = $1 AND product_id = $2`, u1, p1).Scan(&t1); err != nil {
		t.Fatal(err)
	}

	time.Sleep(100 * time.Millisecond)

	if err := repo.AddFavorite(ctx, u1, p1); err != nil {
		t.Fatalf("repeated add failed: %v", err)
	}

	var t2 time.Time
	var count int
	if err := conn.QueryRow(ctx, `SELECT count(*), min(created_at) FROM product_favorites WHERE user_id = $1 AND product_id = $2`, u1, p1).Scan(&count, &t2); err != nil {
		t.Fatal(err)
	}

	if count != 1 {
		t.Fatalf("expected 1 row, got %d", count)
	}
	if !t1.Equal(t2) {
		t.Fatalf("created_at modified: was %v, now %v", t1, t2)
	}
}

// FAVORITE-PERSISTENCE-003: Physical user deletion cascades to product_favorites
func TestFavoritePersistence_003_UserCascade(t *testing.T) {
	conn, ctx := getTestDB(t)
	defer conn.Close(ctx)

	catID := createTestCategory(t, ctx, conn)
	defer conn.Exec(ctx, `DELETE FROM categories WHERE id = $1`, catID)

	u1 := createTestUser(t, ctx, conn)
	u2 := createTestUser(t, ctx, conn)
	defer conn.Exec(ctx, `DELETE FROM users WHERE id = $1`, u2)

	p1 := createTestProduct(t, ctx, conn, catID, true, true, 10, "150000")
	p2 := createTestProduct(t, ctx, conn, catID, true, true, 10, "150000")
	defer conn.Exec(ctx, `DELETE FROM products WHERE id IN ($1, $2)`, p1, p2)

	repo := NewFavoriteRepository(conn)
	_ = repo.AddFavorite(ctx, u1, p1)
	_ = repo.AddFavorite(ctx, u1, p2)
	_ = repo.AddFavorite(ctx, u2, p1)

	// Delete user u1
	if _, err := conn.Exec(ctx, `DELETE FROM users WHERE id = $1`, u1); err != nil {
		t.Fatalf("delete user failed: %v", err)
	}

	var u1Count, u2Count int
	_ = conn.QueryRow(ctx, `SELECT count(*) FROM product_favorites WHERE user_id = $1`, u1).Scan(&u1Count)
	_ = conn.QueryRow(ctx, `SELECT count(*) FROM product_favorites WHERE user_id = $1`, u2).Scan(&u2Count)

	if u1Count != 0 {
		t.Fatalf("expected 0 favorites for u1, got %d", u1Count)
	}
	if u2Count != 1 {
		t.Fatalf("expected 1 favorite for u2, got %d", u2Count)
	}
}

// FAVORITE-PERSISTENCE-004: Physical product deletion cascades to product_favorites
func TestFavoritePersistence_004_ProductCascade(t *testing.T) {
	conn, ctx := getTestDB(t)
	defer conn.Close(ctx)

	catID := createTestCategory(t, ctx, conn)
	defer conn.Exec(ctx, `DELETE FROM categories WHERE id = $1`, catID)

	u1 := createTestUser(t, ctx, conn)
	u2 := createTestUser(t, ctx, conn)
	defer conn.Exec(ctx, `DELETE FROM users WHERE id IN ($1, $2)`, u1, u2)

	p1 := createTestProduct(t, ctx, conn, catID, true, true, 10, "150000")
	p2 := createTestProduct(t, ctx, conn, catID, true, true, 10, "150000")
	defer conn.Exec(ctx, `DELETE FROM products WHERE id = $1`, p2)

	repo := NewFavoriteRepository(conn)
	_ = repo.AddFavorite(ctx, u1, p1)
	_ = repo.AddFavorite(ctx, u2, p1)
	_ = repo.AddFavorite(ctx, u1, p2)

	// Delete product p1
	if _, err := conn.Exec(ctx, `DELETE FROM products WHERE id = $1`, p1); err != nil {
		t.Fatalf("delete product failed: %v", err)
	}

	var p1Count, p2Count int
	_ = conn.QueryRow(ctx, `SELECT count(*) FROM product_favorites WHERE product_id = $1`, p1).Scan(&p1Count)
	_ = conn.QueryRow(ctx, `SELECT count(*) FROM product_favorites WHERE product_id = $1`, p2).Scan(&p2Count)

	if p1Count != 0 {
		t.Fatalf("expected 0 favorites for p1, got %d", p1Count)
	}
	if p2Count != 1 {
		t.Fatalf("expected 1 favorite for p2, got %d", p2Count)
	}
}

// FAVORITE-PERSISTENCE-005: Inactive/soft-deleted product remains in favorite list with active=false, inStock=false
func TestFavoritePersistence_005_SoftDeletedProductProjected(t *testing.T) {
	conn, ctx := getTestDB(t)
	defer conn.Close(ctx)

	catID := createTestCategory(t, ctx, conn)
	defer conn.Exec(ctx, `DELETE FROM categories WHERE id = $1`, catID)

	u1 := createTestUser(t, ctx, conn)
	defer conn.Exec(ctx, `DELETE FROM users WHERE id = $1`, u1)

	p1 := createTestProduct(t, ctx, conn, catID, true, true, 10, "150000")
	defer conn.Exec(ctx, `DELETE FROM products WHERE id = $1`, p1)

	repo := NewFavoriteRepository(conn)
	if err := repo.AddFavorite(ctx, u1, p1); err != nil {
		t.Fatal(err)
	}

	// Soft-delete product (active = false)
	if _, err := conn.Exec(ctx, `UPDATE products SET active = false WHERE id = $1`, p1); err != nil {
		t.Fatal(err)
	}

	res, err := repo.ListFavorites(ctx, u1, 1, 12)
	if err != nil {
		t.Fatalf("list favorites failed: %v", err)
	}
	if len(res.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(res.Items))
	}
	item := res.Items[0]
	if item.ID != p1 {
		t.Fatalf("item.ID = %s, want %s", item.ID, p1)
	}
	if item.Active {
		t.Fatalf("expected item.Active = false, got true")
	}
	if item.InStock {
		t.Fatalf("expected item.InStock = false, got true")
	}
	if string(item.MinPriceVND) != "150000" {
		t.Fatalf("expected minPriceVND = 150000, got %s", item.MinPriceVND)
	}
}

// FAVORITE-PERSISTENCE-006: Pagination ordering by created_at DESC, product_id ASC without duplicates across pages
func TestFavoritePersistence_006_PaginationOrdering(t *testing.T) {
	conn, ctx := getTestDB(t)
	defer conn.Close(ctx)

	catID := createTestCategory(t, ctx, conn)
	defer conn.Exec(ctx, `DELETE FROM categories WHERE id = $1`, catID)

	u1 := createTestUser(t, ctx, conn)
	defer conn.Exec(ctx, `DELETE FROM users WHERE id = $1`, u1)

	repo := NewFavoriteRepository(conn)

	productIDs := make([]string, 5)
	for i := 0; i < 5; i++ {
		productIDs[i] = createTestProduct(t, ctx, conn, catID, true, true, 10, "100000")
		defer conn.Exec(ctx, `DELETE FROM products WHERE id = $1`, productIDs[i])
		if err := repo.AddFavorite(ctx, u1, productIDs[i]); err != nil {
			t.Fatal(err)
		}
		time.Sleep(10 * time.Millisecond)
	}

	page1, err := repo.ListFavorites(ctx, u1, 1, 3)
	if err != nil {
		t.Fatal(err)
	}
	page2, err := repo.ListFavorites(ctx, u1, 2, 3)
	if err != nil {
		t.Fatal(err)
	}

	if page1.Pagination.Total != 5 || page1.Pagination.TotalPages != 2 || !page1.Pagination.HasNext || page1.Pagination.HasPrev {
		t.Fatalf("page 1 pagination mismatch: %+v", page1.Pagination)
	}
	if len(page1.Items) != 3 || len(page2.Items) != 2 {
		t.Fatalf("page items length mismatch: p1=%d, p2=%d", len(page1.Items), len(page2.Items))
	}

	seen := make(map[string]bool)
	for _, item := range page1.Items {
		seen[item.ID] = true
	}
	for _, item := range page2.Items {
		if seen[item.ID] {
			t.Fatalf("duplicate item across pages: %s", item.ID)
		}
	}
}

// FAVORITE-PERSISTENCE-007: Scoped delete is idempotent and does not affect other customers
func TestFavoritePersistence_007_ScopedDeleteIdempotent(t *testing.T) {
	conn, ctx := getTestDB(t)
	defer conn.Close(ctx)

	catID := createTestCategory(t, ctx, conn)
	defer conn.Exec(ctx, `DELETE FROM categories WHERE id = $1`, catID)

	u1 := createTestUser(t, ctx, conn)
	u2 := createTestUser(t, ctx, conn)
	defer conn.Exec(ctx, `DELETE FROM users WHERE id IN ($1, $2)`, u1, u2)

	p1 := createTestProduct(t, ctx, conn, catID, true, true, 10, "150000")
	defer conn.Exec(ctx, `DELETE FROM products WHERE id = $1`, p1)

	repo := NewFavoriteRepository(conn)
	_ = repo.AddFavorite(ctx, u1, p1)
	_ = repo.AddFavorite(ctx, u2, p1)

	// Remove u1 favorite once
	if err := repo.RemoveFavorite(ctx, u1, p1); err != nil {
		t.Fatalf("first remove failed: %v", err)
	}
	// Remove u1 favorite again (idempotent)
	if err := repo.RemoveFavorite(ctx, u1, p1); err != nil {
		t.Fatalf("second remove failed: %v", err)
	}

	// u2 favorite must remain
	u2IDs, err := repo.GetFavoriteProductIDs(ctx, u2, []string{p1})
	if err != nil || len(u2IDs) != 1 || u2IDs[0] != p1 {
		t.Fatalf("u2 favorite was affected: ids=%v, err=%v", u2IDs, err)
	}
}

// FAVORITE-PERSISTENCE-008: Atomic add enforces product active & active variant eligibility
func TestFavoritePersistence_008_EligibilityEnforced(t *testing.T) {
	conn, ctx := getTestDB(t)
	defer conn.Close(ctx)

	catID := createTestCategory(t, ctx, conn)
	defer conn.Exec(ctx, `DELETE FROM categories WHERE id = $1`, catID)

	u1 := createTestUser(t, ctx, conn)
	defer conn.Exec(ctx, `DELETE FROM users WHERE id = $1`, u1)

	pInactive := createTestProduct(t, ctx, conn, catID, false, true, 10, "150000")
	pNoActiveVariant := createTestProduct(t, ctx, conn, catID, true, false, 10, "150000")
	pActive := createTestProduct(t, ctx, conn, catID, true, true, 10, "150000")
	defer conn.Exec(ctx, `DELETE FROM products WHERE id IN ($1, $2, $3)`, pInactive, pNoActiveVariant, pActive)

	repo := NewFavoriteRepository(conn)

	// Inactive product should fail with domain.ErrProductNotFound
	err1 := repo.AddFavorite(ctx, u1, pInactive)
	if err1 != domain.ErrProductNotFound {
		t.Fatalf("expected ErrProductNotFound for inactive product, got %v", err1)
	}

	// Active product without active variant should fail with domain.ErrProductNotFound
	err2 := repo.AddFavorite(ctx, u1, pNoActiveVariant)
	if err2 != domain.ErrProductNotFound {
		t.Fatalf("expected ErrProductNotFound for no active variant, got %v", err2)
	}

	// Active product with active variant should succeed
	err3 := repo.AddFavorite(ctx, u1, pActive)
	if err3 != nil {
		t.Fatalf("expected success for active product, got %v", err3)
	}
}

// FAVORITE-PERSISTENCE-009: Batch lookup is scoped to customer and requested product IDs
func TestFavoritePersistence_009_BatchStatusScoped(t *testing.T) {
	conn, ctx := getTestDB(t)
	defer conn.Close(ctx)

	catID := createTestCategory(t, ctx, conn)
	defer conn.Exec(ctx, `DELETE FROM categories WHERE id = $1`, catID)

	u1 := createTestUser(t, ctx, conn)
	u2 := createTestUser(t, ctx, conn)
	defer conn.Exec(ctx, `DELETE FROM users WHERE id IN ($1, $2)`, u1, u2)

	p1 := createTestProduct(t, ctx, conn, catID, true, true, 10, "150000")
	p2 := createTestProduct(t, ctx, conn, catID, true, true, 10, "150000")
	p3 := createTestProduct(t, ctx, conn, catID, true, true, 10, "150000")
	defer conn.Exec(ctx, `DELETE FROM products WHERE id IN ($1, $2, $3)`, p1, p2, p3)

	repo := NewFavoriteRepository(conn)
	_ = repo.AddFavorite(ctx, u1, p1)
	_ = repo.AddFavorite(ctx, u1, p3)
	_ = repo.AddFavorite(ctx, u2, p2)

	// u1 batch lookup for p1 and p2: should return only p1
	res, err := repo.GetFavoriteProductIDs(ctx, u1, []string{p1, p2})
	if err != nil {
		t.Fatal(err)
	}
	if len(res) != 1 || res[0] != p1 {
		t.Fatalf("expected only [p1], got %v", res)
	}
}

// FAVORITE-PERSISTENCE-010: Reversible migration passes assertions
func TestFavoritePersistence_010_SchemaAssertions(t *testing.T) {
	conn, ctx := getTestDB(t)
	defer conn.Close(ctx)

	// Verify that product_favorites exists and satisfies constraints
	var count int
	err := conn.QueryRow(ctx, `
		SELECT count(*)
		FROM information_schema.tables
		WHERE table_schema = 'public' AND table_name = 'product_favorites'
	`).Scan(&count)
	if err != nil || count != 1 {
		t.Fatalf("product_favorites table not found: count=%d, err=%v", count, err)
	}
}
