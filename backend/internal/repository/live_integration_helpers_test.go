//go:build integration

package repository

import (
	"context"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
)

const (
	liveAdminID    = "a1000000-0000-0000-0000-000000000001"
	liveCustomerID = "a1000000-0000-0000-0000-000000000002"
	liveCustomer2  = "a1000000-0000-0000-0000-000000000003"
	liveCategoryID = "a2000000-0000-0000-0000-000000000001"
	liveProductA   = "a3000000-0000-0000-0000-00000000000a"
	liveProductB   = "a3000000-0000-0000-0000-00000000000b"
	liveVariantA1  = "a4000000-0000-0000-0000-0000000000a1"
	liveVariantA2  = "a4000000-0000-0000-0000-0000000000a2"
	liveVariantB1  = "a4000000-0000-0000-0000-0000000000b1"
)

// startLiveIntegrationDB starts an isolated PostgreSQL container with every
// migration applied and the livestream fixtures seeded.
func startLiveIntegrationDB(t *testing.T) (*pgx.Conn, *pgxpool.Pool) {
	t.Helper()
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
	t.Cleanup(func() { conn.Close(ctx) })
	for _, name := range upMigrationNames(t) {
		applyMigration(t, ctx, conn, name)
	}
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	seedLiveFixtures(t, ctx, conn)
	return conn, pool
}

func upMigrationNames(t *testing.T) []string {
	t.Helper()
	entries, err := os.ReadDir(filepath.Join("..", "..", "db", "migrations"))
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, entry := range entries {
		if strings.HasSuffix(entry.Name(), ".up.sql") {
			names = append(names, entry.Name())
		}
	}
	sort.Strings(names)
	return names
}

func seedLiveFixtures(t *testing.T, ctx context.Context, conn *pgx.Conn) {
	t.Helper()
	statements := []string{
		`INSERT INTO users (id, email, password_hash, role) VALUES
			('` + liveAdminID + `', 'admin@live.test', 'hash', 'admin'),
			('` + liveCustomerID + `', 'lan@live.test', 'hash', 'customer'),
			('` + liveCustomer2 + `', 'minh@live.test', 'hash', 'customer')`,
		`INSERT INTO categories (id, name) VALUES ('` + liveCategoryID + `', 'Live Category')`,
		`INSERT INTO products (id, category_id, name, model, brand, description, price, currency, stock_quantity, featured, active) VALUES
			('` + liveProductA + `', '` + liveCategoryID + `', 'Live Phone A', 'LA-1', 'Aura', '', 1000000, 'VND', 20, false, true),
			('` + liveProductB + `', '` + liveCategoryID + `', 'Live Phone B', 'LB-1', 'Aura', '', 3000000, 'VND', 10, false, true)`,
		`INSERT INTO product_variants (id, product_id, price_vnd, stock_quantity, active) VALUES
			('` + liveVariantA1 + `', '` + liveProductA + `', 1000000, 10, true),
			('` + liveVariantA2 + `', '` + liveProductA + `', 2000000, 10, true),
			('` + liveVariantB1 + `', '` + liveProductB + `', 3000000, 10, true)`,
	}
	for _, statement := range statements {
		if _, err := conn.Exec(ctx, statement); err != nil {
			t.Fatalf("seed live fixtures: %v", err)
		}
	}
}

func liveText(value string) pgtype.Text {
	return pgtype.Text{String: value, Valid: true}
}
