//go:build integration

package repository

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"

	"commerce-backend/internal/domain"
)

const (
	returnsIntegrationUser      = "11111111-1111-1111-1111-111111111111"
	returnsIntegrationOtherUser = "22222222-2222-2222-2222-222222222222"
	returnsIntegrationCategory  = "12000000-0000-0000-0000-000000000001"
	returnsIntegrationProduct   = "13000000-0000-0000-0000-000000000001"
	returnsIntegrationVariantI1 = "14000000-0000-0000-0000-000000000001"
	returnsIntegrationVariantI2 = "15000000-0000-0000-0000-000000000001"
	returnsIntegrationOrderO1   = "17000000-0000-0000-0000-000000000001"
	returnsIntegrationItemI1    = "19000000-0000-0000-0000-000000000001"
	returnsIntegrationItemI2    = "19000000-0000-0000-0000-000000000002"
	returnsIntegrationRR1       = "20000000-0000-0000-0000-000000000001"
)

func TestReturnRepository_Integration(t *testing.T) {
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
	} {
		applyMigration(t, ctx, conn, migration)
	}

	seedReturnsIntegrationData(t, ctx, conn)

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	repo := NewReturnRepository(pool)

	requestID := returnsIntegrationRR1
	orderID := returnsIntegrationOrderO1

	t.Run("REV-BE-001 list foreign order returns order_not_found", func(t *testing.T) {
		_, err := repo.ListByOrder(ctx, returnsIntegrationOtherUser, orderID)
		if err != domain.ErrOrderNotFound {
			t.Fatalf("expected ErrOrderNotFound for foreign order, got %v", err)
		}
		_, err = repo.ListByOrder(ctx, returnsIntegrationUser, "not-a-uuid")
		if err != domain.ErrOrderNotFound {
			t.Fatalf("expected ErrOrderNotFound for invalid uuid, got %v", err)
		}
	})

	t.Run("REV-BE-001 owner lists own requests with items", func(t *testing.T) {
		requests, err := repo.ListByOrder(ctx, returnsIntegrationUser, orderID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(requests) != 1 {
			t.Fatalf("expected 1 request for owner, got %d", len(requests))
		}
		if requests[0].ID != requestID {
			t.Fatalf("expected request %s, got %s", requestID, requests[0].ID)
		}
		if len(requests[0].Items) != 1 || requests[0].Items[0].Quantity != 1 {
			t.Fatalf("expected 1 item quantity 1, got %+v", requests[0].Items)
		}
	})

	t.Run("REV-BE-002 admin list computes suggested refund with shipping once", func(t *testing.T) {
		requests, err := repo.ListByAdmin(ctx, nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		var rr1 *domain.ReturnRequest
		for i := range requests {
			if requests[i].ID == requestID {
				rr1 = &requests[i]
			}
		}
		if rr1 == nil {
			t.Fatalf("expected request %s in admin list", requestID)
		}
		if rr1.SuggestedRefundVND != domain.MoneyVND("520000") {
			t.Fatalf("expected suggestedRefundVnd 520000 (500000x1 + ship 20000), got %s", rr1.SuggestedRefundVND)
		}
	})

	t.Run("REV-BE-002 second refund excludes shipping", func(t *testing.T) {
		if _, err := conn.Exec(ctx, `UPDATE return_requests SET status='refunded', refund_amount_vnd=520000 WHERE id=$1`, requestID); err != nil {
			t.Fatal(err)
		}
		if _, err := conn.Exec(ctx, `INSERT INTO return_requests(id,order_id,user_id,reason_code) VALUES ('20000000-0000-0000-0000-000000000002',$1,$2,'changed_mind')`, orderID, returnsIntegrationUser); err != nil {
			t.Fatal(err)
		}
		if _, err := conn.Exec(ctx, `INSERT INTO return_request_items(id,return_request_id,order_item_id,quantity) VALUES ('21000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002',$1,1)`, returnsIntegrationItemI2); err != nil {
			t.Fatal(err)
		}

		requests, err := repo.ListByAdmin(ctx, nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		for _, request := range requests {
			switch request.ID {
			case "20000000-0000-0000-0000-000000000002":
				if request.SuggestedRefundVND != domain.MoneyVND("300000") {
					t.Fatalf("expected subsequent refund suggestion 300000 (no shipping), got %s", request.SuggestedRefundVND)
				}
			case requestID:
				if request.SuggestedRefundVND != domain.MoneyVND("500000") {
					t.Fatalf("expected refunded request suggestion 500000 (shipping excluded after refund), got %s", request.SuggestedRefundVND)
				}
			}
		}

		detail, err := repo.GetByAdminID(ctx, "20000000-0000-0000-0000-000000000002")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if detail.SuggestedRefundVND != domain.MoneyVND("300000") {
			t.Fatalf("expected GetByAdminID 300000 too, got %s", detail.SuggestedRefundVND)
		}
	})
}

func seedReturnsIntegrationData(t *testing.T, ctx context.Context, conn *pgx.Conn) {
	t.Helper()
	statements := []struct {
		sql  string
		args []any
	}{
		{`INSERT INTO users(id,email,password_hash) VALUES ($1,'return-a@example.com','x'),($2,'return-b@example.com','x')`, []any{returnsIntegrationUser, returnsIntegrationOtherUser}},
		{`INSERT INTO categories(id,name) VALUES ($1,'Cat')`, []any{returnsIntegrationCategory}},
		{`INSERT INTO products(id,category_id,name,model,brand,price,currency,active) VALUES ($1,$2,'Phone','P','Apple',0,'VND',true)`, []any{returnsIntegrationProduct, returnsIntegrationCategory}},
		{`INSERT INTO product_variants(id,product_id,price_vnd,stock_quantity,active) VALUES ($1,$2,500000,10,true),($3,$2,300000,10,true)`, []any{returnsIntegrationVariantI1, returnsIntegrationProduct, returnsIntegrationVariantI2}},
		{`INSERT INTO orders(id,user_id,status,payment_method,subtotal_vnd,shipping_fee_vnd,total_vnd,recipient_name,phone,province_name,ward_name,detail_address,delivered_at) VALUES ($1,$2,'delivered','cod',800000,20000,820000,'A','0123','HN','WB','Detail', now() - interval '1 day')`, []any{returnsIntegrationOrderO1, returnsIntegrationUser}},
		{`INSERT INTO order_items(id,order_id,variant_id,product_id,brand_name,product_name,model,image_url,options,unit_price_vnd,quantity,line_total_vnd) VALUES ($1,$2,$3,$4,'Apple','Phone','P','','[]'::jsonb,500000,2,1000000),($5,$2,$6,$4,'Apple','Phone','P','','[]'::jsonb,300000,1,300000)`, []any{returnsIntegrationItemI1, returnsIntegrationOrderO1, returnsIntegrationVariantI1, returnsIntegrationProduct, returnsIntegrationItemI2, returnsIntegrationVariantI2}},
		{`INSERT INTO return_requests(id,order_id,user_id,reason_code) VALUES ($1,$2,$3,'defective')`, []any{returnsIntegrationRR1, returnsIntegrationOrderO1, returnsIntegrationUser}},
		{`INSERT INTO return_request_items(id,return_request_id,order_item_id,quantity) VALUES ('21000000-0000-0000-0000-000000000001',$1,$2,1)`, []any{returnsIntegrationRR1, returnsIntegrationItemI1}},
	}
	for _, statement := range statements {
		if _, err := conn.Exec(ctx, statement.sql, statement.args...); err != nil {
			t.Fatal(err)
		}
	}
}
