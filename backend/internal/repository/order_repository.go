package repository

import (
	"context"
	"encoding/json"
	"errors"
	"math/big"
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

func (r *OrderRepository) Create(ctx context.Context, userID string, addressID string, lines []domain.OrderLineInput, shippingFeeVND domain.MoneyVND) (*domain.Order, error) {
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

	// 5. Get address snapshot
	addr, err := q.GetAddressByID(ctx, sqlc.GetAddressByIDParams{
		ID:     addressID,
		UserID: userID,
	})
	if err != nil {
		return nil, mapNotFound(err, domain.ErrAddressNotFound)
	}

	// 6. Calculate subtotal & total
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

	// 7. Insert order
	orderRow, err := q.InsertOrder(ctx, sqlc.InsertOrderParams{
		UserID:         userID,
		Status:         string(domain.OrderStatusPendingConfirmation),
		PaymentMethod:  domain.PaymentMethodCOD,
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

	// 8. Insert order items
	orderItems := make([]domain.OrderItem, 0, len(lines))
	for _, line := range lines {
		row := lockedMap[line.VariantID]
		lineTotal := new(big.Int).Mul(numericInt(row.PriceVnd), big.NewInt(line.Quantity)).String()

		err := q.InsertOrderItem(ctx, sqlc.InsertOrderItemParams{
			OrderID:      orderRow.ID,
			VariantID:    row.VariantID,
			ProductID:    row.ProductID,
			BrandName:    row.BrandName,
			ProductName:  row.ProductName,
			Model:        row.Model,
			ImageUrl:     row.ImageUrl,
			Options:      []byte(row.Options),
			UnitPriceVnd: toNumeric(row.PriceVnd),
			Quantity:     line.Quantity,
			LineTotalVnd: toNumeric(lineTotal),
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

	// 9. Decrement variant stock
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

	// 10. Remove selected cart items
	if err := q.RemoveSelectedCartItems(ctx, userID); err != nil {
		return nil, err
	}

	// 11. Commit transaction
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	order := &domain.Order{
		ID:             orderRow.ID,
		UserID:         orderRow.UserID,
		Status:         domain.OrderStatus(orderRow.Status),
		PaymentMethod:  orderRow.PaymentMethod,
		SubtotalVND:    domain.MoneyVND(orderRow.SubtotalVnd),
		ShippingFeeVND: domain.MoneyVND(orderRow.ShippingFeeVnd),
		TotalVND:       domain.MoneyVND(orderRow.TotalVnd),
		ShippingInfo: domain.ShippingInfo{
			RecipientName: orderRow.RecipientName,
			Phone:         orderRow.Phone,
			ProvinceName:  orderRow.ProvinceName,
			WardName:      orderRow.WardName,
			DetailAddress: orderRow.DetailAddress,
		},
		Items:     orderItems,
		CreatedAt: orderRow.CreatedAt,
		UpdatedAt: orderRow.UpdatedAt,
	}
	if orderRow.ConfirmedAt.Valid {
		t := orderRow.ConfirmedAt.Time
		order.ConfirmedAt = &t
	}
	if orderRow.CancelledAt.Valid {
		t := orderRow.CancelledAt.Time
		order.CancelledAt = &t
	}

	return order, nil
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

	items := make([]domain.OrderItem, len(itemRows))
	for i, row := range itemRows {
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

	order := &domain.Order{
		ID:             orderRow.ID,
		UserID:         orderRow.UserID,
		Status:         domain.OrderStatus(orderRow.Status),
		PaymentMethod:  orderRow.PaymentMethod,
		SubtotalVND:    domain.MoneyVND(orderRow.SubtotalVnd),
		ShippingFeeVND: domain.MoneyVND(orderRow.ShippingFeeVnd),
		TotalVND:       domain.MoneyVND(orderRow.TotalVnd),
		ShippingInfo: domain.ShippingInfo{
			RecipientName: orderRow.RecipientName,
			Phone:         orderRow.Phone,
			ProvinceName:  orderRow.ProvinceName,
			WardName:      orderRow.WardName,
			DetailAddress: orderRow.DetailAddress,
		},
		Items:     items,
		CreatedAt: orderRow.CreatedAt,
		UpdatedAt: orderRow.UpdatedAt,
	}
	if orderRow.ConfirmedAt.Valid {
		t := orderRow.ConfirmedAt.Time
		order.ConfirmedAt = &t
	}
	if orderRow.CancelledAt.Valid {
		t := orderRow.CancelledAt.Time
		order.CancelledAt = &t
	}

	return order, nil
}

func (r *OrderRepository) ListByUser(ctx context.Context, userID string, bucket domain.OrderStatusBucket) ([]domain.Order, error) {
	if _, err := uuid.Parse(userID); err != nil {
		return []domain.Order{}, nil
	}

	statuses := bucket.Statuses()
	var statusStrings []string
	if len(statuses) > 0 {
		statusStrings = make([]string, len(statuses))
		for i, s := range statuses {
			statusStrings[i] = string(s)
		}
	}

	q := sqlc.New(r.db)
	orderRows, err := q.ListOrdersByUser(ctx, sqlc.ListOrdersByUserParams{
		UserID:   userID,
		Statuses: statusStrings,
	})
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
		items := itemsByOrderID[row.ID]
		if items == nil {
			items = []domain.OrderItem{}
		}

		orders[i] = domain.Order{
			ID:             row.ID,
			UserID:         row.UserID,
			Status:         domain.OrderStatus(row.Status),
			PaymentMethod:  row.PaymentMethod,
			SubtotalVND:    domain.MoneyVND(row.SubtotalVnd),
			ShippingFeeVND: domain.MoneyVND(row.ShippingFeeVnd),
			TotalVND:       domain.MoneyVND(row.TotalVnd),
			ShippingInfo: domain.ShippingInfo{
				RecipientName: row.RecipientName,
				Phone:         row.Phone,
				ProvinceName:  row.ProvinceName,
				WardName:      row.WardName,
				DetailAddress: row.DetailAddress,
			},
			Items:     items,
			CreatedAt: row.CreatedAt,
			UpdatedAt: row.UpdatedAt,
		}
		if row.ConfirmedAt.Valid {
			t := row.ConfirmedAt.Time
			orders[i].ConfirmedAt = &t
		}
		if row.CancelledAt.Valid {
			t := row.CancelledAt.Time
			orders[i].CancelledAt = &t
		}
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
		case domain.OrderStatusDelivered:
			stats.AwaitingReview += count
		}
	}

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

	items := make([]domain.OrderItem, len(itemRows))
	for i, row := range itemRows {
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

	order := &domain.Order{
		ID:             orderRow.ID,
		UserID:         orderRow.UserID,
		Status:         newStatus,
		PaymentMethod:  orderRow.PaymentMethod,
		SubtotalVND:    domain.MoneyVND(orderRow.SubtotalVnd),
		ShippingFeeVND: domain.MoneyVND(orderRow.ShippingFeeVnd),
		TotalVND:       domain.MoneyVND(orderRow.TotalVnd),
		ShippingInfo: domain.ShippingInfo{
			RecipientName: orderRow.RecipientName,
			Phone:         orderRow.Phone,
			ProvinceName:  orderRow.ProvinceName,
			WardName:      orderRow.WardName,
			DetailAddress: orderRow.DetailAddress,
		},
		Items:     items,
		CreatedAt: orderRow.CreatedAt,
		UpdatedAt: now,
	}
	if confirmedAt.Valid {
		t := confirmedAt.Time
		order.ConfirmedAt = &t
	}
	if cancelledAt.Valid {
		t := cancelledAt.Time
		order.CancelledAt = &t
	}

	return order, nil
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

	items := make([]domain.OrderItem, len(itemRows))
	for i, row := range itemRows {
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

	order := &domain.Order{
		ID:             orderRow.ID,
		UserID:         orderRow.UserID,
		Status:         newStatus,
		PaymentMethod:  orderRow.PaymentMethod,
		SubtotalVND:    domain.MoneyVND(orderRow.SubtotalVnd),
		ShippingFeeVND: domain.MoneyVND(orderRow.ShippingFeeVnd),
		TotalVND:       domain.MoneyVND(orderRow.TotalVnd),
		ShippingInfo: domain.ShippingInfo{
			RecipientName: orderRow.RecipientName,
			Phone:         orderRow.Phone,
			ProvinceName:  orderRow.ProvinceName,
			WardName:      orderRow.WardName,
			DetailAddress: orderRow.DetailAddress,
		},
		Items:     items,
		CreatedAt: orderRow.CreatedAt,
		UpdatedAt: now,
	}
	if orderRow.ConfirmedAt.Valid {
		t := orderRow.ConfirmedAt.Time
		order.ConfirmedAt = &t
	}
	if orderRow.CancelledAt.Valid {
		t := orderRow.CancelledAt.Time
		order.CancelledAt = &t
	}

	return order, nil
}

func (r *OrderRepository) AutoConfirmDue(ctx context.Context, cutoff time.Time) error {
	q := sqlc.New(r.db)
	return q.AutoConfirmDueOrders(ctx, cutoff)
}
