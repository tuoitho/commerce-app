package domain

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
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
	OrderStatusPartiallyReturned   OrderStatus = "partially_returned"
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
		OrderStatusPartiallyReturned,
		OrderStatusReturned:
		return true
	default:
		return false
	}
}

type OrderStatusBucket string

const (
	OrderStatusBucketAll        OrderStatusBucket = "all"
	OrderStatusBucketPending    OrderStatusBucket = "pending"
	OrderStatusBucketPickup     OrderStatusBucket = "pickup"
	OrderStatusBucketDelivery   OrderStatusBucket = "delivery"
	OrderStatusBucketDelivered  OrderStatusBucket = "delivered"
	OrderStatusBucketReviewable OrderStatusBucket = "reviewable"
	OrderStatusBucketReturns    OrderStatusBucket = "returns"
	OrderStatusBucketCancelled  OrderStatusBucket = "cancelled"
)

func (b OrderStatusBucket) IsValid() bool {
	switch b {
	case OrderStatusBucketAll,
		OrderStatusBucketPending,
		OrderStatusBucketPickup,
		OrderStatusBucketDelivery,
		OrderStatusBucketDelivered,
		OrderStatusBucketReviewable,
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
	case OrderStatusBucketReviewable:
		return []OrderStatus{OrderStatusDelivered, OrderStatusPartiallyReturned}
	case OrderStatusBucketReturns:
		return []OrderStatus{OrderStatusPartiallyReturned, OrderStatusReturned}
	case OrderStatusBucketCancelled:
		return []OrderStatus{OrderStatusCancelled}
	default:
		return nil
	}
}

const (
	PaymentMethodCOD  = "cod"
	PaymentMethodMomo = "momo"
)

type PaymentStatus string

const (
	PaymentStatusPending  PaymentStatus = "pending"
	PaymentStatusPaid     PaymentStatus = "paid"
	PaymentStatusFailed   PaymentStatus = "failed"
	PaymentStatusRefunded PaymentStatus = "refunded"
)

const (
	MomoMinAmountVND int64 = 1000
	MomoMaxAmountVND int64 = 50000000
)

// ParseMomoOrderID extracts and validates the original order UUID from a MoMo
// orderId formatted as "<orderUUID>_<timestamp>".
func ParseMomoOrderID(momoOrderID string) (string, bool) {
	trimmed := strings.TrimSpace(momoOrderID)
	idx := strings.IndexByte(trimmed, '_')
	if idx <= 0 || idx >= len(trimmed)-1 {
		return "", false
	}
	orderUUID := trimmed[:idx]
	if _, err := uuid.Parse(orderUUID); err != nil {
		return "", false
	}
	return orderUUID, true
}

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
	ReviewStatus OrderItemReviewStatus
	Review       *Review
}

type OrderActorType string

const (
	OrderActorCustomer OrderActorType = "customer"
	OrderActorAdmin    OrderActorType = "admin"
	OrderActorSystem   OrderActorType = "system"
)

type OrderTimelineEvent struct {
	ID        string         `json:"id"`
	Status    OrderStatus    `json:"status"`
	ActorType OrderActorType `json:"actorType"`
	Note      string         `json:"note"`
	CreatedAt time.Time      `json:"createdAt"`
}

type Order struct {
	ID                   string
	UserID               string
	BuyerEmail           string
	Status               OrderStatus
	PaymentMethod        string
	PaymentStatus        PaymentStatus
	PaymentTransactionID *string
	PaidAt               *time.Time
	PayURL               string
	SubtotalVND          MoneyVND
	ShippingFeeVND       MoneyVND
	DiscountVND          MoneyVND
	TotalVND             MoneyVND
	VoucherID            *string
	VoucherCode          *string
	VoucherType          *VoucherType
	DeliveryMethod       DeliveryMethod
	Carrier              *string
	TrackingCode         *string
	ShippingInfo         ShippingInfo
	Items                []OrderItem
	Timeline             []OrderTimelineEvent
	CreatedAt            time.Time
	UpdatedAt            time.Time
	ConfirmedAt          *time.Time
	PreparingAt          *time.Time
	ShippedAt            *time.Time
	CancelledAt          *time.Time
	DeliveredAt          *time.Time
	CancellableUntil     *time.Time
	ReturnEligibility    *ReturnEligibility
	LatestReturnRequest  *ReturnRequest
}

type MomoCreateInput struct {
	OrderID   string
	AmountVND int64
	OrderInfo string
}

type MomoCallbackPayload struct {
	PartnerCode  string
	OrderID      string
	RequestID    string
	Amount       string
	OrderInfo    string
	OrderType    string
	TransID      string
	ResultCode   int
	Message      string
	PayType      string
	ResponseTime string
	ExtraData    string
	Signature    string
}

type MomoGateway interface {
	CreatePaymentURL(ctx context.Context, input MomoCreateInput) (payURL string, err error)
	VerifyCallbackSignature(payload MomoCallbackPayload) bool
}

type MomoOrderRepository interface {
	CreateWithPaymentMethod(ctx context.Context, userID, addressID string, lines []OrderLineInput, shippingFeeVND MoneyVND, paymentMethod string) (*Order, error)
	SetPaymentFailed(ctx context.Context, orderID string) error
	ResetPaymentPending(ctx context.Context, userID, orderID string) (*Order, error)
	ApplyMomoCallback(ctx context.Context, orderID, userID, amountVND, transID string, resultCode int) (order *Order, justPaid bool, err error)
	AutoCancelExpiredMomoOrders(ctx context.Context, cutoff time.Time) ([]AutoConfirmedOrder, error)
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

type CheckoutQuoteInput struct {
	UserID         string
	AddressID      string
	DeliveryMethod DeliveryMethod
	VoucherCode    string
	Shipping       ShippingConfig
}

type CheckoutQuote struct {
	SubtotalVND              MoneyVND       `json:"subtotalVnd"`
	DeliveryMethod           DeliveryMethod `json:"deliveryMethod"`
	ExpressAvailable         bool           `json:"expressAvailable"`
	StandardShippingFeeVND   MoneyVND       `json:"standardShippingFeeVnd"`
	ExpressShippingFeeVND    MoneyVND       `json:"expressShippingFeeVnd"`
	FreeShippingThresholdVND MoneyVND       `json:"freeShippingThresholdVnd"`
	ShippingFeeVND           MoneyVND       `json:"shippingFeeVnd"`
	VoucherCode              *string        `json:"voucherCode"`
	VoucherType              *VoucherType   `json:"voucherType"`
	DiscountVND              MoneyVND       `json:"discountVnd"`
	TotalVND                 MoneyVND       `json:"totalVnd"`
}

type CreateCheckoutOrderInput struct {
	UserID         string
	AddressID      string
	Lines          []OrderLineInput
	PaymentMethod  string
	DeliveryMethod DeliveryMethod
	VoucherCode    string
	Shipping       ShippingConfig
}

type CheckoutOrderRepository interface {
	QuoteCheckout(ctx context.Context, input CheckoutQuoteInput) (*CheckoutQuote, error)
	CreateCheckoutOrder(ctx context.Context, input CreateCheckoutOrderInput) (*Order, error)
}

type BuyAgainSkipReason string

const (
	BuyAgainSkipOutOfStock  BuyAgainSkipReason = "out_of_stock"
	BuyAgainSkipUnavailable BuyAgainSkipReason = "unavailable"
)

type BuyAgainAdjustedItem struct {
	VariantID         string `json:"variantId"`
	ProductName       string `json:"productName"`
	RequestedQuantity int64  `json:"requestedQuantity"`
	AddedQuantity     int64  `json:"addedQuantity"`
}

type BuyAgainSkippedItem struct {
	VariantID   string             `json:"variantId"`
	ProductName string             `json:"productName"`
	Reason      BuyAgainSkipReason `json:"reason"`
}

type BuyAgainResult struct {
	Cart          *Cart                  `json:"cart"`
	AddedCount    int                    `json:"addedCount"`
	AdjustedItems []BuyAgainAdjustedItem `json:"adjustedItems"`
	SkippedItems  []BuyAgainSkippedItem  `json:"skippedItems"`
}

type FulfillmentOrderRepository interface {
	ShipOrder(ctx context.Context, orderID, carrier, trackingCode string) (*Order, error)
	BuyAgain(ctx context.Context, userID, orderID string) (*BuyAgainResult, error)
}
