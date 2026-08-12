package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

type CatalogRepository struct {
	q *sqlc.Queries
}

func NewCatalogRepository(pool Querier) *CatalogRepository {
	return &CatalogRepository{q: sqlc.New(pool)}
}

func (r *CatalogRepository) ListCategories(ctx context.Context) ([]domain.Category, error) {
	rows, err := r.q.ListCategories(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Category, 0, len(rows))
	for _, row := range rows {
		out = append(out, domain.Category{ID: row.ID, Name: row.Name})
	}
	return out, nil
}

func (r *CatalogRepository) ListProducts(ctx context.Context, f domain.ProductFilter) ([]domain.Product, error) {
	params := sqlc.ListProductsParams{
		Q:        pgtype.Text{String: f.Query, Valid: f.Query != ""},
		MinPrice: toNumeric(f.MinPrice),
		MaxPrice: toNumeric(f.MaxPrice),
	}
	if f.CategoryID != "" {
		var id pgtype.UUID
		if err := id.Scan(f.CategoryID); err != nil {
			return nil, err
		}
		params.CategoryID = id
	}
	if f.InStock != nil {
		params.InStock = pgtype.Bool{Bool: *f.InStock, Valid: true}
	}

	rows, err := r.q.ListProducts(ctx, params)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Product, 0, len(rows))
	for _, row := range rows {
		p := domain.Product{
			ID:            row.ID,
			Name:          row.Name,
			Description:   row.Description,
			Category:      domain.Category{ID: row.CategoryID, Name: row.CategoryName},
			Price:         row.Price,
			Currency:      row.Currency,
			StockQuantity: int(row.StockQuantity),
			CreatedAt:     row.CreatedAt,
			UpdatedAt:     row.UpdatedAt,
		}
		if row.PrimaryImageUrl != "" {
			p.ImageURLs = []string{row.PrimaryImageUrl}
		}
		out = append(out, p)
	}
	return out, nil
}

func (r *CatalogRepository) GetProductByID(ctx context.Context, id string) (*domain.Product, error) {
	row, err := r.q.GetProductByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrProductNotFound
		}
		return nil, err
	}
	images, err := r.q.ListProductImages(ctx, id)
	if err != nil {
		return nil, err
	}
	return &domain.Product{
		ID:            row.ID,
		Name:          row.Name,
		Description:   row.Description,
		Category:      domain.Category{ID: row.CategoryID, Name: row.CategoryName},
		Price:         row.Price,
		Currency:      row.Currency,
		ImageURLs:     images,
		StockQuantity: int(row.StockQuantity),
		CreatedAt:     row.CreatedAt,
		UpdatedAt:     row.UpdatedAt,
	}, nil
}

func toNumeric(s string) pgtype.Numeric {
	if s == "" {
		return pgtype.Numeric{}
	}
	var n pgtype.Numeric
	if err := n.Scan(s); err != nil {
		return pgtype.Numeric{}
	}
	return n
}
