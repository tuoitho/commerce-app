package order

import (
	"context"
	"time"

	"github.com/google/uuid"

	"commerce-backend/internal/domain"
)

type Dependencies struct {
	Order               domain.OrderRepository
	ShippingFeeVND      domain.MoneyVND
	OrderConfirmTimeout time.Duration
}

type UseCase struct {
	order               domain.OrderRepository
	shippingFeeVND      domain.MoneyVND
	orderConfirmTimeout time.Duration
}

func New(deps Dependencies) *UseCase {
	shippingFee := deps.ShippingFeeVND
	if !shippingFee.IsCanonical() {
		shippingFee = "0"
	}
	timeout := deps.OrderConfirmTimeout
	if timeout <= 0 {
		timeout = 30 * time.Minute
	}
	return &UseCase{
		order:               deps.Order,
		shippingFeeVND:      shippingFee,
		orderConfirmTimeout: timeout,
	}
}

func (uc *UseCase) Create(ctx context.Context, userID, addressID string, lines []domain.OrderLineInput) (*domain.Order, error) {
	if len(lines) == 0 {
		return nil, domain.ErrCartEmpty
	}

	if _, err := uuid.Parse(addressID); err != nil {
		return nil, domain.NewValidationError(map[string]string{"address_id": "Mã địa chỉ không hợp lệ"})
	}

	for _, line := range lines {
		if _, err := uuid.Parse(line.VariantID); err != nil {
			return nil, domain.NewValidationError(map[string]string{"lines": "Mã phân loại sản phẩm không hợp lệ"})
		}
		if line.Quantity <= 0 {
			return nil, domain.NewValidationError(map[string]string{"lines": "Số lượng sản phẩm không hợp lệ"})
		}
	}

	order, err := uc.order.Create(ctx, userID, addressID, lines, uc.shippingFeeVND)
	if err != nil {
		return nil, err
	}

	if order != nil && order.Status == domain.OrderStatusPendingConfirmation {
		cancellableUntil := order.CreatedAt.Add(uc.orderConfirmTimeout)
		order.CancellableUntil = &cancellableUntil
	}

	return order, nil
}

func (uc *UseCase) GetByID(ctx context.Context, userID, orderID string) (*domain.Order, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, domain.ErrOrderNotFound
	}

	order, err := uc.order.GetByID(ctx, userID, orderID)
	if err != nil {
		return nil, err
	}

	if order != nil && order.Status == domain.OrderStatusPendingConfirmation {
		cancellableUntil := order.CreatedAt.Add(uc.orderConfirmTimeout)
		order.CancellableUntil = &cancellableUntil
	}

	return order, nil
}

func (uc *UseCase) List(ctx context.Context, userID string, bucket domain.OrderStatusBucket) ([]domain.Order, error) {
	if bucket == "" {
		bucket = domain.OrderStatusBucketAll
	}
	if !bucket.IsValid() {
		return nil, domain.NewValidationError(map[string]string{"status": "Trạng thái đơn hàng không hợp lệ"})
	}

	orders, err := uc.order.ListByUser(ctx, userID, bucket)
	if err != nil {
		return nil, err
	}

	for i := range orders {
		if orders[i].Status == domain.OrderStatusPendingConfirmation {
			cancellableUntil := orders[i].CreatedAt.Add(uc.orderConfirmTimeout)
			orders[i].CancellableUntil = &cancellableUntil
		}
	}

	return orders, nil
}

func (uc *UseCase) Stats(ctx context.Context, userID string) (domain.OrderStats, error) {
	return uc.order.StatsByUser(ctx, userID)
}

func (uc *UseCase) Cancel(ctx context.Context, userID, orderID string) (*domain.Order, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, domain.ErrOrderNotFound
	}
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrOrderNotFound
	}

	order, err := uc.order.Cancel(ctx, userID, orderID)
	if err != nil {
		return nil, err
	}

	if order != nil && order.Status == domain.OrderStatusPendingConfirmation {
		cancellableUntil := order.CreatedAt.Add(uc.orderConfirmTimeout)
		order.CancellableUntil = &cancellableUntil
	}

	return order, nil
}

func (uc *UseCase) UndoCancel(ctx context.Context, userID, orderID string) (*domain.Order, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, domain.ErrOrderNotFound
	}
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrOrderNotFound
	}

	order, err := uc.order.UndoCancelRequest(ctx, userID, orderID)
	if err != nil {
		return nil, err
	}

	if order != nil && order.Status == domain.OrderStatusPendingConfirmation {
		cancellableUntil := order.CreatedAt.Add(uc.orderConfirmTimeout)
		order.CancellableUntil = &cancellableUntil
	}

	return order, nil
}

func (uc *UseCase) AutoConfirmDue(ctx context.Context, cutoff time.Time) error {
	return uc.order.AutoConfirmDue(ctx, cutoff)
}

func (uc *UseCase) AdminList(ctx context.Context, status string) ([]domain.Order, error) {
	var statuses []string
	if status != "" {
		if !domain.OrderStatus(status).IsValid() {
			return nil, domain.NewValidationError(map[string]string{"status": "Trạng thái đơn hàng không hợp lệ"})
		}
		statuses = []string{status}
	}

	orders, err := uc.order.ListByAdmin(ctx, statuses)
	if err != nil {
		return nil, err
	}
	if orders == nil {
		return []domain.Order{}, nil
	}
	return orders, nil
}

func (uc *UseCase) AdminGetByID(ctx context.Context, orderID string) (*domain.Order, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, domain.ErrOrderNotFound
	}

	return uc.order.GetByAdminID(ctx, orderID)
}

func (uc *UseCase) AdminTransition(ctx context.Context, orderID string, action domain.OrderAdminAction) (*domain.Order, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, domain.ErrOrderNotFound
	}
	if !action.IsValid() {
		return nil, domain.NewValidationError(map[string]string{"action": "Thao tác không hợp lệ"})
	}

	return uc.order.AdminTransition(ctx, orderID, action)
}



