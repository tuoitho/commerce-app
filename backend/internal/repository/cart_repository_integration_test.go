//go:build integration

package repository

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"

	"commerce-backend/internal/domain"
)

const (
	integrationUser      = "11111111-1111-1111-1111-111111111111"
	integrationOtherUser = "22222222-2222-2222-2222-222222222222"
	integrationCategory  = "10000000-0000-0000-0000-000000000001"
	integrationProduct   = "55555555-5555-5555-5555-555555555555"
	integrationVariantA  = "33333333-3333-3333-3333-333333333333"
	integrationVariantB  = "66666666-6666-6666-6666-666666666666"
	integrationProductB  = "77777777-7777-7777-7777-777777777777"
	integrationVariantC  = "88888888-8888-8888-8888-888888888888"
	integrationProductC  = "99999999-9999-9999-9999-999999999999"
	integrationGroup     = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	integrationValue     = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
	integrationImage     = "cccccccc-cccc-cccc-cccc-cccccccccccc"
)

func TestCartRepositoryIntegration(t *testing.T) {
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
	applyMigration(t, ctx, conn, "000001_create_users.up.sql")
	applyMigration(t, ctx, conn, "000002_create_catalog.up.sql")
	applyMigration(t, ctx, conn, "000003_phone_variants_cart.up.sql")
	applyMigration(t, ctx, conn, "000004_int64_stock_quantity.up.sql")
	seedPath := filepath.Join("..", "..", "db", "seed", "catalog.sql")
	seedCatalog(t, ctx, conn, seedPath)
	seedCatalog(t, ctx, conn, seedPath)
	assertSchemaConstraints(t, ctx, conn)

	seedIntegrationCartData(t, ctx, conn)
	assertCartQuantityConstraints(t, ctx, conn)
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	repo := NewCartRepository(pool)

	t.Run("add at MaxInt64 returns stock limit without changing the row", func(t *testing.T) {
		if _, err := conn.Exec(ctx, `INSERT INTO cart_items(user_id,variant_id,quantity) VALUES ($1,$2,9223372036854775807)`, integrationUser, integrationVariantB); err != nil {
			t.Fatal(err)
		}
		_, err := repo.AddVariant(ctx, integrationUser, integrationVariantB)
		if err != domain.ErrStockLimit {
			t.Fatalf("error = %v, want stock limit", err)
		}
		var quantity int64
		if err := conn.QueryRow(ctx, `SELECT quantity FROM cart_items WHERE user_id=$1 AND variant_id=$2`, integrationUser, integrationVariantB).Scan(&quantity); err != nil {
			t.Fatal(err)
		}
		if quantity != 9223372036854775807 {
			t.Fatalf("quantity = %d, row was changed", quantity)
		}
		if _, err := conn.Exec(ctx, `DELETE FROM cart_items WHERE user_id=$1 AND variant_id=$2`, integrationUser, integrationVariantB); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("concurrent same and different lines", func(t *testing.T) {
		var wg sync.WaitGroup
		for i := 0; i < 3; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				if _, err := repo.AddVariant(ctx, integrationUser, integrationVariantA); err != nil {
					t.Errorf("same-line add: %v", err)
				}
			}()
		}
		for _, variantID := range []string{integrationVariantB, integrationVariantC} {
			variantID := variantID
			wg.Add(1)
			go func() {
				defer wg.Done()
				if _, err := repo.AddVariant(ctx, integrationUser, variantID); err != nil {
					t.Errorf("different-line add: %v", err)
				}
			}()
		}
		wg.Wait()
		cart, err := repo.Get(ctx, integrationUser)
		if err != nil || len(cart.Items) != 3 {
			t.Fatalf("cart = %+v, err = %v", cart, err)
		}
		for _, item := range cart.Items {
			if item.VariantID == integrationVariantA && item.Quantity != 3 {
				t.Fatalf("same-line quantity = %d", item.Quantity)
			}
		}
	})

	t.Run("ownership and availability transitions", func(t *testing.T) {
		cart, err := repo.Get(ctx, integrationUser)
		if err != nil {
			t.Fatal(err)
		}
		var itemID string
		var item domain.CartItem
		for _, item := range cart.Items {
			if item.VariantID == integrationVariantA {
				itemID = item.ID
			}
		}
		if _, err := repo.SetQuantity(ctx, integrationOtherUser, itemID, 2); err != domain.ErrCartItemNotFound {
			t.Fatalf("ownership error = %v", err)
		}
		if _, err := conn.Exec(ctx, `UPDATE product_variants SET stock_quantity=2 WHERE id=$1`, integrationVariantA); err != nil {
			t.Fatal(err)
		}
		cart, err = repo.Get(ctx, integrationUser)
		if err != nil || findItem(cart, integrationVariantA).Availability != domain.CartInsufficientStock {
			t.Fatalf("insufficient cart = %+v, err = %v", cart, err)
		}
		assertItemStock(t, cart, integrationVariantA, 2, domain.CartInsufficientStock, false)
		if _, err := repo.SetSelected(ctx, integrationUser, itemID, true); err != domain.ErrCartItemUnavailable {
			t.Fatalf("rejected mutation error = %v", err)
		}
		cart, err = repo.Get(ctx, integrationUser)
		if err != nil || findItem(cart, integrationVariantA).Selected {
			t.Fatalf("rejected mutation did not commit reconcile: cart=%+v err=%v", cart, err)
		}
		if _, err := conn.Exec(ctx, `UPDATE product_variants SET stock_quantity=5 WHERE id=$1`, integrationVariantA); err != nil {
			t.Fatal(err)
		}
		cart, err = repo.Get(ctx, integrationUser)
		if err != nil {
			t.Fatal(err)
		}
		assertItemStock(t, cart, integrationVariantA, 5, domain.CartAvailable, false)
		if _, err := repo.SetAllSelected(ctx, integrationUser, false); err != nil {
			t.Fatal(err)
		}
		cart, err = repo.SetAllSelected(ctx, integrationUser, true)
		if err != nil || !findItem(cart, integrationVariantA).Selected {
			t.Fatalf("select all available lines: cart=%+v err=%v", cart, err)
		}
		if _, err := repo.SetSelected(ctx, integrationOtherUser, itemID, false); err != domain.ErrCartItemNotFound {
			t.Fatalf("SetSelected ownership error = %v", err)
		}
		if _, err := repo.SetAllSelected(ctx, integrationOtherUser, false); err != nil {
			t.Fatalf("SetAllSelected empty-cart operation = %v", err)
		}
		cart, err = repo.Get(ctx, integrationUser)
		if err != nil || !findItem(cart, integrationVariantA).Selected {
			t.Fatalf("other user's select-all changed cart: cart=%+v err=%v", cart, err)
		}
		if _, err := repo.Remove(ctx, integrationOtherUser, itemID); err != domain.ErrCartItemNotFound {
			t.Fatalf("Remove ownership error = %v", err)
		}
		if _, err := conn.Exec(ctx, `UPDATE products SET active=false WHERE id=$1`, integrationProduct); err != nil {
			t.Fatal(err)
		}
		cart, err = repo.Get(ctx, integrationUser)
		if err != nil {
			t.Fatal(err)
		}
		item = findItem(cart, integrationVariantA)
		assertItemStock(t, cart, integrationVariantA, 5, domain.CartUnavailable, false)
		if item.BrandName != "Apple" || item.ProductName != "Phone" || item.Model != "P" || item.ImageURL != "cart-image.jpg" || len(item.Options) != 1 {
			t.Fatalf("inactive variant snapshot = %+v", item)
		}
		if _, err := conn.Exec(ctx, `UPDATE products SET active=true WHERE id=$1; UPDATE product_variants SET active=false WHERE id=$2`, integrationProduct, integrationVariantA); err != nil {
			t.Fatal(err)
		}
		cart, err = repo.Get(ctx, integrationUser)
		if err != nil {
			t.Fatal(err)
		}
		assertItemStock(t, cart, integrationVariantA, 5, domain.CartUnavailable, false)
		if _, err := conn.Exec(ctx, `UPDATE product_variants SET active=true, stock_quantity=0 WHERE id=$1`, integrationVariantA); err != nil {
			t.Fatal(err)
		}
		cart, err = repo.Get(ctx, integrationUser)
		if err != nil {
			t.Fatal(err)
		}
		assertItemStock(t, cart, integrationVariantA, 0, domain.CartOutOfStock, false)
	})

	t.Run("snapshot refresh and precision", func(t *testing.T) {
		var item domain.CartItem
		if _, err := conn.Exec(ctx, `UPDATE products SET active=true, name='Phone Updated', model='P2' WHERE id=$1`, integrationProduct); err != nil {
			t.Fatal(err)
		}
		if _, err := conn.Exec(ctx, `UPDATE product_variants SET active=true, stock_quantity=1, price_vnd=100 WHERE id=$1`, integrationVariantA); err != nil {
			t.Fatal(err)
		}
		cart, err := repo.Get(ctx, integrationUser)
		if err != nil {
			t.Fatal(err)
		}
		item = findItem(cart, integrationVariantA)
		if item.Availability != domain.CartInsufficientStock || item.StockQuantity != 1 || item.UnitPriceVND == nil || item.LineTotalVND == nil {
			t.Fatalf("precision item = %+v", item)
		}
		if item.BrandName != "Apple" || item.ProductName != "Phone Updated" || item.Model != "P2" || item.ImageURL != "cart-image.jpg" || len(item.Options) != 1 || item.Options[0].ValueLabel != "Red" {
			t.Fatalf("live snapshot = %+v", item)
		}
		if _, err := conn.Exec(ctx, `UPDATE product_variants SET price_vnd=99999999999999999999999999999999999999, stock_quantity=5 WHERE id=$1`, integrationVariantB); err != nil {
			t.Fatal(err)
		}
		if _, err := conn.Exec(ctx, `UPDATE product_variants SET stock_quantity=0 WHERE id=$1`, integrationVariantC); err != nil {
			t.Fatal(err)
		}
		cart, err = repo.SetAllSelected(ctx, integrationUser, true)
		if err != nil || cart.SelectedTotalVND != "99999999999999999999999999999999999999" {
			t.Fatalf("38-digit selected aggregate = %s, cart=%+v err=%v", cart.SelectedTotalVND, cart, err)
		}
		if _, err := conn.Exec(ctx, `UPDATE products SET active=false WHERE id=$1`, integrationProduct); err != nil {
			t.Fatal(err)
		}
		cart, err = repo.Get(ctx, integrationUser)
		item = findItem(cart, integrationVariantA)
		if err != nil || item.Availability != domain.CartUnavailable || item.Selected || item.UnitPriceVND != nil || item.LineTotalVND != nil || item.BrandName != "Apple" || item.ProductName != "Phone Updated" || item.Model != "P2" || item.ImageURL != "cart-image.jpg" || len(item.Options) != 1 || item.Options[0].ValueLabel != "Red" {
			t.Fatalf("snapshot fallback = %+v, err=%v", item, err)
		}
	})

	if _, err := conn.Exec(ctx, `UPDATE products SET stock_quantity=9223372036854775807 WHERE id=$1; UPDATE product_variants SET stock_quantity=9223372036854775807 WHERE id=$2; UPDATE cart_items SET quantity=9223372036854775807 WHERE user_id=$3 AND variant_id=$2`, integrationProduct, integrationVariantA, integrationUser); err != nil {
		t.Fatal(err)
	}
	applyMigration(t, ctx, conn, "000004_int64_stock_quantity.down.sql")
	assertRolledBackInt64Schema(t, ctx, conn)
	assertRolledBackInt64Constraints(t, ctx, conn)
	applyMigration(t, ctx, conn, "000004_int64_stock_quantity.up.sql")
	assertInt64SchemaRestored(t, ctx, conn)
	assertSchemaConstraints(t, ctx, conn)
	applyMigration(t, ctx, conn, "000003_phone_variants_cart.down.sql")
	applyMigration(t, ctx, conn, "000002_create_catalog.down.sql")
	applyMigration(t, ctx, conn, "000001_create_users.down.sql")
	applyMigration(t, ctx, conn, "000001_create_users.up.sql")
	applyMigration(t, ctx, conn, "000002_create_catalog.up.sql")
	applyMigration(t, ctx, conn, "000003_phone_variants_cart.up.sql")
	applyMigration(t, ctx, conn, "000004_int64_stock_quantity.up.sql")
}

func TestInt64MigrationRejectsFractionalStructurallyValidVariant(t *testing.T) {
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
	for _, migration := range []string{"000001_create_users.up.sql", "000002_create_catalog.up.sql", "000003_phone_variants_cart.up.sql"} {
		applyMigration(t, ctx, conn, migration)
	}
	if _, err := conn.Exec(ctx, `ALTER TABLE product_variants ALTER COLUMN stock_quantity TYPE numeric USING stock_quantity::numeric`); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(ctx, `
		INSERT INTO categories(id,name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','Migration Test');
		INSERT INTO products(id,category_id,name,price,currency,active) VALUES ('aaaaaaaa-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','Migration Test',1,'VND',true);
		INSERT INTO product_option_groups(id,product_id,label) VALUES ('aaaaaaaa-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000002','Color');
		INSERT INTO product_option_values(id,product_id,group_id,label) VALUES ('aaaaaaaa-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000003','Red');
		INSERT INTO product_variants(id,product_id,price_vnd,stock_quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000005','aaaaaaaa-0000-0000-0000-000000000002',1,1.5);
		INSERT INTO variant_option_values(variant_id,product_id,group_id,option_value_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000005','aaaaaaaa-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000004')`); err != nil {
		t.Fatal(err)
	}
	if err := conn.Ping(ctx); err != nil {
		t.Fatal(err)
	}
	if err := applyMigrationExpectError(t, ctx, conn, "000004_int64_stock_quantity.up.sql"); err == nil {
		t.Fatal("migration accepted fractional stock on a structurally valid variant")
	}
}

func applyMigrationExpectError(t *testing.T, ctx context.Context, conn *pgx.Conn, name string) error {
	t.Helper()
	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(root, "db", "migrations", name))
	if err != nil {
		t.Fatal(err)
	}
	_, err = conn.Exec(ctx, string(data))
	return err
}

func connectIntegrationDB(t *testing.T, ctx context.Context, dbURL string) *pgx.Conn {
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

func applyMigration(t *testing.T, ctx context.Context, conn *pgx.Conn, name string) {
	t.Helper()
	root, err := filepath.Abs(filepath.Join("..", ".."))
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

func seedCatalog(t *testing.T, ctx context.Context, conn *pgx.Conn, path string) {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(ctx, string(data)); err != nil {
		t.Fatalf("seed catalog: %v", err)
	}
}

func seedIntegrationCartData(t *testing.T, ctx context.Context, conn *pgx.Conn) {
	t.Helper()
	tx, err := conn.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	statements := []struct {
		sql  string
		args []any
	}{
		{`INSERT INTO users(id,email,password_hash) VALUES ($1,'cart-a@example.com','x'),($2,'cart-b@example.com','x')`, []any{integrationUser, integrationOtherUser}},
		{`INSERT INTO products(id,category_id,name,model,price,currency,active) VALUES ($1,$2,'Phone','P',0,'VND',true),($3,$2,'Phone B','PB',0,'VND',true),($4,$2,'Phone C','PC',0,'VND',true)`, []any{integrationProduct, integrationCategory, integrationProductB, integrationProductC}},
		{`INSERT INTO product_option_groups(id,product_id,label) VALUES ($1,$2,'Color')`, []any{integrationGroup, integrationProduct}},
		{`INSERT INTO product_option_values(id,product_id,group_id,label) VALUES ($1,$2,$3,'Red')`, []any{integrationValue, integrationProduct, integrationGroup}},
		{`INSERT INTO product_images(id,product_id,url) VALUES ($1,$2,'cart-image.jpg')`, []any{integrationImage, integrationProduct}},
		{`INSERT INTO product_variants(id,product_id,price_vnd,stock_quantity) VALUES ($1,$2,100,5),($3,$4,200,5),($5,$6,300,5)`, []any{integrationVariantA, integrationProduct, integrationVariantB, integrationProductB, integrationVariantC, integrationProductC}},
		{`INSERT INTO variant_option_values(variant_id,product_id,group_id,option_value_id) VALUES ($1,$2,$3,$4)`, []any{integrationVariantA, integrationProduct, integrationGroup, integrationValue}},
	}
	for _, statement := range statements {
		if _, err := tx.Exec(ctx, statement.sql, statement.args...); err != nil {
			t.Fatal(err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
}

func assertSchemaConstraints(t *testing.T, ctx context.Context, conn *pgx.Conn) {
	t.Helper()
	checks := []string{
		`INSERT INTO product_variants(product_id,price_vnd) VALUES ('55555555-5555-5555-5555-555555555555',0)`,
		`INSERT INTO product_variants(product_id,price_vnd) VALUES ('55555555-5555-5555-5555-555555555555',100000000000000000000000000000000000000)`,
		`INSERT INTO product_variants(product_id,price_vnd,stock_quantity) VALUES ('55555555-5555-5555-5555-555555555555',100,100000000000000000000000000000000000000)`,
		`INSERT INTO product_variants(product_id,price_vnd,stock_quantity) VALUES ('55555555-5555-5555-5555-555555555555',100,9223372036854775808)`,
		`INSERT INTO product_variants(product_id,price_vnd,stock_quantity) VALUES ('55555555-5555-5555-5555-555555555555',100,-1)`,
		`INSERT INTO product_variants(product_id,price_vnd,stock_quantity) VALUES ('55555555-5555-5555-5555-555555555555',100,1.5)`,
	}
	for _, statement := range checks {
		if _, err := conn.Exec(ctx, statement); err == nil {
			t.Fatalf("constraint accepted invalid statement: %s", statement)
		}
	}
	tx, err := conn.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO products(id,category_id,name,price,currency,active) VALUES ('99999999-9999-9999-9999-999999999990','10000000-0000-0000-0000-000000000001','Invalid',0,'VND',true)`); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO product_option_groups(id,product_id,label) VALUES ('99999999-9999-9999-9999-999999999991','99999999-9999-9999-9999-999999999990','invalid-test')`); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO product_variants(id,product_id,price_vnd) VALUES ('99999999-9999-9999-9999-999999999992','99999999-9999-9999-9999-999999999990',100)`); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err == nil {
		t.Fatal("deferred variant integrity accepted missing option link")
	}
}

func assertCartQuantityConstraints(t *testing.T, ctx context.Context, conn *pgx.Conn) {
	t.Helper()
	checks := []string{
		`UPDATE products SET stock_quantity=1.5 WHERE id='55555555-5555-5555-5555-555555555555'`,
		`UPDATE products SET stock_quantity=-1 WHERE id='55555555-5555-5555-5555-555555555555'`,
		`UPDATE products SET stock_quantity=9223372036854775808 WHERE id='55555555-5555-5555-5555-555555555555'`,
		`INSERT INTO cart_items(user_id,variant_id,quantity) VALUES ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',0)`,
		`INSERT INTO cart_items(user_id,variant_id,quantity) VALUES ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',-1)`,
		`INSERT INTO cart_items(user_id,variant_id,quantity) VALUES ('22222222-2222-2222-2222-222222222222','66666666-6666-6666-6666-666666666666',1.5)`,
		`INSERT INTO cart_items(user_id,variant_id,quantity) VALUES ('22222222-2222-2222-2222-222222222222','88888888-8888-8888-8888-888888888888',9223372036854775808)`,
	}
	for _, statement := range checks {
		if _, err := conn.Exec(ctx, statement); err == nil {
			t.Fatalf("cart quantity constraint accepted invalid statement: %s", statement)
		}
	}
}

func assertRolledBackInt64Schema(t *testing.T, ctx context.Context, conn *pgx.Conn) {
	t.Helper()
	var productType, variantType, cartType string
	if err := conn.QueryRow(ctx, `SELECT data_type FROM information_schema.columns WHERE table_name='products' AND column_name='stock_quantity'`).Scan(&productType); err != nil {
		t.Fatal(err)
	}
	if err := conn.QueryRow(ctx, `SELECT data_type FROM information_schema.columns WHERE table_name='product_variants' AND column_name='stock_quantity'`).Scan(&variantType); err != nil {
		t.Fatal(err)
	}
	if err := conn.QueryRow(ctx, `SELECT data_type FROM information_schema.columns WHERE table_name='cart_items' AND column_name='quantity'`).Scan(&cartType); err != nil {
		t.Fatal(err)
	}
	if productType != "numeric" || variantType != "numeric" || cartType != "numeric" {
		t.Fatalf("rolled-back types = %s/%s/%s", productType, variantType, cartType)
	}
	var productStock, variantStock, quantity string
	if err := conn.QueryRow(ctx, `SELECT stock_quantity::text FROM products WHERE id=$1`, integrationProduct).Scan(&productStock); err != nil {
		t.Fatal(err)
	}
	if err := conn.QueryRow(ctx, `SELECT stock_quantity::text FROM product_variants WHERE id=$1`, integrationVariantA).Scan(&variantStock); err != nil {
		t.Fatal(err)
	}
	if err := conn.QueryRow(ctx, `SELECT quantity::text FROM cart_items WHERE user_id=$1 AND variant_id=$2`, integrationUser, integrationVariantA).Scan(&quantity); err != nil {
		t.Fatal(err)
	}
	if productStock != "9223372036854775807" || variantStock != "9223372036854775807" || quantity != "9223372036854775807" {
		t.Fatalf("rollback lost MaxInt64 data: product=%s variant=%s quantity=%s", productStock, variantStock, quantity)
	}
}

func assertRolledBackInt64Constraints(t *testing.T, ctx context.Context, conn *pgx.Conn) {
	t.Helper()
	checks := []string{
		`UPDATE products SET stock_quantity=1.5 WHERE id='55555555-5555-5555-5555-555555555555'`,
		`UPDATE products SET stock_quantity=-1 WHERE id='55555555-5555-5555-5555-555555555555'`,
		`UPDATE products SET stock_quantity=9223372036854775808 WHERE id='55555555-5555-5555-5555-555555555555'`,
		`UPDATE product_variants SET stock_quantity=1.5 WHERE id='33333333-3333-3333-3333-333333333333'`,
		`UPDATE product_variants SET stock_quantity=-1 WHERE id='33333333-3333-3333-3333-333333333333'`,
		`UPDATE product_variants SET stock_quantity=9223372036854775808 WHERE id='33333333-3333-3333-3333-333333333333'`,
		`UPDATE cart_items SET quantity=1.5 WHERE user_id='11111111-1111-1111-1111-111111111111' AND variant_id='33333333-3333-3333-3333-333333333333'`,
		`UPDATE cart_items SET quantity=0 WHERE user_id='11111111-1111-1111-1111-111111111111' AND variant_id='33333333-3333-3333-3333-333333333333'`,
		`UPDATE cart_items SET quantity=9223372036854775808 WHERE user_id='11111111-1111-1111-1111-111111111111' AND variant_id='33333333-3333-3333-3333-333333333333'`,
	}
	for _, statement := range checks {
		if _, err := conn.Exec(ctx, statement); err == nil {
			t.Fatalf("rolled-back constraint accepted invalid statement: %s", statement)
		}
	}
}

func assertInt64SchemaRestored(t *testing.T, ctx context.Context, conn *pgx.Conn) {
	t.Helper()
	var productType, variantType, cartType string
	if err := conn.QueryRow(ctx, `SELECT data_type FROM information_schema.columns WHERE table_name='products' AND column_name='stock_quantity'`).Scan(&productType); err != nil {
		t.Fatal(err)
	}
	if err := conn.QueryRow(ctx, `SELECT data_type FROM information_schema.columns WHERE table_name='product_variants' AND column_name='stock_quantity'`).Scan(&variantType); err != nil {
		t.Fatal(err)
	}
	if err := conn.QueryRow(ctx, `SELECT data_type FROM information_schema.columns WHERE table_name='cart_items' AND column_name='quantity'`).Scan(&cartType); err != nil {
		t.Fatal(err)
	}
	if productType != "numeric" || variantType != "numeric" || cartType != "numeric" {
		t.Fatalf("restored types = %s/%s/%s", productType, variantType, cartType)
	}
}

func findItem(cart *domain.Cart, variantID string) domain.CartItem {
	for _, item := range cart.Items {
		if item.VariantID == variantID {
			return item
		}
	}
	return domain.CartItem{}
}

func assertItemStock(t *testing.T, cart *domain.Cart, variantID string, stock int64, availability domain.CartAvailability, selected bool) {
	t.Helper()
	item := findItem(cart, variantID)
	if item.StockQuantity != stock || item.Availability != availability || item.Selected != selected {
		t.Fatalf("item = %+v, want stock=%d availability=%s selected=%t", item, stock, availability, selected)
	}
}
