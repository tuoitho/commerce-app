package order

import (
	"context"
	"time"

	"github.com/google/uuid"

	"commerce-backend/internal/domain"
)

type Dependencies struct {
	Order               domain.OrderRepository
	Return              domain.ReturnRepository
	Review              domain.ReviewRepository
	ShippingFeeVND      domain.MoneyVND
	OrderConfirmTimeout time.Duration
}

type UseCase struct {
	order               domain.OrderRepository
	returnRepo          domain.ReturnRepository
	reviewRepo          domain.ReviewRepository
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
		returnRepo:          deps.Return,
		reviewRepo:          deps.Review,
		shippingFeeVND:      shippingFee,
		orderConfirmTimeout: timeout,
	}
}

func (uc *UseCase) hydrateOrderReviewStates(ctx context.Context, orders ...*domain.Order) {
	if len(orders) == 0 {
		return
	}

	var allItemIDs []string
	for _, o := range orders {
		if o == nil {
			continue
		}
		for _, item := range o.Items {
			allItemIDs = append(allItemIDs, item.ID)
		}
	}

	if len(allItemIDs) == 0 {
		return
	}

	var reviewsMap map[string]*domain.Review
	if uc.reviewRepo != nil {
		if revs, err := uc.reviewRepo.ListReviewsByOrderItemIDs(ctx, allItemIDs); err == nil {
			reviewsMap = revs
		}
	}

	var refundedMap map[string]bool
	if uc.returnRepo != nil {
		if refunded, err := uc.returnRepo.ListRefundedOrderItemIDs(ctx, allItemIDs); err == nil {
			refundedMap = refunded
		}
	}

	for _, o := range orders {
		if o == nil {
			continue
		}
		for i := range o.Items {
			itemID := o.Items[i].ID
			if rev, hasReview := reviewsMap[itemID]; hasReview && rev != nil {
				o.Items[i].ReviewStatus = domain.ReviewStatusReviewed
				o.Items[i].Review = rev
			} else if refundedMap != nil && refundedMap[itemID] {
				o.Items[i].ReviewStatus = domain.ReviewStatusRefunded
				o.Items[i].Review = nil
			} else if o.Status == domain.OrderStatusDelivered || o.Status == domain.OrderStatusPartiallyReturned {
				o.Items[i].ReviewStatus = domain.ReviewStatusEligible
				o.Items[i].Review = nil
			} else {
				o.Items[i].ReviewStatus = domain.ReviewStatusIneligible
				o.Items[i].Review = nil
			}
		}
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

	if order != nil {
		if order.Status == domain.OrderStatusPendingConfirmation {
			cancellableUntil := order.CreatedAt.Add(uc.orderConfirmTimeout)
			order.CancellableUntil = &cancellableUntil
		}
		uc.hydrateOrderReviewStates(ctx, order)
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

	if order != nil {
		if order.Status == domain.OrderStatusPendingConfirmation {
			cancellableUntil := order.CreatedAt.Add(uc.orderConfirmTimeout)
			order.CancellableUntil = &cancellableUntil
		}

		if uc.returnRepo != nil {
			latest, err := uc.returnRepo.GetLatestByOrderID(ctx, order.ID)
			if err == nil {
				eligibility := domain.CalculateReturnEligibility(*order, latest, time.Now().UTC())
				order.ReturnEligibility = &eligibility
				order.LatestReturnRequest = latest
			}
		}

		uc.hydrateOrderReviewStates(ctx, order)
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

	if len(orders) > 0 {
		orderPtrs := make([]*domain.Order, len(orders))
		for i := range orders {
			orderPtrs[i] = &orders[i]
		}

		if uc.returnRepo != nil {
			orderIDs := make([]string, len(orders))
			for i := range orders {
				orderIDs[i] = orders[i].ID
			}
			latestMap, err := uc.returnRepo.ListLatestByOrderIDs(ctx, orderIDs)
			if err == nil {
				now := time.Now().UTC()
				for i := range orders {
					latest := latestMap[orders[i].ID]
					eligibility := domain.CalculateReturnEligibility(orders[i], latest, now)
					orders[i].ReturnEligibility = &eligibility
					orders[i].LatestReturnRequest = latest
				}
			}
		}

		uc.hydrateOrderReviewStates(ctx, orderPtrs...)
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

	if order != nil {
		if order.Status == domain.OrderStatusPendingConfirmation {
			cancellableUntil := order.CreatedAt.Add(uc.orderConfirmTimeout)
			order.CancellableUntil = &cancellableUntil
		}
		uc.hydrateOrderReviewStates(ctx, order)
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

	if order != nil {
		if order.Status == domain.OrderStatusPendingConfirmation {
			cancellableUntil := order.CreatedAt.Add(uc.orderConfirmTimeout)
			order.CancellableUntil = &cancellableUntil
		}
		uc.hydrateOrderReviewStates(ctx, order)
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

	if len(orders) > 0 {
		orderPtrs := make([]*domain.Order, len(orders))
		for i := range orders {
			orderPtrs[i] = &orders[i]
		}
		uc.hydrateOrderReviewStates(ctx, orderPtrs...)
	}

	return orders, nil
}

func (uc *UseCase) AdminGetByID(ctx context.Context, orderID string) (*domain.Order, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, domain.ErrOrderNotFound
	}

	order, err := uc.order.GetByAdminID(ctx, orderID)
	if err != nil {
		return nil, err
	}

	if order != nil {
		uc.hydrateOrderReviewStates(ctx, order)
	}

	return order, nil
}

func (uc *UseCase) AdminTransition(ctx context.Context, orderID string, action domain.OrderAdminAction) (*domain.Order, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, domain.ErrOrderNotFound
	}
	if !action.IsValid() {
		return nil, domain.NewValidationError(map[string]string{"action": "Thao tác không hợp lệ"})
	}

	order, err := uc.order.AdminTransition(ctx, orderID, action)
	if err != nil {
		return nil, err
	}

	if order != nil {
		uc.hydrateOrderReviewStates(ctx, order)
	}

	return order, nil
}



