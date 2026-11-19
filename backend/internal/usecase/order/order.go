package order

import (
	"context"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"commerce-backend/internal/domain"
)

var trackingCodePattern = regexp.MustCompile(`^[A-Za-z0-9_-]{3,64}$`)

type Dependencies struct {
	Order               domain.OrderRepository
	Return              domain.ReturnRepository
	Review              domain.ReviewRepository
	MomoGateway         domain.MomoGateway
	ShippingFeeVND      domain.MoneyVND
	Shipping            domain.ShippingConfig
	OrderConfirmTimeout time.Duration
	Now                 func() time.Time
	// LiveQuota, when set, learns about orders that may change live-price quota.
	LiveQuota domain.LiveQuotaObserver
	// Notifications, when set, publishes order lifecycle notifications post-commit.
	Notifications domain.NotificationPublisher
}

type UseCase struct {
	order               domain.OrderRepository
	returnRepo          domain.ReturnRepository
	reviewRepo          domain.ReviewRepository
	momo                domain.MomoGateway
	shippingFeeVND      domain.MoneyVND
	shipping            domain.ShippingConfig
	orderConfirmTimeout time.Duration
	now                 func() time.Time
	liveQuota           domain.LiveQuotaObserver
	notifications       domain.NotificationPublisher
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
	nowFn := deps.Now
	if nowFn == nil {
		nowFn = time.Now
	}
	return &UseCase{
		order:               deps.Order,
		returnRepo:          deps.Return,
		reviewRepo:          deps.Review,
		momo:                deps.MomoGateway,
		shippingFeeVND:      shippingFee,
		shipping:            deps.Shipping.WithDefaults(),
		orderConfirmTimeout: timeout,
		now:                 nowFn,
		liveQuota:           deps.LiveQuota,
		notifications:       deps.Notifications,
	}
}

func (uc *UseCase) notifyLiveQuota(ctx context.Context) {
	if uc.liveQuota != nil {
		uc.liveQuota.LiveQuotaChanged(ctx)
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

type CreateCheckoutInput struct {
	UserID         string
	AddressID      string
	Lines          []domain.OrderLineInput
	PaymentMethod  string
	DeliveryMethod domain.DeliveryMethod
	VoucherCode    string
}

func (uc *UseCase) QuoteCheckout(
	ctx context.Context,
	userID, addressID string,
	deliveryMethod domain.DeliveryMethod,
	voucherCode string,
) (*domain.CheckoutQuote, error) {
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrInvalidToken
	}
	trimmedAddr := strings.TrimSpace(addressID)
	if _, err := uuid.Parse(trimmedAddr); err != nil {
		return nil, domain.NewValidationError(map[string]string{"addressId": "Mã địa chỉ không hợp lệ"})
	}
	dm := domain.DeliveryMethod(strings.TrimSpace(string(deliveryMethod)))
	if dm == "" {
		dm = domain.DeliveryMethodStandard
	}
	if !dm.IsValid() {
		return nil, domain.NewValidationError(map[string]string{"deliveryMethod": "Phương thức vận chuyển không hợp lệ"})
	}
	checkoutRepo, ok := uc.order.(domain.CheckoutOrderRepository)
	if !ok {
		return nil, domain.ErrNotFound
	}
	return checkoutRepo.QuoteCheckout(ctx, domain.CheckoutQuoteInput{
		UserID:         userID,
		AddressID:      trimmedAddr,
		DeliveryMethod: dm,
		VoucherCode:    strings.TrimSpace(voucherCode),
		Shipping:       uc.shipping,
	})
}

func (uc *UseCase) Create(ctx context.Context, userID, addressID string, lines []domain.OrderLineInput) (*domain.Order, error) {
	return uc.CreateWithMethod(ctx, userID, addressID, lines, domain.PaymentMethodCOD)
}

func validateOrderCreateInputs(addressID string, lines []domain.OrderLineInput, paymentMethod string) (string, error) {
	method := strings.TrimSpace(paymentMethod)
	if method == "" {
		method = domain.PaymentMethodCOD
	}
	if method != domain.PaymentMethodCOD && method != domain.PaymentMethodMomo {
		return "", domain.NewValidationError(map[string]string{"paymentMethod": "Phương thức thanh toán không hợp lệ"})
	}
	if len(lines) == 0 {
		return "", domain.ErrCartEmpty
	}
	if _, err := uuid.Parse(addressID); err != nil {
		return "", domain.NewValidationError(map[string]string{"address_id": "Mã địa chỉ không hợp lệ"})
	}
	for _, line := range lines {
		if _, err := uuid.Parse(line.VariantID); err != nil {
			return "", domain.NewValidationError(map[string]string{"lines": "Mã phân loại sản phẩm không hợp lệ"})
		}
		if line.Quantity <= 0 {
			return "", domain.NewValidationError(map[string]string{"lines": "Số lượng sản phẩm không hợp lệ"})
		}
	}
	return method, nil
}

func (uc *UseCase) finalizeCreatedOrder(ctx context.Context, order *domain.Order, method string) {
	uc.notifyLiveQuota(ctx)
	if order == nil {
		return
	}
	if method == domain.PaymentMethodMomo {
		payURL, gwErr := uc.requestMomoPayURL(ctx, order)
		if gwErr != nil || payURL == "" {
			if momoRepo, hasMomoRepo := uc.order.(domain.MomoOrderRepository); hasMomoRepo {
				if setErr := momoRepo.SetPaymentFailed(ctx, order.ID); setErr == nil {
					order.PaymentStatus = domain.PaymentStatusFailed
				}
			}
		} else {
			order.PayURL = payURL
		}
	}
	uc.hydrateCancellableUntil(order)
	uc.hydrateOrderReviewStates(ctx, order)
	if uc.notifications != nil {
		uc.notifications.NotifyOrderCreated(ctx, order)
	}
}

func (uc *UseCase) CreateWithMethod(ctx context.Context, userID, addressID string, lines []domain.OrderLineInput, paymentMethod string) (*domain.Order, error) {
	method, err := validateOrderCreateInputs(addressID, lines, paymentMethod)
	if err != nil {
		return nil, err
	}

	momoRepo, hasMomoRepo := uc.order.(domain.MomoOrderRepository)
	var order *domain.Order
	if hasMomoRepo {
		order, err = momoRepo.CreateWithPaymentMethod(ctx, userID, addressID, lines, uc.shippingFeeVND, method)
	} else if method == domain.PaymentMethodCOD {
		order, err = uc.order.Create(ctx, userID, addressID, lines, uc.shippingFeeVND)
	} else {
		return nil, domain.ErrMomoGateway
	}
	if err != nil {
		return nil, err
	}
	uc.finalizeCreatedOrder(ctx, order, method)
	return order, nil
}

func (uc *UseCase) CreateCheckout(ctx context.Context, in CreateCheckoutInput) (*domain.Order, error) {
	trimmedAddr := strings.TrimSpace(in.AddressID)
	method, err := validateOrderCreateInputs(trimmedAddr, in.Lines, in.PaymentMethod)
	if err != nil {
		return nil, err
	}
	dm := domain.DeliveryMethod(strings.TrimSpace(string(in.DeliveryMethod)))
	if dm == "" {
		dm = domain.DeliveryMethodStandard
	}
	if !dm.IsValid() {
		return nil, domain.NewValidationError(map[string]string{"deliveryMethod": "Phương thức vận chuyển không hợp lệ"})
	}
	trimmedVoucher := strings.TrimSpace(in.VoucherCode)

	var order *domain.Order
	if checkoutRepo, hasCheckoutRepo := uc.order.(domain.CheckoutOrderRepository); hasCheckoutRepo {
		order, err = checkoutRepo.CreateCheckoutOrder(ctx, domain.CreateCheckoutOrderInput{
			UserID:         in.UserID,
			AddressID:      trimmedAddr,
			Lines:          in.Lines,
			PaymentMethod:  method,
			DeliveryMethod: dm,
			VoucherCode:    trimmedVoucher,
			Shipping:       uc.shipping,
		})
	} else {
		if dm == domain.DeliveryMethodExpress2H {
			return nil, domain.ErrExpressDeliveryUnavailable
		}
		if trimmedVoucher != "" {
			return nil, domain.ErrVoucherNotFound
		}
		momoRepo, hasMomoRepo := uc.order.(domain.MomoOrderRepository)
		if hasMomoRepo {
			order, err = momoRepo.CreateWithPaymentMethod(ctx, in.UserID, trimmedAddr, in.Lines, uc.shippingFeeVND, method)
		} else if method == domain.PaymentMethodCOD {
			order, err = uc.order.Create(ctx, in.UserID, trimmedAddr, in.Lines, uc.shippingFeeVND)
		} else {
			return nil, domain.ErrMomoGateway
		}
	}
	if err != nil {
		return nil, err
	}
	uc.finalizeCreatedOrder(ctx, order, method)
	return order, nil
}

func (uc *UseCase) requestMomoPayURL(ctx context.Context, order *domain.Order) (string, error) {
	if uc.momo == nil || order == nil {
		return "", domain.ErrMomoGateway
	}
	amountVND, err := strconv.ParseInt(string(order.TotalVND), 10, 64)
	if err != nil || amountVND < domain.MomoMinAmountVND || amountVND > domain.MomoMaxAmountVND {
		return "", domain.ErrMomoGateway
	}
	payURL, err := uc.momo.CreatePaymentURL(ctx, domain.MomoCreateInput{
		OrderID:   order.ID,
		AmountVND: amountVND,
		OrderInfo: fmt.Sprintf("Thanh toan don hang %s", domain.OrderShortCode(order.ID)),
	})
	if err != nil || strings.TrimSpace(payURL) == "" {
		return "", domain.ErrMomoGateway
	}
	return strings.TrimSpace(payURL), nil
}

func (uc *UseCase) hydrateCancellableUntil(order *domain.Order) {
	if order != nil && order.Status == domain.OrderStatusPendingConfirmation {
		cancellableUntil := order.CreatedAt.Add(uc.orderConfirmTimeout)
		order.CancellableUntil = &cancellableUntil
	}
}

func (uc *UseCase) RetryMomoPayment(ctx context.Context, userID, orderID string) (*domain.Order, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, domain.ErrOrderNotFound
	}
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrOrderNotFound
	}

	order, err := uc.order.GetByID(ctx, userID, orderID)
	if err != nil {
		return nil, err
	}

	if order.PaymentMethod != domain.PaymentMethodMomo ||
		order.Status != domain.OrderStatusPendingConfirmation ||
		(order.PaymentStatus != domain.PaymentStatusPending && order.PaymentStatus != domain.PaymentStatusFailed) ||
		uc.now().UTC().After(order.CreatedAt.Add(uc.orderConfirmTimeout)) {
		return nil, domain.ErrPaymentRetryNotAllowed
	}

	momoRepo, ok := uc.order.(domain.MomoOrderRepository)
	if !ok || uc.momo == nil {
		return nil, domain.ErrMomoGateway
	}

	payURL, err := uc.requestMomoPayURL(ctx, order)
	if err != nil {
		return nil, err
	}

	updated, err := momoRepo.ResetPaymentPending(ctx, userID, orderID)
	if err != nil {
		return nil, err
	}
	if updated != nil {
		updated.PayURL = payURL
		uc.hydrateCancellableUntil(updated)
		uc.hydrateOrderReviewStates(ctx, updated)
	}
	return updated, nil
}

func (uc *UseCase) HandleMomoReturn(ctx context.Context, userID string, payload domain.MomoCallbackPayload) (*domain.Order, error) {
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrOrderNotFound
	}
	return uc.processMomoCallback(ctx, userID, payload)
}

func (uc *UseCase) HandleMomoIPN(ctx context.Context, payload domain.MomoCallbackPayload) error {
	_, err := uc.processMomoCallback(ctx, "", payload)
	return err
}

func (uc *UseCase) processMomoCallback(ctx context.Context, userID string, payload domain.MomoCallbackPayload) (*domain.Order, error) {
	if uc.momo == nil {
		return nil, domain.ErrMomoGateway
	}
	if !uc.momo.VerifyCallbackSignature(payload) {
		return nil, domain.ErrMomoInvalidCallback
	}
	orderID, ok := domain.ParseMomoOrderID(payload.OrderID)
	if !ok {
		return nil, domain.ErrMomoInvalidCallback
	}
	amount := strings.TrimSpace(payload.Amount)
	if !domain.MoneyVND(amount).IsCanonical() {
		return nil, domain.ErrMomoInvalidCallback
	}
	momoRepo, ok := uc.order.(domain.MomoOrderRepository)
	if !ok {
		return nil, domain.ErrMomoGateway
	}

	order, justPaid, err := momoRepo.ApplyMomoCallback(ctx, orderID, userID, amount, payload.TransID, payload.ResultCode)
	if err != nil {
		return nil, err
	}
	if justPaid && uc.notifications != nil {
		if momoNotif, ok := uc.notifications.(domain.MomoNotificationPublisher); ok {
			momoNotif.NotifyOrderMomoPaid(ctx, order)
		}
	}
	if order != nil {
		uc.hydrateCancellableUntil(order)
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
	if order != nil && order.Status == domain.OrderStatusCancelled {
		uc.notifyLiveQuota(ctx)
	}

	if order != nil {
		if order.Status == domain.OrderStatusPendingConfirmation {
			cancellableUntil := order.CreatedAt.Add(uc.orderConfirmTimeout)
			order.CancellableUntil = &cancellableUntil
		}
		uc.hydrateOrderReviewStates(ctx, order)
		if uc.notifications != nil {
			uc.notifications.NotifyOrderCustomerCancelled(ctx, order)
		}
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
	if returningRepo, ok := uc.order.(domain.AutoConfirmReturningRepository); ok {
		confirmed, err := returningRepo.AutoConfirmDueReturning(ctx, cutoff)
		if err != nil {
			return err
		}
		if uc.notifications != nil && len(confirmed) > 0 {
			uc.notifications.NotifyOrderAutoConfirmed(ctx, confirmed)
		}
	} else {
		if err := uc.order.AutoConfirmDue(ctx, cutoff); err != nil {
			return err
		}
	}

	if momoRepo, ok := uc.order.(domain.MomoOrderRepository); ok {
		expired, err := momoRepo.AutoCancelExpiredMomoOrders(ctx, cutoff)
		if err != nil {
			return err
		}
		if len(expired) > 0 {
			uc.notifyLiveQuota(ctx)
			if uc.notifications != nil {
				if momoNotif, ok := uc.notifications.(domain.MomoNotificationPublisher); ok {
					momoNotif.NotifyOrderPaymentExpired(ctx, expired)
				}
			}
		}
	}

	return nil
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
	if order != nil && order.Status == domain.OrderStatusCancelled {
		uc.notifyLiveQuota(ctx)
	}

	if order != nil {
		uc.hydrateOrderReviewStates(ctx, order)
		if uc.notifications != nil {
			uc.notifications.NotifyOrderTransition(ctx, order, action)
		}
	}

	return order, nil
}

func (uc *UseCase) AdminShip(ctx context.Context, orderID, carrier, trackingCode string) (*domain.Order, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, domain.ErrOrderNotFound
	}
	trimmedCarrier := strings.TrimSpace(carrier)
	trimmedCode := strings.TrimSpace(trackingCode)
	fields := map[string]string{}
	if n := utf8.RuneCountInString(trimmedCarrier); n < 1 || n > 80 {
		fields["carrier"] = "Đơn vị vận chuyển phải từ 1 đến 80 ký tự"
	}
	if !trackingCodePattern.MatchString(trimmedCode) {
		fields["trackingCode"] = "Mã vận đơn phải từ 3 đến 64 ký tự (chữ, số, -, _)"
	}
	if len(fields) > 0 {
		return nil, domain.NewValidationError(fields)
	}

	fulfillRepo, ok := uc.order.(domain.FulfillmentOrderRepository)
	if !ok {
		return nil, domain.ErrOrderActionNotAllowed
	}

	order, err := fulfillRepo.ShipOrder(ctx, orderID, trimmedCarrier, trimmedCode)
	if err != nil {
		return nil, err
	}
	if order != nil {
		uc.hydrateOrderReviewStates(ctx, order)
		if uc.notifications != nil {
			uc.notifications.NotifyOrderTransition(ctx, order, domain.OrderAdminActionShip)
		}
	}
	return order, nil
}

func (uc *UseCase) BuyAgain(ctx context.Context, userID, orderID string) (*domain.BuyAgainResult, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, domain.ErrOrderNotFound
	}
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrOrderNotFound
	}

	fulfillRepo, ok := uc.order.(domain.FulfillmentOrderRepository)
	if !ok {
		return nil, domain.ErrOrderActionNotAllowed
	}

	res, err := fulfillRepo.BuyAgain(ctx, userID, orderID)
	if err != nil {
		return nil, err
	}
	if res == nil {
		return nil, domain.ErrBuyAgainAllUnavailable
	}
	if res.AdjustedItems == nil {
		res.AdjustedItems = []domain.BuyAgainAdjustedItem{}
	}
	if res.SkippedItems == nil {
		res.SkippedItems = []domain.BuyAgainSkippedItem{}
	}
	if res.Cart != nil {
		if res.Cart.Items == nil {
			res.Cart.Items = []domain.CartItem{}
		}
		if res.Cart.ShippingFeeVND == "" {
			res.Cart.ShippingFeeVND = uc.shippingFeeVND
		}
	}
	return res, nil
}



