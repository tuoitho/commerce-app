package repository

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

type voucherDB interface {
	sqlc.DBTX
	Begin(context.Context) (pgx.Tx, error)
}

type VoucherRepository struct {
	db voucherDB
}

func NewVoucherRepository(db voucherDB) *VoucherRepository {
	return &VoucherRepository{db: db}
}

var _ domain.VoucherRepository = (*VoucherRepository)(nil)

func (r *VoucherRepository) ListAdmin(ctx context.Context, filter domain.VoucherListFilter) ([]domain.Voucher, int64, error) {
	q := sqlc.New(r.db)
	queryArg := pgtype.Text{String: strings.TrimSpace(filter.Query), Valid: strings.TrimSpace(filter.Query) != ""}
	statusArg := pgtype.Text{String: strings.TrimSpace(filter.Status), Valid: strings.TrimSpace(filter.Status) != ""}

	total, err := q.CountAdminVouchers(ctx, sqlc.CountAdminVouchersParams{
		Query:  queryArg,
		Status: statusArg,
	})
	if err != nil {
		return nil, 0, err
	}

	rows, err := q.ListAdminVouchers(ctx, sqlc.ListAdminVouchersParams{
		Query:     queryArg,
		Status:    statusArg,
		RowLimit:  int32(filter.Limit),
		RowOffset: int32(filter.Offset),
	})
	if err != nil {
		return nil, 0, err
	}

	now := time.Now().UTC()
	out := make([]domain.Voucher, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapVoucherRow(
			row.ID, row.Code, row.Title, row.Description, row.VoucherType,
			row.DiscountValue, row.MaxDiscountVnd, row.MinOrderVnd,
			row.UsageLimit, row.UsedCount, row.PerUserLimit,
			row.StartsAt, row.EndsAt, row.Active, row.CreatedAt, row.UpdatedAt, now,
		))
	}
	return out, total, nil
}

func (r *VoucherRepository) GetAdminByID(ctx context.Context, id string) (*domain.Voucher, error) {
	if _, err := uuid.Parse(id); err != nil {
		return nil, domain.ErrVoucherNotFound
	}
	q := sqlc.New(r.db)
	row, err := q.GetVoucherByID(ctx, id)
	if err != nil {
		return nil, mapNotFound(err, domain.ErrVoucherNotFound)
	}
	v := mapVoucherRow(
		row.ID, row.Code, row.Title, row.Description, row.VoucherType,
		row.DiscountValue, row.MaxDiscountVnd, row.MinOrderVnd,
		row.UsageLimit, row.UsedCount, row.PerUserLimit,
		row.StartsAt, row.EndsAt, row.Active, row.CreatedAt, row.UpdatedAt, time.Now().UTC(),
	)
	return &v, nil
}

func (r *VoucherRepository) Create(ctx context.Context, input domain.SaveVoucherInput) (*domain.Voucher, error) {
	q := sqlc.New(r.db)
	row, err := q.CreateVoucher(ctx, sqlc.CreateVoucherParams{
		Code:           domain.NormalizeVoucherCode(input.Code),
		Title:          strings.TrimSpace(input.Title),
		Description:    strings.TrimSpace(input.Description),
		VoucherType:    string(input.VoucherType),
		DiscountValue:  toNumeric(string(input.DiscountValue)),
		MaxDiscountVnd: nullableMoneyNumeric(input.MaxDiscountVND),
		MinOrderVnd:    toNumeric(string(input.MinOrderVND)),
		UsageLimit:     nullableInt4(input.UsageLimit),
		PerUserLimit:   int32(input.PerUserLimit),
		StartsAt:       input.StartsAt.UTC(),
		EndsAt:         input.EndsAt.UTC(),
		Active:         input.Active,
	})
	if err != nil {
		if isPostgresCode(err, "23505") {
			return nil, domain.ErrVoucherCodeInUse
		}
		return nil, err
	}
	v := mapVoucherRow(
		row.ID, row.Code, row.Title, row.Description, row.VoucherType,
		row.DiscountValue, row.MaxDiscountVnd, row.MinOrderVnd,
		row.UsageLimit, row.UsedCount, row.PerUserLimit,
		row.StartsAt, row.EndsAt, row.Active, row.CreatedAt, row.UpdatedAt, time.Now().UTC(),
	)
	return &v, nil
}

func (r *VoucherRepository) Update(ctx context.Context, id string, input domain.SaveVoucherInput) (*domain.Voucher, error) {
	if _, err := uuid.Parse(id); err != nil {
		return nil, domain.ErrVoucherNotFound
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	q := sqlc.New(tx)
	existing, err := q.LockVoucherByID(ctx, id)
	if err != nil {
		return nil, mapNotFound(err, domain.ErrVoucherNotFound)
	}

	normalizedCode := domain.NormalizeVoucherCode(input.Code)
	if existing.UsedCount > 0 {
		if existing.Code != normalizedCode || existing.VoucherType != string(input.VoucherType) {
			return nil, domain.ErrVoucherImmutableFields
		}
		if input.UsageLimit != nil && *input.UsageLimit < int(existing.UsedCount) {
			return nil, domain.ErrVoucherUsageLimitTooLow
		}
	}

	row, err := q.UpdateVoucher(ctx, sqlc.UpdateVoucherParams{
		ID:             id,
		Code:           normalizedCode,
		Title:          strings.TrimSpace(input.Title),
		Description:    strings.TrimSpace(input.Description),
		VoucherType:    string(input.VoucherType),
		DiscountValue:  toNumeric(string(input.DiscountValue)),
		MaxDiscountVnd: nullableMoneyNumeric(input.MaxDiscountVND),
		MinOrderVnd:    toNumeric(string(input.MinOrderVND)),
		UsageLimit:     nullableInt4(input.UsageLimit),
		PerUserLimit:   int32(input.PerUserLimit),
		StartsAt:       input.StartsAt.UTC(),
		EndsAt:         input.EndsAt.UTC(),
		Active:         input.Active,
	})
	if err != nil {
		if isPostgresCode(err, "23505") {
			return nil, domain.ErrVoucherCodeInUse
		}
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	v := mapVoucherRow(
		row.ID, row.Code, row.Title, row.Description, row.VoucherType,
		row.DiscountValue, row.MaxDiscountVnd, row.MinOrderVnd,
		row.UsageLimit, row.UsedCount, row.PerUserLimit,
		row.StartsAt, row.EndsAt, row.Active, row.CreatedAt, row.UpdatedAt, time.Now().UTC(),
	)
	return &v, nil
}

func (r *VoucherRepository) Delete(ctx context.Context, id string) error {
	if _, err := uuid.Parse(id); err != nil {
		return domain.ErrVoucherNotFound
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	q := sqlc.New(tx)
	existing, err := q.LockVoucherByID(ctx, id)
	if err != nil {
		return mapNotFound(err, domain.ErrVoucherNotFound)
	}
	if existing.UsedCount > 0 {
		return domain.ErrVoucherInUse
	}

	rows, err := q.DeleteVoucher(ctx, id)
	if err != nil {
		if isPostgresCode(err, "23503") {
			return domain.ErrVoucherInUse
		}
		return err
	}
	if rows == 0 {
		return domain.ErrVoucherNotFound
	}
	return tx.Commit(ctx)
}

func (r *VoucherRepository) ListAvailableForUser(ctx context.Context, userID string, now time.Time) ([]domain.AvailableVoucher, error) {
	if _, err := uuid.Parse(userID); err != nil {
		return []domain.AvailableVoucher{}, nil
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}

	q := sqlc.New(r.db)
	rows, err := q.ListAvailableVouchersForUser(ctx, sqlc.ListAvailableVouchersForUserParams{
		UserID: userID,
		Now:    now.UTC(),
	})
	if err != nil {
		return nil, err
	}

	out := make([]domain.AvailableVoucher, 0, len(rows))
	for _, row := range rows {
		out = append(out, domain.AvailableVoucher{
			ID:                row.ID,
			Code:              row.Code,
			Title:             row.Title,
			Description:       row.Description,
			VoucherType:       domain.VoucherType(row.VoucherType),
			DiscountValue:     domain.MoneyVND(row.DiscountValue),
			MaxDiscountVND:    moneyPtrFromString(row.MaxDiscountVnd),
			MinOrderVND:       domain.MoneyVND(row.MinOrderVnd),
			UsageLimit:        intPtrFromPgInt4(row.UsageLimit),
			UsedCount:         int(row.UsedCount),
			PerUserLimit:      int(row.PerUserLimit),
			UserRemainingUses: int(row.UserRemainingUses),
			StartsAt:          row.StartsAt.UTC(),
			EndsAt:            row.EndsAt.UTC(),
		})
	}
	return out, nil
}

func mapVoucherRow(
	id, code, title, description, voucherType, discountValue, maxDiscountVnd, minOrderVnd string,
	usageLimit pgtype.Int4,
	usedCount, perUserLimit int32,
	startsAt, endsAt time.Time,
	active bool,
	createdAt, updatedAt, now time.Time,
) domain.Voucher {
	limitPtr := intPtrFromPgInt4(usageLimit)
	startsUTC := startsAt.UTC()
	endsUTC := endsAt.UTC()
	return domain.Voucher{
		ID:              id,
		Code:            code,
		Title:           title,
		Description:     description,
		VoucherType:     domain.VoucherType(voucherType),
		DiscountValue:   domain.MoneyVND(discountValue),
		MaxDiscountVND:  moneyPtrFromString(maxDiscountVnd),
		MinOrderVND:     domain.MoneyVND(minOrderVnd),
		UsageLimit:      limitPtr,
		UsedCount:       int(usedCount),
		PerUserLimit:    int(perUserLimit),
		StartsAt:        startsUTC,
		EndsAt:          endsUTC,
		Active:          active,
		EffectiveStatus: domain.DeriveVoucherEffectiveStatus(active, startsUTC, endsUTC, now, limitPtr, int(usedCount)),
		CreatedAt:       createdAt.UTC(),
		UpdatedAt:       updatedAt.UTC(),
	}
}

func nullableMoneyNumeric(m *domain.MoneyVND) pgtype.Numeric {
	if m == nil {
		return pgtype.Numeric{}
	}
	return toNumeric(string(*m))
}

func nullableInt4(v *int) pgtype.Int4 {
	if v == nil {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: int32(*v), Valid: true}
}

func intPtrFromPgInt4(v pgtype.Int4) *int {
	if !v.Valid {
		return nil
	}
	val := int(v.Int32)
	return &val
}

func moneyPtrFromString(s string) *domain.MoneyVND {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	val := domain.MoneyVND(s)
	return &val
}
