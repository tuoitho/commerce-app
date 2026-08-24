package repository

import (
	"context"
	"errors"
	"math/big"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

type ReturnRepository struct {
	db orderDB
}

func NewReturnRepository(db orderDB) *ReturnRepository {
	return &ReturnRepository{db: db}
}

var _ domain.ReturnRepository = (*ReturnRepository)(nil)

func adminUUIDFromString(s string) pgtype.UUID {
	id, err := uuid.Parse(s)
	if err != nil {
		return pgtype.UUID{}
	}
	return pgtype.UUID{Bytes: id, Valid: true}
}

func mapTimestamptzPtr(v pgtype.Timestamptz) *time.Time {
	if !v.Valid {
		return nil
	}
	t := v.Time
	return &t
}

func computeSuggestedRefund(items []domain.ReturnRequestItem, shippingFeeVND domain.MoneyVND, hasRefunded bool) domain.MoneyVND {
	total := new(big.Int)
	for _, item := range items {
		total.Add(total, new(big.Int).Mul(numericInt(string(item.UnitPriceVND)), big.NewInt(item.Quantity)))
	}
	if !hasRefunded {
		total.Add(total, numericInt(string(shippingFeeVND)))
	}
	return domain.MoneyVND(total.String())
}

func (r *ReturnRepository) Create(ctx context.Context, userID, orderID, reasonCode, description string, items []domain.ReturnItemInput) (*domain.ReturnRequest, error) {
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

	switch domain.OrderStatus(orderRow.Status) {
	case domain.OrderStatusDelivered, domain.OrderStatusReturned:
	default:
		return nil, domain.ErrReturnNotAllowed
	}

	if !orderRow.DeliveredAt.Valid || time.Now().UTC().After(orderRow.DeliveredAt.Time.Add(domain.ReturnWindowDays*24*time.Hour)) {
		return nil, domain.ErrReturnWindowExpired
	}

	openCount, err := q.CountOpenReturnRequests(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if openCount > 0 {
		return nil, domain.ErrReturnRequestExists
	}

	itemRows, err := q.ListOrderItemsByOrderID(ctx, orderID)
	if err != nil {
		return nil, err
	}
	purchased := make(map[string]int64, len(itemRows))
	for _, row := range itemRows {
		purchased[row.ID] = row.Quantity
	}

	consumedRows, err := q.SumConsumedQuantitiesByOrder(ctx, orderID)
	if err != nil {
		return nil, err
	}
	consumed := make(map[string]int64, len(consumedRows))
	for _, row := range consumedRows {
		consumed[row.OrderItemID] = row.ConsumedQuantity
	}

	merged := make(map[string]int64, len(items))
	var mergedOrder []string
	for _, item := range items {
		if _, ok := purchased[item.OrderItemID]; !ok {
			return nil, domain.ErrReturnItemLimitExceeded
		}
		if _, seen := merged[item.OrderItemID]; !seen {
			mergedOrder = append(mergedOrder, item.OrderItemID)
		}
		merged[item.OrderItemID] += item.Quantity
	}

	for _, orderItemID := range mergedOrder {
		if merged[orderItemID]+consumed[orderItemID] > purchased[orderItemID] {
			return nil, domain.ErrReturnItemLimitExceeded
		}
	}

	requestRow, err := q.InsertReturnRequest(ctx, sqlc.InsertReturnRequestParams{
		OrderID:     orderID,
		UserID:      userID,
		ReasonCode:  reasonCode,
		Description: description,
	})
	if err != nil {
		return nil, err
	}

	for _, orderItemID := range mergedOrder {
		if err := q.InsertReturnRequestItem(ctx, sqlc.InsertReturnRequestItemParams{
			ReturnRequestID: requestRow.ID,
			OrderItemID:     orderItemID,
			Quantity:        merged[orderItemID],
		}); err != nil {
			return nil, err
		}
	}

	itemsByRequest, err := loadReturnItems(ctx, q, []string{requestRow.ID})
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	request := returnRequestFromInsertRow(requestRow)
	request.Items = itemsByRequest[requestRow.ID]
	return request, nil
}

func (r *ReturnRepository) ListByOrder(ctx context.Context, userID, orderID string) ([]domain.ReturnRequest, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, domain.ErrOrderNotFound
	}
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrOrderNotFound
	}

	q := sqlc.New(r.db)
	if _, err := q.GetOrderByID(ctx, sqlc.GetOrderByIDParams{
		ID:     orderID,
		UserID: userID,
	}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrOrderNotFound
		}
		return nil, err
	}

	rows, err := q.ListReturnRequestsByOrder(ctx, sqlc.ListReturnRequestsByOrderParams{
		OrderID: orderID,
		UserID:  userID,
	})
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return []domain.ReturnRequest{}, nil
	}

	requestIDs := make([]string, len(rows))
	for i, row := range rows {
		requestIDs[i] = row.ID
	}
	itemsByRequest, err := loadReturnItems(ctx, q, requestIDs)
	if err != nil {
		return nil, err
	}

	requests := make([]domain.ReturnRequest, len(rows))
	for i, row := range rows {
		requests[i] = domain.ReturnRequest{
			ID:              row.ID,
			OrderID:         row.OrderID,
			UserID:          row.UserID,
			Status:          domain.ReturnRequestStatus(row.Status),
			ReasonCode:      domain.ReturnReasonCode(row.ReasonCode),
			Description:     row.Description,
			RejectReason:    row.RejectReason,
			RefundAmountVND: domain.MoneyVND(row.RefundAmountVnd),
			CreatedAt:       row.CreatedAt,
			UpdatedAt:       row.UpdatedAt,
			ApprovedAt:      mapTimestamptzPtr(row.ApprovedAt),
			RejectedAt:      mapTimestamptzPtr(row.RejectedAt),
			ReceivedAt:      mapTimestamptzPtr(row.ReceivedAt),
			RefundedAt:      mapTimestamptzPtr(row.RefundedAt),
			CancelledAt:     mapTimestamptzPtr(row.CancelledAt),
		}
		requests[i].Items = itemsByRequest[row.ID]
	}

	return requests, nil
}

func (r *ReturnRepository) CancelByCustomer(ctx context.Context, userID, requestID string) (*domain.ReturnRequest, error) {
	if _, err := uuid.Parse(requestID); err != nil {
		return nil, domain.ErrReturnNotFound
	}
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrReturnNotFound
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)

	row, err := q.LockReturnRequestForUser(ctx, sqlc.LockReturnRequestForUserParams{
		ID:     requestID,
		UserID: userID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrReturnNotFound
		}
		return nil, err
	}

	if domain.ReturnRequestStatus(row.Status) != domain.ReturnStatusPendingApproval {
		return nil, domain.ErrReturnActionNotAllowed
	}

	if err := q.CancelReturnRequest(ctx, requestID); err != nil {
		return nil, err
	}

	itemsByRequest, err := loadReturnItems(ctx, q, []string{requestID})
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	request := returnRequestFromUserLockRow(row)
	request.Status = domain.ReturnStatusCancelled
	request.CancelledAt = &now
	request.Items = itemsByRequest[requestID]
	return request, nil
}

func (r *ReturnRepository) ListByAdmin(ctx context.Context, statuses []string) ([]domain.ReturnRequest, error) {
	q := sqlc.New(r.db)
	rows, err := q.ListReturnRequestsByAdmin(ctx, statuses)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return []domain.ReturnRequest{}, nil
	}

	requestIDs := make([]string, len(rows))
	orderHasRefunded := make(map[string]bool, len(rows))
	for i, row := range rows {
		requestIDs[i] = row.ID
		orderHasRefunded[row.OrderID] = false
	}
	itemsByRequest, err := loadReturnItems(ctx, q, requestIDs)
	if err != nil {
		return nil, err
	}

	orderIDs := make([]string, 0, len(orderHasRefunded))
	for orderID := range orderHasRefunded {
		orderIDs = append(orderIDs, orderID)
	}
	refundedOrderIDs, err := q.ListOrderIDsWithRefundedRequests(ctx, orderIDs)
	if err != nil {
		return nil, err
	}
	for _, orderID := range refundedOrderIDs {
		orderHasRefunded[orderID] = true
	}

	requests := make([]domain.ReturnRequest, len(rows))
	for i, row := range rows {
		requests[i] = domain.ReturnRequest{
			ID:              row.ID,
			OrderID:         row.OrderID,
			UserID:          row.UserID,
			Status:          domain.ReturnRequestStatus(row.Status),
			ReasonCode:      domain.ReturnReasonCode(row.ReasonCode),
			Description:     row.Description,
			RejectReason:    row.RejectReason,
			RefundAmountVND: domain.MoneyVND(row.RefundAmountVnd),
			CreatedAt:       row.CreatedAt,
			UpdatedAt:       row.UpdatedAt,
			ApprovedAt:      mapTimestamptzPtr(row.ApprovedAt),
			RejectedAt:      mapTimestamptzPtr(row.RejectedAt),
			ReceivedAt:      mapTimestamptzPtr(row.ReceivedAt),
			RefundedAt:      mapTimestamptzPtr(row.RefundedAt),
			CancelledAt:     mapTimestamptzPtr(row.CancelledAt),
			BuyerEmail:      row.BuyerEmail,
			OrderTotalVND:   domain.MoneyVND(row.TotalVnd),
			ShippingFeeVND:  domain.MoneyVND(row.ShippingFeeVnd),
		}
		requests[i].Items = itemsByRequest[row.ID]
		requests[i].SuggestedRefundVND = computeSuggestedRefund(requests[i].Items, domain.MoneyVND(row.ShippingFeeVnd), orderHasRefunded[row.OrderID])
	}

	return requests, nil
}

func (r *ReturnRepository) GetByAdminID(ctx context.Context, requestID string) (*domain.ReturnRequest, error) {
	if _, err := uuid.Parse(requestID); err != nil {
		return nil, domain.ErrReturnNotFound
	}

	q := sqlc.New(r.db)
	row, err := q.GetReturnRequestByAdminID(ctx, requestID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrReturnNotFound
		}
		return nil, err
	}

	itemRows, err := q.ListReturnRequestItemsByRequestIDs(ctx, []string{requestID})
	if err != nil {
		return nil, err
	}

	items := make([]domain.ReturnRequestItem, len(itemRows))
	for i, item := range itemRows {
		items[i] = domain.ReturnRequestItem{
			ID:           item.ID,
			RequestID:    item.ReturnRequestID,
			OrderItemID:  item.OrderItemID,
			ProductName:  item.ProductName,
			ImageURL:     item.ImageUrl,
			UnitPriceVND: domain.MoneyVND(item.UnitPriceVnd),
			Quantity:     item.Quantity,
		}
	}

	hasRefunded, err := q.HasRefundedReturnRequest(ctx, row.OrderID)
	if err != nil {
		return nil, err
	}

	request := &domain.ReturnRequest{
		ID:                 row.ID,
		OrderID:            row.OrderID,
		UserID:             row.UserID,
		Status:             domain.ReturnRequestStatus(row.Status),
		ReasonCode:         domain.ReturnReasonCode(row.ReasonCode),
		Description:        row.Description,
		RejectReason:       row.RejectReason,
		RefundAmountVND:    domain.MoneyVND(row.RefundAmountVnd),
		Items:              items,
		CreatedAt:          row.CreatedAt,
		UpdatedAt:          row.UpdatedAt,
		ApprovedAt:         mapTimestamptzPtr(row.ApprovedAt),
		RejectedAt:         mapTimestamptzPtr(row.RejectedAt),
		ReceivedAt:         mapTimestamptzPtr(row.ReceivedAt),
		RefundedAt:         mapTimestamptzPtr(row.RefundedAt),
		CancelledAt:        mapTimestamptzPtr(row.CancelledAt),
		BuyerEmail:         row.BuyerEmail,
		OrderTotalVND:      domain.MoneyVND(row.TotalVnd),
		ShippingFeeVND:     domain.MoneyVND(row.ShippingFeeVnd),
		SuggestedRefundVND: computeSuggestedRefund(items, domain.MoneyVND(row.ShippingFeeVnd), hasRefunded),
	}

	return request, nil
}

func (r *ReturnRepository) transitionAdmin(ctx context.Context, requestID string, requiredStatus domain.ReturnRequestStatus, exec func(q *sqlc.Queries, row sqlc.LockReturnRequestForUpdateRow) error) (*domain.ReturnRequest, error) {
	if _, err := uuid.Parse(requestID); err != nil {
		return nil, domain.ErrReturnNotFound
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)

	row, err := q.LockReturnRequestForUpdate(ctx, requestID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrReturnNotFound
		}
		return nil, err
	}

	if domain.ReturnRequestStatus(row.Status) != requiredStatus {
		return nil, domain.ErrReturnActionNotAllowed
	}

	if err := exec(q, row); err != nil {
		return nil, err
	}

	itemsByRequest, err := loadReturnItems(ctx, q, []string{requestID})
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	request := returnRequestFromLockRow(row)
	request.Items = itemsByRequest[requestID]
	return request, nil
}

func (r *ReturnRepository) Approve(ctx context.Context, requestID string) (*domain.ReturnRequest, error) {
	request, err := r.transitionAdmin(ctx, requestID, domain.ReturnStatusPendingApproval, func(q *sqlc.Queries, row sqlc.LockReturnRequestForUpdateRow) error {
		return q.ApproveReturnRequest(ctx, requestID)
	})
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	request.Status = domain.ReturnStatusApproved
	request.ApprovedAt = &now
	return request, nil
}

func (r *ReturnRepository) Reject(ctx context.Context, requestID, reason string) (*domain.ReturnRequest, error) {
	request, err := r.transitionAdmin(ctx, requestID, domain.ReturnStatusPendingApproval, func(q *sqlc.Queries, row sqlc.LockReturnRequestForUpdateRow) error {
		return q.RejectReturnRequest(ctx, sqlc.RejectReturnRequestParams{
			ID:           requestID,
			RejectReason: reason,
		})
	})
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	request.Status = domain.ReturnStatusRejected
	request.RejectReason = reason
	request.RejectedAt = &now
	return request, nil
}

func (r *ReturnRepository) MarkReceived(ctx context.Context, requestID string) (*domain.ReturnRequest, error) {
	request, err := r.transitionAdmin(ctx, requestID, domain.ReturnStatusApproved, func(q *sqlc.Queries, row sqlc.LockReturnRequestForUpdateRow) error {
		orderItemRows, err := q.ListOrderItemsByOrderID(ctx, row.OrderID)
		if err != nil {
			return err
		}
		variantByOrderItem := make(map[string]string, len(orderItemRows))
		for _, item := range orderItemRows {
			variantByOrderItem[item.ID] = item.VariantID
		}
		itemRows, err := q.ListReturnRequestItemsByRequestIDs(ctx, []string{requestID})
		if err != nil {
			return err
		}
		for _, item := range itemRows {
			variantID, ok := variantByOrderItem[item.OrderItemID]
			if !ok {
				continue
			}
			if err := q.IncrementVariantStock(ctx, sqlc.IncrementVariantStockParams{
				ID:       variantID,
				Quantity: item.Quantity,
			}); err != nil {
				return err
			}
		}
		return q.ReceiveReturnRequest(ctx, requestID)
	})
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	request.Status = domain.ReturnStatusReceived
	request.ReceivedAt = &now
	return request, nil
}

func (r *ReturnRepository) MarkRefunded(ctx context.Context, requestID string, amountVND domain.MoneyVND, adminUserID string) (*domain.ReturnRequest, error) {
	if _, err := uuid.Parse(requestID); err != nil {
		return nil, domain.ErrReturnNotFound
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)

	row, err := q.LockReturnRequestForUpdate(ctx, requestID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrReturnNotFound
		}
		return nil, err
	}

	if domain.ReturnRequestStatus(row.Status) != domain.ReturnStatusReceived {
		return nil, domain.ErrReturnActionNotAllowed
	}

	hasRefunded, err := q.HasRefundedReturnRequest(ctx, row.OrderID)
	if err != nil {
		return nil, err
	}

	if err := q.RefundReturnRequest(ctx, sqlc.RefundReturnRequestParams{
		Amount:      toNumeric(string(amountVND)),
		AdminUserID: adminUUIDFromString(adminUserID),
		ID:          requestID,
	}); err != nil {
		return nil, err
	}

	if !hasRefunded {
		if err := q.SetOrderStatusReturned(ctx, row.OrderID); err != nil {
			return nil, err
		}
	}

	itemsByRequest, err := loadReturnItems(ctx, q, []string{requestID})
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	request := returnRequestFromLockRow(row)
	request.Status = domain.ReturnStatusRefunded
	request.RefundAmountVND = amountVND
	request.RefundedAt = &now
	request.Items = itemsByRequest[requestID]
	return request, nil
}

func loadReturnItems(ctx context.Context, q *sqlc.Queries, requestIDs []string) (map[string][]domain.ReturnRequestItem, error) {
	rows, err := q.ListReturnRequestItemsByRequestIDs(ctx, requestIDs)
	if err != nil {
		return nil, err
	}
	itemsByRequest := make(map[string][]domain.ReturnRequestItem, len(requestIDs))
	for _, row := range rows {
		itemsByRequest[row.ReturnRequestID] = append(itemsByRequest[row.ReturnRequestID], domain.ReturnRequestItem{
			ID:           row.ID,
			RequestID:    row.ReturnRequestID,
			OrderItemID:  row.OrderItemID,
			ProductName:  row.ProductName,
			ImageURL:     row.ImageUrl,
			UnitPriceVND: domain.MoneyVND(row.UnitPriceVnd),
			Quantity:     row.Quantity,
		})
	}
	return itemsByRequest, nil
}

func returnRequestFromInsertRow(row sqlc.InsertReturnRequestRow) *domain.ReturnRequest {
	return &domain.ReturnRequest{
		ID:              row.ID,
		OrderID:         row.OrderID,
		UserID:          row.UserID,
		Status:          domain.ReturnRequestStatus(row.Status),
		ReasonCode:      domain.ReturnReasonCode(row.ReasonCode),
		Description:     row.Description,
		RejectReason:    row.RejectReason,
		RefundAmountVND: domain.MoneyVND(row.RefundAmountVnd),
		CreatedAt:       row.CreatedAt,
		UpdatedAt:       row.UpdatedAt,
		ApprovedAt:      mapTimestamptzPtr(row.ApprovedAt),
		RejectedAt:      mapTimestamptzPtr(row.RejectedAt),
		ReceivedAt:      mapTimestamptzPtr(row.ReceivedAt),
		RefundedAt:      mapTimestamptzPtr(row.RefundedAt),
		CancelledAt:     mapTimestamptzPtr(row.CancelledAt),
	}
}

func returnRequestFromLockRow(row sqlc.LockReturnRequestForUpdateRow) *domain.ReturnRequest {
	return &domain.ReturnRequest{
		ID:              row.ID,
		OrderID:         row.OrderID,
		UserID:          row.UserID,
		Status:          domain.ReturnRequestStatus(row.Status),
		ReasonCode:      domain.ReturnReasonCode(row.ReasonCode),
		Description:     row.Description,
		RejectReason:    row.RejectReason,
		RefundAmountVND: domain.MoneyVND(row.RefundAmountVnd),
		CreatedAt:       row.CreatedAt,
		UpdatedAt:       row.UpdatedAt,
		ApprovedAt:      mapTimestamptzPtr(row.ApprovedAt),
		RejectedAt:      mapTimestamptzPtr(row.RejectedAt),
		ReceivedAt:      mapTimestamptzPtr(row.ReceivedAt),
		RefundedAt:      mapTimestamptzPtr(row.RefundedAt),
		CancelledAt:     mapTimestamptzPtr(row.CancelledAt),
	}
}

func returnRequestFromUserLockRow(row sqlc.LockReturnRequestForUserRow) *domain.ReturnRequest {
	return &domain.ReturnRequest{
		ID:              row.ID,
		OrderID:         row.OrderID,
		UserID:          row.UserID,
		Status:          domain.ReturnRequestStatus(row.Status),
		ReasonCode:      domain.ReturnReasonCode(row.ReasonCode),
		Description:     row.Description,
		RejectReason:    row.RejectReason,
		RefundAmountVND: domain.MoneyVND(row.RefundAmountVnd),
		CreatedAt:       row.CreatedAt,
		UpdatedAt:       row.UpdatedAt,
		ApprovedAt:      mapTimestamptzPtr(row.ApprovedAt),
		RejectedAt:      mapTimestamptzPtr(row.RejectedAt),
		ReceivedAt:      mapTimestamptzPtr(row.ReceivedAt),
		RefundedAt:      mapTimestamptzPtr(row.RefundedAt),
		CancelledAt:     mapTimestamptzPtr(row.CancelledAt),
	}
}
