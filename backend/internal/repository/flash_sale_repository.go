package repository

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

type flashSaleDB interface {
	sqlc.DBTX
	Begin(context.Context) (pgx.Tx, error)
}

type FlashSaleRepository struct{ db flashSaleDB }

func NewFlashSaleRepository(db flashSaleDB) *FlashSaleRepository {
	return &FlashSaleRepository{db: db}
}

var _ domain.FlashSaleRepository = (*FlashSaleRepository)(nil)

func (r *FlashSaleRepository) GetCurrentPublic(ctx context.Context) (*domain.FlashSaleCampaignPublic, error) {
	q := sqlc.New(r.db)
	fs, err := q.GetCurrentRunningFlashSale(ctx)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	rows, err := q.ListPublicFlashSaleItems(ctx, fs.ID)
	if err != nil {
		return nil, err
	}
	items := make([]domain.FlashSalePublicItem, 0, len(rows))
	for _, row := range rows {
		reg := domain.MoneyVND(row.RegularPriceVnd)
		flash := domain.MoneyVND(row.FlashPriceVnd)
		items = append(items, domain.FlashSalePublicItem{
			ProductID:       row.ProductID,
			VariantID:       row.VariantID,
			ProductName:     row.ProductName,
			Brand:           row.Brand,
			Model:           row.Model,
			ImageURL:        row.ImageUrl,
			OptionLabel:     row.OptionLabel,
			RegularPriceVND: reg,
			FlashPriceVND:   flash,
			DiscountPercent: domain.ComputeDiscountPercent(reg, flash),
			Quota:           int(row.Quota),
			SoldQuantity:    int(row.SoldQuantity),
			InStock:         row.InStock,
		})
	}
	return &domain.FlashSaleCampaignPublic{
		ID:       fs.ID,
		Name:     fs.Name,
		StartsAt: fs.StartsAt.UTC(),
		EndsAt:   fs.EndsAt.UTC(),
		Items:    items,
	}, nil
}

func (r *FlashSaleRepository) ListAdmin(ctx context.Context, filter domain.FlashSaleListFilter) ([]domain.AdminFlashSaleSummary, int64, error) {
	q := sqlc.New(r.db)
	statusArg := pgtype.Text{String: filter.Status, Valid: filter.Status != ""}

	total, err := q.CountAdminFlashSales(ctx, statusArg)
	if err != nil {
		return nil, 0, err
	}
	rows, err := q.ListAdminFlashSales(ctx, sqlc.ListAdminFlashSalesParams{
		Status:    statusArg,
		RowLimit:  int32(filter.Limit),
		RowOffset: int32(filter.Offset),
	})
	if err != nil {
		return nil, 0, err
	}
	now := time.Now().UTC()
	out := make([]domain.AdminFlashSaleSummary, 0, len(rows))
	for _, row := range rows {
		startsAt := row.StartsAt.UTC()
		endsAt := row.EndsAt.UTC()
		out = append(out, domain.AdminFlashSaleSummary{
			ID:           row.ID,
			Name:         row.Name,
			StartsAt:     startsAt,
			EndsAt:       endsAt,
			Active:       row.Active,
			Status:       domain.DeriveFlashSaleStatus(row.Active, startsAt, endsAt, now),
			VariantCount: int(row.VariantCount),
			TotalQuota:   int(row.TotalQuota),
			TotalSold:    int(row.TotalSold),
			CreatedAt:    row.CreatedAt.UTC(),
			UpdatedAt:    row.UpdatedAt.UTC(),
		})
	}
	return out, total, nil
}

func (r *FlashSaleRepository) GetAdminByID(ctx context.Context, id string) (*domain.AdminFlashSaleDetail, error) {
	return getAdminFlashSaleDetail(ctx, sqlc.New(r.db), id)
}

func (r *FlashSaleRepository) ValidationData(ctx context.Context, flashSaleID string, variantIDs []string) (*domain.FlashSaleValidationData, error) {
	q := sqlc.New(r.db)
	data := &domain.FlashSaleValidationData{
		Variants: map[string]domain.FlashSaleValidationVariant{},
		Sold:     map[string]int{},
	}
	variants, err := q.ListVariantsForFlashSaleValidation(ctx, nonNilIDs(variantIDs))
	if err != nil {
		return nil, err
	}
	for _, v := range variants {
		data.Variants[v.ID] = domain.FlashSaleValidationVariant{
			ID:              v.ID,
			ProductID:       v.ProductID,
			VariantActive:   v.VariantActive,
			ProductActive:   v.ProductActive,
			RegularPriceVND: domain.MoneyVND(v.PriceVnd),
		}
	}
	if flashSaleID != "" {
		if _, err := q.GetAdminFlashSaleByID(ctx, flashSaleID); err != nil {
			return nil, mapNotFound(err, domain.ErrFlashSaleNotFound)
		}
		soldRows, err := q.ListFlashSaleItemSold(ctx, flashSaleID)
		if err != nil {
			return nil, err
		}
		for _, s := range soldRows {
			data.Sold[s.VariantID] = int(s.SoldQuantity)
		}
	}
	return data, nil
}

func (r *FlashSaleRepository) Create(ctx context.Context, input domain.SaveFlashSaleInput, resolvedProductIDs map[string]string) (*domain.AdminFlashSaleDetail, error) {
	var detail *domain.AdminFlashSaleDetail
	err := r.inTx(ctx, func(q *sqlc.Queries) error {
		createdBy := pgtype.UUID{}
		if input.CreatedBy != "" {
			if err := createdBy.Scan(input.CreatedBy); err != nil {
				return err
			}
		}
		row, err := q.CreateFlashSale(ctx, sqlc.CreateFlashSaleParams{
			Name:      input.Name,
			StartsAt:  input.StartsAt.UTC(),
			EndsAt:    input.EndsAt.UTC(),
			Active:    input.Active,
			CreatedBy: createdBy,
		})
		if err != nil {
			if isPostgresCode(err, "23P01") {
				return domain.ErrFlashSaleTimeOverlap
			}
			return err
		}
		for i, item := range input.Items {
			if err := q.UpsertFlashSaleItem(ctx, sqlc.UpsertFlashSaleItemParams{
				FlashSaleID:   row.ID,
				ProductID:     resolvedProductIDs[item.VariantID],
				VariantID:     item.VariantID,
				FlashPriceVnd: toNumeric(string(item.FlashPriceVND)),
				Quota:         int32(item.Quota),
				Position:      int32(i),
			}); err != nil {
				return err
			}
		}
		detail, err = getAdminFlashSaleDetail(ctx, q, row.ID)
		return err
	})
	if err != nil {
		return nil, err
	}
	return detail, nil
}

func (r *FlashSaleRepository) Update(ctx context.Context, id string, input domain.SaveFlashSaleInput, resolvedProductIDs map[string]string) (*domain.AdminFlashSaleDetail, error) {
	var detail *domain.AdminFlashSaleDetail
	err := r.inTx(ctx, func(q *sqlc.Queries) error {
		if _, err := q.LockFlashSale(ctx, id); err != nil {
			return mapNotFound(err, domain.ErrFlashSaleNotFound)
		}
		if _, err := q.UpdateFlashSale(ctx, sqlc.UpdateFlashSaleParams{
			ID:       id,
			Name:     input.Name,
			StartsAt: input.StartsAt.UTC(),
			EndsAt:   input.EndsAt.UTC(),
			Active:   input.Active,
		}); err != nil {
			if isPostgresCode(err, "23P01") {
				return domain.ErrFlashSaleTimeOverlap
			}
			return err
		}
		variantIDs := make([]string, 0, len(input.Items))
		for _, item := range input.Items {
			variantIDs = append(variantIDs, item.VariantID)
		}
		if err := q.DeleteFlashSaleItemsExcept(ctx, sqlc.DeleteFlashSaleItemsExceptParams{
			FlashSaleID: id,
			VariantIds:  variantIDs,
		}); err != nil {
			return err
		}
		for i, item := range input.Items {
			if err := q.UpsertFlashSaleItem(ctx, sqlc.UpsertFlashSaleItemParams{
				FlashSaleID:   id,
				ProductID:     resolvedProductIDs[item.VariantID],
				VariantID:     item.VariantID,
				FlashPriceVnd: toNumeric(string(item.FlashPriceVND)),
				Quota:         int32(item.Quota),
				Position:      int32(i),
			}); err != nil {
				if isPostgresCode(err, "23514") {
					return domain.NewValidationError(map[string]string{"items": "Số suất không được nhỏ hơn số đã bán"})
				}
				return err
			}
		}
		var err error
		detail, err = getAdminFlashSaleDetail(ctx, q, id)
		return err
	})
	if err != nil {
		return nil, err
	}
	return detail, nil
}

func (r *FlashSaleRepository) Delete(ctx context.Context, id string) error {
	return r.inTx(ctx, func(q *sqlc.Queries) error {
		if _, err := q.LockFlashSale(ctx, id); err != nil {
			return mapNotFound(err, domain.ErrFlashSaleNotFound)
		}
		sold, err := q.GetFlashSaleTotalSold(ctx, id)
		if err != nil {
			return err
		}
		if sold > 0 {
			return domain.ErrFlashSaleHasOrders
		}
		rows, err := q.DeleteFlashSale(ctx, id)
		if err != nil {
			return err
		}
		if rows == 0 {
			return domain.ErrFlashSaleNotFound
		}
		return nil
	})
}

func getAdminFlashSaleDetail(ctx context.Context, q *sqlc.Queries, id string) (*domain.AdminFlashSaleDetail, error) {
	row, err := q.GetAdminFlashSaleByID(ctx, id)
	if err != nil {
		return nil, mapNotFound(err, domain.ErrFlashSaleNotFound)
	}
	itemRows, err := q.ListAdminFlashSaleItems(ctx, id)
	if err != nil {
		return nil, err
	}
	items := make([]domain.AdminFlashSaleItem, 0, len(itemRows))
	for _, it := range itemRows {
		items = append(items, domain.AdminFlashSaleItem{
			ProductID:       it.ProductID,
			VariantID:       it.VariantID,
			ProductName:     it.ProductName,
			Brand:           it.Brand,
			Model:           it.Model,
			ImageURL:        it.ImageUrl,
			OptionLabel:     it.OptionLabel,
			VariantActive:   it.VariantActive,
			RegularPriceVND: domain.MoneyVND(it.RegularPriceVnd),
			FlashPriceVND:   domain.MoneyVND(it.FlashPriceVnd),
			Quota:           int(it.Quota),
			SoldQuantity:    int(it.SoldQuantity),
			Position:        int(it.Position),
		})
	}
	startsAt := row.StartsAt.UTC()
	endsAt := row.EndsAt.UTC()
	return &domain.AdminFlashSaleDetail{
		ID:        row.ID,
		Name:      row.Name,
		StartsAt:  startsAt,
		EndsAt:    endsAt,
		Active:    row.Active,
		Status:    domain.DeriveFlashSaleStatus(row.Active, startsAt, endsAt, time.Now().UTC()),
		CreatedAt: row.CreatedAt.UTC(),
		UpdatedAt: row.UpdatedAt.UTC(),
		Items:     items,
	}, nil
}

func (r *FlashSaleRepository) inTx(ctx context.Context, fn func(*sqlc.Queries) error) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	if err := fn(sqlc.New(tx)); err != nil {
		_ = tx.Rollback(ctx)
		return err
	}
	return tx.Commit(ctx)
}
