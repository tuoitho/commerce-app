//go:build integration

package http_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"

	delivery "commerce-backend/internal/delivery/http"
	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository"
	"commerce-backend/internal/security/jwt"
	"commerce-backend/internal/storage"
	reviewuc "commerce-backend/internal/usecase/review"
)

const (
	reviewHTTPIntegrationUser    = "31111111-1111-1111-1111-111111111111"
	reviewHTTPIntegrationAdmin   = "39999999-9999-9999-9999-999999999999"
	reviewHTTPIntegrationCat     = "31200000-0000-0000-0000-000000000001"
	reviewHTTPIntegrationProd    = "31300000-0000-0000-0000-000000000001"
	reviewHTTPIntegrationVar     = "31400000-0000-0000-0000-000000000001"
	reviewHTTPIntegrationOrder   = "31700000-0000-0000-0000-000000000001"
	reviewHTTPIntegrationItem    = "31900000-0000-0000-0000-000000000001"
	reviewHTTPIntegrationItem2   = "31900000-0000-0000-0000-000000000002"
	reviewHTTPIntegrationReview  = "32100000-0000-0000-0000-000000000001"
	reviewHTTPIntegrationReview2 = "32100000-0000-0000-0000-000000000002"
)

func TestReviewHandler_AdminResponseLengthBoundaryIntegration(t *testing.T) {
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
	conn := connectReviewHTTPIntegrationDB(t, ctx, dbURL)
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
		"000013_review_responses.up.sql",
		"000014_review_helpful_votes.up.sql",
	} {
		applyReviewHTTPIntegrationMigration(t, ctx, conn, migration)
	}
	if _, err := conn.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, role) VALUES
		($1, 'admin@example.com', 'hash', 'admin'),
		($2, 'customer@example.com', 'hash', 'customer');
		INSERT INTO categories (id, name) VALUES ($3, 'Test');
		INSERT INTO products (id, category_id, name, description, price, currency, stock_quantity, active)
		VALUES ($4, $3, 'Test product', 'Description', 100, 'VND', 10, true);
		INSERT INTO product_variants (id, product_id, price_vnd, stock_quantity, active)
		VALUES ($5, $4, 100, 10, true);
		INSERT INTO orders (id, user_id, status, subtotal_vnd, shipping_fee_vnd, total_vnd, recipient_name, phone, province_name, ward_name, detail_address)
		VALUES ($6, $2, 'delivered', 100, 0, 100, 'Customer', '0900000000', 'Province', 'Ward', 'Address');
		INSERT INTO order_items (id, order_id, variant_id, product_id, brand_name, product_name, options, unit_price_vnd, quantity, line_total_vnd)
		VALUES
			($7, $6, $5, $4, 'Brand', 'Test product', '[]'::jsonb, 100, 1, 100),
			($8, $6, $5, $4, 'Brand', 'Test product 2', '[]'::jsonb, 100, 1, 100);
		INSERT INTO product_reviews (id, order_item_id, user_id, product_id, variant_id, rating, comment)
		VALUES ($9, $7, $2, $4, $5, 5, 'Review');
		INSERT INTO product_reviews (id, order_item_id, user_id, product_id, variant_id, rating, comment)
		VALUES ($10, $8, $2, $4, $5, 4, 'Review 2');
	`, reviewHTTPIntegrationAdmin, reviewHTTPIntegrationUser, reviewHTTPIntegrationCat,
		reviewHTTPIntegrationProd, reviewHTTPIntegrationVar, reviewHTTPIntegrationOrder,
		reviewHTTPIntegrationItem, reviewHTTPIntegrationItem2, reviewHTTPIntegrationReview, reviewHTTPIntegrationReview2); err != nil {
		t.Fatal(err)
	}

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	manager := jwt.NewManager("super-secret-key-that-is-at-least-32-chars-long", "commerce-backend")
	adminToken, err := manager.GenerateAccessToken(reviewHTTPIntegrationAdmin, domain.RoleAdmin, 15*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	uc := reviewuc.New(reviewuc.Dependencies{
		Reviews: repository.NewReviewRepository(pool),
		Storage: storage.NewMemoryStorage("test-bucket"),
	})
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	delivery.NewRouter(engine, delivery.Dependencies{Review: uc, JWT: manager})

	valid := `{"content":"` + strings.Repeat("a", 1000) + `"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/reviews/"+reviewHTTPIntegrationReview+"/response", strings.NewReader(valid))
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)
	if w.Code != http.StatusCreated || !strings.Contains(w.Body.String(), `"content":"`+strings.Repeat("a", 1000)+`"`) {
		t.Fatalf("exact 1000 response = %d: %s", w.Code, w.Body.String())
	}

	over := `{"content":"` + strings.Repeat("b", 1001) + `"}`
	req = httptest.NewRequest(http.MethodPost, "/api/v1/admin/reviews/"+reviewHTTPIntegrationReview2+"/response", strings.NewReader(over))
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	engine.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), `"fields":{"content":`) {
		t.Fatalf("over-limit response = %d: %s", w.Code, w.Body.String())
	}
}

func TestReviewHandler_HelpfulnessEndpoints_Integration(t *testing.T) {
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
	conn := connectReviewHTTPIntegrationDB(t, ctx, dbURL)
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
		"000013_review_responses.up.sql",
		"000014_review_helpful_votes.up.sql",
	} {
		applyReviewHTTPIntegrationMigration(t, ctx, conn, migration)
	}

	if _, err := conn.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, role) VALUES
		($1, 'admin@example.com', 'hash', 'admin'),
		($2, 'customer@example.com', 'hash', 'customer');
		INSERT INTO categories (id, name) VALUES ($3, 'Test');
		INSERT INTO products (id, category_id, name, description, price, currency, stock_quantity, active)
		VALUES ($4, $3, 'Test product', 'Description', 100, 'VND', 10, true);
		INSERT INTO product_variants (id, product_id, price_vnd, stock_quantity, active)
		VALUES ($5, $4, 100, 10, true);
		INSERT INTO orders (id, user_id, status, subtotal_vnd, shipping_fee_vnd, total_vnd, recipient_name, phone, province_name, ward_name, detail_address)
		VALUES ($6, $2, 'delivered', 100, 0, 100, 'Customer', '0900000000', 'Province', 'Ward', 'Address');
		INSERT INTO order_items (id, order_id, variant_id, product_id, brand_name, product_name, options, unit_price_vnd, quantity, line_total_vnd)
		VALUES
			($7, $6, $5, $4, 'Brand', 'Test product', '[]'::jsonb, 100, 1, 100),
			($8, $6, $5, $4, 'Brand', 'Test product 2', '[]'::jsonb, 100, 1, 100);
		INSERT INTO product_reviews (id, order_item_id, user_id, product_id, variant_id, rating, comment)
		VALUES ($9, $7, $2, $4, $5, 5, 'Review 1');
		INSERT INTO product_reviews (id, order_item_id, user_id, product_id, variant_id, rating, comment)
		VALUES ($10, $8, $2, $4, $5, 4, 'Review 2');
	`, reviewHTTPIntegrationAdmin, reviewHTTPIntegrationUser, reviewHTTPIntegrationCat,
		reviewHTTPIntegrationProd, reviewHTTPIntegrationVar, reviewHTTPIntegrationOrder,
		reviewHTTPIntegrationItem, reviewHTTPIntegrationItem2, reviewHTTPIntegrationReview, reviewHTTPIntegrationReview2); err != nil {
		t.Fatal(err)
	}

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	manager := jwt.NewManager("super-secret-key-that-is-at-least-32-chars-long", "commerce-backend")
	adminToken, err := manager.GenerateAccessToken(reviewHTTPIntegrationAdmin, domain.RoleAdmin, 15*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	customerToken, err := manager.GenerateAccessToken(reviewHTTPIntegrationUser, domain.RoleCustomer, 15*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	uc := reviewuc.New(reviewuc.Dependencies{
		Reviews: repository.NewReviewRepository(pool),
		Storage: storage.NewMemoryStorage("test-bucket"),
	})
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	delivery.NewRouter(engine, delivery.Dependencies{Review: uc, JWT: manager})

	// 1. Author self-votes helpful on Review 1 (AC-VOTE-01-01, AC-VOTE-03-01)
	voteReq := httptest.NewRequest(http.MethodPut, "/api/v1/reviews/"+reviewHTTPIntegrationReview+"/vote", strings.NewReader(`{"vote":"helpful"}`))
	voteReq.Header.Set("Authorization", "Bearer "+customerToken)
	voteReq.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, voteReq)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"helpfulCount":1`) || !strings.Contains(w.Body.String(), `"viewerVote":"helpful"`) {
		t.Fatalf("vote helpful failed = %d: %s", w.Code, w.Body.String())
	}

	// 2. Switch vote: change to unhelpful (AC-VOTE-01-02)
	switchReq := httptest.NewRequest(http.MethodPut, "/api/v1/reviews/"+reviewHTTPIntegrationReview+"/vote", strings.NewReader(`{"vote":"unhelpful"}`))
	switchReq.Header.Set("Authorization", "Bearer "+customerToken)
	switchReq.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	engine.ServeHTTP(w, switchReq)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"helpfulCount":0`) || !strings.Contains(w.Body.String(), `"unhelpfulCount":1`) || !strings.Contains(w.Body.String(), `"viewerVote":"unhelpful"`) {
		t.Fatalf("switch vote failed = %d: %s", w.Code, w.Body.String())
	}

	// 3. Unvote: delete vote (AC-VOTE-02-01)
	unvoteReq := httptest.NewRequest(http.MethodDelete, "/api/v1/reviews/"+reviewHTTPIntegrationReview+"/vote", nil)
	unvoteReq.Header.Set("Authorization", "Bearer "+customerToken)
	w = httptest.NewRecorder()
	engine.ServeHTTP(w, unvoteReq)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"helpfulCount":0`) || !strings.Contains(w.Body.String(), `"unhelpfulCount":0`) || !strings.Contains(w.Body.String(), `"viewerVote":null`) {
		t.Fatalf("unvote failed = %d: %s", w.Code, w.Body.String())
	}

	// Re-vote helpful for remaining tests
	reVoteReq := httptest.NewRequest(http.MethodPut, "/api/v1/reviews/"+reviewHTTPIntegrationReview+"/vote", strings.NewReader(`{"vote":"helpful"}`))
	reVoteReq.Header.Set("Authorization", "Bearer "+customerToken)
	reVoteReq.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	engine.ServeHTTP(w, reVoteReq)
	if w.Code != http.StatusOK {
		t.Fatalf("re-vote helpful failed = %d", w.Code)
	}

	// 4. Storefront reviews with authenticated viewer (AC-VOTE-04-02, AC-VOTE-04-03)
	listAuthReq := httptest.NewRequest(http.MethodGet, "/api/v1/products/"+reviewHTTPIntegrationProd+"/reviews", nil)
	listAuthReq.Header.Set("Authorization", "Bearer "+customerToken)
	w = httptest.NewRecorder()
	engine.ServeHTTP(w, listAuthReq)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"helpfulCount":1`) || !strings.Contains(w.Body.String(), `"canVote":true`) || !strings.Contains(w.Body.String(), `"vote":"helpful"`) {
		t.Fatalf("auth list reviews failed = %d: %s", w.Code, w.Body.String())
	}

	// 5. Storefront reviews as guest (AC-VOTE-04-01)
	listGuestReq := httptest.NewRequest(http.MethodGet, "/api/v1/products/"+reviewHTTPIntegrationProd+"/reviews", nil)
	w = httptest.NewRecorder()
	engine.ServeHTTP(w, listGuestReq)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"helpfulCount":1`) || !strings.Contains(w.Body.String(), `"viewer":null`) {
		t.Fatalf("guest list reviews failed = %d: %s", w.Code, w.Body.String())
	}

	// 6. Admin stats endpoint (AC-VOTE-06-01)
	statsReq := httptest.NewRequest(http.MethodGet, "/api/v1/admin/reviews/stats", nil)
	statsReq.Header.Set("Authorization", "Bearer "+adminToken)
	w = httptest.NewRecorder()
	engine.ServeHTTP(w, statsReq)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"totalReviews":2`) || !strings.Contains(w.Body.String(), `"totalHelpful":1`) || !strings.Contains(w.Body.String(), `"totalUnhelpful":0`) {
		t.Fatalf("admin stats failed = %d: %s", w.Code, w.Body.String())
	}

	// 7. Admin reviews with sort (AC-VOTE-06-02)
	sortReq := httptest.NewRequest(http.MethodGet, "/api/v1/admin/reviews?sort=most_helpful", nil)
	sortReq.Header.Set("Authorization", "Bearer "+adminToken)
	w = httptest.NewRecorder()
	engine.ServeHTTP(w, sortReq)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), reviewHTTPIntegrationReview) {
		t.Fatalf("admin sort failed = %d: %s", w.Code, w.Body.String())
	}
}

func connectReviewHTTPIntegrationDB(t *testing.T, ctx context.Context, dbURL string) *pgx.Conn {
	t.Helper()
	config, err := pgx.ParseConfig(dbURL)
	if err != nil {
		t.Fatal(err)
	}
	config.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	var conn *pgx.Conn
	for attempt := 0; attempt < 20; attempt++ {
		conn, err = pgx.ConnectConfig(ctx, config)
		if err == nil {
			return conn
		}
		time.Sleep(500 * time.Millisecond)
	}
	t.Fatalf("connect integration database: %v", err)
	return nil
}

func applyReviewHTTPIntegrationMigration(t *testing.T, ctx context.Context, conn *pgx.Conn, name string) {
	t.Helper()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(root, "db", "migrations", name))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(ctx, string(data)); err != nil {
		t.Fatalf("migration %s: %v", name, err)
	}
}
