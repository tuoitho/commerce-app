package domain

import (
	"context"
	"time"
)

type Address struct {
	ID            string
	UserID        string
	RecipientName string
	Phone         string
	ProvinceCode  int
	ProvinceName  string
	WardCode      int
	WardName      string
	DetailAddress string
	IsDefault     bool
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

type AddressInput struct {
	RecipientName string
	Phone         string
	ProvinceCode  int
	WardCode      int
	DetailAddress string
	IsDefault     bool
}

type AddressRepository interface {
	ListByUser(ctx context.Context, userID string) ([]Address, error)
	GetByID(ctx context.Context, userID, id string) (*Address, error)
	Create(ctx context.Context, userID string, input AddressInput) (*Address, error)
	Update(ctx context.Context, userID, id string, input AddressInput) (*Address, error)
	Delete(ctx context.Context, userID, id string) error
	SetDefault(ctx context.Context, userID, id string) (*Address, error)
}
