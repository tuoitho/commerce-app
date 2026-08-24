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

	brands, err := repo.ListBrands(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(brands) != 2 || brands[0] != "Apple" || brands[1] != "Xiaomi" {
		t.Fatalf("active brands = %+v", brands)
	}

	products, err := repo.ListProducts(ctx, domain.ProductFilter{Brands: []string{"apple"}})
	if err != nil || len(products) != 2 {
		t.Fatalf("brand filter apple = %+v, err = %v", products, err)
	}
	products, err = repo.ListProducts(ctx, domain.ProductFilter{Brands: []string{"xIaOmI"}})
	if err != nil || len(products) != 1 || products[0].ID != integrationP3 {
		t.Fatalf("brand filter xIaOmI = %+v, err = %v", products, err)
	}
	products, err = repo.ListProducts(ctx, domain.ProductFilter{Brands: []string{"apple", "xiaomi"}})
	if err != nil || len(products) != 3 {
		t.Fatalf("multi brand filter = %+v, err = %v", products, err)
	}

	products, err = repo.ListProducts(ctx, domain.ProductFilter{Query: "xIaOmI"})
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
	if err != nil || detail.Brand != "Apple" || detail.MinPriceVND != "100" || detail.MaxPriceVND != "1000" || len(detail.OptionGroups) != 2 || len(detail.Variants) != 2 {
		t.Fatalf("detail graph = %+v, err = %v", detail, err)
	}
	if _, err := repo.GetProductByID(ctx, integrationP4); err != domain.ErrProductNotFound {
		t.Fatalf("inactive detail error = %v", err)
	}

	t.Run("atomic create product with variants", func(t *testing.T) {
		input := domain.SaveProductInput{
			Name:        "iPhone 15 Pro",
			Model:       "IP15P",
			Brand:       "Apple",
			Description: "Pro variant model",
			CategoryID:  integrationApple,
			Featured:    true,
			ImageURLs:   []string{"https://img.com/iphone-front.jpg", "https://img.com/iphone-back.jpg"},
			HasVariants: true,
			OptionGroups: []domain.OptionGroupInput{
				{
					ID:       "aaaaaaaa-1111-0000-0000-000000000001",
					Label:    "Màu sắc",
					Position: 0,
					Values: []domain.OptionValueInput{
						{ID: "aaaaaaaa-1111-0000-0000-000000000002", Label: "Titan Tự Nhiên", Position: 0},
						{ID: "aaaaaaaa-1111-0000-0000-000000000003", Label: "Titan Xanh", Position: 1},
					},
				},
				{
					ID:       "aaaaaaaa-2222-0000-0000-000000000001",
					Label:    "Dung lượng",
					Position: 1,
					Values: []domain.OptionValueInput{
						{ID: "aaaaaaaa-2222-0000-0000-000000000002", Label: "128GB", Position: 0},
						{ID: "aaaaaaaa-2222-0000-0000-000000000003", Label: "256GB", Position: 1},
					},
				},
			},
			Variants: []domain.VariantInput{
				{
					ID: "aaaaaaaa-3333-0000-0000-000000000001",
					OptionValueIDs: map[string]string{
						"aaaaaaaa-1111-0000-0000-000000000001": "aaaaaaaa-1111-0000-0000-000000000002",
						"aaaaaaaa-2222-0000-0000-000000000001": "aaaaaaaa-2222-0000-0000-000000000002",
					},
					PriceVND:      "28990000",
					StockQuantity: 10,
					Active:        true,
				},
				{
					ID: "aaaaaaaa-3333-0000-0000-000000000002",
					OptionValueIDs: map[string]string{
						"aaaaaaaa-1111-0000-0000-000000000001": "aaaaaaaa-1111-0000-0000-000000000002",
						"aaaaaaaa-2222-0000-0000-000000000001": "aaaaaaaa-2222-0000-0000-000000000003",
					},
					PriceVND:      "31990000",
					StockQuantity: 5,
					Active:        true,
				},
				{
					ID: "aaaaaaaa-3333-0000-0000-000000000003",
					OptionValueIDs: map[string]string{
						"aaaaaaaa-1111-0000-0000-000000000001": "aaaaaaaa-1111-0000-0000-000000000003",
						"aaaaaaaa-2222-0000-0000-000000000001": "aaaaaaaa-2222-0000-0000-000000000002",
					},
					PriceVND:      "28990000",
					StockQuantity: 0,
					Active:        true,
				},
				{
					ID: "aaaaaaaa-3333-0000-0000-000000000004",
					OptionValueIDs: map[string]string{
						"aaaaaaaa-1111-0000-0000-000000000001": "aaaaaaaa-1111-0000-0000-000000000003",
						"aaaaaaaa-2222-0000-0000-000000000001": "aaaaaaaa-2222-0000-0000-000000000003",
					},
					PriceVND:      "35000000",
					StockQuantity: 20,
					Active:        false,
				},
			},
		}

		created, err := repo.CreateProduct(ctx, input)
		if err != nil {
			t.Fatalf("CreateProduct failed: %v", err)
		}
		if created.Price != "28990000" || created.MinPriceVND != "28990000" || created.MaxPriceVND != "31990000" {
			t.Fatalf("created price range mismatch: min=%s max=%s price=%s", created.MinPriceVND, created.MaxPriceVND, created.Price)
		}
		if created.StockQuantity != 15 {
			t.Fatalf("expected total active stock = 15, got %d", created.StockQuantity)
		}
		if len(created.OptionGroups) != 2 || len(created.Variants) != 4 {
			t.Fatalf("expected 2 option groups and 4 variants, got groups=%d variants=%d", len(created.OptionGroups), len(created.Variants))
		}

		// Verify database row values
		var dbPrice, dbStock string
		if err := tx.QueryRow(ctx, `SELECT price::text, stock_quantity::text FROM products WHERE id=$1`, created.ID).Scan(&dbPrice, &dbStock); err != nil {
			t.Fatal(err)
		}
		if dbPrice != "28990000" || dbStock != "15" {
			t.Fatalf("db product row mismatch: price=%s stock=%s", dbPrice, dbStock)
		}

		// 2. Update existing product variants
		updateInput := input
		updateInput.Name = "iPhone 15 Pro Max"
		updateInput.Variants[0].PriceVND = "27990000"
		updateInput.Variants[0].StockQuantity = 8
		updateInput.Variants[1].Active = false // now inactive

		updated, err := repo.UpdateProduct(ctx, created.ID, updateInput)
		if err != nil {
			t.Fatalf("UpdateProduct failed: %v", err)
		}
		if updated.Name != "iPhone 15 Pro Max" || updated.Price != "27990000" || updated.MinPriceVND != "27990000" || updated.MaxPriceVND != "28990000" {
			t.Fatalf("updated product range mismatch: min=%s max=%s price=%s", updated.MinPriceVND, updated.MaxPriceVND, updated.Price)
		}
		if updated.StockQuantity != 8 {
			t.Fatalf("expected updated total active stock = 8, got %d", updated.StockQuantity)
		}

		// 3. Switch to simple product (remove all variants)
		simpleInput := domain.SaveProductInput{
			Name:          "iPhone 15 Pro Max Simple",
			Model:         "IP15PM",
			Brand:         "Apple",
			Description:   "Now a simple product",
			CategoryID:    integrationApple,
			Price:         "29990000",
			StockQuantity: 100,
			HasVariants:   false,
		}

		updatedSimple, err := repo.UpdateProduct(ctx, created.ID, simpleInput)
		if err != nil {
			t.Fatalf("UpdateProduct simple switch failed: %v", err)
		}
		if updatedSimple.Price != "29990000" || updatedSimple.StockQuantity != 100 {
			t.Fatalf("simple product price/stock mismatch: price=%s stock=%d", updatedSimple.Price, updatedSimple.StockQuantity)
		}
		if len(updatedSimple.OptionGroups) != 0 || len(updatedSimple.Variants) != 1 {
			t.Fatalf("expected 0 option groups and 1 base variant, got groups=%d variants=%d", len(updatedSimple.OptionGroups), len(updatedSimple.Variants))
		}

		// Verify database tables are cleaned
		var grpCount, valCount, varCount, linkCount int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM product_option_groups WHERE product_id=$1`, created.ID).Scan(&grpCount); err != nil {
			t.Fatal(err)
		}
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM product_option_values WHERE product_id=$1`, created.ID).Scan(&valCount); err != nil {
			t.Fatal(err)
		}
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM product_variants WHERE product_id=$1 AND active=true`, created.ID).Scan(&varCount); err != nil {
			t.Fatal(err)
		}
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM variant_option_values WHERE product_id=$1`, created.ID).Scan(&linkCount); err != nil {
			t.Fatal(err)
		}
		if grpCount != 0 || valCount != 0 || varCount != 1 || linkCount != 0 {
			t.Fatalf("expected 0 groups, 0 values, 1 base variant, 0 links, got groups=%d values=%d active_variants=%d links=%d", grpCount, valCount, varCount, linkCount)
		}
	})
}

func integrationDatabaseURL() string {
	if value := os.Getenv("DB_URL"); value != "" {
		return value
	}
	return "postgres://commerce:commerce@localhost:5432/commercesdd?sslmode=disable"
}

func createIntegrationCatalog(t *testing.T, ctx context.Context, tx pgx.Tx) {
	t.Helper()
	for _, statement := range []string{
		`CREATE TEMP TABLE categories (id uuid PRIMARY KEY, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
		`CREATE TEMP TABLE products (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category_id uuid NOT NULL, name text NOT NULL, model text NOT NULL DEFAULT '', brand text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '', price numeric NOT NULL DEFAULT 0, currency text NOT NULL DEFAULT 'VND', stock_quantity numeric NOT NULL DEFAULT 0, featured boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`,
		`CREATE TEMP TABLE product_images (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL, url text NOT NULL, position integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now())`,
		`CREATE TEMP TABLE product_option_groups (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL, label text NOT NULL, position integer NOT NULL DEFAULT 0)`,
		`CREATE TEMP TABLE product_option_values (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL, group_id uuid NOT NULL, label text NOT NULL, position integer NOT NULL DEFAULT 0)`,
		`CREATE TEMP TABLE product_variants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL, price_vnd numeric NOT NULL, stock_quantity numeric NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`,
		`CREATE TEMP TABLE variant_option_values (variant_id uuid NOT NULL, product_id uuid NOT NULL, group_id uuid NOT NULL, option_value_id uuid NOT NULL, PRIMARY KEY (variant_id, group_id))`,
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
		`INSERT INTO products (id, category_id, name, model, brand, description, featured, active, created_at, updated_at) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Alpha Phone','AX-1','Apple','',true,true,now(),now()),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-1111-1111-1111-111111111111','Beta Phone','BT-2','Apple','',false,true,now(),now()),('cccccccc-cccc-cccc-cccc-cccccccccccc','22222222-2222-2222-2222-222222222222','Gamma Phone','XM-3','Xiaomi','',true,true,now(),now()),('dddddddd-dddd-dddd-dddd-dddddddddddd','33333333-3333-3333-3333-333333333333','Inactive Phone','IN-4','Legacy','',true,false,now(),now()),('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','33333333-3333-3333-3333-333333333333','Empty Phone','EM-5','Legacy','',false,true,now(),now())`,
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

