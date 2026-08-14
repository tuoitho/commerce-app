//go:build integration

package repository

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"

	"commerce-backend/internal/domain"
)

const (
	integrationApple  = "11111111-1111-1111-1111-111111111111"
	integrationXiaomi = "22222222-2222-2222-2222-222222222222"
	integrationOther  = "33333333-3333-3333-3333-333333333333"
	integrationP1     = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	integrationP2     = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
	integrationP3     = "cccccccc-cccc-cccc-cccc-cccccccccccc"
	integrationP4     = "dddddddd-dddd-dddd-dddd-dddddddddddd"
	integrationP5     = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"
)

func TestCatalogRepositorySQLIntegration(t *testing.T) {
	ctx := context.Background()
	dbURL := integrationDatabaseURL()
	conn, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		t.Fatalf("integration database is required: connect %v: %v", dbURL, err)
	}
	defer conn.Close(ctx)
	tx, err := conn.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, "SET LOCAL search_path TO pg_temp"); err != nil {
		t.Fatal(err)
	}
	createIntegrationCatalog(t, ctx, tx)
	seedIntegrationCatalog(t, ctx, tx)
	repo := NewCatalogRepository(tx)

	categories, err := repo.ListCategories(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(categories) != 2 || categories[0].Name != "Apple" || categories[1].Name != "Xiaomi" {
		t.Fatalf("active categories = %+v", categories)
	}

	products, err := repo.ListProducts(ctx, domain.ProductFilter{Query: "xIaOmI"})
	if err != nil || len(products) != 1 || products[0].ID != integrationP3 {
		t.Fatalf("brand search = %+v, err = %v", products, err)
	}
	products, err = repo.ListProducts(ctx, domain.ProductFilter{Query: "aX-1"})
	if err != nil || len(products) != 1 || products[0].ID != integrationP1 {
		t.Fatalf("model search = %+v, err = %v", products, err)
	}

	products, err = repo.ListProducts(ctx, domain.ProductFilter{CategoryIDs: []string{integrationApple, integrationXiaomi, "99999999-9999-9999-9999-999999999999"}})
	if err != nil || len(products) != 3 {
		t.Fatalf("repeated/category OR filtering = %+v, err = %v", products, err)
	}
	products, err = repo.ListProducts(ctx, domain.ProductFilter{CategoryIDs: []string{"99999999-9999-9999-9999-999999999999"}})
	if err != nil || len(products) != 3 {
		t.Fatalf("unknown category should be ignored: %+v, err = %v", products, err)
	}

	products, err = repo.ListProducts(ctx, domain.ProductFilter{MinPriceVND: domain.MoneyVNDPtr("900"), MaxPriceVND: domain.MoneyVNDPtr("1100")})
	if err != nil || len(products) != 1 || products[0].ID != integrationP1 || products[0].MinPriceVND != "100" || products[0].MaxPriceVND != "1000" {
		t.Fatalf("same-variant price filtering/projection = %+v, err = %v", products, err)
	}
	products, err = repo.ListProducts(ctx, domain.ProductFilter{MinPriceVND: domain.MoneyVNDPtr("500"), MaxPriceVND: domain.MoneyVNDPtr("600")})
	if err != nil || len(products) != 0 {
		t.Fatalf("split-variant price range should not match: %+v, err = %v", products, err)
	}

	inStock := true
	products, err = repo.ListProducts(ctx, domain.ProductFilter{InStock: &inStock})
	if err != nil || len(products) != 1 || products[0].ID != integrationP1 {
		t.Fatalf("in_stock=true = %+v, err = %v", products, err)
	}
	inStock = false
	products, err = repo.ListProducts(ctx, domain.ProductFilter{InStock: &inStock})
	if err != nil || len(products) != 2 || products[0].ID != integrationP2 || products[1].ID != integrationP3 {
		t.Fatalf("in_stock=false = %+v, err = %v", products, err)
	}

	featured, err := repo.ListFeaturedProducts(ctx)
	if err != nil || len(featured) != 2 || featured[0].ID != integrationP1 || featured[1].ID != integrationP3 {
		t.Fatalf("featured = %+v, err = %v", featured, err)
	}
	detail, err := repo.GetProductByID(ctx, integrationP1)
	if err != nil || detail.MinPriceVND != "100" || detail.MaxPriceVND != "1000" || len(detail.OptionGroups) != 2 || len(detail.Variants) != 2 {
		t.Fatalf("detail graph = %+v, err = %v", detail, err)
	}
	if _, err := repo.GetProductByID(ctx, integrationP4); err != domain.ErrProductNotFound {
		t.Fatalf("inactive detail error = %v", err)
	}
}

func integrationDatabaseURL() string {
	if value := os.Getenv("DB_URL"); value != "" {
		return value
	}
	return "postgres://commerce:commerce@localhost:5432/commerce?sslmode=disable"
}

func createIntegrationCatalog(t *testing.T, ctx context.Context, tx pgx.Tx) {
	t.Helper()
	for _, statement := range []string{
		`CREATE TEMP TABLE categories (id uuid PRIMARY KEY, name text NOT NULL)`,
		`CREATE TEMP TABLE products (id uuid PRIMARY KEY, category_id uuid NOT NULL, name text NOT NULL, model text NOT NULL, description text NOT NULL, featured boolean NOT NULL, active boolean NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL)`,
		`CREATE TEMP TABLE product_images (id uuid PRIMARY KEY, product_id uuid NOT NULL, url text NOT NULL, position integer NOT NULL)`,
		`CREATE TEMP TABLE product_option_groups (id uuid PRIMARY KEY, product_id uuid NOT NULL, label text NOT NULL, position integer NOT NULL)`,
		`CREATE TEMP TABLE product_option_values (id uuid PRIMARY KEY, product_id uuid NOT NULL, group_id uuid NOT NULL, label text NOT NULL, position integer NOT NULL)`,
		`CREATE TEMP TABLE product_variants (id uuid PRIMARY KEY, product_id uuid NOT NULL, price_vnd numeric NOT NULL, stock_quantity numeric NOT NULL, active boolean NOT NULL)`,
		`CREATE TEMP TABLE variant_option_values (variant_id uuid NOT NULL, product_id uuid NOT NULL, group_id uuid NOT NULL, option_value_id uuid NOT NULL)`,
	} {
		if _, err := tx.Exec(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
}

func seedIntegrationCatalog(t *testing.T, ctx context.Context, tx pgx.Tx) {
	t.Helper()
	statements := []string{
		`INSERT INTO categories VALUES ('11111111-1111-1111-1111-111111111111','Apple'),('22222222-2222-2222-2222-222222222222','Xiaomi'),('33333333-3333-3333-3333-333333333333','Legacy')`,
		`INSERT INTO products VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Alpha Phone','AX-1','',true,true,now(),now()),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-1111-1111-1111-111111111111','Beta Phone','BT-2','',false,true,now(),now()),('cccccccc-cccc-cccc-cccc-cccccccccccc','22222222-2222-2222-2222-222222222222','Gamma Phone','XM-3','',true,true,now(),now()),('dddddddd-dddd-dddd-dddd-dddddddddddd','33333333-3333-3333-3333-333333333333','Inactive Phone','IN-4','',true,false,now(),now()),('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','33333333-3333-3333-3333-333333333333','Empty Phone','EM-5','',false,true,now(),now())`,
		`INSERT INTO product_images VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','alpha.jpg',0)`,
		`INSERT INTO product_option_groups VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Color',0),('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Storage',1)`,
		`INSERT INTO product_option_values VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','Black',0),('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3','128 GB',0)`,
		`INSERT INTO product_variants VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',100,0,true),('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',1000,5,true),('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',9999,9,false),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',50,0,true),('cccccccc-cccc-cccc-cccc-ccccccccccc1','cccccccc-cccc-cccc-cccc-cccccccccccc',200,0,true),('dddddddd-dddd-dddd-dddd-ddddddddddd1','dddddddd-dddd-dddd-dddd-dddddddddddd',10,10,true),('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1','eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',10,10,false)`,
		`INSERT INTO variant_option_values VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4'),('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5'),('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4'),('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5')`,
	}
	for _, statement := range statements {
		if _, err := tx.Exec(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
}
