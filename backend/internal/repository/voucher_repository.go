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

	voucherIDs := make([]string, 0, len(rows))
	for _, row := range rows {
		voucherIDs = append(voucherIDs, row.ID)
	}
	catMap, prodMap, err := loadVoucherScopeTargets(ctx, q, voucherIDs)
	if err != nil {
		return nil, 0, err
	}

	now := time.Now().UTC()
	out := make([]domain.Voucher, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapVoucherRow(
			row.ID, row.Code, row.Title, row.Description, row.VoucherType, row.ScopeType,
			catMap[row.ID], prodMap[row.ID],
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
	catMap, prodMap, err := loadVoucherScopeTargets(ctx, q, []string{row.ID})
	if err != nil {
		return nil, err
	}
	v := mapVoucherRow(
		row.ID, row.Code, row.Title, row.Description, row.VoucherType, row.ScopeType,
		catMap[row.ID], prodMap[row.ID],
		row.DiscountValue, row.MaxDiscountVnd, row.MinOrderVnd,
		row.UsageLimit, row.UsedCount, row.PerUserLimit,
		row.StartsAt, row.EndsAt, row.Active, row.CreatedAt, row.UpdatedAt, time.Now().UTC(),
	)
	return &v, nil
}

func (r *VoucherRepository) Create(ctx context.Context, input domain.SaveVoucherInput) (*domain.Voucher, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	q := sqlc.New(tx)
	scopeType := input.ScopeType
	if scopeType == "" {
		scopeType = domain.VoucherScopeAll
	}
	if err := validateScopeTargetsExist(ctx, q, scopeType, input.CategoryIDs, input.ProductIDs); err != nil {
		return nil, err
	}

	row, err := q.CreateVoucher(ctx, sqlc.CreateVoucherParams{
		Code:           domain.NormalizeVoucherCode(input.Code),
		Title:          strings.TrimSpace(input.Title),
		Description:    strings.TrimSpace(input.Description),
		VoucherType:    string(input.VoucherType),
		ScopeType:      string(scopeType),
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

	if err := replaceVoucherScopeTargets(ctx, q, row.ID, scopeType, input.CategoryIDs, input.ProductIDs); err != nil {
		return nil, err
	}

	catMap, prodMap, err := loadVoucherScopeTargets(ctx, q, []string{row.ID})
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	v := mapVoucherRow(
		row.ID, row.Code, row.Title, row.Description, row.VoucherType, row.ScopeType,
		catMap[row.ID], prodMap[row.ID],
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

	scopeType := input.ScopeType
	if scopeType == "" {
		scopeType = domain.VoucherScopeAll
	}
	if err := validateScopeTargetsExist(ctx, q, scopeType, input.CategoryIDs, input.ProductIDs); err != nil {
		return nil, err
	}

	row, err := q.UpdateVoucher(ctx, sqlc.UpdateVoucherParams{
		ID:             id,
		Code:           normalizedCode,
		Title:          strings.TrimSpace(input.Title),
		Description:    strings.TrimSpace(input.Description),
		VoucherType:    string(input.VoucherType),
		ScopeType:      string(scopeType),
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

	if err := replaceVoucherScopeTargets(ctx, q, row.ID, scopeType, input.CategoryIDs, input.ProductIDs); err != nil {
		return nil, err
	}

	catMap, prodMap, err := loadVoucherScopeTargets(ctx, q, []string{row.ID})
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	v := mapVoucherRow(
		row.ID, row.Code, row.Title, row.Description, row.VoucherType, row.ScopeType,
		catMap[row.ID], prodMap[row.ID],
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

	voucherIDs := make([]string, 0, len(rows))
	for _, row := range rows {
		voucherIDs = append(voucherIDs, row.ID)
	}
	catMap, prodMap, err := loadVoucherScopeTargets(ctx, q, voucherIDs)
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
			ScopeType:         domain.VoucherScopeType(row.ScopeType),
			ScopeCategories:   nonNilTargets(catMap[row.ID]),
			ScopeProducts:     nonNilTargets(prodMap[row.ID]),
			DiscountValue:     domain.MoneyVND(row.DiscountValue),
			MaxDiscountVND:    moneyPtrFromString(row.MaxDiscountVnd),
			MinOrderVND:       domain.MoneyVND(row.MinOrderVnd),
			UsageLimit:        intPtrFromPgInt4(row.UsageLimit),
			UsedCount:         int(row.UsedCount),
			PerUserLimit:      int(row.PerUserLimit),
			UserRemainingUses: int(row.UserRemainingUses),
			StartsAt:          row.StartsAt.UTC(),
			EndsAt:            row.EndsAt.UTC(),
			ClaimedAt:         row.ClaimedAt.UTC(),
		})
	}
	return out, nil
}

func (r *VoucherRepository) ListDiscoverForUser(ctx context.Context, userID string, now time.Time) ([]domain.DiscoverVoucher, error) {
	if _, err := uuid.Parse(userID); err != nil {
		return []domain.DiscoverVoucher{}, nil
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}

	q := sqlc.New(r.db)
	rows, err := q.ListDiscoverVouchersForUser(ctx, sqlc.ListDiscoverVouchersForUserParams{
		UserID: userID,
		Now:    now.UTC(),
	})
	if err != nil {
		return nil, err
	}

	voucherIDs := make([]string, 0, len(rows))
	for _, row := range rows {
		voucherIDs = append(voucherIDs, row.ID)
	}
	catMap, prodMap, err := loadVoucherScopeTargets(ctx, q, voucherIDs)
	if err != nil {
		return nil, err
	}

	out := make([]domain.DiscoverVoucher, 0, len(rows))
	for _, row := range rows {
		var claimedAt *time.Time
		if row.ClaimedAt.Valid {
			t := row.ClaimedAt.Time.UTC()
			claimedAt = &t
		}
		out = append(out, domain.DiscoverVoucher{
			ID:                row.ID,
			Code:              row.Code,
			Title:             row.Title,
			Description:       row.Description,
			VoucherType:       domain.VoucherType(row.VoucherType),
			ScopeType:         domain.VoucherScopeType(row.ScopeType),
			ScopeCategories:   nonNilTargets(catMap[row.ID]),
			ScopeProducts:     nonNilTargets(prodMap[row.ID]),
			DiscountValue:     domain.MoneyVND(row.DiscountValue),
			MaxDiscountVND:    moneyPtrFromString(row.MaxDiscountVnd),
			MinOrderVND:       domain.MoneyVND(row.MinOrderVnd),
			UsageLimit:        intPtrFromPgInt4(row.UsageLimit),
			UsedCount:         int(row.UsedCount),
			PerUserLimit:      int(row.PerUserLimit),
			UserRemainingUses: int(row.UserRemainingUses),
			StartsAt:          row.StartsAt.UTC(),
			EndsAt:            row.EndsAt.UTC(),
			Claimed:           row.Claimed,
			ClaimedAt:         claimedAt,
		})
	}
	return out, nil
}

func (r *VoucherRepository) ClaimForUser(ctx context.Context, userID, voucherID string, now time.Time) (*domain.UserVoucher, error) {
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrInvalidToken
	}
	if _, err := uuid.Parse(voucherID); err != nil {
		return nil, domain.ErrVoucherNotFound
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	nowUTC := now.UTC()

	q := sqlc.New(r.db)
	vRow, err := q.GetVoucherByID(ctx, voucherID)
	if err != nil {
		return nil, mapNotFound(err, domain.ErrVoucherNotFound)
	}

	if !vRow.Active {
		return nil, domain.ErrVoucherInactive
	}
	if nowUTC.Before(vRow.StartsAt.UTC()) {
		return nil, domain.ErrVoucherNotStarted
	}
	if nowUTC.After(vRow.EndsAt.UTC()) {
		return nil, domain.ErrVoucherExpired
	}
	if vRow.UsageLimit.Valid && vRow.UsedCount >= vRow.UsageLimit.Int32 {
		return nil, domain.ErrVoucherExhausted
	}

	if err := q.ClaimUserVoucher(ctx, sqlc.ClaimUserVoucherParams{
		UserID:    userID,
		VoucherID: vRow.ID,
	}); err != nil {
		return nil, err
	}

	uvRow, err := q.GetUserVoucher(ctx, sqlc.GetUserVoucherParams{
		UserID:    userID,
		VoucherID: vRow.ID,
	})
	if err != nil {
		return nil, err
	}

	userUsed, err := q.CountUserActiveVoucherUsages(ctx, sqlc.CountUserActiveVoucherUsagesParams{
		VoucherID: vRow.ID,
		UserID:    userID,
	})
	if err != nil {
		return nil, err
	}

	catMap, prodMap, err := loadVoucherScopeTargets(ctx, q, []string{vRow.ID})
	if err != nil {
		return nil, err
	}

	remaining := int(vRow.PerUserLimit) - int(userUsed)
	if remaining < 0 {
		remaining = 0
	}
	limitPtr := intPtrFromPgInt4(vRow.UsageLimit)
	walletStatus := domain.DeriveVoucherWalletStatus(
		vRow.Active,
		vRow.StartsAt.UTC(),
		vRow.EndsAt.UTC(),
		nowUTC,
		limitPtr,
		int(vRow.UsedCount),
		remaining,
	)

	return &domain.UserVoucher{
		ID:                vRow.ID,
		Code:              vRow.Code,
		Title:             vRow.Title,
		Description:       vRow.Description,
		VoucherType:       domain.VoucherType(vRow.VoucherType),
		ScopeType:         domain.VoucherScopeType(vRow.ScopeType),
		ScopeCategories:   nonNilTargets(catMap[vRow.ID]),
		ScopeProducts:     nonNilTargets(prodMap[vRow.ID]),
		DiscountValue:     domain.MoneyVND(vRow.DiscountValue),
		MaxDiscountVND:    moneyPtrFromString(vRow.MaxDiscountVnd),
		MinOrderVND:       domain.MoneyVND(vRow.MinOrderVnd),
		UsageLimit:        limitPtr,
		UsedCount:         int(vRow.UsedCount),
		PerUserLimit:      int(vRow.PerUserLimit),
		UserRemainingUses: remaining,
		StartsAt:          vRow.StartsAt.UTC(),
		EndsAt:            vRow.EndsAt.UTC(),
		ClaimedAt:         uvRow.ClaimedAt.UTC(),
		WalletStatus:      walletStatus,
	}, nil
}

func (r *VoucherRepository) ListWalletForUser(ctx context.Context, userID string, statusFilter string, now time.Time) ([]domain.UserVoucher, error) {
	if _, err := uuid.Parse(userID); err != nil {
		return []domain.UserVoucher{}, nil
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	nowUTC := now.UTC()

	q := sqlc.New(r.db)
	rows, err := q.ListWalletVouchersForUser(ctx, userID)
	if err != nil {
		return nil, err
	}

	voucherIDs := make([]string, 0, len(rows))
	for _, row := range rows {
		voucherIDs = append(voucherIDs, row.ID)
	}
	catMap, prodMap, err := loadVoucherScopeTargets(ctx, q, voucherIDs)
	if err != nil {
		return nil, err
	}

	out := make([]domain.UserVoucher, 0, len(rows))
	for _, row := range rows {
		limitPtr := intPtrFromPgInt4(row.UsageLimit)
		ws := domain.DeriveVoucherWalletStatus(
			row.Active,
			row.StartsAt.UTC(),
			row.EndsAt.UTC(),
			nowUTC,
			limitPtr,
			int(row.UsedCount),
			int(row.UserRemainingUses),
		)
		if !matchesWalletFilter(ws, statusFilter) {
			continue
		}
		out = append(out, domain.UserVoucher{
			ID:                row.ID,
			Code:              row.Code,
			Title:             row.Title,
			Description:       row.Description,
			VoucherType:       domain.VoucherType(row.VoucherType),
			ScopeType:         domain.VoucherScopeType(row.ScopeType),
			ScopeCategories:   nonNilTargets(catMap[row.ID]),
			ScopeProducts:     nonNilTargets(prodMap[row.ID]),
			DiscountValue:     domain.MoneyVND(row.DiscountValue),
			MaxDiscountVND:    moneyPtrFromString(row.MaxDiscountVnd),
			MinOrderVND:       domain.MoneyVND(row.MinOrderVnd),
			UsageLimit:        limitPtr,
			UsedCount:         int(row.UsedCount),
			PerUserLimit:      int(row.PerUserLimit),
			UserRemainingUses: int(row.UserRemainingUses),
			StartsAt:          row.StartsAt.UTC(),
			EndsAt:            row.EndsAt.UTC(),
			ClaimedAt:         row.ClaimedAt.UTC(),
			WalletStatus:      ws,
		})
	}
	return out, nil
}

func matchesWalletFilter(ws domain.VoucherWalletStatus, filter string) bool {
	switch strings.TrimSpace(filter) {
	case "":
		return true
	case "available":
		return ws == domain.VoucherWalletAvailable
	case "used_up":
		return ws == domain.VoucherWalletUsedUp
	case "unavailable":
		return ws == domain.VoucherWalletExpired ||
			ws == domain.VoucherWalletExhausted ||
			ws == domain.VoucherWalletInactive ||
			ws == domain.VoucherWalletScheduled
	default:
		return true
	}
}

func validateScopeTargetsExist(ctx context.Context, q *sqlc.Queries, scopeType domain.VoucherScopeType, categoryIDs, productIDs []string) error {
	switch scopeType {
	case domain.VoucherScopeCategories:
		if len(categoryIDs) == 0 {
			return domain.NewValidationError(map[string]string{"categoryIds": "Vui lòng chọn ít nhất một danh mục áp dụng"})
		}
		count, err := q.CountExistingCategoriesByIDs(ctx, categoryIDs)
		if err != nil {
			return err
		}
		if int(count) != len(categoryIDs) {
			return domain.NewValidationError(map[string]string{"categoryIds": "Một hoặc nhiều danh mục không tồn tại"})
		}
	case domain.VoucherScopeProducts:
		if len(productIDs) == 0 {
			return domain.NewValidationError(map[string]string{"productIds": "Vui lòng chọn ít nhất một sản phẩm áp dụng"})
		}
		count, err := q.CountExistingProductsByIDs(ctx, productIDs)
		if err != nil {
			return err
		}
		if int(count) != len(productIDs) {
			return domain.NewValidationError(map[string]string{"productIds": "Một hoặc nhiều sản phẩm không tồn tại"})
		}
	}
	return nil
}

func replaceVoucherScopeTargets(ctx context.Context, q *sqlc.Queries, voucherID string, scopeType domain.VoucherScopeType, categoryIDs, productIDs []string) error {
	if err := q.DeleteVoucherCategories(ctx, voucherID); err != nil {
		return err
	}
	if err := q.DeleteVoucherProducts(ctx, voucherID); err != nil {
		return err
	}
	switch scopeType {
	case domain.VoucherScopeCategories:
		for _, catID := range categoryIDs {
			if err := q.InsertVoucherCategory(ctx, sqlc.InsertVoucherCategoryParams{
				VoucherID:  voucherID,
				CategoryID: catID,
			}); err != nil {
				return err
			}
		}
	case domain.VoucherScopeProducts:
		for _, prodID := range productIDs {
			if err := q.InsertVoucherProduct(ctx, sqlc.InsertVoucherProductParams{
				VoucherID: voucherID,
				ProductID: prodID,
			}); err != nil {
				return err
			}
		}
	}
	return nil
}

func loadVoucherScopeTargets(
	ctx context.Context,
	q *sqlc.Queries,
	voucherIDs []string,
) (map[string][]domain.VoucherScopeTarget, map[string][]domain.VoucherScopeTarget, error) {
	catMap := make(map[string][]domain.VoucherScopeTarget)
	prodMap := make(map[string][]domain.VoucherScopeTarget)
	if len(voucherIDs) == 0 {
		return catMap, prodMap, nil
	}

	catRows, err := q.ListVoucherCategoriesByVoucherIDs(ctx, voucherIDs)
	if err != nil {
		return nil, nil, err
	}
	for _, r := range catRows {
		catMap[r.VoucherID] = append(catMap[r.VoucherID], domain.VoucherScopeTarget{
			ID:   r.CategoryID,
			Name: r.CategoryName,
		})
	}

	prodRows, err := q.ListVoucherProductsByVoucherIDs(ctx, voucherIDs)
	if err != nil {
		return nil, nil, err
	}
	for _, r := range prodRows {
		prodMap[r.VoucherID] = append(prodMap[r.VoucherID], domain.VoucherScopeTarget{
			ID:   r.ProductID,
			Name: r.ProductName,
		})
	}

	return catMap, prodMap, nil
}

func nonNilTargets(in []domain.VoucherScopeTarget) []domain.VoucherScopeTarget {
	if in == nil {
		return []domain.VoucherScopeTarget{}
	}
	return in
}

func mapVoucherRow(
	id, code, title, description, voucherType, scopeType string,
	scopeCategories, scopeProducts []domain.VoucherScopeTarget,
	discountValue, maxDiscountVnd, minOrderVnd string,
	usageLimit pgtype.Int4,
	usedCount, perUserLimit int32,
	startsAt, endsAt time.Time,
	active bool,
	createdAt, updatedAt, now time.Time,
) domain.Voucher {
	limitPtr := intPtrFromPgInt4(usageLimit)
	startsUTC := startsAt.UTC()
	endsUTC := endsAt.UTC()
	st := domain.VoucherScopeType(scopeType)
	if st == "" {
		st = domain.VoucherScopeAll
	}
	return domain.Voucher{
		ID:              id,
		Code:            code,
		Title:           title,
		Description:     description,
		VoucherType:     domain.VoucherType(voucherType),
		ScopeType:       st,
		ScopeCategories: nonNilTargets(scopeCategories),
		ScopeProducts:   nonNilTargets(scopeProducts),
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
