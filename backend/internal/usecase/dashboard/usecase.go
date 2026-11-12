package dashboard

import (
	"context"
	"math/big"
	"time"

	"commerce-backend/internal/domain"
)

type Dependencies struct {
	Repo  domain.DashboardRepository
	Clock func() time.Time
	Loc   *time.Location
}

type UseCase struct {
	repo  domain.DashboardRepository
	clock func() time.Time
	loc   *time.Location
}

func New(deps Dependencies) *UseCase {
	clock := deps.Clock
	if clock == nil {
		clock = time.Now
	}
	loc := deps.Loc
	if loc == nil {
		loc = domain.VietnamLocation
	}
	return &UseCase{
		repo:  deps.Repo,
		clock: clock,
		loc:   loc,
	}
}

func (uc *UseCase) GetDashboard(ctx context.Context, r domain.DashboardRange) (*domain.DashboardSnapshot, error) {
	if r == "" {
		r = domain.DashboardRange7d
	}
	if !r.IsValid() {
		return nil, domain.NewFilterValidationError(map[string]string{
			"range": "Kỳ báo cáo không hợp lệ",
		})
	}

	now := uc.clock()
	nowVN := now.In(uc.loc)
	year, month, day := nowVN.Date()
	todayStart := time.Date(year, month, day, 0, 0, 0, 0, uc.loc)

	var rangeStart time.Time
	var numDays int
	switch r {
	case domain.DashboardRangeToday:
		rangeStart = todayStart
		numDays = 1
	case domain.DashboardRange7d:
		rangeStart = todayStart.AddDate(0, 0, -6)
		numDays = 7
	case domain.DashboardRange30d:
		rangeStart = todayStart.AddDate(0, 0, -29)
		numDays = 30
	}
	rangeEnd := now

	raw, err := uc.repo.GetDashboardData(ctx, rangeStart, rangeEnd, uc.loc)
	if err != nil {
		return nil, err
	}
	if raw == nil {
		raw = &domain.DashboardRawData{}
	}

	deliveredByDate := make(map[string]domain.DashboardDailyDelivered, len(raw.DailyDelivered))
	for _, d := range raw.DailyDelivered {
		deliveredByDate[d.Date] = d
	}

	refundedByDate := make(map[string]domain.DashboardDailyRefunded, len(raw.DailyRefunded))
	for _, ref := range raw.DailyRefunded {
		refundedByDate[ref.Date] = ref
	}

	dailyRevenue := make([]domain.DashboardDailyPoint, numDays)
	totalDelivered := new(big.Int)
	totalRefunded := new(big.Int)
	var totalDeliveredOrders int64

	for i := 0; i < numDays; i++ {
		d := rangeStart.AddDate(0, 0, i)
		dateStr := d.Format("2006-01-02")

		delivVnd := domain.MoneyVND("0")
		if del, ok := deliveredByDate[dateStr]; ok {
			delivVnd = del.DeliveredVnd
			totalDeliveredOrders += del.DeliveredOrders
		}
		delivBig, ok := new(big.Int).SetString(string(delivVnd), 10)
		if !ok {
			delivBig = new(big.Int)
		}
		totalDelivered.Add(totalDelivered, delivBig)

		refVnd := domain.MoneyVND("0")
		if ref, ok := refundedByDate[dateStr]; ok {
			refVnd = ref.RefundedVnd
		}
		refBig, ok := new(big.Int).SetString(string(refVnd), 10)
		if !ok {
			refBig = new(big.Int)
		}
		totalRefunded.Add(totalRefunded, refBig)

		netBig := new(big.Int).Sub(delivBig, refBig)

		dailyRevenue[i] = domain.DashboardDailyPoint{
			Date:         dateStr,
			DeliveredVnd: delivVnd,
			RefundedVnd:  refVnd,
			NetVnd:       netBig.String(),
		}
	}

	totalNet := new(big.Int).Sub(totalDelivered, totalRefunded)
	avgOrderVnd := domain.MoneyVND("0")
	if totalDeliveredOrders > 0 {
		avgBig := new(big.Int).Quo(totalDelivered, big.NewInt(totalDeliveredOrders))
		avgOrderVnd = domain.MoneyVND(avgBig.String())
	}

	revenue := domain.DashboardRevenue{
		DeliveredVnd:    domain.MoneyVND(totalDelivered.String()),
		RefundedVnd:     domain.MoneyVND(totalRefunded.String()),
		NetVnd:          totalNet.String(),
		DeliveredOrders: totalDeliveredOrders,
		AverageOrderVnd: avgOrderVnd,
	}

	allStatuses := []domain.OrderStatus{
		domain.OrderStatusPendingConfirmation,
		domain.OrderStatusConfirmed,
		domain.OrderStatusPreparing,
		domain.OrderStatusShipped,
		domain.OrderStatusDelivered,
		domain.OrderStatusCancelRequested,
		domain.OrderStatusCancelled,
		domain.OrderStatusPartiallyReturned,
		domain.OrderStatusReturned,
	}
	byStatus := make(map[string]int64, len(allStatuses))
	for _, st := range allStatuses {
		byStatus[string(st)] = 0
	}
	for k, v := range raw.OrdersSummary.ByStatus {
		byStatus[k] = v
	}

	orders := domain.DashboardOrders{
		NewInRange:       raw.OrdersSummary.NewInRange,
		CancelledInRange: raw.OrdersSummary.CancelledInRange,
		ByStatus:         byStatus,
	}

	topProducts := raw.TopProducts
	if topProducts == nil {
		topProducts = []domain.DashboardTopProduct{}
	}

	lowStock := raw.LowStock
	if lowStock.Items == nil {
		lowStock.Items = []domain.DashboardLowStockItem{}
	}
	for i := range lowStock.Items {
		if lowStock.Items[i].Options == nil {
			lowStock.Items[i].Options = []domain.CartOption{}
		}
	}

	return &domain.DashboardSnapshot{
		Range:        r,
		RangeStart:   rangeStart.UTC(),
		GeneratedAt:  now.UTC(),
		Revenue:      revenue,
		DailyRevenue: dailyRevenue,
		Orders:       orders,
		PendingWork:  raw.PendingWork,
		TopProducts:  topProducts,
		LowStock:     lowStock,
	}, nil
}
