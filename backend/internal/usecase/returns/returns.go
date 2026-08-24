package returns

import (
	"context"

	"github.com/google/uuid"

	"commerce-backend/internal/domain"
)

type Dependencies struct {
	Returns domain.ReturnRepository
}

type UseCase struct {
	returns domain.ReturnRepository
}

func New(deps Dependencies) *UseCase {
	return &UseCase{returns: deps.Returns}
}

func (uc *UseCase) Create(ctx context.Context, userID, orderID, reasonCode, description string, items []domain.ReturnItemInput) (*domain.ReturnRequest, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, domain.ErrOrderNotFound
	}

	fields := map[string]string{}
	if !domain.ReturnReasonCode(reasonCode).IsValid() {
		fields["reasonCode"] = "Lý do trả hàng không hợp lệ"
	}
	if len(description) > 500 {
		fields["description"] = "Mô tả không được vượt quá 500 ký tự"
	}
	if len(items) == 0 {
		fields["items"] = "Cần chọn ít nhất một mặt hàng để trả"
	} else {
		seen := map[string]bool{}
		for _, item := range items {
			if _, err := uuid.Parse(item.OrderItemID); err != nil {
				fields["items"] = "Mặt hàng trả không hợp lệ"
				break
			}
			if item.Quantity < 1 {
				fields["items"] = "Số lượng trả phải lớn hơn hoặc bằng 1"
				break
			}
			if seen[item.OrderItemID] {
				fields["items"] = "Mặt hàng trả bị trùng lặp"
				break
			}
			seen[item.OrderItemID] = true
		}
	}
	if len(fields) > 0 {
		return nil, domain.NewValidationError(fields)
	}

	return uc.returns.Create(ctx, userID, orderID, reasonCode, description, items)
}

func (uc *UseCase) ListByOrder(ctx context.Context, userID, orderID string) ([]domain.ReturnRequest, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, domain.ErrOrderNotFound
	}

	requests, err := uc.returns.ListByOrder(ctx, userID, orderID)
	if err != nil {
		return nil, err
	}
	if requests == nil {
		return []domain.ReturnRequest{}, nil
	}
	return requests, nil
}

func (uc *UseCase) Cancel(ctx context.Context, userID, requestID string) (*domain.ReturnRequest, error) {
	if _, err := uuid.Parse(requestID); err != nil {
		return nil, domain.ErrReturnNotFound
	}

	return uc.returns.CancelByCustomer(ctx, userID, requestID)
}

func (uc *UseCase) AdminList(ctx context.Context, status string) ([]domain.ReturnRequest, error) {
	var statuses []string
	if status != "" {
		if !domain.ReturnRequestStatus(status).IsValid() {
			return nil, domain.NewValidationError(map[string]string{"status": "Trạng thái yêu cầu trả hàng không hợp lệ"})
		}
		statuses = []string{status}
	}

	requests, err := uc.returns.ListByAdmin(ctx, statuses)
	if err != nil {
		return nil, err
	}
	if requests == nil {
		return []domain.ReturnRequest{}, nil
	}
	return requests, nil
}

func (uc *UseCase) AdminGetByID(ctx context.Context, requestID string) (*domain.ReturnRequest, error) {
	if _, err := uuid.Parse(requestID); err != nil {
		return nil, domain.ErrReturnNotFound
	}

	return uc.returns.GetByAdminID(ctx, requestID)
}

func (uc *UseCase) AdminAction(ctx context.Context, requestID, action, rejectReason, refundAmount, adminUserID string) (*domain.ReturnRequest, error) {
	if _, err := uuid.Parse(requestID); err != nil {
		return nil, domain.ErrReturnNotFound
	}

	actionType := domain.ReturnAdminAction(action)
	if !actionType.IsValid() {
		return nil, domain.NewValidationError(map[string]string{"action": "Thao tác không hợp lệ"})
	}

	switch actionType {
	case domain.ReturnActionReject:
		if len(rejectReason) == 0 || len(rejectReason) > 500 {
			return nil, domain.NewValidationError(map[string]string{"reason": "Vui lòng nhập lý do từ chối (tối đa 500 ký tự)"})
		}
	case domain.ReturnActionRefund:
		amount := domain.MoneyVND(refundAmount)
		if !amount.IsCanonical() || amount == "0" {
			return nil, domain.NewValidationError(map[string]string{"amount": "Số tiền hoàn phải là số nguyên VND lớn hơn 0"})
		}
	}

	switch actionType {
	case domain.ReturnActionApprove:
		return uc.returns.Approve(ctx, requestID)
	case domain.ReturnActionReject:
		return uc.returns.Reject(ctx, requestID, rejectReason)
	case domain.ReturnActionReceive:
		return uc.returns.MarkReceived(ctx, requestID)
	case domain.ReturnActionRefund:
		return uc.returns.MarkRefunded(ctx, requestID, domain.MoneyVND(refundAmount), adminUserID)
	default:
		return nil, domain.ErrReturnActionNotAllowed
	}
}
