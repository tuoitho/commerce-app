package returns

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"commerce-backend/internal/domain"
)

type Dependencies struct {
	Return domain.ReturnRepository
}

type UseCase struct {
	returnRepo domain.ReturnRepository
}

func New(deps Dependencies) *UseCase {
	return &UseCase{
		returnRepo: deps.Return,
	}
}

func (uc *UseCase) Create(ctx context.Context, userID, orderID string, itemIDs []string, reasonCode domain.ReturnReasonCode, description string) (*domain.ReturnRequest, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, domain.ErrOrderNotFound
	}
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrOrderNotFound
	}

	if len(itemIDs) == 0 {
		return nil, domain.NewValidationError(map[string]string{"orderItemIds": "Vui lòng chọn ít nhất một sản phẩm để trả"})
	}

	seen := make(map[string]bool)
	for _, id := range itemIDs {
		if _, err := uuid.Parse(id); err != nil {
			return nil, domain.NewValidationError(map[string]string{"orderItemIds": "Mã sản phẩm không hợp lệ"})
		}
		if seen[id] {
			return nil, domain.NewValidationError(map[string]string{"orderItemIds": "Sản phẩm được chọn bị trùng lặp"})
		}
		seen[id] = true
	}

	if !reasonCode.IsValid() {
		return nil, domain.NewValidationError(map[string]string{"reasonCode": "Lý do trả hàng không hợp lệ"})
	}

	trimmedDesc := strings.TrimSpace(description)
	if len([]rune(trimmedDesc)) > 1000 {
		return nil, domain.NewValidationError(map[string]string{"description": "Mô tả không được vượt quá 1000 ký tự"})
	}

	return uc.returnRepo.CreateReturnRequest(ctx, domain.CreateReturnInput{
		OrderID:      orderID,
		UserID:       userID,
		OrderItemIDs: itemIDs,
		ReasonCode:   reasonCode,
		Description:  trimmedDesc,
	})
}

func (uc *UseCase) Cancel(ctx context.Context, userID, orderID, returnID string) (*domain.ReturnRequest, error) {
	if _, err := uuid.Parse(returnID); err != nil {
		return nil, domain.ErrReturnRequestNotFound
	}
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, domain.ErrReturnRequestNotFound
	}
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrReturnRequestNotFound
	}

	return uc.returnRepo.CancelReturnRequest(ctx, userID, orderID, returnID)
}

func (uc *UseCase) GetLatestByOrderID(ctx context.Context, orderID string) (*domain.ReturnRequest, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, nil
	}
	return uc.returnRepo.GetLatestByOrderID(ctx, orderID)
}

func (uc *UseCase) AdminList(ctx context.Context, status string, page, limit int) ([]domain.ReturnRequest, int, error) {
	if status != "" && !domain.ReturnStatus(status).IsValid() {
		return nil, 0, domain.NewValidationError(map[string]string{"status": "Trạng thái trả hàng không hợp lệ"})
	}
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}

	return uc.returnRepo.ListAdmin(ctx, status, page, limit)
}

func (uc *UseCase) AdminGetByID(ctx context.Context, returnID string) (*domain.ReturnRequest, error) {
	if _, err := uuid.Parse(returnID); err != nil {
		return nil, domain.ErrReturnRequestNotFound
	}
	return uc.returnRepo.GetAdminByID(ctx, returnID)
}

func (uc *UseCase) AdminApprove(ctx context.Context, returnID string) (*domain.ReturnRequest, error) {
	if _, err := uuid.Parse(returnID); err != nil {
		return nil, domain.ErrReturnRequestNotFound
	}
	return uc.returnRepo.ApproveAdmin(ctx, returnID)
}

func (uc *UseCase) AdminReject(ctx context.Context, returnID, rejectReason string) (*domain.ReturnRequest, error) {
	if _, err := uuid.Parse(returnID); err != nil {
		return nil, domain.ErrReturnRequestNotFound
	}
	trimmed := strings.TrimSpace(rejectReason)
	if trimmed == "" {
		return nil, domain.NewValidationError(map[string]string{"rejectReason": "Lý do từ chối không được để trống"})
	}
	if len([]rune(trimmed)) > 1000 {
		return nil, domain.NewValidationError(map[string]string{"rejectReason": "Lý do từ chối không được vượt quá 1000 ký tự"})
	}

	return uc.returnRepo.RejectAdmin(ctx, returnID, trimmed)
}

func (uc *UseCase) AdminReceive(ctx context.Context, returnID string, mappings []domain.ReceiveItemMapping) (*domain.ReturnRequest, error) {
	if _, err := uuid.Parse(returnID); err != nil {
		return nil, domain.ErrReturnRequestNotFound
	}
	if len(mappings) == 0 {
		return nil, domain.NewValidationError(map[string]string{"items": "Danh sách mapping sản phẩm nhận không được rỗng"})
	}

	seen := make(map[string]bool)
	for _, m := range mappings {
		if _, err := uuid.Parse(m.OrderItemID); err != nil {
			return nil, domain.NewValidationError(map[string]string{"items": "Mã dòng sản phẩm không hợp lệ"})
		}
		if _, err := uuid.Parse(m.ReceivedVariantID); err != nil {
			return nil, domain.NewValidationError(map[string]string{"items": "Mã phân loại sản phẩm thực nhận không hợp lệ"})
		}
		if seen[m.OrderItemID] {
			return nil, domain.NewValidationError(map[string]string{"items": "Dòng sản phẩm bị trùng lặp trong danh sách nhận"})
		}
		seen[m.OrderItemID] = true
	}

	return uc.returnRepo.ReceiveAdmin(ctx, returnID, mappings)
}

func (uc *UseCase) AdminRefund(ctx context.Context, returnID, adminUserID string) (*domain.ReturnRequest, error) {
	if _, err := uuid.Parse(returnID); err != nil {
		return nil, domain.ErrReturnRequestNotFound
	}
	if _, err := uuid.Parse(adminUserID); err != nil {
		return nil, domain.ErrForbidden
	}

	return uc.returnRepo.RefundAdmin(ctx, returnID, adminUserID)
}

func (uc *UseCase) AdminSearchVariantOptions(ctx context.Context, query string, page, limit int) ([]domain.VariantOptionInfo, int, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}

	return uc.returnRepo.SearchVariantOptionsAdmin(ctx, query, page, limit)
}
