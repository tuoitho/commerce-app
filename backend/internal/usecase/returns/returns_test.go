package returns_test

import (
	"context"
	"errors"
	"testing"

	"commerce-backend/internal/domain"
	returnsuc "commerce-backend/internal/usecase/returns"
)

type fakeReturnRepo struct {
	createdRequest *domain.ReturnRequest
	createErr      error
	lastCreateUser string
	lastCreateOrd  string
	lastReason     string
	lastDesc       string
	lastItems      []domain.ReturnItemInput

	listByOrderReqs []domain.ReturnRequest
	listByOrderErr  error
	lastListOrderID string
	lastListUserID  string

	cancelledRequest *domain.ReturnRequest
	cancelErr        error
	lastCancelReqID  string
	lastCancelUserID string

	adminListReqs     []domain.ReturnRequest
	adminListErr      error
	lastAdminStatuses []string

	adminGetRequest *domain.ReturnRequest
	adminGetErr     error
	lastAdminGetID  string

	approveRequest *domain.ReturnRequest
	approveErr     error
	lastApproveID  string

	rejectRequest    *domain.ReturnRequest
	rejectErr        error
	lastRejectID     string
	lastRejectReason string

	receiveRequest *domain.ReturnRequest
	receiveErr     error
	lastReceiveID  string

	refundRequest    *domain.ReturnRequest
	refundErr        error
	lastRefundID     string
	lastRefundAmount domain.MoneyVND
	lastRefundAdmin  string
}

func (f *fakeReturnRepo) Create(_ context.Context, userID, orderID, reasonCode, description string, items []domain.ReturnItemInput) (*domain.ReturnRequest, error) {
	f.lastCreateUser = userID
	f.lastCreateOrd = orderID
	f.lastReason = reasonCode
	f.lastDesc = description
	f.lastItems = items
	if f.createErr != nil {
		return nil, f.createErr
	}
	return f.createdRequest, nil
}

func (f *fakeReturnRepo) ListByOrder(_ context.Context, userID, orderID string) ([]domain.ReturnRequest, error) {
	f.lastListUserID = userID
	f.lastListOrderID = orderID
	if f.listByOrderErr != nil {
		return nil, f.listByOrderErr
	}
	return f.listByOrderReqs, nil
}

func (f *fakeReturnRepo) CancelByCustomer(_ context.Context, userID, requestID string) (*domain.ReturnRequest, error) {
	f.lastCancelUserID = userID
	f.lastCancelReqID = requestID
	if f.cancelErr != nil {
		return nil, f.cancelErr
	}
	return f.cancelledRequest, nil
}

func (f *fakeReturnRepo) ListByAdmin(_ context.Context, statuses []string) ([]domain.ReturnRequest, error) {
	f.lastAdminStatuses = statuses
	if f.adminListErr != nil {
		return nil, f.adminListErr
	}
	return f.adminListReqs, nil
}

func (f *fakeReturnRepo) GetByAdminID(_ context.Context, requestID string) (*domain.ReturnRequest, error) {
	f.lastAdminGetID = requestID
	if f.adminGetErr != nil {
		return nil, f.adminGetErr
	}
	return f.adminGetRequest, nil
}

func (f *fakeReturnRepo) Approve(_ context.Context, requestID string) (*domain.ReturnRequest, error) {
	f.lastApproveID = requestID
	if f.approveErr != nil {
		return nil, f.approveErr
	}
	return f.approveRequest, nil
}

func (f *fakeReturnRepo) Reject(_ context.Context, requestID, reason string) (*domain.ReturnRequest, error) {
	f.lastRejectID = requestID
	f.lastRejectReason = reason
	if f.rejectErr != nil {
		return nil, f.rejectErr
	}
	return f.rejectRequest, nil
}

func (f *fakeReturnRepo) MarkReceived(_ context.Context, requestID string) (*domain.ReturnRequest, error) {
	f.lastReceiveID = requestID
	if f.receiveErr != nil {
		return nil, f.receiveErr
	}
	return f.receiveRequest, nil
}

func (f *fakeReturnRepo) MarkRefunded(_ context.Context, requestID string, amountVND domain.MoneyVND, adminUserID string) (*domain.ReturnRequest, error) {
	f.lastRefundID = requestID
	f.lastRefundAmount = amountVND
	f.lastRefundAdmin = adminUserID
	if f.refundErr != nil {
		return nil, f.refundErr
	}
	return f.refundRequest, nil
}

const orderTestUUID = "11111111-1111-1111-1111-111111111111"
const testOrderUUID = "22222222-2222-2222-2222-222222222222"
const testItemUUID = "33333333-3333-3333-3333-333333333333"
const testRequestUUID = "44444444-4444-4444-4444-444444444444"
const testAdminUUID = "55555555-5555-5555-5555-555555555555"

func newTestUseCase(repo *fakeReturnRepo) *returnsuc.UseCase {
	return returnsuc.New(returnsuc.Dependencies{Returns: repo})
}

func TestReturnsUseCase_Create_Validation(t *testing.T) {
	tests := []struct {
		name          string
		orderID       string
		reasonCode    string
		description   string
		items         []domain.ReturnItemInput
		expectedField string
	}{
		{
			name:          "invalid order uuid",
			orderID:       "not-a-uuid",
			reasonCode:    "defective",
			items:         []domain.ReturnItemInput{{OrderItemID: testItemUUID, Quantity: 1}},
			expectedField: "",
		},
		{
			name:          "invalid reason code",
			orderID:       testOrderUUID,
			reasonCode:    "because",
			items:         []domain.ReturnItemInput{{OrderItemID: testItemUUID, Quantity: 1}},
			expectedField: "reasonCode",
		},
		{
			name:          "description too long",
			orderID:       testOrderUUID,
			reasonCode:    "defective",
			description:   string(make([]byte, 501)),
			items:         []domain.ReturnItemInput{{OrderItemID: testItemUUID, Quantity: 1}},
			expectedField: "description",
		},
		{
			name:          "no items",
			orderID:       testOrderUUID,
			reasonCode:    "defective",
			expectedField: "items",
		},
		{
			name:          "quantity zero",
			orderID:       testOrderUUID,
			reasonCode:    "defective",
			items:         []domain.ReturnItemInput{{OrderItemID: testItemUUID, Quantity: 0}},
			expectedField: "items",
		},
		{
			name:          "invalid item uuid",
			orderID:       testOrderUUID,
			reasonCode:    "defective",
			items:         []domain.ReturnItemInput{{OrderItemID: "abc", Quantity: 1}},
			expectedField: "items",
		},
		{
			name:       "duplicate item ids",
			orderID:    testOrderUUID,
			reasonCode: "defective",
			items: []domain.ReturnItemInput{
				{OrderItemID: testItemUUID, Quantity: 1},
				{OrderItemID: testItemUUID, Quantity: 1},
			},
			expectedField: "items",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &fakeReturnRepo{}
			uc := newTestUseCase(repo)

			_, err := uc.Create(context.Background(), orderTestUUID, tt.orderID, tt.reasonCode, tt.description, tt.items)

			if tt.expectedField == "" {
				if !errors.Is(err, domain.ErrOrderNotFound) {
					t.Fatalf("expected ErrOrderNotFound, got %v", err)
				}
				return
			}

			var valErr *domain.ValidationError
			if !errors.As(err, &valErr) {
				t.Fatalf("expected ValidationError, got %v", err)
			}
			if valErr.Fields[tt.expectedField] == "" {
				t.Fatalf("expected validation error on field %q, got fields %+v", tt.expectedField, valErr.Fields)
			}
		})
	}
}

func TestReturnsUseCase_Create_SuccessDelegatesToRepo(t *testing.T) {
	repo := &fakeReturnRepo{}
	uc := newTestUseCase(repo)
	items := []domain.ReturnItemInput{{OrderItemID: testItemUUID, Quantity: 2}}

	created := &domain.ReturnRequest{ID: testRequestUUID}
	repo.createdRequest = created

	request, err := uc.Create(context.Background(), orderTestUUID, testOrderUUID, "defective", "Mô tả", items)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if request != created {
		t.Fatalf("expected repo result to be returned")
	}
	if repo.lastCreateOrd != testOrderUUID || repo.lastCreateUser != orderTestUUID {
		t.Errorf("unexpected delegation args: user=%s order=%s", repo.lastCreateUser, repo.lastCreateOrd)
	}
	if len(repo.lastItems) != 1 || repo.lastItems[0].Quantity != 2 {
		t.Errorf("expected items forwarded to repo, got %+v", repo.lastItems)
	}
}

func TestReturnsUseCase_ListByOrder_UUIDCheck(t *testing.T) {
	repo := &fakeReturnRepo{}
	uc := newTestUseCase(repo)

	_, err := uc.ListByOrder(context.Background(), orderTestUUID, "bad-uuid")
	if !errors.Is(err, domain.ErrOrderNotFound) {
		t.Fatalf("expected ErrOrderNotFound for invalid order uuid, got %v", err)
	}

	requests, err := uc.ListByOrder(context.Background(), orderTestUUID, testOrderUUID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if requests == nil {
		t.Fatal("expected non-nil slice")
	}
}

func TestReturnsUseCase_Cancel_UUIDAndBusinessError(t *testing.T) {
	repo := &fakeReturnRepo{}
	uc := newTestUseCase(repo)

	_, err := uc.Cancel(context.Background(), orderTestUUID, "bad-uuid")
	if !errors.Is(err, domain.ErrReturnNotFound) {
		t.Fatalf("expected ErrReturnNotFound for invalid request uuid, got %v", err)
	}

	repo.cancelErr = domain.ErrReturnActionNotAllowed
	_, err = uc.Cancel(context.Background(), orderTestUUID, testRequestUUID)
	if !errors.Is(err, domain.ErrReturnActionNotAllowed) {
		t.Fatalf("expected ErrReturnActionNotAllowed passthrough, got %v", err)
	}
}

func TestReturnsUseCase_AdminList_FilterValidation(t *testing.T) {
	repo := &fakeReturnRepo{}
	uc := newTestUseCase(repo)

	_, err := uc.AdminList(context.Background(), "khong_hop_le")
	var valErr *domain.ValidationError
	if !errors.As(err, &valErr) {
		t.Fatalf("expected ValidationError for invalid status, got %v", err)
	}
	if valErr.Fields["status"] == "" {
		t.Fatalf("expected validation error on field status")
	}

	_, err = uc.AdminList(context.Background(), "pending_approval")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(repo.lastAdminStatuses) != 1 || repo.lastAdminStatuses[0] != "pending_approval" {
		t.Errorf("expected filter forwarded, got %+v", repo.lastAdminStatuses)
	}

	_, err = uc.AdminList(context.Background(), "")
	if err != nil {
		t.Fatalf("unexpected error for empty filter: %v", err)
	}
	if len(repo.lastAdminStatuses) != 0 {
		t.Errorf("expected no filter for empty status, got %+v", repo.lastAdminStatuses)
	}
}

func TestReturnsUseCase_AdminGetByID_UUID(t *testing.T) {
	repo := &fakeReturnRepo{}
	uc := newTestUseCase(repo)

	_, err := uc.AdminGetByID(context.Background(), "bad")
	if !errors.Is(err, domain.ErrReturnNotFound) {
		t.Fatalf("expected ErrReturnNotFound, got %v", err)
	}

	repo.adminGetErr = domain.ErrReturnNotFound
	_, err = uc.AdminGetByID(context.Background(), testRequestUUID)
	if !errors.Is(err, domain.ErrReturnNotFound) {
		t.Fatalf("expected repo error passthrough, got %v", err)
	}
}

func TestReturnsUseCase_AdminAction_RejectRequiresReason(t *testing.T) {
	repo := &fakeReturnRepo{}
	uc := newTestUseCase(repo)

	for _, reason := range []string{""} {
		_, err := uc.AdminAction(context.Background(), testRequestUUID, "reject", reason, "", testAdminUUID)
		var valErr *domain.ValidationError
		if !errors.As(err, &valErr) {
			t.Fatalf("expected ValidationError for empty reason %q, got %v", reason, err)
		}
		if valErr.Fields["reason"] == "" {
			t.Fatalf("expected validation error on field reason")
		}
	}

	long := make([]byte, 501)
	_, err := uc.AdminAction(context.Background(), testRequestUUID, "reject", string(long), "", testAdminUUID)
	var valErr *domain.ValidationError
	if !errors.As(err, &valErr) || valErr.Fields["reason"] == "" {
		t.Fatalf("expected validation error on reason for over-length value, got %v", err)
	}
}

func TestReturnsUseCase_AdminAction_RefundAmountValidation(t *testing.T) {
	tests := []struct {
		name   string
		amount string
	}{
		{name: "zero", amount: "0"},
		{name: "negative", amount: "-100"},
		{name: "non-digit", amount: "abc"},
		{name: "decimal", amount: "1.0"},
		{name: "leading zero", amount: "0100"},
		{name: "empty", amount: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &fakeReturnRepo{}
			uc := newTestUseCase(repo)

			_, err := uc.AdminAction(context.Background(), testRequestUUID, "refund", "", tt.amount, testAdminUUID)
			var valErr *domain.ValidationError
			if !errors.As(err, &valErr) {
				t.Fatalf("expected ValidationError, got %v", err)
			}
			if valErr.Fields["amount"] == "" {
				t.Fatalf("expected validation error on field amount, got fields %+v", valErr.Fields)
			}
		})
	}
}

func TestReturnsUseCase_AdminAction_UnknownAction(t *testing.T) {
	repo := &fakeReturnRepo{}
	uc := newTestUseCase(repo)

	_, err := uc.AdminAction(context.Background(), testRequestUUID, "explode", "", "", testAdminUUID)
	var valErr *domain.ValidationError
	if !errors.As(err, &valErr) {
		t.Fatalf("expected ValidationError for unknown action, got %v", err)
	}
	if valErr.Fields["action"] == "" {
		t.Fatalf("expected validation error on field action")
	}
}

func TestReturnsUseCase_AdminAction_ValidActionsDelegate(t *testing.T) {
	setup := func() (*fakeReturnRepo, *returnsuc.UseCase) {
		repo := &fakeReturnRepo{}
		return repo, newTestUseCase(repo)
	}

	t.Run("approve", func(t *testing.T) {
		repo, uc := setup()
		repo.approveRequest = &domain.ReturnRequest{ID: testRequestUUID}
		req, err := uc.AdminAction(context.Background(), testRequestUUID, "approve", "", "", testAdminUUID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if req.ID != testRequestUUID {
			t.Errorf("unexpected request id %s", req.ID)
		}
	})

	t.Run("reject", func(t *testing.T) {
		repo, uc := setup()
		repo.rejectRequest = &domain.ReturnRequest{ID: testRequestUUID}
		if _, err := uc.AdminAction(context.Background(), testRequestUUID, "reject", "Hàng đã qua sử dụng", "", testAdminUUID); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if repo.lastRejectReason != "Hàng đã qua sử dụng" {
			t.Errorf("expected reject reason forwarded, got %q", repo.lastRejectReason)
		}
	})

	t.Run("receive", func(t *testing.T) {
		repo, uc := setup()
		repo.receiveRequest = &domain.ReturnRequest{ID: testRequestUUID}
		if _, err := uc.AdminAction(context.Background(), testRequestUUID, "receive", "", "", testAdminUUID); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("refund", func(t *testing.T) {
		repo, uc := setup()
		repo.refundRequest = &domain.ReturnRequest{ID: testRequestUUID}
		if _, err := uc.AdminAction(context.Background(), testRequestUUID, "refund", "", "520000", testAdminUUID); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if repo.lastRefundAmount != "520000" {
			t.Errorf("expected amount 520000 forwarded, got %s", repo.lastRefundAmount)
		}
		if repo.lastRefundAdmin != testAdminUUID {
			t.Errorf("expected admin id forwarded, got %s", repo.lastRefundAdmin)
		}
	})
}
