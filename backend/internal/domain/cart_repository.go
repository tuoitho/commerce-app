package domain

import "context"

type CartRepository interface {
	Get(context.Context, string) (*Cart, error)
	AddVariant(context.Context, string, string) (*Cart, error)
	SetQuantity(context.Context, string, string, int64) (*Cart, error)
	SetSelected(context.Context, string, string, bool) (*Cart, error)
	SetAllSelected(context.Context, string, bool) (*Cart, error)
	Remove(context.Context, string, string) (*Cart, error)
}
