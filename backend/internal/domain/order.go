package domain

import (
	"context"
	"time"
)

type OrderStatus string

const (
	OrderStatusPendingConfirmation OrderStatus = "pending_confirmation"
	OrderStatusConfirmed           OrderStatus = "confirmed"
	OrderStatusPreparing           OrderStatus = "preparing"
	OrderStatusCancelRequested     OrderStatus = "cancel_requested"
	OrderStatusShipped             OrderStatus = "shipped"
	OrderStatusDelivered           OrderStatus = "delivered"
	OrderStatusCancelled           OrderStatus = "cancelled"
	OrderStatusReturned            OrderStatus = "returned"
)

func (s OrderStatus) IsValid() bool {
	switch s {
	case OrderStatusPendingConfirmation,
		OrderStatusConfirmed,
		OrderStatusPreparing,
		OrderStatusCancelRequested,
		OrderStatusShipped,
		OrderStatusDelivered,
		OrderStatusCancelled,
		OrderStatusReturned:
		return true
	default:
		return false
	}
}

type OrderStatusBucket string

const (
	OrderStatusBucketAll       OrderStatusBucket = "all"
	OrderStatusBucketPending   OrderStatusBucket = "pending"
	OrderStatusBucketPickup    OrderStatusBucket = "pickup"
	OrderStatusBucketDelivery  OrderStatusBucket = "delivery"
	OrderStatusBucketDelivered OrderStatusBucket = "delivered"
	OrderStatusBucketReturns   OrderStatusBucket = "returns"
	OrderStatusBucketCancelled OrderStatusBucket = "cancelled"
)

func (b OrderStatusBucket) IsValid() bool {
	switch b {
	case OrderStatusBucketAll,
		OrderStatusBucketPending,
		OrderStatusBucketPickup,
		OrderStatusBucketDelivery,
		OrderStatusBucketDelivered,
		OrderStatusBucketReturns,
		OrderStatusBucketCancelled:
		return true
	default:
		return false
	}
}

func (b OrderStatusBucket) Statuses() []OrderStatus {
	switch b {
	case OrderStatusBucketPending:
		return []OrderStatus{OrderStatusPendingConfirmation}
	case OrderStatusBucketPickup:
		return []OrderStatus{OrderStatusConfirmed, OrderStatusPreparing, OrderStatusCancelRequested}
	case OrderStatusBucketDelivery:
		return []OrderStatus{OrderStatusShipped}
	case OrderStatusBucketDelivered:
		return []OrderStatus{OrderStatusDelivered}
	case OrderStatusBucketReturns:
		return []OrderStatus{OrderStatusReturned}
	case OrderStatusBucketCancelled:
		return []OrderStatus{OrderStatusCancelled}
	default:
		return nil
	}
}

const PaymentMethodCOD = "cod"

type ShippingInfo struct {
	RecipientName string
	Phone         string
	ProvinceName  string
	WardName      string
	DetailAddress string
}

type OrderItem struct {
	ID           string
	OrderID      string
	VariantID    string
	ProductID    string
	BrandName    string
	ProductName  string
	Model        string
	ImageURL     string
	Options      []CartOption
	UnitPriceVND MoneyVND
	Quantity     int64
	LineTotalVND MoneyVND
	ReviewState  OrderItemReviewState
}

type Order struct {
	ID               string
	UserID           string
	BuyerEmail       string
	Status           OrderStatus
	PaymentMethod    string
	SubtotalVND      MoneyVND
	ShippingFeeVND   MoneyVND
	TotalVND         MoneyVND
	ShippingInfo     ShippingInfo
	Items            []OrderItem
	CreatedAt        time.Time
	UpdatedAt        time.Time
	ConfirmedAt      *time.Time
	CancelledAt      *time.Time
	DeliveredAt      *time.Time
	CancellableUntil *time.Time
}

type OrderAdminAction string

const (
	OrderAdminActionConfirmPreparing OrderAdminAction = "confirm_preparing"
	OrderAdminActionShip             OrderAdminAction = "ship"
	OrderAdminActionDeliver          OrderAdminAction = "deliver"
	OrderAdminActionApproveCancel    OrderAdminAction = "approve_cancel"
	OrderAdminActionDeclineCancel    OrderAdminAction = "decline_cancel"
)

func (a OrderAdminAction) IsValid() bool {
	switch a {
	case OrderAdminActionConfirmPreparing,
		OrderAdminActionShip,
		OrderAdminActionDeliver,
		OrderAdminActionApproveCancel,
		OrderAdminActionDeclineCancel:
		return true
	default:
		return false
	}
}

func (a OrderAdminAction) Transition() (from, to OrderStatus, restock bool, ok bool) {
	switch a {
	case OrderAdminActionConfirmPreparing:
		return OrderStatusConfirmed, OrderStatusPreparing, false, true
	case OrderAdminActionShip:
		return OrderStatusPreparing, OrderStatusShipped, false, true
	case OrderAdminActionDeliver:
		return OrderStatusShipped, OrderStatusDelivered, false, true
	case OrderAdminActionApproveCancel:
		return OrderStatusCancelRequested, OrderStatusCancelled, true, true
	case OrderAdminActionDeclineCancel:
		return OrderStatusCancelRequested, OrderStatusPreparing, false, true
	default:
		return "", "", false, false
	}
}

type OrderLineInput struct {
	VariantID    string
	Quantity     int64
	ProductName  string
	UnitPriceVND MoneyVND
}

type OrderFilter struct {
	Bucket OrderStatusBucket
}

type OrderStats struct {
	PendingConfirmation int
	AwaitingPickup      int
	AwaitingDelivery    int
	AwaitingReview      int
}

type OrderRepository interface {
	Create(ctx context.Context, userID string, addressID string, lines []OrderLineInput, shippingFeeVND MoneyVND) (*Order, error)
	GetByID(ctx context.Context, userID, orderID string) (*Order, error)
	ListByUser(ctx context.Context, userID string, bucket OrderStatusBucket) ([]Order, error)
	StatsByUser(ctx context.Context, userID string) (OrderStats, error)
	Cancel(ctx context.Context, userID, orderID string) (*Order, error)
	UndoCancelRequest(ctx context.Context, userID, orderID string) (*Order, error)
	AutoConfirmDue(ctx context.Context, cutoff time.Time) error
	ListByAdmin(ctx context.Context, statuses []string) ([]Order, error)
	GetByAdminID(ctx context.Context, orderID string) (*Order, error)
	AdminTransition(ctx context.Context, orderID string, action OrderAdminAction) (*Order, error)
}
