package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

type userAdminDB interface {
	sqlc.DBTX
	Begin(context.Context) (pgx.Tx, error)
}

type UserAdminRepository struct {
	db userAdminDB
	q  *sqlc.Queries
}

func NewUserAdminRepository(db userAdminDB) *UserAdminRepository {
	return &UserAdminRepository{db: db, q: sqlc.New(db)}
}

func (r *UserAdminRepository) ListUsers(ctx context.Context, filter domain.UserListFilter) ([]domain.UserListItem, int64, error) {
	rows, err := r.q.ListAdminUsers(ctx, sqlc.ListAdminUsersParams{
		Search:    filter.Search,
		Role:      filter.Role,
		Status:    filter.Status,
		RowLimit:  int32(filter.Limit),
		RowOffset: int64(filter.Offset),
	})
	if err != nil {
		return nil, 0, err
	}
	total, err := r.q.CountAdminUsers(ctx, sqlc.CountAdminUsersParams{
		Search: filter.Search,
		Role:   filter.Role,
		Status: filter.Status,
	})
	if err != nil {
		return nil, 0, err
	}

	items := make([]domain.UserListItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, domain.UserListItem{
			ID:         row.ID,
			Email:      row.Email,
			Role:       row.Role,
			Status:     row.Status,
			OrderCount: row.OrderCount,
			CreatedAt:  row.CreatedAt,
		})
	}
	return items, total, nil
}

func (r *UserAdminRepository) GetUserDetail(ctx context.Context, id string) (*domain.UserAdminDetail, error) {
	return getUserAdminDetail(ctx, r.q, id)
}

func getUserAdminDetail(ctx context.Context, q *sqlc.Queries, id string) (*domain.UserAdminDetail, error) {
	u, err := q.GetUserByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrUserNotFound
		}
		return nil, err
	}
	summary, err := q.GetAdminUserOrderSummary(ctx, id)
	if err != nil {
		return nil, err
	}
	recent, err := q.ListAdminUserRecentOrders(ctx, id)
	if err != nil {
		return nil, err
	}

	orders := make([]domain.UserRecentOrder, 0, len(recent))
	for _, o := range recent {
		orders = append(orders, domain.UserRecentOrder{
			ID:        o.ID,
			Status:    o.Status,
			TotalVnd:  o.TotalVnd,
			CreatedAt: o.CreatedAt,
		})
	}
	return &domain.UserAdminDetail{
		User: *toDomainUser(u.ID, u.Email, u.PasswordHash, u.Role, u.Status, u.LockedAt, u.LockReason, u.CreatedAt, u.UpdatedAt),
		OrderSummary: domain.UserOrderSummary{
			TotalOrders:       summary.TotalOrders,
			DeliveredOrders:   summary.DeliveredOrders,
			DeliveredTotalVnd: summary.DeliveredTotalVnd,
		},
		RecentOrders: orders,
	}, nil
}

func (r *UserAdminRepository) LockCustomer(ctx context.Context, id string, reason *string) (bool, error) {
	lockReason := pgtype.Text{}
	if reason != nil {
		lockReason = pgtype.Text{String: *reason, Valid: true}
	}
	return r.updateAndRevokeSessions(ctx, id, func(q *sqlc.Queries) (int64, error) {
		return q.LockCustomerUser(ctx, sqlc.LockCustomerUserParams{ID: id, LockReason: lockReason})
	})
}

func (r *UserAdminRepository) UnlockUser(ctx context.Context, id string) (bool, error) {
	return r.updateAndRevokeSessions(ctx, id, func(q *sqlc.Queries) (int64, error) {
		return q.UnlockUser(ctx, id)
	})
}

// updateAndRevokeSessions runs a conditional status update and, when it changed
// the account, revokes every refresh token of that account in the same
// transaction.
func (r *UserAdminRepository) updateAndRevokeSessions(ctx context.Context, id string, update func(*sqlc.Queries) (int64, error)) (bool, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	q := r.q.WithTx(tx)
	affected, err := update(q)
	if err != nil {
		return false, err
	}
	if affected == 0 {
		return false, nil
	}
	if err := q.RevokeRefreshTokensByUserID(ctx, id); err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}
