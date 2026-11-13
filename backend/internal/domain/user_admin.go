package domain

import (
	"context"
	"time"
)

// UserListFilter selects accounts for the admin user list. Empty Search, Role
// and Status mean "no filter" on that attribute.
type UserListFilter struct {
	Search string
	Role   string
	Status string
	Limit  int
	Offset int
}

type UserListItem struct {
	ID         string
	Email      string
	Role       string
	Status     string
	OrderCount int64
	CreatedAt  time.Time
}

// UserOrderSummary counts every order of the account. Delivered orders are
// those in delivered, partially_returned or returned status, the same
// definition the admin dashboard uses.
type UserOrderSummary struct {
	TotalOrders       int64
	DeliveredOrders   int64
	DeliveredTotalVnd string
}

type UserRecentOrder struct {
	ID        string
	Status    string
	TotalVnd  string
	CreatedAt time.Time
}

type UserAdminDetail struct {
	User         User
	OrderSummary UserOrderSummary
	// RecentOrders holds at most five orders, newest first.
	RecentOrders []UserRecentOrder
}

// LastOrderAt is the creation time of the newest order, nil without orders.
func (d *UserAdminDetail) LastOrderAt() *time.Time {
	if len(d.RecentOrders) == 0 {
		return nil
	}
	t := d.RecentOrders[0].CreatedAt
	return &t
}

type UserAdminRepository interface {
	ListUsers(ctx context.Context, filter UserListFilter) ([]UserListItem, int64, error)
	// GetUserDetail returns ErrUserNotFound when no account has the id.
	GetUserDetail(ctx context.Context, id string) (*UserAdminDetail, error)
	// LockCustomer locks an active customer and revokes its refresh tokens in
	// one transaction. It reports false when no active customer has the id.
	LockCustomer(ctx context.Context, id string, reason *string) (bool, error)
	// UnlockUser reactivates a locked account and revokes any refresh token
	// issued while the lock was being applied. It reports false when no
	// locked account has the id.
	UnlockUser(ctx context.Context, id string) (bool, error)
}
