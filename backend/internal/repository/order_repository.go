package repository

import (
	"context"
	"encoding/json"
	"errors"
	"math/big"
	"strings"
	"time"

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
	TotalVnd             string
	RecipientName        string
	Phone                string
	ProvinceName         string
	WardName             string
	DetailAddress        string
	CreatedAt            time.Time
	UpdatedAt            time.Time
	ConfirmedAt          pgtype.Timestamptz
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

func mapOrderFromFields(row orderRowFields, items []domain.OrderItem) *domain.Order {
	if items == nil {
		items = []domain.OrderItem{}
	}
	payStatus := domain.PaymentStatus(row.PaymentStatus)
	if payStatus == "" {
		payStatus = domain.PaymentStatusPending
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
		TotalVND:             domain.MoneyVND(row.TotalVnd),
		ShippingInfo: domain.ShippingInfo{
			RecipientName: row.RecipientName,
			Phone:         row.Phone,
			ProvinceName:  row.ProvinceName,
			WardName:      row.WardName,
			DetailAddress: row.DetailAddress,
		},
		Items:       items,
		CreatedAt:   row.CreatedAt,
		UpdatedAt:   row.UpdatedAt,
		ConfirmedAt: pgTimePtr(row.ConfirmedAt),
		CancelledAt: pgTimePtr(row.CancelledAt),
		DeliveredAt: pgTimePtr(row.DeliveredAt),
	}
}

func (r *OrderRepository) Create(ctx context.Context, userID string, addressID string, lines []domain.OrderLineInput, shippingFeeVND domain.MoneyVND) (*domain.Order, error) {
	return r.CreateWithPaymentMethod(ctx, userID, addressID, lines, shippingFeeVND, domain.PaymentMethodCOD)
}

func (r *OrderRepository) CreateWithPaymentMethod(ctx context.Context, userID, addressID string, lines []domain.OrderLineInput, shippingFeeVND domain.MoneyVND, paymentMethod string) (*domain.Order, error) {
	if paymentMethod == "" {
		paymentMethod = domain.PaymentMethodCOD
	}
	if paymentMethod != domain.PaymentMethodCOD && paymentMethod != domain.PaymentMethodMomo {
		return nil, domain.NewValidationError(map[string]string{"paymentMethod": "Phương thức thanh toán không hợp lệ"})
	}
	if len(lines) == 0 {
		return nil, domain.ErrCartEmpty
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)

	// 1. Lock user
	if _, err := q.LockUser(ctx, userID); err != nil {
		return nil, mapNotFound(err, domain.ErrNotFound)
	}

	// 2. Lock submitted cart items and variants
	variantIDs := make([]string, len(lines))
	for i, l := range lines {
		variantIDs[i] = l.VariantID
	}

	lockedRows, err := q.LockSubmittedCartItems(ctx, sqlc.LockSubmittedCartItemsParams{
		UserID:     userID,
		VariantIds: variantIDs,
	})
	if err != nil {
		return nil, err
	}

	// 3. Reconcile cart & refresh snapshots
	if err := q.ReconcileCart(ctx, userID); err != nil {
		return nil, err
	}
	if err := q.RefreshCartSnapshots(ctx, userID); err != nil {
		return nil, err
	}

	// 4. Classify submitted lines
	lockedMap := make(map[string]sqlc.LockSubmittedCartItemsRow, len(lockedRows))
	for _, row := range lockedRows {
		lockedMap[row.VariantID] = row
	}

	// First check: stock/activity issues (take precedence, out_of_stock/stock_limit error, not product_changed)
	for _, line := range lines {
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

	// Second check: missing items, unselected items, or drift
	var changedProducts []string
	for _, line := range lines {
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
		for _, p := range changedProducts {
			if !seen[p] {
				seen[p] = true
				deduped = append(deduped, p)
			}
		}
		return nil, domain.NewProductChangedError(deduped)
	}

	// 4b. Calculate subtotal & total and check MoMo amount limits before mutating quota/stock/cart
	var subtotal domain.MoneyVND = "0"
	for _, line := range lines {
		row := lockedMap[line.VariantID]
		lineTotal := new(big.Int).Mul(numericInt(row.PriceVnd), big.NewInt(line.Quantity)).String()
		subtotal, err = domain.AddMoneyVND(subtotal, domain.MoneyVND(lineTotal))
		if err != nil {
			return nil, err
		}
	}

	if !shippingFeeVND.IsCanonical() {
		shippingFeeVND = "0"
	}
	total, err := domain.AddMoneyVND(subtotal, shippingFeeVND)
	if err != nil {
		return nil, err
	}

	if paymentMethod == domain.PaymentMethodMomo {
		totalInt := numericInt(string(total))
		if totalInt.Cmp(big.NewInt(domain.MomoMinAmountVND)) < 0 || totalInt.Cmp(big.NewInt(domain.MomoMaxAmountVND)) > 0 {
			return nil, domain.ErrMomoAmountOutOfRange
		}
	}

	// 4c. Consume live-price quota for lines priced by a live session
	for _, line := range lines {
		row := lockedMap[line.VariantID]
		if row.LiveSessionID == "" {
			continue
		}
		if err := consumeLiveQuota(ctx, q, row.LiveSessionID, row.VariantID, row.ProductName, line.Quantity); err != nil {
			return nil, err
		}
	}

	// 5. Get address snapshot
	addr, err := q.GetAddressByID(ctx, sqlc.GetAddressByIDParams{
		ID:     addressID,
		UserID: userID,
	})
	if err != nil {
		return nil, mapNotFound(err, domain.ErrAddressNotFound)
	}

	// 6. Insert order
	orderRow, err := q.InsertOrder(ctx, sqlc.InsertOrderParams{
		UserID:         userID,
		Status:         string(domain.OrderStatusPendingConfirmation),
		PaymentMethod:  paymentMethod,
		PaymentStatus:  string(domain.PaymentStatusPending),
		SubtotalVnd:    toNumeric(string(subtotal)),
		ShippingFeeVnd: toNumeric(string(shippingFeeVND)),
		TotalVnd:       toNumeric(string(total)),
		RecipientName:  addr.RecipientName,
		Phone:          addr.Phone,
		ProvinceName:   addr.ProvinceName,
		WardName:       addr.WardName,
		DetailAddress:  addr.DetailAddress,
	})
	if err != nil {
		return nil, err
	}

	// 7. Insert order items
	orderItems := make([]domain.OrderItem, 0, len(lines))
	for _, line := range lines {
		row := lockedMap[line.VariantID]
		lineTotal := new(big.Int).Mul(numericInt(row.PriceVnd), big.NewInt(line.Quantity)).String()

		var liveSessionID pgtype.UUID
		if row.LiveSessionID != "" {
			if err := liveSessionID.Scan(row.LiveSessionID); err != nil {
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

	// 8. Decrement variant stock
	for _, line := range lines {
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

	// 9. Remove selected cart items
	if err := q.RemoveSelectedCartItems(ctx, userID); err != nil {
		return nil, err
	}

	// 10. Commit transaction
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
		TotalVnd:             orderRow.TotalVnd,
		RecipientName:        orderRow.RecipientName,
		Phone:                orderRow.Phone,
		ProvinceName:         orderRow.ProvinceName,
		WardName:             orderRow.WardName,
		DetailAddress:        orderRow.DetailAddress,
		CreatedAt:            orderRow.CreatedAt,
		UpdatedAt:            orderRow.UpdatedAt,
		ConfirmedAt:          orderRow.ConfirmedAt,
		CancelledAt:          orderRow.CancelledAt,
		DeliveredAt:          orderRow.DeliveredAt,
	}, orderItems), nil
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
		TotalVnd:             orderRow.TotalVnd,
		RecipientName:        orderRow.RecipientName,
		Phone:                orderRow.Phone,
		ProvinceName:         orderRow.ProvinceName,
		WardName:             orderRow.WardName,
		DetailAddress:        orderRow.DetailAddress,
		CreatedAt:            orderRow.CreatedAt,
		UpdatedAt:            orderRow.UpdatedAt,
		ConfirmedAt:          orderRow.ConfirmedAt,
		CancelledAt:          orderRow.CancelledAt,
		DeliveredAt:          orderRow.DeliveredAt,
	}, items), nil
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
				TotalVnd:             row.TotalVnd,
				RecipientName:        row.RecipientName,
				Phone:                row.Phone,
				ProvinceName:         row.ProvinceName,
				WardName:             row.WardName,
				DetailAddress:        row.DetailAddress,
				CreatedAt:            row.CreatedAt,
				UpdatedAt:            row.UpdatedAt,
				ConfirmedAt:          row.ConfirmedAt,
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
			TotalVnd:             row.TotalVnd,
			RecipientName:        row.RecipientName,
			Phone:                row.Phone,
			ProvinceName:         row.ProvinceName,
			WardName:             row.WardName,
			DetailAddress:        row.DetailAddress,
			CreatedAt:            row.CreatedAt,
			UpdatedAt:            row.UpdatedAt,
			ConfirmedAt:          row.ConfirmedAt,
			CancelledAt:          row.CancelledAt,
			DeliveredAt:          row.DeliveredAt,
		}, itemsByOrderID[row.ID])
		orders[i] = *mapped
	}

	return orders, nil
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
	var confirmedAt pgtype.Timestamptz = orderRow.ConfirmedAt

	switch domain.OrderStatus(orderRow.Status) {
	case domain.OrderStatusPendingConfirmation, domain.OrderStatusConfirmed:
		newStatus = domain.OrderStatusCancelled
		cancelledAt = pgtype.Timestamptz{Time: now, Valid: true}

		itemRows, err := q.ListOrderItemsByOrderID(ctx, orderID)
		if err != nil {
			return nil, err
		}
		for _, item := range itemRows {
			if err := q.IncrementVariantStock(ctx, sqlc.IncrementVariantStockParams{
				ID:       item.VariantID,
				Quantity: item.Quantity,
			}); err != nil {
				return nil, err
			}
		}
		if err := q.RestoreLiveQuotaForOrder(ctx, orderID); err != nil {
			return nil, err
		}

	case domain.OrderStatusPreparing:
		newStatus = domain.OrderStatusCancelRequested
		cancelledAt = orderRow.CancelledAt

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
		TotalVnd:             orderRow.TotalVnd,
		RecipientName:        orderRow.RecipientName,
		Phone:                orderRow.Phone,
		ProvinceName:         orderRow.ProvinceName,
		WardName:             orderRow.WardName,
		DetailAddress:        orderRow.DetailAddress,
		CreatedAt:            orderRow.CreatedAt,
		UpdatedAt:            now,
		ConfirmedAt:          confirmedAt,
		CancelledAt:          cancelledAt,
		DeliveredAt:          orderRow.DeliveredAt,
	}, items), nil
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

	itemRows, err := q.ListOrderItemsByOrderID(ctx, orderID)
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
		TotalVnd:             orderRow.TotalVnd,
		RecipientName:        orderRow.RecipientName,
		Phone:                orderRow.Phone,
		ProvinceName:         orderRow.ProvinceName,
		WardName:             orderRow.WardName,
		DetailAddress:        orderRow.DetailAddress,
		CreatedAt:            orderRow.CreatedAt,
		UpdatedAt:            now,
		ConfirmedAt:          orderRow.ConfirmedAt,
		CancelledAt:          orderRow.CancelledAt,
		DeliveredAt:          orderRow.DeliveredAt,
	}, items), nil
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
			TotalVnd:             row.TotalVnd,
			RecipientName:        row.RecipientName,
			Phone:                row.Phone,
			ProvinceName:         row.ProvinceName,
			WardName:             row.WardName,
			DetailAddress:        row.DetailAddress,
			CreatedAt:            row.CreatedAt,
			UpdatedAt:            row.UpdatedAt,
			ConfirmedAt:          row.ConfirmedAt,
			CancelledAt:          row.CancelledAt,
			DeliveredAt:          row.DeliveredAt,
		}, itemsByOrderID[row.ID])
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
		TotalVnd:             orderRow.TotalVnd,
		RecipientName:        orderRow.RecipientName,
		Phone:                orderRow.Phone,
		ProvinceName:         orderRow.ProvinceName,
		WardName:             orderRow.WardName,
		DetailAddress:        orderRow.DetailAddress,
		CreatedAt:            orderRow.CreatedAt,
		UpdatedAt:            orderRow.UpdatedAt,
		ConfirmedAt:          orderRow.ConfirmedAt,
		CancelledAt:          orderRow.CancelledAt,
		DeliveredAt:          orderRow.DeliveredAt,
	}, items), nil
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

	if restock {
		itemRows, err := q.ListOrderItemsByOrderID(ctx, orderID)
		if err != nil {
			return nil, err
		}
		for _, item := range itemRows {
			if err := q.IncrementVariantStock(ctx, sqlc.IncrementVariantStockParams{
				ID:       item.VariantID,
				Quantity: item.Quantity,
			}); err != nil {
				return nil, err
			}
		}
	}
	if to == domain.OrderStatusCancelled {
		if err := q.RestoreLiveQuotaForOrder(ctx, orderID); err != nil {
			return nil, err
		}
	}

	now := time.Now().UTC()
	cancelledAt := orderRow.CancelledAt
	if to == domain.OrderStatusCancelled {
		cancelledAt = pgtype.Timestamptz{Time: now, Valid: true}
	}
	confirmedAt := orderRow.ConfirmedAt
	deliveredAt := orderRow.DeliveredAt
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
		TotalVnd:             orderRow.TotalVnd,
		RecipientName:        orderRow.RecipientName,
		Phone:                orderRow.Phone,
		ProvinceName:         orderRow.ProvinceName,
		WardName:             orderRow.WardName,
		DetailAddress:        orderRow.DetailAddress,
		CreatedAt:            orderRow.CreatedAt,
		UpdatedAt:            now,
		ConfirmedAt:          confirmedAt,
		CancelledAt:          cancelledAt,
		DeliveredAt:          deliveredAt,
	}, items), nil
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
		TotalVnd:             orderRow.TotalVnd,
		RecipientName:        orderRow.RecipientName,
		Phone:                orderRow.Phone,
		ProvinceName:         orderRow.ProvinceName,
		WardName:             orderRow.WardName,
		DetailAddress:        orderRow.DetailAddress,
		CreatedAt:            orderRow.CreatedAt,
		UpdatedAt:            updatedAt,
		ConfirmedAt:          orderRow.ConfirmedAt,
		CancelledAt:          orderRow.CancelledAt,
		DeliveredAt:          orderRow.DeliveredAt,
	}, mapOrderItems(itemRows)), nil
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
		TotalVnd:             orderRow.TotalVnd,
		RecipientName:        orderRow.RecipientName,
		Phone:                orderRow.Phone,
		ProvinceName:         orderRow.ProvinceName,
		WardName:             orderRow.WardName,
		DetailAddress:        orderRow.DetailAddress,
		CreatedAt:            orderRow.CreatedAt,
		UpdatedAt:            orderRow.UpdatedAt,
		ConfirmedAt:          orderRow.ConfirmedAt,
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

	if err := tx.Commit(ctx); err != nil {
		return nil, false, err
	}

	return mapOrderFromFields(fields, mapOrderItems(itemRows)), justPaid, nil
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

	now := time.Now().UTC()
	out := make([]domain.AutoConfirmedOrder, 0, len(expiredRows))
	for _, row := range expiredRows {
		itemRows, err := q.ListOrderItemsByOrderID(ctx, row.ID)
		if err != nil {
			return nil, err
		}
		for _, item := range itemRows {
			if err := q.IncrementVariantStock(ctx, sqlc.IncrementVariantStockParams{
				ID:       item.VariantID,
				Quantity: item.Quantity,
			}); err != nil {
				return nil, err
			}
		}
		if err := q.RestoreLiveQuotaForOrder(ctx, row.ID); err != nil {
			return nil, err
		}
		if err := q.MarkOrderMomoExpiredCancelled(ctx, sqlc.MarkOrderMomoExpiredCancelledParams{
			ID:          row.ID,
			CancelledAt: now,
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
