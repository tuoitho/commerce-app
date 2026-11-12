package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

type dashboardDB interface {
	sqlc.DBTX
	BeginTx(ctx context.Context, txOptions pgx.TxOptions) (pgx.Tx, error)
}

type DashboardRepository struct {
	db dashboardDB
}

func NewDashboardRepository(db dashboardDB) *DashboardRepository {
	return &DashboardRepository{db: db}
}

var _ domain.DashboardRepository = (*DashboardRepository)(nil)

func (r *DashboardRepository) GetDashboardData(ctx context.Context, rangeStart, rangeEnd time.Time, loc *time.Location) (*domain.DashboardRawData, error) {
	// loc parameter is preserved for interface contract; SQL queries explicitly group by 'Asia/Ho_Chi_Minh' (UTC+7).
	_ = loc

	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{
		IsoLevel:   pgx.RepeatableRead,
		AccessMode: pgx.ReadOnly,
	})
	if err != nil {
		return nil, fmt.Errorf("begin dashboard tx: %w", err)
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)

	// 1. Delivered revenue and order count daily
	deliveredRows, err := q.GetDashboardDeliveredRevenueDaily(ctx, sqlc.GetDashboardDeliveredRevenueDailyParams{
		RangeStart: rangeStart,
		RangeEnd:   rangeEnd,
	})
	if err != nil {
		return nil, fmt.Errorf("get delivered revenue daily: %w", err)
	}

	// 2. Refunded amount daily
	refundedRows, err := q.GetDashboardRefundedDaily(ctx, sqlc.GetDashboardRefundedDailyParams{
		RangeStart: rangeStart,
		RangeEnd:   rangeEnd,
	})
	if err != nil {
		return nil, fmt.Errorf("get refunded daily: %w", err)
	}

	// 3. New and cancelled orders in range
	orderCounts, err := q.GetDashboardOrderCountsInRange(ctx, sqlc.GetDashboardOrderCountsInRangeParams{
		RangeStart: rangeStart,
		RangeEnd:   rangeEnd,
	})
	if err != nil {
		return nil, fmt.Errorf("get order counts in range: %w", err)
	}

	// 4. Orders by status (all time)
	statusRows, err := q.GetDashboardOrdersByStatus(ctx)
	if err != nil {
		return nil, fmt.Errorf("get orders by status: %w", err)
	}

	byStatus := map[string]int64{
		string(domain.OrderStatusPendingConfirmation): 0,
		string(domain.OrderStatusConfirmed):           0,
		string(domain.OrderStatusPreparing):           0,
		string(domain.OrderStatusShipped):             0,
		string(domain.OrderStatusDelivered):           0,
		string(domain.OrderStatusCancelRequested):     0,
		string(domain.OrderStatusCancelled):           0,
		string(domain.OrderStatusPartiallyReturned):   0,
		string(domain.OrderStatusReturned):            0,
	}
	for _, row := range statusRows {
		byStatus[row.Status] = row.Count
	}

	// 5. Pending return requests (pending_approval and received)
	pendingReturns, err := q.GetDashboardPendingReturns(ctx)
	if err != nil {
		return nil, fmt.Errorf("get pending returns: %w", err)
	}

	// 6. Unreplied reviews (reuse sqlc CountAdminReviews)
	unrepliedReviews, err := q.CountAdminReviews(ctx, sqlc.CountAdminReviewsParams{
		RatingFilter:   0,
		HasReplyFilter: "no",
	})
	if err != nil {
		return nil, fmt.Errorf("count unreplied reviews: %w", err)
	}

	// 7. Unread conversations (reuse sqlc CountConversationsForAdmin)
	unreadConversations, err := q.CountConversationsForAdmin(ctx, sqlc.CountConversationsForAdminParams{
		Status: "unread",
		Search: "",
	})
	if err != nil {
		return nil, fmt.Errorf("count unread conversations: %w", err)
	}

	// 8. Top 5 products in range
	topProductRows, err := q.GetDashboardTopProducts(ctx, sqlc.GetDashboardTopProductsParams{
		RangeStart: rangeStart,
		RangeEnd:   rangeEnd,
	})
	if err != nil {
		return nil, fmt.Errorf("get top products: %w", err)
	}

	// 9. Low stock variants (active variants of active products with stock <= 5)
	lowStockRows, err := q.GetDashboardLowStockVariants(ctx)
	if err != nil {
		return nil, fmt.Errorf("get low stock variants: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit dashboard tx: %w", err)
	}

	// Map delivered daily rows
	dailyDelivered := make([]domain.DashboardDailyDelivered, 0, len(deliveredRows))
	for _, r := range deliveredRows {
		dailyDelivered = append(dailyDelivered, domain.DashboardDailyDelivered{
			Date:            r.Date,
			DeliveredVnd:    domain.MoneyVND(r.DeliveredVnd),
			DeliveredOrders: r.DeliveredOrders,
		})
	}

	// Map refunded daily rows
	dailyRefunded := make([]domain.DashboardDailyRefunded, 0, len(refundedRows))
	for _, r := range refundedRows {
		dailyRefunded = append(dailyRefunded, domain.DashboardDailyRefunded{
			Date:        r.Date,
			RefundedVnd: domain.MoneyVND(r.RefundedVnd),
		})
	}

	// Map top products
	topProducts := make([]domain.DashboardTopProduct, 0, len(topProductRows))
	for _, r := range topProductRows {
		topProducts = append(topProducts, domain.DashboardTopProduct{
			ProductID:    r.ProductID,
			Name:         r.Name,
			Brand:        r.Brand,
			ImageURL:     r.ImageUrl,
			Active:       r.Active,
			QuantitySold: r.QuantitySold,
			RevenueVnd:   domain.MoneyVND(r.RevenueVnd),
		})
	}

	// Map low stock variants
	lowStockItems := make([]domain.DashboardLowStockItem, 0, len(lowStockRows))
	var totalLowStock int64
	if len(lowStockRows) > 0 {
		totalLowStock = lowStockRows[0].TotalCount
	}
	for _, r := range lowStockRows {
		var options []domain.CartOption
		if r.Options != "" && r.Options != "[]" {
			_ = json.Unmarshal([]byte(r.Options), &options)
		}
		if options == nil {
			options = make([]domain.CartOption, 0)
		}
		lowStockItems = append(lowStockItems, domain.DashboardLowStockItem{
			VariantID:     r.VariantID,
			ProductID:     r.ProductID,
			ProductName:   r.ProductName,
			Options:       options,
			StockQuantity: r.StockQuantity,
		})
	}

	return &domain.DashboardRawData{
		DailyDelivered: dailyDelivered,
		DailyRefunded:  dailyRefunded,
		OrdersSummary: domain.DashboardOrdersSummary{
			NewInRange:       orderCounts.NewOrdersCount,
			CancelledInRange: orderCounts.CancelledOrdersCount,
			ByStatus:         byStatus,
		},
		PendingWork: domain.DashboardPendingWork{
			PendingConfirmationOrders: byStatus[string(domain.OrderStatusPendingConfirmation)],
			CancelRequestedOrders:     byStatus[string(domain.OrderStatusCancelRequested)],
			PendingApprovalReturns:    pendingReturns.PendingApprovalCount,
			ReceivedReturns:           pendingReturns.ReceivedCount,
			UnrepliedReviews:          unrepliedReviews,
			UnreadConversations:       unreadConversations,
		},
		TopProducts: topProducts,
		LowStock: domain.DashboardLowStockData{
			Threshold: 5,
			Total:     totalLowStock,
			Items:     lowStockItems,
		},
	}, nil
}
