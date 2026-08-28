package repository

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

func uuidToString(u pgtype.UUID) *string {
	if !u.Valid {
		return nil
	}
	s := uuid.UUID(u.Bytes).String()
	return &s
}

type ReturnRepository struct {
	db orderDB
}

func NewReturnRepository(db orderDB) *ReturnRepository {
	return &ReturnRepository{db: db}
}

var _ domain.ReturnRepository = (*ReturnRepository)(nil)

func (r *ReturnRepository) CreateReturnRequest(ctx context.Context, input domain.CreateReturnInput) (*domain.ReturnRequest, error) {
	if _, err := uuid.Parse(input.OrderID); err != nil {
		return nil, domain.ErrOrderNotFound
	}
	if _, err := uuid.Parse(input.UserID); err != nil {
		return nil, domain.ErrOrderNotFound
	}
	if len(input.OrderItemIDs) == 0 {
		return nil, domain.NewValidationError(map[string]string{"orderItemIds": "Vui lòng chọn ít nhất một sản phẩm để trả"})
	}
	if !input.ReasonCode.IsValid() {
		return nil, domain.NewValidationError(map[string]string{"reasonCode": "Lý do trả hàng không hợp lệ"})
	}
	if len([]rune(input.Description)) > 1000 {
		return nil, domain.NewValidationError(map[string]string{"description": "Mô tả không được vượt quá 1000 ký tự"})
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)

	// 1. Lock order
	orderRow, err := q.LockOrderForUpdate(ctx, sqlc.LockOrderForUpdateParams{
		ID:     input.OrderID,
		UserID: input.UserID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrOrderNotFound
		}
		return nil, err
	}

	// Check delivery status and delivered_at
	if domain.OrderStatus(orderRow.Status) != domain.OrderStatusDelivered || !orderRow.DeliveredAt.Valid {
		return nil, domain.ErrReturnNotEligible
	}

	now := time.Now().UTC()
	deadline := domain.CalculateReturnDeadline(orderRow.DeliveredAt.Time)
	if now.After(deadline) {
		return nil, domain.ErrReturnNotEligible
	}

	// Check if already open or refunded
	hasOpen, err := q.HasOpenReturnRequestForOrder(ctx, input.OrderID)
	if err != nil {
		return nil, err
	}
	if hasOpen {
		return nil, domain.ErrReturnRequestOpen
	}

	hasRefunded, err := q.HasRefundedReturnRequestForOrder(ctx, input.OrderID)
	if err != nil {
		return nil, err
	}
	if hasRefunded {
		return nil, domain.ErrReturnAlreadyRefunded
	}

	// 2. Fetch order items
	orderItems, err := q.ListOrderItemsByOrderID(ctx, input.OrderID)
	if err != nil {
		return nil, err
	}

	orderItemMap := make(map[string]sqlc.ListOrderItemsByOrderIDRow, len(orderItems))
	for _, item := range orderItems {
		orderItemMap[item.ID] = item
	}

	// Validate selected item IDs
	seenItemIDs := make(map[string]bool)
	var selectedItems []sqlc.ListOrderItemsByOrderIDRow
	var itemsTotal domain.MoneyVND = "0"

	for _, itemID := range input.OrderItemIDs {
		if _, err := uuid.Parse(itemID); err != nil {
			return nil, domain.NewValidationError(map[string]string{"orderItemIds": "Mã sản phẩm không hợp lệ"})
		}
		if seenItemIDs[itemID] {
			return nil, domain.NewValidationError(map[string]string{"orderItemIds": "Sản phẩm được chọn bị trùng lặp"})
		}
		seenItemIDs[itemID] = true

		item, exists := orderItemMap[itemID]
		if !exists {
			return nil, domain.NewValidationError(map[string]string{"orderItemIds": "Sản phẩm không thuộc đơn hàng này"})
		}
		selectedItems = append(selectedItems, item)

		itemsTotal, err = domain.AddMoneyVND(itemsTotal, domain.MoneyVND(item.LineTotalVnd))
		if err != nil {
			return nil, err
		}
	}

	// Calculate expected refund
	expectedRefund := itemsTotal
	if len(selectedItems) == len(orderItems) {
		shippingFee := domain.MoneyVND(orderRow.ShippingFeeVnd)
		if !shippingFee.IsCanonical() {
			shippingFee = "0"
		}
		expectedRefund, err = domain.AddMoneyVND(expectedRefund, shippingFee)
		if err != nil {
			return nil, err
		}
	}

	// Insert return request
	reqRow, err := q.CreateReturnRequest(ctx, sqlc.CreateReturnRequestParams{
		OrderID:                 input.OrderID,
		UserID:                  input.UserID,
		Status:                  string(domain.ReturnStatusPendingApproval),
		ReasonCode:              string(input.ReasonCode),
		Description:             strings.TrimSpace(input.Description),
		ExpectedRefundAmountVnd: toNumeric(string(expectedRefund)),
	})
	if err != nil {
		return nil, err
	}

	// Insert return request items
	returnItems := make([]domain.ReturnRequestItem, len(selectedItems))
	for i, item := range selectedItems {
		if err := q.InsertReturnRequestItem(ctx, sqlc.InsertReturnRequestItemParams{
			ReturnRequestID: reqRow.ID,
			OrderItemID:     item.ID,
			Quantity:        item.Quantity,
		}); err != nil {
			return nil, err
		}

		var options []domain.CartOption
		if err := json.Unmarshal([]byte(item.Options), &options); err != nil {
			options = []domain.CartOption{}
		}

		returnItems[i] = domain.ReturnRequestItem{
			ID:              "",
			ReturnRequestID: reqRow.ID,
			OrderItemID:     item.ID,
			VariantID:       item.VariantID,
			ProductID:       item.ProductID,
			BrandName:       item.BrandName,
			ProductName:     item.ProductName,
			Model:           item.Model,
			ImageURL:        item.ImageUrl,
			Options:         options,
			Quantity:        item.Quantity,
			UnitPriceVND:    domain.MoneyVND(item.UnitPriceVnd),
			LineTotalVND:    domain.MoneyVND(item.LineTotalVnd),
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	res := &domain.ReturnRequest{
		ID:                reqRow.ID,
		OrderID:           reqRow.OrderID,
		UserID:            reqRow.UserID,
		Status:            domain.ReturnStatus(reqRow.Status),
		ReasonCode:        domain.ReturnReasonCode(reqRow.ReasonCode),
		Description:       reqRow.Description,
		RejectReason:      reqRow.RejectReason,
		ExpectedRefundVND: domain.MoneyVND(reqRow.ExpectedRefundAmountVnd),
		Items:             returnItems,
		CreatedAt:         reqRow.CreatedAt,
		UpdatedAt:         reqRow.UpdatedAt,
	}
	if reqRow.ApprovedAt.Valid {
		t := reqRow.ApprovedAt.Time
		res.ApprovedAt = &t
	}
	if reqRow.RejectedAt.Valid {
		t := reqRow.RejectedAt.Time
		res.RejectedAt = &t
	}
	if reqRow.ReceivedAt.Valid {
		t := reqRow.ReceivedAt.Time
		res.ReceivedAt = &t
	}
	if reqRow.RefundedAt.Valid {
		t := reqRow.RefundedAt.Time
		res.RefundedAt = &t
	}
	if reqRow.CancelledAt.Valid {
		t := reqRow.CancelledAt.Time
		res.CancelledAt = &t
	}

	return res, nil
}

func (r *ReturnRepository) CancelReturnRequest(ctx context.Context, userID, orderID, returnID string) (*domain.ReturnRequest, error) {
	if _, err := uuid.Parse(returnID); err != nil {
		return nil, domain.ErrReturnRequestNotFound
	}
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, domain.ErrReturnRequestNotFound
	}
	if _, err := uuid.Parse(userID); err != nil {
		return nil, domain.ErrReturnRequestNotFound
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)

	reqRow, err := q.LockReturnRequestByOrderAndUser(ctx, sqlc.LockReturnRequestByOrderAndUserParams{
		ID:      returnID,
		OrderID: orderID,
		UserID:  userID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrReturnRequestNotFound
		}
		return nil, err
	}

	if domain.ReturnStatus(reqRow.Status) != domain.ReturnStatusPendingApproval {
		return nil, domain.ErrReturnTransitionNotAllowed
	}

	if err := q.CancelReturnRequest(ctx, returnID); err != nil {
		return nil, err
	}

	itemRows, err := q.ListReturnRequestItemsByRequestID(ctx, returnID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	returnItems := mapReturnItemRows(itemRows)

	res := &domain.ReturnRequest{
		ID:                reqRow.ID,
		OrderID:           reqRow.OrderID,
		UserID:            reqRow.UserID,
		Status:            domain.ReturnStatusCancelled,
		ReasonCode:        domain.ReturnReasonCode(reqRow.ReasonCode),
		Description:       reqRow.Description,
		RejectReason:      reqRow.RejectReason,
		ExpectedRefundVND: domain.MoneyVND(reqRow.ExpectedRefundAmountVnd),
		Items:             returnItems,
		CreatedAt:         reqRow.CreatedAt,
		UpdatedAt:         now,
		CancelledAt:       &now,
	}
	return res, nil
}

func (r *ReturnRepository) GetLatestByOrderID(ctx context.Context, orderID string) (*domain.ReturnRequest, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return nil, nil
	}

	q := sqlc.New(r.db)
	reqRow, err := q.GetLatestReturnRequestByOrderID(ctx, orderID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	itemRows, err := q.ListReturnRequestItemsByRequestID(ctx, reqRow.ID)
	if err != nil {
		return nil, err
	}

	return mapSingleReturnRequest(reqRow, itemRows), nil
}

func (r *ReturnRepository) ListLatestByOrderIDs(ctx context.Context, orderIDs []string) (map[string]*domain.ReturnRequest, error) {
	if len(orderIDs) == 0 {
		return map[string]*domain.ReturnRequest{}, nil
	}

	q := sqlc.New(r.db)
	reqRows, err := q.ListLatestReturnRequestsByOrderIDs(ctx, orderIDs)
	if err != nil {
		return nil, err
	}

	if len(reqRows) == 0 {
		return map[string]*domain.ReturnRequest{}, nil
	}

	reqIDs := make([]string, len(reqRows))
	for i, row := range reqRows {
		reqIDs[i] = row.ID
	}

	itemRows, err := q.ListReturnRequestItemsByRequestIDs(ctx, reqIDs)
	if err != nil {
		return nil, err
	}

	itemsByReqID := make(map[string][]domain.ReturnRequestItem)
	for _, item := range itemRows {
		var options []domain.CartOption
		if err := json.Unmarshal([]byte(item.Options), &options); err != nil {
			options = []domain.CartOption{}
		}

		itemsByReqID[item.ReturnRequestID] = append(itemsByReqID[item.ReturnRequestID], domain.ReturnRequestItem{
			ID:                item.ID,
			ReturnRequestID:   item.ReturnRequestID,
			OrderItemID:       item.OrderItemID,
			VariantID:         item.VariantID,
			ProductID:         item.ProductID,
			BrandName:         item.BrandName,
			ProductName:       item.ProductName,
			Model:             item.Model,
			ImageURL:          item.ImageUrl,
			Options:           options,
			Quantity:          item.Quantity,
			UnitPriceVND:      domain.MoneyVND(item.UnitPriceVnd),
			LineTotalVND:      domain.MoneyVND(item.LineTotalVnd),
			ReceivedVariantID: uuidToString(item.ReceivedVariantID),
		})
	}

	res := make(map[string]*domain.ReturnRequest, len(reqRows))
	for _, row := range reqRows {
		items := itemsByReqID[row.ID]
		if items == nil {
			items = []domain.ReturnRequestItem{}
		}

		var refundAmount *domain.MoneyVND
		if row.RefundAmountVnd != "" {
			m := domain.MoneyVND(row.RefundAmountVnd)
			refundAmount = &m
		}

		retReq := &domain.ReturnRequest{
			ID:                row.ID,
			OrderID:           row.OrderID,
			UserID:            row.UserID,
			Status:            domain.ReturnStatus(row.Status),
			ReasonCode:        domain.ReturnReasonCode(row.ReasonCode),
			Description:       row.Description,
			RejectReason:      row.RejectReason,
			ExpectedRefundVND: domain.MoneyVND(row.ExpectedRefundAmountVnd),
			RefundAmountVND:   refundAmount,
			RefundedByUserID:  uuidToString(row.RefundedByUserID),
			Items:             items,
			CreatedAt:         row.CreatedAt,
			UpdatedAt:         row.UpdatedAt,
		}
		if row.ApprovedAt.Valid {
			t := row.ApprovedAt.Time
			retReq.ApprovedAt = &t
		}
		if row.RejectedAt.Valid {
			t := row.RejectedAt.Time
			retReq.RejectedAt = &t
		}
		if row.ReceivedAt.Valid {
			t := row.ReceivedAt.Time
			retReq.ReceivedAt = &t
		}
		if row.RefundedAt.Valid {
			t := row.RefundedAt.Time
			retReq.RefundedAt = &t
		}
		if row.CancelledAt.Valid {
			t := row.CancelledAt.Time
			retReq.CancelledAt = &t
		}

		res[row.OrderID] = retReq
	}

	return res, nil
}

func (r *ReturnRepository) ListAdmin(ctx context.Context, status string, page, limit int) ([]domain.ReturnRequest, int, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	q := sqlc.New(r.db)
	rows, err := q.ListReturnRequestsAdmin(ctx, sqlc.ListReturnRequestsAdminParams{
		Status:      status,
		LimitCount:  int32(limit),
		OffsetCount: int32(offset),
	})
	if err != nil {
		return nil, 0, err
	}

	if len(rows) == 0 {
		return []domain.ReturnRequest{}, 0, nil
	}

	totalCount := int(rows[0].TotalCount)
	reqIDs := make([]string, len(rows))
	for i, r := range rows {
		reqIDs[i] = r.ID
	}

	itemRows, err := q.ListReturnRequestItemsByRequestIDs(ctx, reqIDs)
	if err != nil {
		return nil, 0, err
	}

	itemsByReqID := make(map[string][]domain.ReturnRequestItem)
	for _, item := range itemRows {
		var options []domain.CartOption
		if err := json.Unmarshal([]byte(item.Options), &options); err != nil {
			options = []domain.CartOption{}
		}

		itemsByReqID[item.ReturnRequestID] = append(itemsByReqID[item.ReturnRequestID], domain.ReturnRequestItem{
			ID:                item.ID,
			ReturnRequestID:   item.ReturnRequestID,
			OrderItemID:       item.OrderItemID,
			VariantID:         item.VariantID,
			ProductID:         item.ProductID,
			BrandName:         item.BrandName,
			ProductName:       item.ProductName,
			Model:             item.Model,
			ImageURL:          item.ImageUrl,
			Options:           options,
			Quantity:          item.Quantity,
			UnitPriceVND:      domain.MoneyVND(item.UnitPriceVnd),
			LineTotalVND:      domain.MoneyVND(item.LineTotalVnd),
			ReceivedVariantID: uuidToString(item.ReceivedVariantID),
		})
	}

	res := make([]domain.ReturnRequest, len(rows))
	for i, row := range rows {
		items := itemsByReqID[row.ID]
		if items == nil {
			items = []domain.ReturnRequestItem{}
		}

		var refundAmount *domain.MoneyVND
		if row.RefundAmountVnd != "" {
			m := domain.MoneyVND(row.RefundAmountVnd)
			refundAmount = &m
		}

		res[i] = domain.ReturnRequest{
			ID:                row.ID,
			OrderID:           row.OrderID,
			UserID:            row.UserID,
			BuyerEmail:        row.BuyerEmail,
			Status:            domain.ReturnStatus(row.Status),
			ReasonCode:        domain.ReturnReasonCode(row.ReasonCode),
			Description:       row.Description,
			RejectReason:      row.RejectReason,
			ExpectedRefundVND: domain.MoneyVND(row.ExpectedRefundAmountVnd),
			RefundAmountVND:   refundAmount,
			RefundedByUserID:  uuidToString(row.RefundedByUserID),
			Items:             items,
			CreatedAt:         row.CreatedAt,
			UpdatedAt:         row.UpdatedAt,
		}
		if row.ApprovedAt.Valid {
			t := row.ApprovedAt.Time
			res[i].ApprovedAt = &t
		}
		if row.RejectedAt.Valid {
			t := row.RejectedAt.Time
			res[i].RejectedAt = &t
		}
		if row.ReceivedAt.Valid {
			t := row.ReceivedAt.Time
			res[i].ReceivedAt = &t
		}
		if row.RefundedAt.Valid {
			t := row.RefundedAt.Time
			res[i].RefundedAt = &t
		}
		if row.CancelledAt.Valid {
			t := row.CancelledAt.Time
			res[i].CancelledAt = &t
		}
	}

	return res, totalCount, nil
}

func (r *ReturnRepository) GetAdminByID(ctx context.Context, returnID string) (*domain.ReturnRequest, error) {
	if _, err := uuid.Parse(returnID); err != nil {
		return nil, domain.ErrReturnRequestNotFound
	}

	q := sqlc.New(r.db)
	reqRow, err := q.GetReturnRequestAdminByID(ctx, returnID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrReturnRequestNotFound
		}
		return nil, err
	}

	itemRows, err := q.ListReturnRequestItemsByRequestID(ctx, returnID)
	if err != nil {
		return nil, err
	}

	items := mapReturnItemRows(itemRows)
	var refundAmount *domain.MoneyVND
	if reqRow.RefundAmountVnd != "" {
		m := domain.MoneyVND(reqRow.RefundAmountVnd)
		refundAmount = &m
	}

	res := &domain.ReturnRequest{
		ID:                reqRow.ID,
		OrderID:           reqRow.OrderID,
		UserID:            reqRow.UserID,
		BuyerEmail:        reqRow.BuyerEmail,
		Status:            domain.ReturnStatus(reqRow.Status),
		ReasonCode:        domain.ReturnReasonCode(reqRow.ReasonCode),
		Description:       reqRow.Description,
		RejectReason:      reqRow.RejectReason,
		ExpectedRefundVND: domain.MoneyVND(reqRow.ExpectedRefundAmountVnd),
		RefundAmountVND:   refundAmount,
		RefundedByUserID:  uuidToString(reqRow.RefundedByUserID),
		Items:             items,
		CreatedAt:         reqRow.CreatedAt,
		UpdatedAt:         reqRow.UpdatedAt,
	}
	if reqRow.ApprovedAt.Valid {
		t := reqRow.ApprovedAt.Time
		res.ApprovedAt = &t
	}
	if reqRow.RejectedAt.Valid {
		t := reqRow.RejectedAt.Time
		res.RejectedAt = &t
	}
	if reqRow.ReceivedAt.Valid {
		t := reqRow.ReceivedAt.Time
		res.ReceivedAt = &t
	}
	if reqRow.RefundedAt.Valid {
		t := reqRow.RefundedAt.Time
		res.RefundedAt = &t
	}
	if reqRow.CancelledAt.Valid {
		t := reqRow.CancelledAt.Time
		res.CancelledAt = &t
	}

	return res, nil
}

func (r *ReturnRepository) ApproveAdmin(ctx context.Context, returnID string) (*domain.ReturnRequest, error) {
	if _, err := uuid.Parse(returnID); err != nil {
		return nil, domain.ErrReturnRequestNotFound
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)

	reqRow, err := q.LockReturnRequestForUpdate(ctx, returnID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrReturnRequestNotFound
		}
		return nil, err
	}

	if domain.ReturnStatus(reqRow.Status) != domain.ReturnStatusPendingApproval {
		return nil, domain.ErrReturnTransitionNotAllowed
	}

	if err := q.ApproveReturnRequest(ctx, returnID); err != nil {
		return nil, err
	}

	itemRows, err := q.ListReturnRequestItemsByRequestID(ctx, returnID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	items := mapReturnItemRows(itemRows)

	res := &domain.ReturnRequest{
		ID:                reqRow.ID,
		OrderID:           reqRow.OrderID,
		UserID:            reqRow.UserID,
		Status:            domain.ReturnStatusApproved,
		ReasonCode:        domain.ReturnReasonCode(reqRow.ReasonCode),
		Description:       reqRow.Description,
		RejectReason:      reqRow.RejectReason,
		ExpectedRefundVND: domain.MoneyVND(reqRow.ExpectedRefundAmountVnd),
		Items:             items,
		CreatedAt:         reqRow.CreatedAt,
		UpdatedAt:         now,
		ApprovedAt:        &now,
	}
	return res, nil
}

func (r *ReturnRepository) RejectAdmin(ctx context.Context, returnID, rejectReason string) (*domain.ReturnRequest, error) {
	if _, err := uuid.Parse(returnID); err != nil {
		return nil, domain.ErrReturnRequestNotFound
	}
	trimmedReason := strings.TrimSpace(rejectReason)
	if trimmedReason == "" {
		return nil, domain.NewValidationError(map[string]string{"rejectReason": "Lý do từ chối không được để trống"})
	}
	if len([]rune(trimmedReason)) > 1000 {
		return nil, domain.NewValidationError(map[string]string{"rejectReason": "Lý do từ chối không được vượt quá 1000 ký tự"})
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)

	reqRow, err := q.LockReturnRequestForUpdate(ctx, returnID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrReturnRequestNotFound
		}
		return nil, err
	}

	if domain.ReturnStatus(reqRow.Status) != domain.ReturnStatusPendingApproval {
		return nil, domain.ErrReturnTransitionNotAllowed
	}

	if err := q.RejectReturnRequest(ctx, sqlc.RejectReturnRequestParams{
		ID:           returnID,
		RejectReason: trimmedReason,
	}); err != nil {
		return nil, err
	}

	itemRows, err := q.ListReturnRequestItemsByRequestID(ctx, returnID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	items := mapReturnItemRows(itemRows)

	res := &domain.ReturnRequest{
		ID:                reqRow.ID,
		OrderID:           reqRow.OrderID,
		UserID:            reqRow.UserID,
		Status:            domain.ReturnStatusRejected,
		ReasonCode:        domain.ReturnReasonCode(reqRow.ReasonCode),
		Description:       reqRow.Description,
		RejectReason:      trimmedReason,
		ExpectedRefundVND: domain.MoneyVND(reqRow.ExpectedRefundAmountVnd),
		Items:             items,
		CreatedAt:         reqRow.CreatedAt,
		UpdatedAt:         now,
		RejectedAt:        &now,
	}
	return res, nil
}

func (r *ReturnRepository) ReceiveAdmin(ctx context.Context, returnID string, mappings []domain.ReceiveItemMapping) (*domain.ReturnRequest, error) {
	if _, err := uuid.Parse(returnID); err != nil {
		return nil, domain.ErrReturnRequestNotFound
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)

	// Lock return request
	reqRow, err := q.LockReturnRequestForUpdate(ctx, returnID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrReturnRequestNotFound
		}
		return nil, err
	}

	if domain.ReturnStatus(reqRow.Status) != domain.ReturnStatusApproved {
		return nil, domain.ErrReturnTransitionNotAllowed
	}

	// Lock order
	if _, err := q.LockOrderForUpdateAdmin(ctx, reqRow.OrderID); err != nil {
		return nil, err
	}

	// Load return items
	itemRows, err := q.ListReturnRequestItemsByRequestID(ctx, returnID)
	if err != nil {
		return nil, err
	}

	returnItemMap := make(map[string]sqlc.ListReturnRequestItemsByRequestIDRow, len(itemRows))
	for _, item := range itemRows {
		returnItemMap[item.OrderItemID] = item
	}

	if len(mappings) != len(itemRows) {
		return nil, domain.NewValidationError(map[string]string{"items": "Danh sách mapping sản phẩm nhận không đầy đủ"})
	}

	seenOrderItemIDs := make(map[string]bool)
	for _, m := range mappings {
		if _, err := uuid.Parse(m.OrderItemID); err != nil {
			return nil, domain.NewValidationError(map[string]string{"items": "Mã dòng sản phẩm không hợp lệ"})
		}
		if _, err := uuid.Parse(m.ReceivedVariantID); err != nil {
			return nil, domain.NewValidationError(map[string]string{"items": "Mã phân loại sản phẩm thực nhận không hợp lệ"})
		}
		if seenOrderItemIDs[m.OrderItemID] {
			return nil, domain.NewValidationError(map[string]string{"items": "Dòng sản phẩm bị trùng lặp trong danh sách nhận"})
		}
		seenOrderItemIDs[m.OrderItemID] = true

		item, exists := returnItemMap[m.OrderItemID]
		if !exists {
			return nil, domain.NewValidationError(map[string]string{"items": "Dòng sản phẩm không thuộc yêu cầu trả hàng này"})
		}

		// Increment variant stock for received variant
		if err := q.IncrementVariantStock(ctx, sqlc.IncrementVariantStockParams{
			ID:       m.ReceivedVariantID,
			Quantity: item.Quantity,
		}); err != nil {
			return nil, domain.NewValidationError(map[string]string{"items": "Phân loại sản phẩm thực nhận không tồn tại"})
		}

		// Update received_variant_id on return item
		if err := q.UpdateReturnRequestItemReceivedVariant(ctx, sqlc.UpdateReturnRequestItemReceivedVariantParams{
			ReceivedVariantID: pgtype.UUID{Bytes: uuid.MustParse(m.ReceivedVariantID), Valid: true},
			ReturnRequestID:   returnID,
			OrderItemID:       m.OrderItemID,
		}); err != nil {
			return nil, err
		}
	}

	// Update return request status to received
	if err := q.ReceiveReturnRequest(ctx, returnID); err != nil {
		return nil, err
	}

	// Re-fetch return items with updated received_variant_id
	updatedItemRows, err := q.ListReturnRequestItemsByRequestID(ctx, returnID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	items := mapReturnItemRows(updatedItemRows)

	res := &domain.ReturnRequest{
		ID:                reqRow.ID,
		OrderID:           reqRow.OrderID,
		UserID:            reqRow.UserID,
		Status:            domain.ReturnStatusReceived,
		ReasonCode:        domain.ReturnReasonCode(reqRow.ReasonCode),
		Description:       reqRow.Description,
		RejectReason:      reqRow.RejectReason,
		ExpectedRefundVND: domain.MoneyVND(reqRow.ExpectedRefundAmountVnd),
		Items:             items,
		CreatedAt:         reqRow.CreatedAt,
		UpdatedAt:         now,
		ReceivedAt:        &now,
	}
	if reqRow.ApprovedAt.Valid {
		t := reqRow.ApprovedAt.Time
		res.ApprovedAt = &t
	}
	return res, nil
}

func (r *ReturnRepository) RefundAdmin(ctx context.Context, returnID, adminUserID string) (*domain.ReturnRequest, error) {
	if _, err := uuid.Parse(returnID); err != nil {
		return nil, domain.ErrReturnRequestNotFound
	}
	if _, err := uuid.Parse(adminUserID); err != nil {
		return nil, domain.ErrForbidden
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)

	// Lock return request
	reqRow, err := q.LockReturnRequestForUpdate(ctx, returnID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrReturnRequestNotFound
		}
		return nil, err
	}

	if domain.ReturnStatus(reqRow.Status) != domain.ReturnStatusReceived {
		return nil, domain.ErrReturnTransitionNotAllowed
	}

	// Lock order
	orderRow, err := q.LockOrderForUpdateAdmin(ctx, reqRow.OrderID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrOrderNotFound
		}
		return nil, err
	}

	// Check if already refunded
	hasRefunded, err := q.HasRefundedReturnRequestForOrder(ctx, reqRow.OrderID)
	if err != nil {
		return nil, err
	}
	if hasRefunded {
		return nil, domain.ErrReturnAlreadyRefunded
	}

	// Fetch all order items vs return items to classify partial vs full return
	allOrderItems, err := q.ListOrderItemsByOrderID(ctx, reqRow.OrderID)
	if err != nil {
		return nil, err
	}

	returnItems, err := q.ListReturnRequestItemsByRequestID(ctx, returnID)
	if err != nil {
		return nil, err
	}

	var newOrderStatus domain.OrderStatus
	if len(returnItems) == len(allOrderItems) {
		newOrderStatus = domain.OrderStatusReturned
	} else {
		newOrderStatus = domain.OrderStatusPartiallyReturned
	}

	// Update return request to refunded
	if err := q.RefundReturnRequest(ctx, sqlc.RefundReturnRequestParams{
		ID:                  returnID,
		RefundAmountVnd:     toNumeric(reqRow.ExpectedRefundAmountVnd),
		RefundedByUserID:    pgtype.UUID{Bytes: uuid.MustParse(adminUserID), Valid: true},
	}); err != nil {
		return nil, err
	}

	// Update order status
	if err := q.SetOrderStatus(ctx, sqlc.SetOrderStatusParams{
		ID:          reqRow.OrderID,
		Status:      string(newOrderStatus),
		ConfirmedAt: orderRow.ConfirmedAt,
		CancelledAt: orderRow.CancelledAt,
		DeliveredAt: orderRow.DeliveredAt,
	}); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	items := mapReturnItemRows(returnItems)
	refundAmount := domain.MoneyVND(reqRow.ExpectedRefundAmountVnd)

	res := &domain.ReturnRequest{
		ID:                reqRow.ID,
		OrderID:           reqRow.OrderID,
		UserID:            reqRow.UserID,
		Status:            domain.ReturnStatusRefunded,
		ReasonCode:        domain.ReturnReasonCode(reqRow.ReasonCode),
		Description:       reqRow.Description,
		RejectReason:      reqRow.RejectReason,
		ExpectedRefundVND: domain.MoneyVND(reqRow.ExpectedRefundAmountVnd),
		RefundAmountVND:   &refundAmount,
		RefundedByUserID:  &adminUserID,
		Items:             items,
		CreatedAt:         reqRow.CreatedAt,
		UpdatedAt:         now,
		RefundedAt:        &now,
	}
	if reqRow.ApprovedAt.Valid {
		t := reqRow.ApprovedAt.Time
		res.ApprovedAt = &t
	}
	if reqRow.ReceivedAt.Valid {
		t := reqRow.ReceivedAt.Time
		res.ReceivedAt = &t
	}

	return res, nil
}

func (r *ReturnRepository) SearchVariantOptionsAdmin(ctx context.Context, query string, page, limit int) ([]domain.VariantOptionInfo, int, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	q := sqlc.New(r.db)
	rows, err := q.SearchVariantOptionsAdmin(ctx, sqlc.SearchVariantOptionsAdminParams{
		Query:       strings.TrimSpace(query),
		LimitCount:  int32(limit),
		OffsetCount: int32(offset),
	})
	if err != nil {
		return nil, 0, err
	}

	if len(rows) == 0 {
		return []domain.VariantOptionInfo{}, 0, nil
	}

	totalCount := int(rows[0].TotalCount)
	res := make([]domain.VariantOptionInfo, len(rows))
	for i, row := range rows {
		var options []domain.CartOption
		if err := json.Unmarshal([]byte(row.Options), &options); err != nil {
			options = []domain.CartOption{}
		}

		res[i] = domain.VariantOptionInfo{
			VariantID:     row.VariantID,
			ProductID:     row.ProductID,
			BrandName:     row.BrandName,
			ProductName:   row.ProductName,
			Model:         row.Model,
			Options:       options,
			StockQuantity: row.StockQuantity,
			ProductActive: row.ProductActive,
			VariantActive: row.VariantActive,
		}
	}

	return res, totalCount, nil
}

func (r *ReturnRepository) IsOrderItemRefunded(ctx context.Context, orderItemID string) (bool, error) {
	if _, err := uuid.Parse(orderItemID); err != nil {
		return false, nil
	}
	q := sqlc.New(r.db)
	return q.IsOrderItemRefunded(ctx, orderItemID)
}

func mapReturnItemRows(rows []sqlc.ListReturnRequestItemsByRequestIDRow) []domain.ReturnRequestItem {
	items := make([]domain.ReturnRequestItem, len(rows))
	for i, r := range rows {
		var options []domain.CartOption
		if err := json.Unmarshal([]byte(r.Options), &options); err != nil {
			options = []domain.CartOption{}
		}

		items[i] = domain.ReturnRequestItem{
			ID:                r.ID,
			ReturnRequestID:   r.ReturnRequestID,
			OrderItemID:       r.OrderItemID,
			VariantID:         r.VariantID,
			ProductID:         r.ProductID,
			BrandName:         r.BrandName,
			ProductName:       r.ProductName,
			Model:             r.Model,
			ImageURL:          r.ImageUrl,
			Options:           options,
			Quantity:          r.Quantity,
			UnitPriceVND:      domain.MoneyVND(r.UnitPriceVnd),
			LineTotalVND:      domain.MoneyVND(r.LineTotalVnd),
			ReceivedVariantID: uuidToString(r.ReceivedVariantID),
		}
	}
	return items
}

func mapSingleReturnRequest(row sqlc.GetLatestReturnRequestByOrderIDRow, itemRows []sqlc.ListReturnRequestItemsByRequestIDRow) *domain.ReturnRequest {
	items := mapReturnItemRows(itemRows)
	var refundAmount *domain.MoneyVND
	if row.RefundAmountVnd != "" {
		m := domain.MoneyVND(row.RefundAmountVnd)
		refundAmount = &m
	}

	res := &domain.ReturnRequest{
		ID:                row.ID,
		OrderID:           row.OrderID,
		UserID:            row.UserID,
		Status:            domain.ReturnStatus(row.Status),
		ReasonCode:        domain.ReturnReasonCode(row.ReasonCode),
		Description:       row.Description,
		RejectReason:      row.RejectReason,
		ExpectedRefundVND: domain.MoneyVND(row.ExpectedRefundAmountVnd),
		RefundAmountVND:   refundAmount,
		RefundedByUserID:  uuidToString(row.RefundedByUserID),
		Items:             items,
		CreatedAt:         row.CreatedAt,
		UpdatedAt:         row.UpdatedAt,
	}
	if row.ApprovedAt.Valid {
		t := row.ApprovedAt.Time
		res.ApprovedAt = &t
	}
	if row.RejectedAt.Valid {
		t := row.RejectedAt.Time
		res.RejectedAt = &t
	}
	if row.ReceivedAt.Valid {
		t := row.ReceivedAt.Time
		res.ReceivedAt = &t
	}
	if row.RefundedAt.Valid {
		t := row.RefundedAt.Time
		res.RefundedAt = &t
	}
	if row.CancelledAt.Valid {
		t := row.CancelledAt.Time
		res.CancelledAt = &t
	}
	return res
}
