package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"math/big"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

type orderDB interface {
	sqlc.DBTX
	Begin(context.Context) (pgx.Tx, error)
}

type OrderRepository struct {
	db orderDB
}

func NewOrderRepository(db orderDB) *OrderRepository {
	return &OrderRepository{db: db}
}

var _ domain.OrderRepository = (*OrderRepository)(nil)
var _ domain.AutoConfirmReturningRepository = (*OrderRepository)(nil)
var _ domain.MomoOrderRepository = (*OrderRepository)(nil)
var _ domain.CheckoutOrderRepository = (*OrderRepository)(nil)
var _ domain.FulfillmentOrderRepository = (*OrderRepository)(nil)

var trackingCodePattern = regexp.MustCompile(`^[A-Za-z0-9_-]{3,64}$`)

type orderRowFields struct {
	ID                   string
	UserID               string
	BuyerEmail           string
	Status               string
	PaymentMethod        string
	PaymentStatus        string
	PaymentTransactionID pgtype.Text
	PaidAt               pgtype.Timestamptz
	SubtotalVnd          string
	ShippingFeeVnd       string
	DiscountVnd          string
	TotalVnd             string
	VoucherID            pgtype.UUID
	VoucherCode          pgtype.Text
	VoucherType          pgtype.Text
	DeliveryMethod       string
	ShippingCarrier      pgtype.Text
	TrackingCode         pgtype.Text
	RecipientName        string
	Phone                string
	ProvinceName         string
	WardName             string
	DetailAddress        string
	CreatedAt            time.Time
	UpdatedAt            time.Time
	ConfirmedAt          pgtype.Timestamptz
	PreparingAt          pgtype.Timestamptz
	ShippedAt            pgtype.Timestamptz
	CancelledAt          pgtype.Timestamptz
	DeliveredAt          pgtype.Timestamptz
}

func pgTextPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	s := t.String
	return &s
}

func pgTimePtr(t pgtype.Timestamptz) *time.Time {
	if !t.Valid {
		return nil
	}
	v := t.Time
	return &v
}

func mapOrderItems(rows []sqlc.ListOrderItemsByOrderIDRow) []domain.OrderItem {
	items := make([]domain.OrderItem, len(rows))
	for i, row := range rows {
		var options []domain.CartOption
		if err := json.Unmarshal([]byte(row.Options), &options); err != nil {
			options = []domain.CartOption{}
		}
		items[i] = domain.OrderItem{
			ID:           row.ID,
			OrderID:      row.OrderID,
			VariantID:    row.VariantID,
			ProductID:    row.ProductID,
			BrandName:    row.BrandName,
			ProductName:  row.ProductName,
			Model:        row.Model,
			ImageURL:     row.ImageUrl,
			Options:      options,
			UnitPriceVND: domain.MoneyVND(row.UnitPriceVnd),
			Quantity:     row.Quantity,
			LineTotalVND: domain.MoneyVND(row.LineTotalVnd),
		}
	}
	return items
}

func mapOrderTimelineEvents(rows []sqlc.OrderStatusEvent) []domain.OrderTimelineEvent {
	events := make([]domain.OrderTimelineEvent, 0, len(rows))
	for _, row := range rows {
		events = append(events, domain.OrderTimelineEvent{
			ID:        row.ID,
			Status:    domain.OrderStatus(row.Status),
			ActorType: domain.OrderActorType(row.ActorType),
			Note:      row.Note,
			CreatedAt: row.CreatedAt.UTC(),
		})
	}
	return events
}

func mapOrderFromFields(row orderRowFields, items []domain.OrderItem, timeline []domain.OrderTimelineEvent) *domain.Order {
	if items == nil {
		items = []domain.OrderItem{}
	}
	if timeline == nil {
		timeline = []domain.OrderTimelineEvent{}
	}
	payStatus := domain.PaymentStatus(row.PaymentStatus)
	if payStatus == "" {
		payStatus = domain.PaymentStatusPending
	}
	discountVND := domain.MoneyVND(row.DiscountVnd)
	if discountVND == "" {
		discountVND = "0"
	}
	deliveryMethod := domain.DeliveryMethod(row.DeliveryMethod)
	if deliveryMethod == "" {
		deliveryMethod = domain.DeliveryMethodStandard
	}
	var voucherType *domain.VoucherType
	if row.VoucherType.Valid {
		vt := domain.VoucherType(row.VoucherType.String)
		voucherType = &vt
	}
	return &domain.Order{
		ID:                   row.ID,
		UserID:               row.UserID,
		BuyerEmail:           row.BuyerEmail,
		Status:               domain.OrderStatus(row.Status),
		PaymentMethod:        row.PaymentMethod,
		PaymentStatus:        payStatus,
		PaymentTransactionID: pgTextPtr(row.PaymentTransactionID),
		PaidAt:               pgTimePtr(row.PaidAt),
		SubtotalVND:          domain.MoneyVND(row.SubtotalVnd),
		ShippingFeeVND:       domain.MoneyVND(row.ShippingFeeVnd),
		DiscountVND:          discountVND,
		TotalVND:             domain.MoneyVND(row.TotalVnd),
		VoucherID:            uuidToString(row.VoucherID),
		VoucherCode:          pgTextPtr(row.VoucherCode),
		VoucherType:          voucherType,
		DeliveryMethod:       deliveryMethod,
		Carrier:              pgTextPtr(row.ShippingCarrier),
		TrackingCode:         pgTextPtr(row.TrackingCode),
		ShippingInfo: domain.ShippingInfo{
			RecipientName: row.RecipientName,
			Phone:         row.Phone,
			ProvinceName:  row.ProvinceName,
			WardName:      row.WardName,
			DetailAddress: row.DetailAddress,
		},
		Items:       items,
		Timeline:    timeline,
		CreatedAt:   row.CreatedAt,
		UpdatedAt:   row.UpdatedAt,
		ConfirmedAt: pgTimePtr(row.ConfirmedAt),
		PreparingAt: pgTimePtr(row.PreparingAt),
		ShippedAt:   pgTimePtr(row.ShippedAt),
		CancelledAt: pgTimePtr(row.CancelledAt),
		DeliveredAt: pgTimePtr(row.DeliveredAt),
	}
}

func (r *OrderRepository) QuoteCheckout(ctx context.Context, input domain.CheckoutQuoteInput) (*domain.CheckoutQuote, error) {
	if _, err := uuid.Parse(input.UserID); err != nil {
		return nil, domain.ErrNotFound
	}
	if _, err := uuid.Parse(input.AddressID); err != nil {
		return nil, domain.ErrAddressNotFound
	}
	deliveryMethod := input.DeliveryMethod
	if deliveryMethod == "" {
		deliveryMethod = domain.DeliveryMethodStandard
	}
	if !deliveryMethod.IsValid() {
		return nil, domain.NewValidationError(map[string]string{"deliveryMethod": "Phương thức vận chuyển không hợp lệ"})
	}

	q := sqlc.New(r.db)
	addr, err := q.GetAddressByID(ctx, sqlc.GetAddressByIDParams{
		ID:     input.AddressID,
		UserID: input.UserID,
	})
	if err != nil {
		return nil, mapNotFound(err, domain.ErrAddressNotFound)
	}

	cartRows, err := q.ListCartRows(ctx, input.UserID)
	if err != nil {
		return nil, err
	}
	var subtotalVND domain.MoneyVND = "0"
	for _, row := range cartRows {
		if !row.Selected || !row.ProductActive || !row.VariantActive || row.StockQuantity <= 0 || row.Quantity > row.StockQuantity {
			continue
		}
		lineTotal := new(big.Int).Mul(numericInt(row.PriceVnd), big.NewInt(row.Quantity)).String()
		subtotalVND, err = domain.AddMoneyVND(subtotalVND, domain.MoneyVND(lineTotal))
		if err != nil {
			return nil, err
		}
	}

	shipQuote, err := domain.CalculateShippingQuote(addr.ProvinceCode, subtotalVND, deliveryMethod, input.Shipping)
	if err != nil {
		return nil, err
	}

	var voucherCodePtr *string
	var voucherTypePtr *domain.VoucherType
	var discountVND domain.MoneyVND = "0"

	if strings.TrimSpace(input.VoucherCode) != "" {
		normalizedCode := domain.NormalizeVoucherCode(input.VoucherCode)
		vRow, err := q.GetVoucherByCode(ctx, normalizedCode)
		if err != nil {
			return nil, mapNotFound(err, domain.ErrVoucherNotFound)
		}
		userUsed, err := q.CountUserActiveVoucherUsages(ctx, sqlc.CountUserActiveVoucherUsagesParams{
			VoucherID: vRow.ID,
			UserID:    input.UserID,
		})
		if err != nil {
			return nil, err
		}
		if err := validateVoucherEligibility(
			vRow.Active,
			vRow.StartsAt,
			vRow.EndsAt,
			vRow.UsageLimit,
			vRow.UsedCount,
			vRow.PerUserLimit,
			userUsed,
			domain.MoneyVND(vRow.MinOrderVnd),
			subtotalVND,
			time.Now().UTC(),
		); err != nil {
			return nil, err
		}

		vt := domain.VoucherType(vRow.VoucherType)
		discountVND, err = domain.CalculateVoucherDiscount(
			vt,
			domain.MoneyVND(vRow.DiscountValue),
			moneyPtrFromString(vRow.MaxDiscountVnd),
			subtotalVND,
			shipQuote.ShippingFeeVND,
		)
		if err != nil {
			return nil, err
		}
		codeCopy := vRow.Code
		voucherCodePtr = &codeCopy
		voucherTypePtr = &vt
	}

	totalVND, err := domain.CalculateCheckoutTotal(subtotalVND, shipQuote.ShippingFeeVND, discountVND)
	if err != nil {
		return nil, err
	}

	return &domain.CheckoutQuote{
		SubtotalVND:              subtotalVND,
		DeliveryMethod:           shipQuote.DeliveryMethod,
		ExpressAvailable:         shipQuote.ExpressAvailable,
		StandardShippingFeeVND:   shipQuote.StandardShippingFeeVND,
		ExpressShippingFeeVND:    shipQuote.ExpressShippingFeeVND,
		FreeShippingThresholdVND: shipQuote.FreeShippingThresholdVND,
		ShippingFeeVND:           shipQuote.ShippingFeeVND,
		VoucherCode:              voucherCodePtr,
		VoucherType:              voucherTypePtr,
		DiscountVND:              discountVND,
		TotalVND:                 totalVND,
	}, nil
}

func (r *OrderRepository) Create(ctx context.Context, userID string, addressID string, lines []domain.OrderLineInput, shippingFeeVND domain.MoneyVND) (*domain.Order, error) {
	return r.CreateWithPaymentMethod(ctx, userID, addressID, lines, shippingFeeVND, domain.PaymentMethodCOD)
}

func (r *OrderRepository) CreateWithPaymentMethod(ctx context.Context, userID, addressID string, lines []domain.OrderLineInput, shippingFeeVND domain.MoneyVND, paymentMethod string) (*domain.Order, error) {
	return r.createOrderInternal(ctx, createOrderParams{
		userID:                 userID,
		addressID:              addressID,
		lines:                  lines,
		paymentMethod:          paymentMethod,
		deliveryMethod:         domain.DeliveryMethodStandard,
		explicitShippingFeeVND: shippingFeeVND,
		useRegionalShipping:    false,
	})
}

func (r *OrderRepository) CreateCheckoutOrder(ctx context.Context, input domain.CreateCheckoutOrderInput) (*domain.Order, error) {
	return r.createOrderInternal(ctx, createOrderParams{
		userID:              input.UserID,
		addressID:           input.AddressID,
		lines:               input.Lines,
		paymentMethod:       input.PaymentMethod,
		deliveryMethod:      input.DeliveryMethod,
		voucherCode:         input.VoucherCode,
		useRegionalShipping: true,
		shippingCfg:         input.Shipping,
	})
}

type createOrderParams struct {
	userID                 string
	addressID              string
	lines                  []domain.OrderLineInput
	paymentMethod          string
	deliveryMethod         domain.DeliveryMethod
	voucherCode            string
	explicitShippingFeeVND domain.MoneyVND
	useRegionalShipping    bool
	shippingCfg            domain.ShippingConfig
}

func (r *OrderRepository) createOrderInternal(ctx context.Context, p createOrderParams) (*domain.Order, error) {
	paymentMethod := p.paymentMethod
	if paymentMethod == "" {
		paymentMethod = domain.PaymentMethodCOD
	}
	if paymentMethod != domain.PaymentMethodCOD && paymentMethod != domain.PaymentMethodMomo {
		return nil, domain.NewValidationError(map[string]string{"paymentMethod": "Phương thức thanh toán không hợp lệ"})
	}
	deliveryMethod := p.deliveryMethod
	if deliveryMethod == "" {
		deliveryMethod = domain.DeliveryMethodStandard
	}
	if !deliveryMethod.IsValid() {
		return nil, domain.NewValidationError(map[string]string{"deliveryMethod": "Phương thức vận chuyển không hợp lệ"})
	}
	if len(p.lines) == 0 {
		return nil, domain.ErrCartEmpty
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)

	// 1. Lock user (serializes concurrent checkouts from the same customer)
	if _, err := q.LockUser(ctx, p.userID); err != nil {
		return nil, mapNotFound(err, domain.ErrNotFound)
	}

	// 2. Lock submitted cart items and variants
	variantIDs := make([]string, len(p.lines))
	for i, l := range p.lines {
		variantIDs[i] = l.VariantID
	}

	lockedRows, err := q.LockSubmittedCartItems(ctx, sqlc.LockSubmittedCartItemsParams{
		UserID:     p.userID,
		VariantIds: variantIDs,
	})
	if err != nil {
		return nil, err
	}

	// 3. Reconcile cart & refresh snapshots
	if err := q.ReconcileCart(ctx, p.userID); err != nil {
		return nil, err
	}
	if err := q.RefreshCartSnapshots(ctx, p.userID); err != nil {
		return nil, err
	}

	// 4. Classify submitted lines
	lockedMap := make(map[string]sqlc.LockSubmittedCartItemsRow, len(lockedRows))
	for _, row := range lockedRows {
		lockedMap[row.VariantID] = row
	}

	for _, line := range p.lines {
		row, exists := lockedMap[line.VariantID]
		if exists {
			if !row.ProductActive || !row.VariantActive || row.StockQuantity == 0 {
				return nil, domain.ErrOutOfStock
			}
			if row.StockQuantity < line.Quantity {
				return nil, domain.ErrStockLimit
			}
		}
	}

	var changedProducts []string
	for _, line := range p.lines {
		row, exists := lockedMap[line.VariantID]
		if !exists {
			name := line.ProductName
			if name == "" {
				name = line.VariantID
			}
			changedProducts = append(changedProducts, name)
			continue
		}

		if !row.Selected {
			changedProducts = append(changedProducts, row.ProductName)
			continue
		}

		if line.Quantity != row.Quantity || line.ProductName != row.ProductName || string(line.UnitPriceVND) != row.PriceVnd {
			changedProducts = append(changedProducts, row.ProductName)
			continue
		}
	}

	if len(changedProducts) > 0 {
		deduped := make([]string, 0, len(changedProducts))
		seen := make(map[string]bool)
		for _, prod := range changedProducts {
			if !seen[prod] {
				seen[prod] = true
				deduped = append(deduped, prod)
			}
		}
		return nil, domain.NewProductChangedError(deduped)
	}

	// 5. Calculate subtotal
	var subtotal domain.MoneyVND = "0"
	for _, line := range p.lines {
		row := lockedMap[line.VariantID]
		lineTotal := new(big.Int).Mul(numericInt(row.PriceVnd), big.NewInt(line.Quantity)).String()
		subtotal, err = domain.AddMoneyVND(subtotal, domain.MoneyVND(lineTotal))
		if err != nil {
			return nil, err
		}
	}

	// 6. Get address snapshot & calculate shipping fee
	addr, err := q.GetAddressByID(ctx, sqlc.GetAddressByIDParams{
		ID:     p.addressID,
		UserID: p.userID,
	})
	if err != nil {
		return nil, mapNotFound(err, domain.ErrAddressNotFound)
	}

	shippingFeeVND := p.explicitShippingFeeVND
	if p.useRegionalShipping {
		shipQuote, err := domain.CalculateShippingQuote(addr.ProvinceCode, subtotal, deliveryMethod, p.shippingCfg)
		if err != nil {
			return nil, err
		}
		shippingFeeVND = shipQuote.ShippingFeeVND
	} else if !shippingFeeVND.IsCanonical() {
		shippingFeeVND = "0"
	}

	// 7. Lock & validate voucher if provided
	var appliedVoucherID pgtype.UUID
	var appliedVoucherCode pgtype.Text
	var appliedVoucherType pgtype.Text
	var discountVND domain.MoneyVND = "0"
	var voucherUUIDStr string

	if strings.TrimSpace(p.voucherCode) != "" {
		normalizedCode := domain.NormalizeVoucherCode(p.voucherCode)
		vRow, err := q.LockVoucherByCode(ctx, normalizedCode)
		if err != nil {
			return nil, mapNotFound(err, domain.ErrVoucherNotFound)
		}
		userUsed, err := q.CountUserActiveVoucherUsages(ctx, sqlc.CountUserActiveVoucherUsagesParams{
			VoucherID: vRow.ID,
			UserID:    p.userID,
		})
		if err != nil {
			return nil, err
		}
		if err := validateVoucherEligibility(
			vRow.Active,
			vRow.StartsAt,
			vRow.EndsAt,
			vRow.UsageLimit,
			vRow.UsedCount,
			vRow.PerUserLimit,
			userUsed,
			domain.MoneyVND(vRow.MinOrderVnd),
			subtotal,
			time.Now().UTC(),
		); err != nil {
			return nil, err
		}

		vt := domain.VoucherType(vRow.VoucherType)
		discountVND, err = domain.CalculateVoucherDiscount(
			vt,
			domain.MoneyVND(vRow.DiscountValue),
			moneyPtrFromString(vRow.MaxDiscountVnd),
			subtotal,
			shippingFeeVND,
		)
		if err != nil {
			return nil, err
		}

		if err := appliedVoucherID.Scan(vRow.ID); err != nil {
			return nil, err
		}
		appliedVoucherCode = pgtype.Text{String: vRow.Code, Valid: true}
		appliedVoucherType = pgtype.Text{String: vRow.VoucherType, Valid: true}
		voucherUUIDStr = vRow.ID
	}

	// 8. Calculate total & check MoMo bounds BEFORE mutating quotas/voucher/stock/cart
	total, err := domain.CalculateCheckoutTotal(subtotal, shippingFeeVND, discountVND)
	if err != nil {
		return nil, err
	}

	if paymentMethod == domain.PaymentMethodMomo {
		totalInt := numericInt(string(total))
		if totalInt.Cmp(big.NewInt(domain.MomoMinAmountVND)) < 0 || totalInt.Cmp(big.NewInt(domain.MomoMaxAmountVND)) > 0 {
			return nil, domain.ErrMomoAmountOutOfRange
		}
	}

	// 9. Consume promo quotas in deterministic lock order (Live then Flash Sale, sorted by PromoID, VariantID ASC)
	liveLines, flashLines := splitAndSortCheckoutPromoLines(p.lines, lockedMap)
	for _, line := range liveLines {
		row := lockedMap[line.VariantID]
		if err := consumeLiveQuota(ctx, q, row.LiveSessionID, row.VariantID, row.ProductName, line.Quantity); err != nil {
			return nil, err
		}
	}
	for _, line := range flashLines {
		row := lockedMap[line.VariantID]
		if err := consumeFlashSaleQuota(ctx, q, row.FlashSaleID, row.VariantID, row.ProductName, line.Quantity); err != nil {
			return nil, err
		}
	}

	// 10. Consume voucher global slot (if applied)
	if voucherUUIDStr != "" {
		if _, err := q.ConsumeVoucherUsage(ctx, voucherUUIDStr); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, domain.ErrVoucherExhausted
			}
			return nil, err
		}
	}

	// 11. Insert order
	orderRow, err := q.InsertOrder(ctx, sqlc.InsertOrderParams{
		UserID:         p.userID,
		Status:         string(domain.OrderStatusPendingConfirmation),
		PaymentMethod:  paymentMethod,
		PaymentStatus:  string(domain.PaymentStatusPending),
		SubtotalVnd:    toNumeric(string(subtotal)),
		ShippingFeeVnd: toNumeric(string(shippingFeeVND)),
		DiscountVnd:    toNumeric(string(discountVND)),
		TotalVnd:       toNumeric(string(total)),
		VoucherID:      appliedVoucherID,
		VoucherCode:    appliedVoucherCode,
		VoucherType:    appliedVoucherType,
		DeliveryMethod: string(deliveryMethod),
		RecipientName:  addr.RecipientName,
		Phone:          addr.Phone,
		ProvinceName:   addr.ProvinceName,
		WardName:       addr.WardName,
		DetailAddress:  addr.DetailAddress,
	})
	if err != nil {
		return nil, err
	}

	// 12. Insert voucher usage record (if applied)
	if voucherUUIDStr != "" {
		if err := q.InsertVoucherUsage(ctx, sqlc.InsertVoucherUsageParams{
			VoucherID:   voucherUUIDStr,
			UserID:      p.userID,
			OrderID:     orderRow.ID,
			DiscountVnd: toNumeric(string(discountVND)),
		}); err != nil {
			return nil, err
		}
	}

	// 13. Insert order items
	orderItems := make([]domain.OrderItem, 0, len(p.lines))
	for _, line := range p.lines {
		row := lockedMap[line.VariantID]
		lineTotal := new(big.Int).Mul(numericInt(row.PriceVnd), big.NewInt(line.Quantity)).String()

		var liveSessionID pgtype.UUID
		if row.LiveSessionID != "" {
			if err := liveSessionID.Scan(row.LiveSessionID); err != nil {
				return nil, err
			}
		}
		var flashSaleID pgtype.UUID
		if row.FlashSaleID != "" {
			if err := flashSaleID.Scan(row.FlashSaleID); err != nil {
				return nil, err
			}
		}
		err := q.InsertOrderItem(ctx, sqlc.InsertOrderItemParams{
			OrderID:       orderRow.ID,
			VariantID:     row.VariantID,
			ProductID:     row.ProductID,
			BrandName:     row.BrandName,
			ProductName:   row.ProductName,
			Model:         row.Model,
			ImageUrl:      row.ImageUrl,
			Options:       []byte(row.Options),
			UnitPriceVnd:  toNumeric(row.PriceVnd),
			Quantity:      line.Quantity,
			LineTotalVnd:  toNumeric(lineTotal),
			LiveSessionID: liveSessionID,
			FlashSaleID:   flashSaleID,
		})
		if err != nil {
			return nil, err
		}

		var options []domain.CartOption
		if err := json.Unmarshal([]byte(row.Options), &options); err != nil {
			options = []domain.CartOption{}
		}

		orderItems = append(orderItems, domain.OrderItem{
			OrderID:      orderRow.ID,
			VariantID:    row.VariantID,
			ProductID:    row.ProductID,
			BrandName:    row.BrandName,
			ProductName:  row.ProductName,
			Model:        row.Model,
			ImageURL:     row.ImageUrl,
			Options:      options,
			UnitPriceVND: domain.MoneyVND(row.PriceVnd),
			Quantity:     line.Quantity,
			LineTotalVND: domain.MoneyVND(lineTotal),
		})
	}

	// 14. Insert initial order_status_events record
	if err := q.InsertOrderStatusEvent(ctx, sqlc.InsertOrderStatusEventParams{
		OrderID:   orderRow.ID,
		Status:    string(domain.OrderStatusPendingConfirmation),
		ActorType: string(domain.OrderActorCustomer),
		Note:      "Đơn hàng được tạo",
	}); err != nil {
		return nil, err
	}

	// 15. Decrement variant stock in VariantID ASC order
	decrementLines := make([]domain.OrderLineInput, len(p.lines))
	copy(decrementLines, p.lines)
	sort.Slice(decrementLines, func(i, j int) bool {
		return decrementLines[i].VariantID < decrementLines[j].VariantID
	})
	for _, line := range decrementLines {
		_, err := q.DecrementVariantStock(ctx, sqlc.DecrementVariantStockParams{
			ID:       line.VariantID,
			Quantity: line.Quantity,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, domain.ErrOutOfStock
			}
			return nil, err
		}
	}

	// 16. Remove selected cart items
	if err := q.RemoveSelectedCartItems(ctx, p.userID); err != nil {
		return nil, err
	}

	eventRows, err := q.ListOrderStatusEventsByOrderID(ctx, orderRow.ID)
	if err != nil {
		return nil, err
	}

	// 17. Commit transaction
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return mapOrderFromFields(orderRowFields{
		ID:                   orderRow.ID,
		UserID:               orderRow.UserID,
		Status:               orderRow.Status,
		PaymentMethod:        orderRow.PaymentMethod,
		PaymentStatus:        orderRow.PaymentStatus,
		PaymentTransactionID: orderRow.PaymentTransactionID,
		PaidAt:               orderRow.PaidAt,
		SubtotalVnd:          orderRow.SubtotalVnd,
		ShippingFeeVnd:       orderRow.ShippingFeeVnd,
		DiscountVnd:          orderRow.DiscountVnd,
		TotalVnd:             orderRow.TotalVnd,
		VoucherID:            orderRow.VoucherID,
		VoucherCode:          orderRow.VoucherCode,
		VoucherType:          orderRow.VoucherType,
		DeliveryMethod:       orderRow.DeliveryMethod,
		ShippingCarrier:      orderRow.ShippingCarrier,
		TrackingCode:         orderRow.TrackingCode,
		RecipientName:        orderRow.RecipientName,
		Phone:                orderRow.Phone,
		ProvinceName:         orderRow.ProvinceName,
		WardName:             orderRow.WardName,
		DetailAddress:        orderRow.DetailAddress,
		CreatedAt:            orderRow.CreatedAt,
		UpdatedAt:            orderRow.UpdatedAt,
		ConfirmedAt:          orderRow.ConfirmedAt,
		PreparingAt:          orderRow.PreparingAt,
		ShippedAt:            orderRow.ShippedAt,
		CancelledAt:          orderRow.CancelledAt,
		DeliveredAt:          orderRow.DeliveredAt,
	}, orderItems, mapOrderTimelineEvents(eventRows)), nil
}

func validateVoucherEligibility(
	active bool,
	startsAt, endsAt time.Time,
	usageLimit pgtype.Int4,
	usedCount, perUserLimit int32,
	userUsed int64,
	minOrderVND, subtotalVND domain.MoneyVND,
	now time.Time,
) error {
	if !active {
		return domain.ErrVoucherInactive
	}
	if now.Before(startsAt.UTC()) {
		return domain.ErrVoucherNotStarted
	}
	if now.After(endsAt.UTC()) {
		return domain.ErrVoucherExpired
	}
	if usageLimit.Valid && usedCount >= usageLimit.Int32 {
		return domain.ErrVoucherExhausted
	}
	if userUsed >= int64(perUserLimit) {
		return domain.ErrVoucherUserLimitReached
	}
	if domain.CompareMoneyVND(subtotalVND, minOrderVND) < 0 {
		return &domain.VoucherMinOrderError{MinOrderVND: minOrderVND}
	}
	return nil
}

func consumeFlashSaleQuota(ctx context.Context, q *sqlc.Queries, flashSaleID, variantID, productName string, quantity int64) error {
	if quantity <= int64(math.MaxInt32) {
		_, err := q.ConsumeFlashSaleQuota(ctx, sqlc.ConsumeFlashSaleQuotaParams{
			FlashSaleID: flashSaleID,
			VariantID:   variantID,
			Quantity:    int32(quantity),
		})
		if err == nil {
			return nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
	}
	remaining, err := q.GetFlashSaleQuotaRemaining(ctx, sqlc.GetFlashSaleQuotaRemainingParams{
		FlashSaleID: flashSaleID,
		VariantID:   variantID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.NewProductChangedError([]string{productName})
		}
		return err
	}
	if remaining < 1 {
		return domain.NewProductChangedError([]string{productName})
	}
	return &domain.FlashSaleQuotaExceededError{ProductName: productName, Remaining: int64(remaining)}
}

type variantRestockTarget struct {
	VariantID string
	Quantity  int64
}

type promoQuotaRestoreTarget struct {
	PromoID   string
	VariantID string
	Quantity  int64
}

func aggregateRestockTargets(rows []sqlc.ListOrderItemRestoreTargetsByOrderIDsRow) []variantRestockTarget {
	if len(rows) == 0 {
		return nil
	}
	byVariant := make(map[string]int64, len(rows))
	for _, row := range rows {
		if row.Quantity <= 0 {
			continue
		}
		byVariant[row.VariantID] += row.Quantity
	}
	if len(byVariant) == 0 {
		return nil
	}
	variantIDs := make([]string, 0, len(byVariant))
	for vid := range byVariant {
		variantIDs = append(variantIDs, vid)
	}
	sort.Strings(variantIDs)
	out := make([]variantRestockTarget, 0, len(variantIDs))
	for _, vid := range variantIDs {
		out = append(out, variantRestockTarget{VariantID: vid, Quantity: byVariant[vid]})
	}
	return out
}

func aggregatePromoRestoreTargets(rows []sqlc.ListOrderItemRestoreTargetsByOrderIDsRow) (liveTargets, flashTargets []promoQuotaRestoreTarget) {
	type key struct {
		promoID   string
		variantID string
	}
	liveMap := make(map[key]int64)
	flashMap := make(map[key]int64)
	for _, row := range rows {
		if row.Quantity <= 0 {
			continue
		}
		if row.LiveSessionID != "" {
			liveMap[key{promoID: row.LiveSessionID, variantID: row.VariantID}] += row.Quantity
		} else if row.FlashSaleID != "" {
			flashMap[key{promoID: row.FlashSaleID, variantID: row.VariantID}] += row.Quantity
		}
	}
	sortPromoMap := func(m map[key]int64) []promoQuotaRestoreTarget {
		if len(m) == 0 {
			return nil
		}
		out := make([]promoQuotaRestoreTarget, 0, len(m))
		for k, qty := range m {
			out = append(out, promoQuotaRestoreTarget{
				PromoID:   k.promoID,
				VariantID: k.variantID,
				Quantity:  qty,
			})
		}
		sort.Slice(out, func(i, j int) bool {
			if out[i].PromoID != out[j].PromoID {
				return out[i].PromoID < out[j].PromoID
			}
			return out[i].VariantID < out[j].VariantID
		})
		return out
	}
	return sortPromoMap(liveMap), sortPromoMap(flashMap)
}

func splitAndSortCheckoutPromoLines(
	lines []domain.OrderLineInput,
	lockedMap map[string]sqlc.LockSubmittedCartItemsRow,
) (liveLines, flashLines []domain.OrderLineInput) {
	for _, line := range lines {
		row := lockedMap[line.VariantID]
		if row.LiveSessionID != "" {
			liveLines = append(liveLines, line)
		} else if row.FlashSaleID != "" {
			flashLines = append(flashLines, line)
		}
	}
	sort.Slice(liveLines, func(i, j int) bool {
		li, lj := lockedMap[liveLines[i].VariantID], lockedMap[liveLines[j].VariantID]
		if li.LiveSessionID != lj.LiveSessionID {
			return li.LiveSessionID < lj.LiveSessionID
		}
		return liveLines[i].VariantID < liveLines[j].VariantID
	})
	sort.Slice(flashLines, func(i, j int) bool {
		li, lj := lockedMap[flashLines[i].VariantID], lockedMap[flashLines[j].VariantID]
		if li.FlashSaleID != lj.FlashSaleID {
			return li.FlashSaleID < lj.FlashSaleID
		}
		return flashLines[i].VariantID < flashLines[j].VariantID
	})
	return liveLines, flashLines
}

func clampPositiveInt32(qty int64) int32 {
	if qty <= 0 {
		return 0
	}
	if qty > math.MaxInt32 {
		return math.MaxInt32
	}
	return int32(qty)
}

func restockVariantTargetsSorted(ctx context.Context, q *sqlc.Queries, rows []sqlc.ListOrderItemRestoreTargetsByOrderIDsRow) error {
	for _, target := range aggregateRestockTargets(rows) {
		if err := q.IncrementVariantStock(ctx, sqlc.IncrementVariantStockParams{
			ID:       target.VariantID,
			Quantity: target.Quantity,
		}); err != nil {
			return err
		}
	}
	return nil
}

func restoreVouchersForOrdersSorted(ctx context.Context, q *sqlc.Queries, orderIDs []string) error {
	sortedOrderIDs := make([]string, len(orderIDs))
	copy(sortedOrderIDs, orderIDs)
	sort.Strings(sortedOrderIDs)

	voucherCounts := make(map[string]int32)
	for _, orderID := range sortedOrderIDs {
		voucherID, err := q.RestoreVoucherUsageByOrderID(ctx, orderID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				continue
			}
			return err
		}
		voucherCounts[voucherID]++
	}
	if len(voucherCounts) == 0 {
		return nil
	}
	voucherIDs := make([]string, 0, len(voucherCounts))
	for voucherID := range voucherCounts {
		voucherIDs = append(voucherIDs, voucherID)
	}
	sort.Strings(voucherIDs)
	for _, voucherID := range voucherIDs {
		if err := q.DecrementVoucherUsedCountBy(ctx, sqlc.DecrementVoucherUsedCountByParams{
			ID:    voucherID,
			Delta: voucherCounts[voucherID],
		}); err != nil {
			return err
		}
	}
	return nil
}

func restorePromoTargetsSorted(ctx context.Context, q *sqlc.Queries, rows []sqlc.ListOrderItemRestoreTargetsByOrderIDsRow) error {
	liveTargets, flashTargets := aggregatePromoRestoreTargets(rows)
	for _, target := range liveTargets {
		if err := q.RestoreLiveQuotaItem(ctx, sqlc.RestoreLiveQuotaItemParams{
			SessionID: target.PromoID,
			VariantID: target.VariantID,
			Quantity:  clampPositiveInt32(target.Quantity),
		}); err != nil {
			return err
		}
	}
	for _, target := range flashTargets {
		if err := q.RestoreFlashSaleQuotaItem(ctx, sqlc.RestoreFlashSaleQuotaItemParams{
			FlashSaleID: target.PromoID,
			VariantID:   target.VariantID,
			Quantity:    clampPositiveInt32(target.Quantity),
		}); err != nil {
			return err
		}
	}
	return nil
}

func restoreVoucherAndPromoTargetsSorted(ctx context.Context, q *sqlc.Queries, orderIDs []string, rows []sqlc.ListOrderItemRestoreTargetsByOrderIDsRow) error {
	if err := restoreVouchersForOrdersSorted(ctx, q, orderIDs); err != nil {
		return err
	}
	return restorePromoTargetsSorted(ctx, q, rows)
}

func restoreCancelledOrdersResources(ctx context.Context, q *sqlc.Queries, orderIDs []string) error {
	if len(orderIDs) == 0 {
		return nil
	}
	rows, err := q.ListOrderItemRestoreTargetsByOrderIDs(ctx, orderIDs)
	if err != nil {
		return err
	}
	if err := restockVariantTargetsSorted(ctx, q, rows); err != nil {
		return err
	}
	return restoreVoucherAndPromoTargetsSorted(ctx, q, orderIDs, rows)
}

func (r *OrderRepository) GetByID(ctx context.Context, userID, orderID string) (*domain.Order, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, domain.ErrOrderNotFound
	}
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrOrderNotFound
	}

	q := sqlc.New(r.db)
	orderRow, err := q.GetOrderByID(ctx, sqlc.GetOrderByIDParams{
		ID:     orderID,
		UserID: userID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrOrderNotFound
		}
		return nil, err
	}

	itemRows, err := q.ListOrderItemsByOrderID(ctx, orderID)
	if err != nil {
		return nil, err
	}
	eventRows, err := q.ListOrderStatusEventsByOrderID(ctx, orderID)
	if err != nil {
		return nil, err
	}

	items := mapOrderItems(itemRows)

	return mapOrderFromFields(orderRowFields{
		ID:                   orderRow.ID,
		UserID:               orderRow.UserID,
		Status:               orderRow.Status,
		PaymentMethod:        orderRow.PaymentMethod,
		PaymentStatus:        orderRow.PaymentStatus,
		PaymentTransactionID: orderRow.PaymentTransactionID,
		PaidAt:               orderRow.PaidAt,
		SubtotalVnd:          orderRow.SubtotalVnd,
		ShippingFeeVnd:       orderRow.ShippingFeeVnd,
		DiscountVnd:          orderRow.DiscountVnd,
		TotalVnd:             orderRow.TotalVnd,
		VoucherID:            orderRow.VoucherID,
		VoucherCode:          orderRow.VoucherCode,
		VoucherType:          orderRow.VoucherType,
		DeliveryMethod:       orderRow.DeliveryMethod,
		ShippingCarrier:      orderRow.ShippingCarrier,
		TrackingCode:         orderRow.TrackingCode,
		RecipientName:        orderRow.RecipientName,
		Phone:                orderRow.Phone,
		ProvinceName:         orderRow.ProvinceName,
		WardName:             orderRow.WardName,
		DetailAddress:        orderRow.DetailAddress,
		CreatedAt:            orderRow.CreatedAt,
		UpdatedAt:            orderRow.UpdatedAt,
		ConfirmedAt:          orderRow.ConfirmedAt,
		PreparingAt:          orderRow.PreparingAt,
		ShippedAt:            orderRow.ShippedAt,
		CancelledAt:          orderRow.CancelledAt,
		DeliveredAt:          orderRow.DeliveredAt,
	}, items, mapOrderTimelineEvents(eventRows)), nil
}

func (r *OrderRepository) ListByUser(ctx context.Context, userID string, bucket domain.OrderStatusBucket) ([]domain.Order, error) {
	if _, err := uuid.Parse(userID); err != nil {
		return []domain.Order{}, nil
	}

	q := sqlc.New(r.db)

	var orderRows []sqlc.ListOrdersByUserRow
	if bucket == domain.OrderStatusBucketReviewable {
		reviewableRows, err := q.ListReviewableOrdersByUser(ctx, userID)
		if err != nil {
			return nil, err
		}
		orderRows = make([]sqlc.ListOrdersByUserRow, len(reviewableRows))
		for i, row := range reviewableRows {
			orderRows[i] = sqlc.ListOrdersByUserRow{
				ID:                   row.ID,
				UserID:               row.UserID,
				Status:               row.Status,
				PaymentMethod:        row.PaymentMethod,
				PaymentStatus:        row.PaymentStatus,
				PaymentTransactionID: row.PaymentTransactionID,
				PaidAt:               row.PaidAt,
				SubtotalVnd:          row.SubtotalVnd,
				ShippingFeeVnd:       row.ShippingFeeVnd,
				DiscountVnd:          row.DiscountVnd,
				TotalVnd:             row.TotalVnd,
				VoucherID:            row.VoucherID,
				VoucherCode:          row.VoucherCode,
				VoucherType:          row.VoucherType,
				DeliveryMethod:       row.DeliveryMethod,
				ShippingCarrier:      row.ShippingCarrier,
				TrackingCode:         row.TrackingCode,
				RecipientName:        row.RecipientName,
				Phone:                row.Phone,
				ProvinceName:         row.ProvinceName,
				WardName:             row.WardName,
				DetailAddress:        row.DetailAddress,
				CreatedAt:            row.CreatedAt,
				UpdatedAt:            row.UpdatedAt,
				ConfirmedAt:          row.ConfirmedAt,
				PreparingAt:          row.PreparingAt,
				ShippedAt:            row.ShippedAt,
				CancelledAt:          row.CancelledAt,
				DeliveredAt:          row.DeliveredAt,
			}
		}
	} else {
		statuses := bucket.Statuses()
		var statusStrings []string
		if len(statuses) > 0 {
			statusStrings = make([]string, len(statuses))
			for i, s := range statuses {
				statusStrings[i] = string(s)
			}
		}

		rows, err := q.ListOrdersByUser(ctx, sqlc.ListOrdersByUserParams{
			UserID:   userID,
			Statuses: statusStrings,
		})
		if err != nil {
			return nil, err
		}
		orderRows = rows
	}

	if len(orderRows) == 0 {
		return []domain.Order{}, nil
	}

	orderIDs := make([]string, len(orderRows))
	for i, row := range orderRows {
		orderIDs[i] = row.ID
	}

	itemRows, err := q.ListOrderItemsByOrderIDs(ctx, orderIDs)
	if err != nil {
		return nil, err
	}

	itemsByOrderID := make(map[string][]domain.OrderItem)
	for _, row := range itemRows {
		var options []domain.CartOption
		if err := json.Unmarshal([]byte(row.Options), &options); err != nil {
			options = []domain.CartOption{}
		}

		item := domain.OrderItem{
			ID:           row.ID,
			OrderID:      row.OrderID,
			VariantID:    row.VariantID,
			ProductID:    row.ProductID,
			BrandName:    row.BrandName,
			ProductName:  row.ProductName,
			Model:        row.Model,
			ImageURL:     row.ImageUrl,
			Options:      options,
			UnitPriceVND: domain.MoneyVND(row.UnitPriceVnd),
			Quantity:     row.Quantity,
			LineTotalVND: domain.MoneyVND(row.LineTotalVnd),
		}
		itemsByOrderID[row.OrderID] = append(itemsByOrderID[row.OrderID], item)
	}

	eventRows, err := q.ListOrderStatusEventsByOrderIDs(ctx, orderIDs)
	if err != nil {
		return nil, err
	}
	eventsByOrderID := groupTimelineEventsByOrderID(eventRows)

	orders := make([]domain.Order, len(orderRows))
	for i, row := range orderRows {
		mapped := mapOrderFromFields(orderRowFields{
			ID:                   row.ID,
			UserID:               row.UserID,
			Status:               row.Status,
			PaymentMethod:        row.PaymentMethod,
			PaymentStatus:        row.PaymentStatus,
			PaymentTransactionID: row.PaymentTransactionID,
			PaidAt:               row.PaidAt,
			SubtotalVnd:          row.SubtotalVnd,
			ShippingFeeVnd:       row.ShippingFeeVnd,
			DiscountVnd:          row.DiscountVnd,
			TotalVnd:             row.TotalVnd,
			VoucherID:            row.VoucherID,
			VoucherCode:          row.VoucherCode,
			VoucherType:          row.VoucherType,
			DeliveryMethod:       row.DeliveryMethod,
			ShippingCarrier:      row.ShippingCarrier,
			TrackingCode:         row.TrackingCode,
			RecipientName:        row.RecipientName,
			Phone:                row.Phone,
			ProvinceName:         row.ProvinceName,
			WardName:             row.WardName,
			DetailAddress:        row.DetailAddress,
			CreatedAt:            row.CreatedAt,
			UpdatedAt:            row.UpdatedAt,
			ConfirmedAt:          row.ConfirmedAt,
			PreparingAt:          row.PreparingAt,
			ShippedAt:            row.ShippedAt,
			CancelledAt:          row.CancelledAt,
			DeliveredAt:          row.DeliveredAt,
		}, itemsByOrderID[row.ID], eventsByOrderID[row.ID])
		orders[i] = *mapped
	}

	return orders, nil
}

func groupTimelineEventsByOrderID(rows []sqlc.OrderStatusEvent) map[string][]domain.OrderTimelineEvent {
	grouped := make(map[string][]domain.OrderTimelineEvent)
	for _, row := range rows {
		grouped[row.OrderID] = append(grouped[row.OrderID], domain.OrderTimelineEvent{
			ID:        row.ID,
			Status:    domain.OrderStatus(row.Status),
			ActorType: domain.OrderActorType(row.ActorType),
			Note:      row.Note,
			CreatedAt: row.CreatedAt.UTC(),
		})
	}
	return grouped
}

func (r *OrderRepository) StatsByUser(ctx context.Context, userID string) (domain.OrderStats, error) {
	if _, err := uuid.Parse(userID); err != nil {
		return domain.OrderStats{}, nil
	}

	q := sqlc.New(r.db)
	rows, err := q.CountOrdersByStatus(ctx, userID)
	if err != nil {
		return domain.OrderStats{}, err
	}

	var stats domain.OrderStats
	for _, row := range rows {
		count := int(row.Count)
		switch domain.OrderStatus(row.Status) {
		case domain.OrderStatusPendingConfirmation:
			stats.PendingConfirmation += count
		case domain.OrderStatusConfirmed, domain.OrderStatusPreparing, domain.OrderStatusCancelRequested:
			stats.AwaitingPickup += count
		case domain.OrderStatusShipped:
			stats.AwaitingDelivery += count
		}
	}

	awaitingReviewCount, err := q.CountReviewableOrdersByUser(ctx, userID)
	if err != nil {
		return domain.OrderStats{}, err
	}
	stats.AwaitingReview = int(awaitingReviewCount)

	return stats, nil
}

func (r *OrderRepository) Cancel(ctx context.Context, userID, orderID string) (*domain.Order, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, domain.ErrOrderNotFound
	}
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrOrderNotFound
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)

	orderRow, err := q.LockOrderForUpdate(ctx, sqlc.LockOrderForUpdateParams{
		ID:     orderID,
		UserID: userID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrOrderNotFound
		}
		return nil, err
	}

	now := time.Now().UTC()
	var newStatus domain.OrderStatus
	var cancelledAt pgtype.Timestamptz
	confirmedAt := orderRow.ConfirmedAt
	var eventNote string

	switch domain.OrderStatus(orderRow.Status) {
	case domain.OrderStatusPendingConfirmation, domain.OrderStatusConfirmed:
		newStatus = domain.OrderStatusCancelled
		cancelledAt = pgtype.Timestamptz{Time: now, Valid: true}
		eventNote = "Khách hàng hủy đơn hàng"

		if err := restoreCancelledOrdersResources(ctx, q, []string{orderID}); err != nil {
			return nil, err
		}

	case domain.OrderStatusPreparing:
		newStatus = domain.OrderStatusCancelRequested
		cancelledAt = orderRow.CancelledAt
		eventNote = "Khách hàng gửi yêu cầu hủy đơn hàng"

	case domain.OrderStatusCancelRequested:
		return nil, domain.ErrOrderNotCancellable

	default:
		return nil, domain.ErrOrderNotCancellable
	}

	if err := q.SetOrderStatus(ctx, sqlc.SetOrderStatusParams{
		ID:          orderID,
		Status:      string(newStatus),
		ConfirmedAt: confirmedAt,
		CancelledAt: cancelledAt,
		DeliveredAt: orderRow.DeliveredAt,
	}); err != nil {
		return nil, err
	}

	if err := q.InsertOrderStatusEvent(ctx, sqlc.InsertOrderStatusEventParams{
		OrderID:   orderID,
		Status:    string(newStatus),
		ActorType: string(domain.OrderActorCustomer),
		Note:      eventNote,
	}); err != nil {
		return nil, err
	}

	paymentStatus := orderRow.PaymentStatus
	if newStatus == domain.OrderStatusCancelled && domain.PaymentStatus(orderRow.PaymentStatus) == domain.PaymentStatusPaid {
		if err := q.SetOrderPaymentRefunded(ctx, orderID); err != nil {
			return nil, err
		}
		paymentStatus = string(domain.PaymentStatusRefunded)
	}

	itemRows, err := q.ListOrderItemsByOrderID(ctx, orderID)
	if err != nil {
		return nil, err
	}
	eventRows, err := q.ListOrderStatusEventsByOrderID(ctx, orderID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	items := mapOrderItems(itemRows)
	return mapOrderFromFields(orderRowFields{
		ID:                   orderRow.ID,
		UserID:               orderRow.UserID,
		Status:               string(newStatus),
		PaymentMethod:        orderRow.PaymentMethod,
		PaymentStatus:        paymentStatus,
		PaymentTransactionID: orderRow.PaymentTransactionID,
		PaidAt:               orderRow.PaidAt,
		SubtotalVnd:          orderRow.SubtotalVnd,
		ShippingFeeVnd:       orderRow.ShippingFeeVnd,
		DiscountVnd:          orderRow.DiscountVnd,
		TotalVnd:             orderRow.TotalVnd,
		VoucherID:            orderRow.VoucherID,
		VoucherCode:          orderRow.VoucherCode,
		VoucherType:          orderRow.VoucherType,
		DeliveryMethod:       orderRow.DeliveryMethod,
		ShippingCarrier:      orderRow.ShippingCarrier,
		TrackingCode:         orderRow.TrackingCode,
		RecipientName:        orderRow.RecipientName,
		Phone:                orderRow.Phone,
		ProvinceName:         orderRow.ProvinceName,
		WardName:             orderRow.WardName,
		DetailAddress:        orderRow.DetailAddress,
		CreatedAt:            orderRow.CreatedAt,
		UpdatedAt:            now,
		ConfirmedAt:          confirmedAt,
		PreparingAt:          orderRow.PreparingAt,
		ShippedAt:            orderRow.ShippedAt,
		CancelledAt:          cancelledAt,
		DeliveredAt:          orderRow.DeliveredAt,
	}, items, mapOrderTimelineEvents(eventRows)), nil
}

func (r *OrderRepository) UndoCancelRequest(ctx context.Context, userID, orderID string) (*domain.Order, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, domain.ErrOrderNotFound
	}
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrOrderNotFound
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)

	orderRow, err := q.LockOrderForUpdate(ctx, sqlc.LockOrderForUpdateParams{
		ID:     orderID,
		UserID: userID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrOrderNotFound
		}
		return nil, err
	}

	if domain.OrderStatus(orderRow.Status) != domain.OrderStatusCancelRequested {
		return nil, domain.ErrOrderNotCancelRequested
	}

	now := time.Now().UTC()
	newStatus := domain.OrderStatusPreparing

	if err := q.SetOrderStatus(ctx, sqlc.SetOrderStatusParams{
		ID:          orderID,
		Status:      string(newStatus),
		ConfirmedAt: orderRow.ConfirmedAt,
		CancelledAt: orderRow.CancelledAt,
		DeliveredAt: orderRow.DeliveredAt,
	}); err != nil {
		return nil, err
	}

	if err := q.InsertOrderStatusEvent(ctx, sqlc.InsertOrderStatusEventParams{
		OrderID:   orderID,
		Status:    string(newStatus),
		ActorType: string(domain.OrderActorCustomer),
		Note:      "Khách hàng hoàn tác yêu cầu hủy đơn",
	}); err != nil {
		return nil, err
	}

	itemRows, err := q.ListOrderItemsByOrderID(ctx, orderID)
	if err != nil {
		return nil, err
	}
	eventRows, err := q.ListOrderStatusEventsByOrderID(ctx, orderID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	items := mapOrderItems(itemRows)
	return mapOrderFromFields(orderRowFields{
		ID:                   orderRow.ID,
		UserID:               orderRow.UserID,
		Status:               string(newStatus),
		PaymentMethod:        orderRow.PaymentMethod,
		PaymentStatus:        orderRow.PaymentStatus,
		PaymentTransactionID: orderRow.PaymentTransactionID,
		PaidAt:               orderRow.PaidAt,
		SubtotalVnd:          orderRow.SubtotalVnd,
		ShippingFeeVnd:       orderRow.ShippingFeeVnd,
		DiscountVnd:          orderRow.DiscountVnd,
		TotalVnd:             orderRow.TotalVnd,
		VoucherID:            orderRow.VoucherID,
		VoucherCode:          orderRow.VoucherCode,
		VoucherType:          orderRow.VoucherType,
		DeliveryMethod:       orderRow.DeliveryMethod,
		ShippingCarrier:      orderRow.ShippingCarrier,
		TrackingCode:         orderRow.TrackingCode,
		RecipientName:        orderRow.RecipientName,
		Phone:                orderRow.Phone,
		ProvinceName:         orderRow.ProvinceName,
		WardName:             orderRow.WardName,
		DetailAddress:        orderRow.DetailAddress,
		CreatedAt:            orderRow.CreatedAt,
		UpdatedAt:            now,
		ConfirmedAt:          orderRow.ConfirmedAt,
		PreparingAt:          orderRow.PreparingAt,
		ShippedAt:            orderRow.ShippedAt,
		CancelledAt:          orderRow.CancelledAt,
		DeliveredAt:          orderRow.DeliveredAt,
	}, items, mapOrderTimelineEvents(eventRows)), nil
}

func (r *OrderRepository) AutoConfirmDue(ctx context.Context, cutoff time.Time) error {
	q := sqlc.New(r.db)
	return q.AutoConfirmDueOrders(ctx, cutoff)
}

func (r *OrderRepository) AutoConfirmDueReturning(ctx context.Context, cutoff time.Time) ([]domain.AutoConfirmedOrder, error) {
	q := sqlc.New(r.db)
	rows, err := q.AutoConfirmDueOrdersReturning(ctx, cutoff)
	if err != nil {
		return nil, err
	}
	out := make([]domain.AutoConfirmedOrder, 0, len(rows))
	for _, row := range rows {
		out = append(out, domain.AutoConfirmedOrder{
			ID:       row.ID,
			UserID:   row.UserID,
			TotalVND: domain.MoneyVND(row.TotalVnd),
		})
	}
	return out, nil
}

func (r *OrderRepository) ListByAdmin(ctx context.Context, statuses []string) ([]domain.Order, error) {
	q := sqlc.New(r.db)
	orderRows, err := q.ListOrdersByAdmin(ctx, statuses)
	if err != nil {
		return nil, err
	}

	if len(orderRows) == 0 {
		return []domain.Order{}, nil
	}

	orderIDs := make([]string, len(orderRows))
	for i, row := range orderRows {
		orderIDs[i] = row.ID
	}

	itemRows, err := q.ListOrderItemsByOrderIDs(ctx, orderIDs)
	if err != nil {
		return nil, err
	}

	itemsByOrderID := make(map[string][]domain.OrderItem)
	for _, row := range itemRows {
		var options []domain.CartOption
		if err := json.Unmarshal([]byte(row.Options), &options); err != nil {
			options = []domain.CartOption{}
		}

		item := domain.OrderItem{
			ID:           row.ID,
			OrderID:      row.OrderID,
			VariantID:    row.VariantID,
			ProductID:    row.ProductID,
			BrandName:    row.BrandName,
			ProductName:  row.ProductName,
			Model:        row.Model,
			ImageURL:     row.ImageUrl,
			Options:      options,
			UnitPriceVND: domain.MoneyVND(row.UnitPriceVnd),
			Quantity:     row.Quantity,
			LineTotalVND: domain.MoneyVND(row.LineTotalVnd),
		}
		itemsByOrderID[row.OrderID] = append(itemsByOrderID[row.OrderID], item)
	}

	eventRows, err := q.ListOrderStatusEventsByOrderIDs(ctx, orderIDs)
	if err != nil {
		return nil, err
	}
	eventsByOrderID := groupTimelineEventsByOrderID(eventRows)

	orders := make([]domain.Order, len(orderRows))
	for i, row := range orderRows {
		mapped := mapOrderFromFields(orderRowFields{
			ID:                   row.ID,
			UserID:               row.UserID,
			BuyerEmail:           row.BuyerEmail,
			Status:               row.Status,
			PaymentMethod:        row.PaymentMethod,
			PaymentStatus:        row.PaymentStatus,
			PaymentTransactionID: row.PaymentTransactionID,
			PaidAt:               row.PaidAt,
			SubtotalVnd:          row.SubtotalVnd,
			ShippingFeeVnd:       row.ShippingFeeVnd,
			DiscountVnd:          row.DiscountVnd,
			TotalVnd:             row.TotalVnd,
			VoucherID:            row.VoucherID,
			VoucherCode:          row.VoucherCode,
			VoucherType:          row.VoucherType,
			DeliveryMethod:       row.DeliveryMethod,
			ShippingCarrier:      row.ShippingCarrier,
			TrackingCode:         row.TrackingCode,
			RecipientName:        row.RecipientName,
			Phone:                row.Phone,
			ProvinceName:         row.ProvinceName,
			WardName:             row.WardName,
			DetailAddress:        row.DetailAddress,
			CreatedAt:            row.CreatedAt,
			UpdatedAt:            row.UpdatedAt,
			ConfirmedAt:          row.ConfirmedAt,
			PreparingAt:          row.PreparingAt,
			ShippedAt:            row.ShippedAt,
			CancelledAt:          row.CancelledAt,
			DeliveredAt:          row.DeliveredAt,
		}, itemsByOrderID[row.ID], eventsByOrderID[row.ID])
		orders[i] = *mapped
	}

	return orders, nil
}

func (r *OrderRepository) GetByAdminID(ctx context.Context, orderID string) (*domain.Order, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, domain.ErrOrderNotFound
	}

	q := sqlc.New(r.db)
	orderRow, err := q.GetOrderByAdminID(ctx, orderID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrOrderNotFound
		}
		return nil, err
	}

	itemRows, err := q.ListOrderItemsByOrderID(ctx, orderID)
	if err != nil {
		return nil, err
	}
	eventRows, err := q.ListOrderStatusEventsByOrderID(ctx, orderID)
	if err != nil {
		return nil, err
	}

	items := mapOrderItems(itemRows)
	return mapOrderFromFields(orderRowFields{
		ID:                   orderRow.ID,
		UserID:               orderRow.UserID,
		BuyerEmail:           orderRow.BuyerEmail,
		Status:               orderRow.Status,
		PaymentMethod:        orderRow.PaymentMethod,
		PaymentStatus:        orderRow.PaymentStatus,
		PaymentTransactionID: orderRow.PaymentTransactionID,
		PaidAt:               orderRow.PaidAt,
		SubtotalVnd:          orderRow.SubtotalVnd,
		ShippingFeeVnd:       orderRow.ShippingFeeVnd,
		DiscountVnd:          orderRow.DiscountVnd,
		TotalVnd:             orderRow.TotalVnd,
		VoucherID:            orderRow.VoucherID,
		VoucherCode:          orderRow.VoucherCode,
		VoucherType:          orderRow.VoucherType,
		DeliveryMethod:       orderRow.DeliveryMethod,
		ShippingCarrier:      orderRow.ShippingCarrier,
		TrackingCode:         orderRow.TrackingCode,
		RecipientName:        orderRow.RecipientName,
		Phone:                orderRow.Phone,
		ProvinceName:         orderRow.ProvinceName,
		WardName:             orderRow.WardName,
		DetailAddress:        orderRow.DetailAddress,
		CreatedAt:            orderRow.CreatedAt,
		UpdatedAt:            orderRow.UpdatedAt,
		ConfirmedAt:          orderRow.ConfirmedAt,
		PreparingAt:          orderRow.PreparingAt,
		ShippedAt:            orderRow.ShippedAt,
		CancelledAt:          orderRow.CancelledAt,
		DeliveredAt:          orderRow.DeliveredAt,
	}, items, mapOrderTimelineEvents(eventRows)), nil
}

func (r *OrderRepository) AdminTransition(ctx context.Context, orderID string, action domain.OrderAdminAction) (*domain.Order, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, domain.ErrOrderNotFound
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)

	orderRow, err := q.LockOrderForUpdateAdmin(ctx, orderID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrOrderNotFound
		}
		return nil, err
	}

	from, to, restock, ok := action.Transition()
	if !ok || domain.OrderStatus(orderRow.Status) != from {
		return nil, domain.ErrOrderActionNotAllowed
	}

	if restock || to == domain.OrderStatusCancelled {
		restoreRows, err := q.ListOrderItemRestoreTargetsByOrderIDs(ctx, []string{orderID})
		if err != nil {
			return nil, err
		}
		if restock {
			if err := restockVariantTargetsSorted(ctx, q, restoreRows); err != nil {
				return nil, err
			}
		}
		if to == domain.OrderStatusCancelled {
			if err := restoreVoucherAndPromoTargetsSorted(ctx, q, []string{orderID}, restoreRows); err != nil {
				return nil, err
			}
		}
	}

	now := time.Now().UTC()
	cancelledAt := orderRow.CancelledAt
	if to == domain.OrderStatusCancelled {
		cancelledAt = pgtype.Timestamptz{Time: now, Valid: true}
	}
	confirmedAt := orderRow.ConfirmedAt
	preparingAt := orderRow.PreparingAt
	shippedAt := orderRow.ShippedAt
	deliveredAt := orderRow.DeliveredAt

	switch action {
	case domain.OrderAdminActionConfirmPreparing:
		if !preparingAt.Valid {
			preparingAt = pgtype.Timestamptz{Time: now, Valid: true}
		}
		if err := q.SetOrderPreparing(ctx, sqlc.SetOrderPreparingParams{
			ID:          orderID,
			PreparingAt: now,
		}); err != nil {
			return nil, err
		}
	case domain.OrderAdminActionShip:
		if !shippedAt.Valid {
			shippedAt = pgtype.Timestamptz{Time: now, Valid: true}
		}
		if err := q.SetOrderShipped(ctx, sqlc.SetOrderShippedParams{
			ID:        orderID,
			ShippedAt: now,
		}); err != nil {
			return nil, err
		}
	default:
		if to == domain.OrderStatusDelivered && !deliveredAt.Valid {
			deliveredAt = pgtype.Timestamptz{Time: now, Valid: true}
		}
		if err := q.SetOrderStatus(ctx, sqlc.SetOrderStatusParams{
			ID:          orderID,
			Status:      string(to),
			ConfirmedAt: confirmedAt,
			CancelledAt: cancelledAt,
			DeliveredAt: deliveredAt,
		}); err != nil {
			return nil, err
		}
	}

	if err := q.InsertOrderStatusEvent(ctx, sqlc.InsertOrderStatusEventParams{
		OrderID:   orderID,
		Status:    string(to),
		ActorType: string(domain.OrderActorAdmin),
		Note:      adminTransitionNote(action),
	}); err != nil {
		return nil, err
	}

	paymentStatus := orderRow.PaymentStatus
	paidAt := orderRow.PaidAt
	if to == domain.OrderStatusDelivered && (orderRow.PaymentMethod == domain.PaymentMethodCOD || domain.PaymentStatus(orderRow.PaymentStatus) != domain.PaymentStatusPaid) {
		if err := q.SetOrderPaymentPaid(ctx, sqlc.SetOrderPaymentPaidParams{
			ID:                   orderID,
			PaymentTransactionID: orderRow.PaymentTransactionID,
			PaidAt:               now,
		}); err != nil {
			return nil, err
		}
		paymentStatus = string(domain.PaymentStatusPaid)
		if !paidAt.Valid {
			paidAt = pgtype.Timestamptz{Time: now, Valid: true}
		}
	}
	if to == domain.OrderStatusCancelled && domain.PaymentStatus(orderRow.PaymentStatus) == domain.PaymentStatusPaid {
		if err := q.SetOrderPaymentRefunded(ctx, orderID); err != nil {
			return nil, err
		}
		paymentStatus = string(domain.PaymentStatusRefunded)
	}

	itemRows, err := q.ListOrderItemsByOrderID(ctx, orderID)
	if err != nil {
		return nil, err
	}
	eventRows, err := q.ListOrderStatusEventsByOrderID(ctx, orderID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	items := mapOrderItems(itemRows)
	return mapOrderFromFields(orderRowFields{
		ID:                   orderRow.ID,
		UserID:               orderRow.UserID,
		BuyerEmail:           orderRow.BuyerEmail,
		Status:               string(to),
		PaymentMethod:        orderRow.PaymentMethod,
		PaymentStatus:        paymentStatus,
		PaymentTransactionID: orderRow.PaymentTransactionID,
		PaidAt:               paidAt,
		SubtotalVnd:          orderRow.SubtotalVnd,
		ShippingFeeVnd:       orderRow.ShippingFeeVnd,
		DiscountVnd:          orderRow.DiscountVnd,
		TotalVnd:             orderRow.TotalVnd,
		VoucherID:            orderRow.VoucherID,
		VoucherCode:          orderRow.VoucherCode,
		VoucherType:          orderRow.VoucherType,
		DeliveryMethod:       orderRow.DeliveryMethod,
		ShippingCarrier:      orderRow.ShippingCarrier,
		TrackingCode:         orderRow.TrackingCode,
		RecipientName:        orderRow.RecipientName,
		Phone:                orderRow.Phone,
		ProvinceName:         orderRow.ProvinceName,
		WardName:             orderRow.WardName,
		DetailAddress:        orderRow.DetailAddress,
		CreatedAt:            orderRow.CreatedAt,
		UpdatedAt:            now,
		ConfirmedAt:          confirmedAt,
		PreparingAt:          preparingAt,
		ShippedAt:            shippedAt,
		CancelledAt:          cancelledAt,
		DeliveredAt:          deliveredAt,
	}, items, mapOrderTimelineEvents(eventRows)), nil
}

func adminTransitionNote(action domain.OrderAdminAction) string {
	switch action {
	case domain.OrderAdminActionConfirmPreparing:
		return "Đơn hàng đang được chuẩn bị"
	case domain.OrderAdminActionShip:
		return "Đơn hàng đã được bàn giao cho đơn vị vận chuyển"
	case domain.OrderAdminActionDeliver:
		return "Đơn hàng đã giao thành công"
	case domain.OrderAdminActionApproveCancel:
		return "Quản trị viên duyệt yêu cầu hủy đơn"
	case domain.OrderAdminActionDeclineCancel:
		return "Quản trị viên từ chối yêu cầu hủy đơn, tiếp tục chuẩn bị hàng"
	default:
		return ""
	}
}

func (r *OrderRepository) ShipOrder(ctx context.Context, orderID, carrier, trackingCode string) (*domain.Order, error) {
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

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)
	orderRow, err := q.LockOrderForUpdateAdmin(ctx, orderID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrOrderNotFound
		}
		return nil, err
	}
	if domain.OrderStatus(orderRow.Status) != domain.OrderStatusPreparing {
		return nil, domain.ErrOrderActionNotAllowed
	}

	now := time.Now().UTC()
	if err := q.SetOrderShippedWithTracking(ctx, sqlc.SetOrderShippedWithTrackingParams{
		ID:              orderID,
		ShippingCarrier: pgtype.Text{String: trimmedCarrier, Valid: true},
		TrackingCode:    pgtype.Text{String: trimmedCode, Valid: true},
		ShippedAt:       now,
	}); err != nil {
		return nil, err
	}

	if err := q.InsertOrderStatusEvent(ctx, sqlc.InsertOrderStatusEventParams{
		OrderID:   orderID,
		Status:    string(domain.OrderStatusShipped),
		ActorType: string(domain.OrderActorAdmin),
		Note:      fmt.Sprintf("Đã bàn giao vận chuyển (%s - %s)", trimmedCarrier, trimmedCode),
	}); err != nil {
		return nil, err
	}

	itemRows, err := q.ListOrderItemsByOrderID(ctx, orderID)
	if err != nil {
		return nil, err
	}
	eventRows, err := q.ListOrderStatusEventsByOrderID(ctx, orderID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	shippedAt := orderRow.ShippedAt
	if !shippedAt.Valid {
		shippedAt = pgtype.Timestamptz{Time: now, Valid: true}
	}

	return mapOrderFromFields(orderRowFields{
		ID:                   orderRow.ID,
		UserID:               orderRow.UserID,
		BuyerEmail:           orderRow.BuyerEmail,
		Status:               string(domain.OrderStatusShipped),
		PaymentMethod:        orderRow.PaymentMethod,
		PaymentStatus:        orderRow.PaymentStatus,
		PaymentTransactionID: orderRow.PaymentTransactionID,
		PaidAt:               orderRow.PaidAt,
		SubtotalVnd:          orderRow.SubtotalVnd,
		ShippingFeeVnd:       orderRow.ShippingFeeVnd,
		DiscountVnd:          orderRow.DiscountVnd,
		TotalVnd:             orderRow.TotalVnd,
		VoucherID:            orderRow.VoucherID,
		VoucherCode:          orderRow.VoucherCode,
		VoucherType:          orderRow.VoucherType,
		DeliveryMethod:       orderRow.DeliveryMethod,
		ShippingCarrier:      pgtype.Text{String: trimmedCarrier, Valid: true},
		TrackingCode:         pgtype.Text{String: trimmedCode, Valid: true},
		RecipientName:        orderRow.RecipientName,
		Phone:                orderRow.Phone,
		ProvinceName:         orderRow.ProvinceName,
		WardName:             orderRow.WardName,
		DetailAddress:        orderRow.DetailAddress,
		CreatedAt:            orderRow.CreatedAt,
		UpdatedAt:            now,
		ConfirmedAt:          orderRow.ConfirmedAt,
		PreparingAt:          orderRow.PreparingAt,
		ShippedAt:            shippedAt,
		CancelledAt:          orderRow.CancelledAt,
		DeliveredAt:          orderRow.DeliveredAt,
	}, mapOrderItems(itemRows), mapOrderTimelineEvents(eventRows)), nil
}

func (r *OrderRepository) BuyAgain(ctx context.Context, userID, orderID string) (*domain.BuyAgainResult, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, domain.ErrOrderNotFound
	}
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrOrderNotFound
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)

	if _, err := q.LockUser(ctx, userID); err != nil {
		return nil, mapNotFound(err, domain.ErrNotFound)
	}

	orderRow, err := q.GetOrderByID(ctx, sqlc.GetOrderByIDParams{
		ID:     orderID,
		UserID: userID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrOrderNotFound
		}
		return nil, err
	}

	switch domain.OrderStatus(orderRow.Status) {
	case domain.OrderStatusDelivered,
		domain.OrderStatusPartiallyReturned,
		domain.OrderStatusReturned,
		domain.OrderStatusCancelled:
	default:
		return nil, domain.ErrOrderActionNotAllowed
	}

	orderItems, err := q.ListOrderItemsByOrderID(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if len(orderItems) == 0 {
		return nil, domain.ErrBuyAgainAllUnavailable
	}

	cartQtyRows, err := q.ListCartItemQuantitiesForUpdate(ctx, userID)
	if err != nil {
		return nil, err
	}
	curCartQty := make(map[string]int64, len(cartQtyRows))
	for _, row := range cartQtyRows {
		curCartQty[row.VariantID] = row.Quantity
	}

	// Lock variants in deterministic sorted order to prevent deadlocks.
	sortedVariantIDs := make([]string, 0, len(orderItems))
	seenVariants := make(map[string]bool, len(orderItems))
	for _, item := range orderItems {
		if !seenVariants[item.VariantID] {
			seenVariants[item.VariantID] = true
			sortedVariantIDs = append(sortedVariantIDs, item.VariantID)
		}
	}
	sort.Strings(sortedVariantIDs)

	lockedVariants := make(map[string]sqlc.LockVariantRow, len(sortedVariantIDs))
	for _, vid := range sortedVariantIDs {
		vRow, err := q.LockVariant(ctx, vid)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				continue
			}
			return nil, err
		}
		lockedVariants[vid] = vRow
	}

	addedCount := 0
	adjustedItems := []domain.BuyAgainAdjustedItem{}
	skippedItems := []domain.BuyAgainSkippedItem{}

	for _, item := range orderItems {
		vRow, exists := lockedVariants[item.VariantID]
		if !exists || !vRow.ProductActive || !vRow.Active {
			skippedItems = append(skippedItems, domain.BuyAgainSkippedItem{
				VariantID:   item.VariantID,
				ProductName: item.ProductName,
				Reason:      domain.BuyAgainSkipUnavailable,
			})
			continue
		}
		if vRow.StockQuantity <= 0 {
			skippedItems = append(skippedItems, domain.BuyAgainSkippedItem{
				VariantID:   item.VariantID,
				ProductName: vRow.ProductName,
				Reason:      domain.BuyAgainSkipOutOfStock,
			})
			continue
		}

		cur := curCartQty[item.VariantID]
		var desired int64
		if item.Quantity > math.MaxInt64-cur {
			desired = math.MaxInt64
		} else {
			desired = cur + item.Quantity
		}
		newQty := desired
		if newQty > vRow.StockQuantity {
			newQty = vRow.StockQuantity
		}
		curCartQty[item.VariantID] = newQty

		if err := q.UpsertCartItemWithQuantity(ctx, sqlc.UpsertCartItemWithQuantityParams{
			UserID:              userID,
			VariantID:           item.VariantID,
			Quantity:            newQty,
			SnapshotBrandName:   vRow.BrandName,
			SnapshotProductName: vRow.ProductName,
			SnapshotModel:       vRow.Model,
			SnapshotImageUrl:    vRow.ImageUrl,
			SnapshotOptions:     []byte(vRow.Options),
		}); err != nil {
			return nil, err
		}

		addedCount++
		if newQty < desired {
			added := newQty - cur
			if added < 0 {
				added = 0
			}
			adjustedItems = append(adjustedItems, domain.BuyAgainAdjustedItem{
				VariantID:         item.VariantID,
				ProductName:       vRow.ProductName,
				RequestedQuantity: item.Quantity,
				AddedQuantity:     added,
			})
		}
	}

	if addedCount == 0 {
		return nil, domain.ErrBuyAgainAllUnavailable
	}

	if err := q.ReconcileCart(ctx, userID); err != nil {
		return nil, err
	}
	if err := q.RefreshCartSnapshots(ctx, userID); err != nil {
		return nil, err
	}
	cart, err := loadCart(ctx, q, userID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return &domain.BuyAgainResult{
		Cart:          cart,
		AddedCount:    addedCount,
		AdjustedItems: adjustedItems,
		SkippedItems:  skippedItems,
	}, nil
}

func (r *OrderRepository) SetPaymentFailed(ctx context.Context, orderID string) error {
	if _, err := uuid.Parse(orderID); err != nil {
		return domain.ErrOrderNotFound
	}
	q := sqlc.New(r.db)
	return q.SetOrderPaymentFailed(ctx, orderID)
}

func (r *OrderRepository) ResetPaymentPending(ctx context.Context, userID, orderID string) (*domain.Order, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, domain.ErrOrderNotFound
	}
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrOrderNotFound
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)
	orderRow, err := q.LockOrderForUpdate(ctx, sqlc.LockOrderForUpdateParams{
		ID:     orderID,
		UserID: userID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrOrderNotFound
		}
		return nil, err
	}

	curPayStatus := domain.PaymentStatus(orderRow.PaymentStatus)
	if orderRow.PaymentMethod != domain.PaymentMethodMomo ||
		domain.OrderStatus(orderRow.Status) != domain.OrderStatusPendingConfirmation ||
		(curPayStatus != domain.PaymentStatusPending && curPayStatus != domain.PaymentStatusFailed) {
		return nil, domain.ErrPaymentRetryNotAllowed
	}

	updatedAt := orderRow.UpdatedAt
	if curPayStatus == domain.PaymentStatusFailed {
		if err := q.SetOrderPaymentPending(ctx, orderID); err != nil {
			return nil, err
		}
		orderRow.PaymentStatus = string(domain.PaymentStatusPending)
		updatedAt = time.Now().UTC()
	}

	itemRows, err := q.ListOrderItemsByOrderID(ctx, orderID)
	if err != nil {
		return nil, err
	}
	eventRows, err := q.ListOrderStatusEventsByOrderID(ctx, orderID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return mapOrderFromFields(orderRowFields{
		ID:                   orderRow.ID,
		UserID:               orderRow.UserID,
		Status:               orderRow.Status,
		PaymentMethod:        orderRow.PaymentMethod,
		PaymentStatus:        orderRow.PaymentStatus,
		PaymentTransactionID: orderRow.PaymentTransactionID,
		PaidAt:               orderRow.PaidAt,
		SubtotalVnd:          orderRow.SubtotalVnd,
		ShippingFeeVnd:       orderRow.ShippingFeeVnd,
		DiscountVnd:          orderRow.DiscountVnd,
		TotalVnd:             orderRow.TotalVnd,
		VoucherID:            orderRow.VoucherID,
		VoucherCode:          orderRow.VoucherCode,
		VoucherType:          orderRow.VoucherType,
		DeliveryMethod:       orderRow.DeliveryMethod,
		ShippingCarrier:      orderRow.ShippingCarrier,
		TrackingCode:         orderRow.TrackingCode,
		RecipientName:        orderRow.RecipientName,
		Phone:                orderRow.Phone,
		ProvinceName:         orderRow.ProvinceName,
		WardName:             orderRow.WardName,
		DetailAddress:        orderRow.DetailAddress,
		CreatedAt:            orderRow.CreatedAt,
		UpdatedAt:            updatedAt,
		ConfirmedAt:          orderRow.ConfirmedAt,
		PreparingAt:          orderRow.PreparingAt,
		ShippedAt:            orderRow.ShippedAt,
		CancelledAt:          orderRow.CancelledAt,
		DeliveredAt:          orderRow.DeliveredAt,
	}, mapOrderItems(itemRows), mapOrderTimelineEvents(eventRows)), nil
}

func (r *OrderRepository) ApplyMomoCallback(ctx context.Context, orderID, userID, amountVND, transID string, resultCode int) (*domain.Order, bool, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		if userID != "" {
			return nil, false, domain.ErrOrderNotFound
		}
		return nil, false, domain.ErrMomoInvalidCallback
	}
	if userID != "" {
		if _, err := uuid.Parse(userID); err != nil {
			return nil, false, domain.ErrOrderNotFound
		}
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)
	orderRow, err := q.LockOrderForUpdateAdmin(ctx, orderID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			if userID != "" {
				return nil, false, domain.ErrOrderNotFound
			}
			return nil, false, domain.ErrMomoInvalidCallback
		}
		return nil, false, err
	}

	if userID != "" && orderRow.UserID != userID {
		return nil, false, domain.ErrOrderNotFound
	}
	if orderRow.PaymentMethod != domain.PaymentMethodMomo {
		return nil, false, domain.ErrMomoInvalidCallback
	}
	if orderRow.TotalVnd != amountVND {
		return nil, false, domain.ErrMomoInvalidCallback
	}

	itemRows, err := q.ListOrderItemsByOrderID(ctx, orderID)
	if err != nil {
		return nil, false, err
	}

	curStatus := domain.OrderStatus(orderRow.Status)
	curPayStatus := domain.PaymentStatus(orderRow.PaymentStatus)
	justPaid := false
	fields := orderRowFields{
		ID:                   orderRow.ID,
		UserID:               orderRow.UserID,
		BuyerEmail:           orderRow.BuyerEmail,
		Status:               orderRow.Status,
		PaymentMethod:        orderRow.PaymentMethod,
		PaymentStatus:        orderRow.PaymentStatus,
		PaymentTransactionID: orderRow.PaymentTransactionID,
		PaidAt:               orderRow.PaidAt,
		SubtotalVnd:          orderRow.SubtotalVnd,
		ShippingFeeVnd:       orderRow.ShippingFeeVnd,
		DiscountVnd:          orderRow.DiscountVnd,
		TotalVnd:             orderRow.TotalVnd,
		VoucherID:            orderRow.VoucherID,
		VoucherCode:          orderRow.VoucherCode,
		VoucherType:          orderRow.VoucherType,
		DeliveryMethod:       orderRow.DeliveryMethod,
		ShippingCarrier:      orderRow.ShippingCarrier,
		TrackingCode:         orderRow.TrackingCode,
		RecipientName:        orderRow.RecipientName,
		Phone:                orderRow.Phone,
		ProvinceName:         orderRow.ProvinceName,
		WardName:             orderRow.WardName,
		DetailAddress:        orderRow.DetailAddress,
		CreatedAt:            orderRow.CreatedAt,
		UpdatedAt:            orderRow.UpdatedAt,
		ConfirmedAt:          orderRow.ConfirmedAt,
		PreparingAt:          orderRow.PreparingAt,
		ShippedAt:            orderRow.ShippedAt,
		CancelledAt:          orderRow.CancelledAt,
		DeliveredAt:          orderRow.DeliveredAt,
	}

	if curStatus == domain.OrderStatusPendingConfirmation &&
		(curPayStatus == domain.PaymentStatusPending || curPayStatus == domain.PaymentStatusFailed) {
		now := time.Now().UTC()
		if resultCode == 0 {
			trimmedTrans := strings.TrimSpace(transID)
			txID := pgtype.Text{String: trimmedTrans, Valid: trimmedTrans != ""}
			if err := q.ConfirmOrderMomoPaid(ctx, sqlc.ConfirmOrderMomoPaidParams{
				Now:                  now,
				PaymentTransactionID: txID,
				ID:                   orderID,
			}); err != nil {
				return nil, false, err
			}
			if err := q.InsertOrderStatusEvent(ctx, sqlc.InsertOrderStatusEventParams{
				OrderID:   orderID,
				Status:    string(domain.OrderStatusConfirmed),
				ActorType: string(domain.OrderActorSystem),
				Note:      "Thanh toán MoMo thành công, đơn hàng đã được xác nhận",
			}); err != nil {
				return nil, false, err
			}
			fields.Status = string(domain.OrderStatusConfirmed)
			fields.PaymentStatus = string(domain.PaymentStatusPaid)
			fields.PaymentTransactionID = txID
			if !fields.ConfirmedAt.Valid {
				fields.ConfirmedAt = pgtype.Timestamptz{Time: now, Valid: true}
			}
			if !fields.PaidAt.Valid {
				fields.PaidAt = pgtype.Timestamptz{Time: now, Valid: true}
			}
			fields.UpdatedAt = now
			justPaid = true
		} else if curPayStatus == domain.PaymentStatusPending {
			if err := q.SetOrderPaymentFailed(ctx, orderID); err != nil {
				return nil, false, err
			}
			fields.PaymentStatus = string(domain.PaymentStatusFailed)
			fields.UpdatedAt = now
		}
	}

	eventRows, err := q.ListOrderStatusEventsByOrderID(ctx, orderID)
	if err != nil {
		return nil, false, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, false, err
	}

	return mapOrderFromFields(fields, mapOrderItems(itemRows), mapOrderTimelineEvents(eventRows)), justPaid, nil
}

func (r *OrderRepository) AutoCancelExpiredMomoOrders(ctx context.Context, cutoff time.Time) ([]domain.AutoConfirmedOrder, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)
	expiredRows, err := q.LockExpiredMomoOrders(ctx, cutoff)
	if err != nil {
		return nil, err
	}
	if len(expiredRows) == 0 {
		return []domain.AutoConfirmedOrder{}, nil
	}

	expiredOrderIDs := make([]string, len(expiredRows))
	for i, row := range expiredRows {
		expiredOrderIDs[i] = row.ID
	}

	// Phases 1-3 across the entire batch strictly match createOrderInternal lock order:
	// product_variants (VariantID ASC) -> vouchers (VoucherID ASC) -> live_variant_prices -> flash_sale_items
	if err := restoreCancelledOrdersResources(ctx, q, expiredOrderIDs); err != nil {
		return nil, err
	}

	// Phase 4: update order status & insert order_status_events ('cancelled', 'system')
	now := time.Now().UTC()
	out := make([]domain.AutoConfirmedOrder, 0, len(expiredRows))
	for _, row := range expiredRows {
		if err := q.MarkOrderMomoExpiredCancelled(ctx, sqlc.MarkOrderMomoExpiredCancelledParams{
			ID:          row.ID,
			CancelledAt: now,
		}); err != nil {
			return nil, err
		}
		if err := q.InsertOrderStatusEvent(ctx, sqlc.InsertOrderStatusEventParams{
			OrderID:   row.ID,
			Status:    string(domain.OrderStatusCancelled),
			ActorType: string(domain.OrderActorSystem),
			Note:      "Hệ thống tự động hủy đơn MoMo quá hạn thanh toán",
		}); err != nil {
			return nil, err
		}
		out = append(out, domain.AutoConfirmedOrder{
			ID:       row.ID,
			UserID:   row.UserID,
			TotalVND: domain.MoneyVND(row.TotalVnd),
		})
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return out, nil
}
