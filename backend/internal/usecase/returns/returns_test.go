package returns

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"

	"commerce-backend/internal/domain"
)

type mockReturnRepo struct {
	createFn        func(ctx context.Context, input domain.CreateReturnInput) (*domain.ReturnRequest, error)
	cancelFn        func(ctx context.Context, userID, orderID, returnID string) (*domain.ReturnRequest, error)
	getLatestFn     func(ctx context.Context, orderID string) (*domain.ReturnRequest, error)
	listLatestFn    func(ctx context.Context, orderIDs []string) (map[string]*domain.ReturnRequest, error)
	listAdminFn     func(ctx context.Context, status string, page, limit int) ([]domain.ReturnRequest, int, error)
	getAdminFn      func(ctx context.Context, returnID string) (*domain.ReturnRequest, error)
	approveAdminFn  func(ctx context.Context, returnID string) (*domain.ReturnRequest, error)
	rejectAdminFn   func(ctx context.Context, returnID, rejectReason string) (*domain.ReturnRequest, error)
	receiveAdminFn  func(ctx context.Context, returnID string, mappings []domain.ReceiveItemMapping) (*domain.ReturnRequest, error)
	refundAdminFn   func(ctx context.Context, returnID, adminUserID string) (*domain.ReturnRequest, error)
	searchVariantFn func(ctx context.Context, query string, page, limit int) ([]domain.VariantOptionInfo, int, error)
	isRefundedFn    func(ctx context.Context, orderItemID string) (bool, error)
}

func (m *mockReturnRepo) CreateReturnRequest(ctx context.Context, input domain.CreateReturnInput) (*domain.ReturnRequest, error) {
	if m.createFn != nil {
		return m.createFn(ctx, input)
	}
	return nil, nil
}
func (m *mockReturnRepo) CancelReturnRequest(ctx context.Context, userID, orderID, returnID string) (*domain.ReturnRequest, error) {
	if m.cancelFn != nil {
		return m.cancelFn(ctx, userID, orderID, returnID)
	}
	return nil, nil
}
func (m *mockReturnRepo) GetLatestByOrderID(ctx context.Context, orderID string) (*domain.ReturnRequest, error) {
	if m.getLatestFn != nil {
		return m.getLatestFn(ctx, orderID)
	}
	return nil, nil
}
func (m *mockReturnRepo) ListLatestByOrderIDs(ctx context.Context, orderIDs []string) (map[string]*domain.ReturnRequest, error) {
	if m.listLatestFn != nil {
		return m.listLatestFn(ctx, orderIDs)
	}
	return nil, nil
}
func (m *mockReturnRepo) ListAdmin(ctx context.Context, status string, page, limit int) ([]domain.ReturnRequest, int, error) {
	if m.listAdminFn != nil {
		return m.listAdminFn(ctx, status, page, limit)
	}
	return nil, 0, nil
}
func (m *mockReturnRepo) GetAdminByID(ctx context.Context, returnID string) (*domain.ReturnRequest, error) {
	if m.getAdminFn != nil {
		return m.getAdminFn(ctx, returnID)
	}
	return nil, nil
}
func (m *mockReturnRepo) ApproveAdmin(ctx context.Context, returnID string) (*domain.ReturnRequest, error) {
	if m.approveAdminFn != nil {
		return m.approveAdminFn(ctx, returnID)
	}
	return nil, nil
}
func (m *mockReturnRepo) RejectAdmin(ctx context.Context, returnID, rejectReason string) (*domain.ReturnRequest, error) {
	if m.rejectAdminFn != nil {
		return m.rejectAdminFn(ctx, returnID, rejectReason)
	}
	return nil, nil
}
func (m *mockReturnRepo) ReceiveAdmin(ctx context.Context, returnID string, mappings []domain.ReceiveItemMapping) (*domain.ReturnRequest, error) {
	if m.receiveAdminFn != nil {
		return m.receiveAdminFn(ctx, returnID, mappings)
	}
	return nil, nil
}
func (m *mockReturnRepo) RefundAdmin(ctx context.Context, returnID, adminUserID string) (*domain.ReturnRequest, error) {
	if m.refundAdminFn != nil {
		return m.refundAdminFn(ctx, returnID, adminUserID)
	}
	return nil, nil
}
func (m *mockReturnRepo) SearchVariantOptionsAdmin(ctx context.Context, query string, page, limit int) ([]domain.VariantOptionInfo, int, error) {
	if m.searchVariantFn != nil {
		return m.searchVariantFn(ctx, query, page, limit)
	}
	return nil, 0, nil
}
func (m *mockReturnRepo) IsOrderItemRefunded(ctx context.Context, orderItemID string) (bool, error) {
	if m.isRefundedFn != nil {
		return m.isRefundedFn(ctx, orderItemID)
	}
	return false, nil
}
func (m *mockReturnRepo) ListRefundedOrderItemIDs(ctx context.Context, orderItemIDs []string) (map[string]bool, error) {
	res := make(map[string]bool)
	for _, id := range orderItemIDs {
		if m.isRefundedFn != nil {
			if ref, _ := m.isRefundedFn(ctx, id); ref {
				res[id] = true
			}
		}
	}
	return res, nil
}

func TestReturnUseCase_Create_Validation(t *testing.T) {
	uc := New(Dependencies{Return: &mockReturnRepo{}})
	ctx := context.Background()

	validUserID := uuid.NewString()
	validOrderID := uuid.NewString()
	validItemID := uuid.NewString()

	t.Run("invalid orderID", func(t *testing.T) {
		_, err := uc.Create(ctx, validUserID, "invalid-uuid", []string{validItemID}, domain.ReturnReasonDefective, "broken")
		if err != domain.ErrOrderNotFound {
			t.Fatalf("expected ErrOrderNotFound, got %v", err)
		}
	})

	t.Run("empty itemIDs", func(t *testing.T) {
		_, err := uc.Create(ctx, validUserID, validOrderID, []string{}, domain.ReturnReasonDefective, "broken")
		if err == nil {
			t.Fatal("expected validation error, got nil")
		}
	})

	t.Run("duplicate itemIDs", func(t *testing.T) {
		_, err := uc.Create(ctx, validUserID, validOrderID, []string{validItemID, validItemID}, domain.ReturnReasonDefective, "broken")
		if err == nil {
			t.Fatal("expected validation error for duplicate itemIDs, got nil")
		}
	})

	t.Run("invalid reason code", func(t *testing.T) {
		_, err := uc.Create(ctx, validUserID, validOrderID, []string{validItemID}, domain.ReturnReasonCode("invalid"), "broken")
		if err == nil {
			t.Fatal("expected validation error for invalid reason, got nil")
		}
	})

	t.Run("description too long", func(t *testing.T) {
		longDesc := strings.Repeat("a", 1001)
		_, err := uc.Create(ctx, validUserID, validOrderID, []string{validItemID}, domain.ReturnReasonDefective, longDesc)
		if err == nil {
			t.Fatal("expected validation error for long description, got nil")
		}
	})

	t.Run("valid input calls repo", func(t *testing.T) {
		called := false
		mock := &mockReturnRepo{
			createFn: func(ctx context.Context, input domain.CreateReturnInput) (*domain.ReturnRequest, error) {
				called = true
				if input.OrderID != validOrderID || input.UserID != validUserID {
					t.Errorf("unexpected IDs: %v, %v", input.OrderID, input.UserID)
				}
				return &domain.ReturnRequest{ID: uuid.NewString()}, nil
			},
		}
		testUC := New(Dependencies{Return: mock})
		res, err := testUC.Create(ctx, validUserID, validOrderID, []string{validItemID}, domain.ReturnReasonDefective, "broken screen")
		if err != nil {
			t.Fatalf("expected success, got %v", err)
		}
		if !called || res == nil {
			t.Fatal("expected repo create to be called and result returned")
		}
	})
}

func TestReturnUseCase_Cancel(t *testing.T) {
	called := false
	validUserID := uuid.NewString()
	validOrderID := uuid.NewString()
	validReturnID := uuid.NewString()

	mock := &mockReturnRepo{
		cancelFn: func(ctx context.Context, userID, orderID, returnID string) (*domain.ReturnRequest, error) {
			called = true
			return &domain.ReturnRequest{ID: returnID, Status: domain.ReturnStatusCancelled}, nil
		},
	}
	uc := New(Dependencies{Return: mock})
	res, err := uc.Cancel(context.Background(), validUserID, validOrderID, validReturnID)
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if !called || res.Status != domain.ReturnStatusCancelled {
		t.Fatal("expected repo cancel to be called")
	}
}

func TestReturnUseCase_AdminReject_Validation(t *testing.T) {
	uc := New(Dependencies{Return: &mockReturnRepo{}})
	validReturnID := uuid.NewString()

	_, err := uc.AdminReject(context.Background(), validReturnID, "   ")
	if err == nil {
		t.Fatal("expected validation error for empty reject reason")
	}

	_, err = uc.AdminReject(context.Background(), validReturnID, strings.Repeat("x", 1001))
	if err == nil {
		t.Fatal("expected validation error for too long reject reason")
	}
}

func TestReturnUseCase_AdminReceive_Validation(t *testing.T) {
	uc := New(Dependencies{Return: &mockReturnRepo{}})
	validReturnID := uuid.NewString()

	_, err := uc.AdminReceive(context.Background(), validReturnID, nil)
	if err == nil {
		t.Fatal("expected validation error for empty mappings")
	}

	item1 := uuid.NewString()
	var1 := uuid.NewString()
	_, err = uc.AdminReceive(context.Background(), validReturnID, []domain.ReceiveItemMapping{
		{OrderItemID: item1, ReceivedVariantID: var1},
		{OrderItemID: item1, ReceivedVariantID: var1},
	})
	if err == nil {
		t.Fatal("expected validation error for duplicate item mappings")
	}
}
