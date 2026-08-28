package domain

import (
	"context"
	"time"
)

type ReturnStatus string

const (
	ReturnStatusPendingApproval ReturnStatus = "pending_approval"
	ReturnStatusApproved        ReturnStatus = "approved"
	ReturnStatusReceived        ReturnStatus = "received"
	ReturnStatusRefunded        ReturnStatus = "refunded"
	ReturnStatusRejected        ReturnStatus = "rejected"
	ReturnStatusCancelled       ReturnStatus = "cancelled"
)

func (s ReturnStatus) IsValid() bool {
	switch s {
	case ReturnStatusPendingApproval,
		ReturnStatusApproved,
		ReturnStatusReceived,
		ReturnStatusRefunded,
		ReturnStatusRejected,
		ReturnStatusCancelled:
		return true
	default:
		return false
	}
}

type ReturnReasonCode string

const (
	ReturnReasonDefective      ReturnReasonCode = "defective"
	ReturnReasonNotAsDescribed ReturnReasonCode = "not_as_described"
	ReturnReasonWrongOrMissing ReturnReasonCode = "wrong_or_missing"
	ReturnReasonChangedMind    ReturnReasonCode = "changed_mind"
)

func (r ReturnReasonCode) IsValid() bool {
	switch r {
	case ReturnReasonDefective,
		ReturnReasonNotAsDescribed,
		ReturnReasonWrongOrMissing,
		ReturnReasonChangedMind:
		return true
	default:
		return false
	}
}

type ReturnEligibility struct {
	Eligible bool       `json:"eligible"`
	Deadline *time.Time `json:"deadline"`
}

var vietnamLocation = time.FixedZone("Asia/Ho_Chi_Minh", 7*3600)

func CalculateReturnDeadline(deliveredAt time.Time) time.Time {
	local := deliveredAt.In(vietnamLocation)
	year, month, day := local.Date()
	deadlineLocal := time.Date(year, month, day+7, 23, 59, 59, 999999999, vietnamLocation)
	return deadlineLocal.UTC()
}

func CalculateReturnEligibility(order Order, latestReturn *ReturnRequest, now time.Time) ReturnEligibility {
	if order.Status != OrderStatusDelivered || order.DeliveredAt == nil {
		return ReturnEligibility{
			Eligible: false,
			Deadline: nil,
		}
	}

	deadline := CalculateReturnDeadline(*order.DeliveredAt)
	if now.After(deadline) {
		return ReturnEligibility{
			Eligible: false,
			Deadline: &deadline,
		}
	}

	if latestReturn != nil {
		switch latestReturn.Status {
		case ReturnStatusPendingApproval,
			ReturnStatusApproved,
			ReturnStatusReceived,
			ReturnStatusRefunded:
			return ReturnEligibility{
				Eligible: false,
				Deadline: &deadline,
			}
		case ReturnStatusCancelled, ReturnStatusRejected:
			return ReturnEligibility{
				Eligible: true,
				Deadline: &deadline,
			}
		}
	}

	return ReturnEligibility{
		Eligible: true,
		Deadline: &deadline,
	}
}

type ReturnRequestItem struct {
	ID                string       `json:"id"`
	ReturnRequestID   string       `json:"returnRequestId"`
	OrderItemID       string       `json:"orderItemId"`
	VariantID         string       `json:"variantId"`
	ProductID         string       `json:"productId"`
	BrandName         string       `json:"brandName"`
	ProductName       string       `json:"productName"`
	Model             string       `json:"model"`
	ImageURL          string       `json:"imageUrl"`
	Options           []CartOption `json:"options"`
	Quantity          int64        `json:"quantity"`
	UnitPriceVND      MoneyVND     `json:"unitPriceVnd"`
	LineTotalVND      MoneyVND     `json:"lineTotalVnd"`
	ReceivedVariantID *string      `json:"receivedVariantId,omitempty"`
}

type ReturnRequest struct {
	ID                string              `json:"id"`
	OrderID           string              `json:"orderId"`
	UserID            string              `json:"userId,omitempty"`
	BuyerEmail        string              `json:"buyerEmail,omitempty"`
	Status            ReturnStatus        `json:"status"`
	ReasonCode        ReturnReasonCode    `json:"reasonCode"`
	Description       string              `json:"description"`
	RejectReason      string              `json:"rejectReason"`
	ExpectedRefundVND MoneyVND            `json:"expectedRefundVnd"`
	RefundAmountVND   *MoneyVND           `json:"refundAmountVnd"`
	RefundedByUserID  *string             `json:"refundedByUserId,omitempty"`
	Items             []ReturnRequestItem `json:"items"`
	CreatedAt         time.Time           `json:"createdAt"`
	UpdatedAt         time.Time           `json:"updatedAt"`
	ApprovedAt        *time.Time          `json:"approvedAt"`
	RejectedAt        *time.Time          `json:"rejectedAt"`
	ReceivedAt        *time.Time          `json:"receivedAt"`
	RefundedAt        *time.Time          `json:"refundedAt"`
	CancelledAt       *time.Time          `json:"cancelledAt"`
}

type VariantOptionInfo struct {
	VariantID     string       `json:"variantId"`
	ProductID     string       `json:"productId"`
	BrandName     string       `json:"brandName"`
	ProductName   string       `json:"productName"`
	Model         string       `json:"model"`
	Options       []CartOption `json:"options"`
	StockQuantity int64        `json:"stockQuantity"`
	ProductActive bool         `json:"productActive"`
	VariantActive bool         `json:"variantActive"`
}

type CreateReturnInput struct {
	OrderID      string
	UserID       string
	OrderItemIDs []string
	ReasonCode   ReturnReasonCode
	Description  string
}

type ReceiveItemMapping struct {
	OrderItemID       string
	ReceivedVariantID string
}

type ReturnRepository interface {
	CreateReturnRequest(ctx context.Context, input CreateReturnInput) (*ReturnRequest, error)
	CancelReturnRequest(ctx context.Context, userID, orderID, returnID string) (*ReturnRequest, error)
	GetLatestByOrderID(ctx context.Context, orderID string) (*ReturnRequest, error)
	ListLatestByOrderIDs(ctx context.Context, orderIDs []string) (map[string]*ReturnRequest, error)
	
	// Admin operations
	ListAdmin(ctx context.Context, status string, page, limit int) ([]ReturnRequest, int, error)
	GetAdminByID(ctx context.Context, returnID string) (*ReturnRequest, error)
	ApproveAdmin(ctx context.Context, returnID string) (*ReturnRequest, error)
	RejectAdmin(ctx context.Context, returnID, rejectReason string) (*ReturnRequest, error)
	ReceiveAdmin(ctx context.Context, returnID string, mappings []ReceiveItemMapping) (*ReturnRequest, error)
	RefundAdmin(ctx context.Context, returnID, adminUserID string) (*ReturnRequest, error)
	SearchVariantOptionsAdmin(ctx context.Context, query string, page, limit int) ([]VariantOptionInfo, int, error)

	// Item refunded predicate
	IsOrderItemRefunded(ctx context.Context, orderItemID string) (bool, error)
	ListRefundedOrderItemIDs(ctx context.Context, orderItemIDs []string) (map[string]bool, error)
}
