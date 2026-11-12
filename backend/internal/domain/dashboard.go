package domain

import (
	"context"
	"time"
)

type DashboardRange string

const (
	DashboardRangeToday DashboardRange = "today"
	DashboardRange7d    DashboardRange = "7d"
	DashboardRange30d   DashboardRange = "30d"
)

func (r DashboardRange) IsValid() bool {
	switch r {
	case DashboardRangeToday, DashboardRange7d, DashboardRange30d:
		return true
	default:
		return false
	}
}

type DashboardDailyDelivered struct {
	Date            string   `json:"date"`
	DeliveredVnd    MoneyVND `json:"deliveredVnd"`
	DeliveredOrders int64    `json:"deliveredOrders"`
}

type DashboardDailyRefunded struct {
	Date        string   `json:"date"`
	RefundedVnd MoneyVND `json:"refundedVnd"`
}

type DashboardOrdersSummary struct {
	NewInRange       int64            `json:"newInRange"`
	CancelledInRange int64            `json:"cancelledInRange"`
	ByStatus         map[string]int64 `json:"byStatus"`
}

type DashboardPendingWork struct {
	PendingConfirmationOrders int64 `json:"pendingConfirmationOrders"`
	CancelRequestedOrders     int64 `json:"cancelRequestedOrders"`
	PendingApprovalReturns    int64 `json:"pendingApprovalReturns"`
	ReceivedReturns           int64 `json:"receivedReturns"`
	UnrepliedReviews          int64 `json:"unrepliedReviews"`
	UnreadConversations       int64 `json:"unreadConversations"`
}

type DashboardTopProduct struct {
	ProductID    string   `json:"productId"`
	Name         string   `json:"name"`
	Brand        string   `json:"brand"`
	ImageURL     string   `json:"imageUrl"`
	Active       bool     `json:"active"`
	QuantitySold int64    `json:"quantitySold"`
	RevenueVnd   MoneyVND `json:"revenueVnd"`
}

type DashboardLowStockItem struct {
	VariantID     string       `json:"variantId"`
	ProductID     string       `json:"productId"`
	ProductName   string       `json:"productName"`
	Options       []CartOption `json:"options"`
	StockQuantity int64        `json:"stockQuantity"`
}

type DashboardLowStockData struct {
	Threshold int64                   `json:"threshold"`
	Total     int64                   `json:"total"`
	Items     []DashboardLowStockItem `json:"items"`
}

type DashboardRawData struct {
	DailyDelivered []DashboardDailyDelivered
	DailyRefunded  []DashboardDailyRefunded
	OrdersSummary  DashboardOrdersSummary
	PendingWork    DashboardPendingWork
	TopProducts    []DashboardTopProduct
	LowStock       DashboardLowStockData
}

type DashboardRevenue struct {
	DeliveredVnd    MoneyVND `json:"deliveredVnd"`
	RefundedVnd     MoneyVND `json:"refundedVnd"`
	NetVnd          string   `json:"netVnd"`
	DeliveredOrders int64    `json:"deliveredOrders"`
	AverageOrderVnd MoneyVND `json:"averageOrderVnd"`
}

type DashboardDailyPoint struct {
	Date         string   `json:"date"`
	DeliveredVnd MoneyVND `json:"deliveredVnd"`
	RefundedVnd  MoneyVND `json:"refundedVnd"`
	NetVnd       string   `json:"netVnd"`
}

type DashboardOrders struct {
	NewInRange       int64            `json:"newInRange"`
	CancelledInRange int64            `json:"cancelledInRange"`
	ByStatus         map[string]int64 `json:"byStatus"`
}

type DashboardSnapshot struct {
	Range        DashboardRange        `json:"range"`
	RangeStart   time.Time             `json:"rangeStart"`
	GeneratedAt  time.Time             `json:"generatedAt"`
	Revenue      DashboardRevenue      `json:"revenue"`
	DailyRevenue []DashboardDailyPoint `json:"dailyRevenue"`
	Orders       DashboardOrders       `json:"orders"`
	PendingWork  DashboardPendingWork  `json:"pendingWork"`
	TopProducts  []DashboardTopProduct `json:"topProducts"`
	LowStock     DashboardLowStockData `json:"lowStock"`
}

type DashboardRepository interface {
	GetDashboardData(ctx context.Context, rangeStart, rangeEnd time.Time, loc *time.Location) (*DashboardRawData, error)
}
