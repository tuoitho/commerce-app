package domain

import (
	"context"
	"time"
)

type ReturnRequestStatus string

const (
	ReturnStatusPendingApproval ReturnRequestStatus = "pending_approval"
	ReturnStatusApproved        ReturnRequestStatus = "approved"
	ReturnStatusReceived        ReturnRequestStatus = "received"
	ReturnStatusRefunded        ReturnRequestStatus = "refunded"
	ReturnStatusRejected        ReturnRequestStatus = "rejected"
	ReturnStatusCancelled       ReturnRequestStatus = "cancelled"
)

func (s ReturnRequestStatus) IsValid() bool {
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

func (s ReturnRequestStatus) ConsumesQuantity() bool {
	switch s {
	case ReturnStatusPendingApproval,
		ReturnStatusApproved,
		ReturnStatusReceived,
		ReturnStatusRefunded:
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

var returnReasonLabels = map[ReturnReasonCode]string{
	ReturnReasonDefective:      "Hàng lỗi",
	ReturnReasonNotAsDescribed: "Không đúng mô tả",
	ReturnReasonWrongOrMissing: "Giao thiếu hoặc giao sai hàng",
	ReturnReasonChangedMind:    "Khách đổi ý",
}

func (r ReturnReasonCode) IsValid() bool {
	_, ok := returnReasonLabels[r]
	return ok
}

func (r ReturnReasonCode) Label() string {
	return returnReasonLabels[r]
}

const ReturnWindowDays = 7

type ReturnItemInput struct {
	OrderItemID string
	Quantity    int64
}

type ReturnRequestItem struct {
	ID           string
	RequestID    string
	OrderItemID  string
	ProductName  string
	ImageURL     string
	UnitPriceVND MoneyVND
	Quantity     int64
}

type ReturnRequest struct {
	ID              string
	OrderID         string
	UserID          string
	Status          ReturnRequestStatus
	ReasonCode      ReturnReasonCode
	Description     string
	RejectReason    string
	RefundAmountVND MoneyVND
	Items           []ReturnRequestItem
	CreatedAt       time.Time
	UpdatedAt       time.Time
	ApprovedAt      *time.Time
	RejectedAt      *time.Time
	ReceivedAt      *time.Time
	RefundedAt      *time.Time
	CancelledAt     *time.Time

	BuyerEmail         string
	OrderTotalVND      MoneyVND
	ShippingFeeVND     MoneyVND
	SuggestedRefundVND MoneyVND
}

type ReturnAdminAction string

const (
	ReturnActionApprove ReturnAdminAction = "approve"
	ReturnActionReject  ReturnAdminAction = "reject"
	ReturnActionReceive ReturnAdminAction = "receive"
	ReturnActionRefund  ReturnAdminAction = "refund"
)

func (a ReturnAdminAction) IsValid() bool {
	switch a {
	case ReturnActionApprove,
		ReturnActionReject,
		ReturnActionReceive,
		ReturnActionRefund:
		return true
	default:
		return false
	}
}

func (a ReturnAdminAction) AllowedFrom() (ReturnRequestStatus, bool) {
	switch a {
	case ReturnActionApprove, ReturnActionReject:
		return ReturnStatusPendingApproval, true
	case ReturnActionReceive:
		return ReturnStatusApproved, true
	case ReturnActionRefund:
		return ReturnStatusReceived, true
	default:
		return "", false
	}
}

type ReturnRepository interface {
	Create(ctx context.Context, userID, orderID, reasonCode, description string, items []ReturnItemInput) (*ReturnRequest, error)
	ListByOrder(ctx context.Context, userID, orderID string) ([]ReturnRequest, error)
	CancelByCustomer(ctx context.Context, userID, requestID string) (*ReturnRequest, error)
	ListByAdmin(ctx context.Context, statuses []string) ([]ReturnRequest, error)
	GetByAdminID(ctx context.Context, requestID string) (*ReturnRequest, error)
	Approve(ctx context.Context, requestID string) (*ReturnRequest, error)
	Reject(ctx context.Context, requestID, reason string) (*ReturnRequest, error)
	MarkReceived(ctx context.Context, requestID string) (*ReturnRequest, error)
	MarkRefunded(ctx context.Context, requestID string, amountVND MoneyVND, adminUserID string) (*ReturnRequest, error)
}
