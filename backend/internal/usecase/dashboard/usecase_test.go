package dashboard

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
)

type mockDashboardRepo struct {
	getDataFn func(ctx context.Context, rangeStart, rangeEnd time.Time, loc *time.Location) (*domain.DashboardRawData, error)
}

func (m *mockDashboardRepo) GetDashboardData(ctx context.Context, rangeStart, rangeEnd time.Time, loc *time.Location) (*domain.DashboardRawData, error) {
	if m.getDataFn != nil {
		return m.getDataFn(ctx, rangeStart, rangeEnd, loc)
	}
	return &domain.DashboardRawData{}, nil
}

func TestGetDashboard_RangeValidation(t *testing.T) {
	repo := &mockDashboardRepo{}
	uc := New(Dependencies{
		Repo: repo,
	})

	t.Run("empty range defaults to 7d", func(t *testing.T) {
		res, err := uc.GetDashboard(context.Background(), "")
		require.NoError(t, err)
		assert.Equal(t, domain.DashboardRange7d, res.Range)
		assert.Len(t, res.DailyRevenue, 7)
	})

	t.Run("invalid range returns FilterValidationError", func(t *testing.T) {
		invalidRanges := []domain.DashboardRange{"1y", "invalid", "14d", "90d"}
		for _, r := range invalidRanges {
			res, err := uc.GetDashboard(context.Background(), r)
			assert.Nil(t, res)
			var filterErr *domain.FilterValidationError
			require.ErrorAs(t, err, &filterErr)
			assert.Equal(t, "Kỳ báo cáo không hợp lệ", filterErr.Fields["range"])
		}
	})
}

func TestGetDashboard_DateBoundaries(t *testing.T) {
	loc := domain.VietnamLocation

	// Time A: 23:30 VN time on 2026-11-12
	tA := time.Date(2026, 11, 12, 23, 30, 0, 0, loc)

	// Time B: 00:10 VN time on 2026-11-13
	tB := time.Date(2026, 11, 13, 0, 10, 0, 0, loc)

	tests := []struct {
		name              string
		now               time.Time
		r                 domain.DashboardRange
		expectedRange     domain.DashboardRange
		expectedCount     int
		expectedFirstDate string
		expectedLastDate  string
		expectedStart     time.Time
	}{
		{
			name:              "23:30 VN - today",
			now:               tA,
			r:                 domain.DashboardRangeToday,
			expectedRange:     domain.DashboardRangeToday,
			expectedCount:     1,
			expectedFirstDate: "2026-11-12",
			expectedLastDate:  "2026-11-12",
			expectedStart:     time.Date(2026, 11, 12, 0, 0, 0, 0, loc).UTC(),
		},
		{
			name:              "23:30 VN - 7d",
			now:               tA,
			r:                 domain.DashboardRange7d,
			expectedRange:     domain.DashboardRange7d,
			expectedCount:     7,
			expectedFirstDate: "2026-11-06",
			expectedLastDate:  "2026-11-12",
			expectedStart:     time.Date(2026, 11, 6, 0, 0, 0, 0, loc).UTC(),
		},
		{
			name:              "23:30 VN - 30d",
			now:               tA,
			r:                 domain.DashboardRange30d,
			expectedRange:     domain.DashboardRange30d,
			expectedCount:     30,
			expectedFirstDate: "2026-10-14",
			expectedLastDate:  "2026-11-12",
			expectedStart:     time.Date(2026, 10, 14, 0, 0, 0, 0, loc).UTC(),
		},
		{
			name:              "00:10 VN - today",
			now:               tB,
			r:                 domain.DashboardRangeToday,
			expectedRange:     domain.DashboardRangeToday,
			expectedCount:     1,
			expectedFirstDate: "2026-11-13",
			expectedLastDate:  "2026-11-13",
			expectedStart:     time.Date(2026, 11, 13, 0, 0, 0, 0, loc).UTC(),
		},
		{
			name:              "00:10 VN - 7d",
			now:               tB,
			r:                 domain.DashboardRange7d,
			expectedRange:     domain.DashboardRange7d,
			expectedCount:     7,
			expectedFirstDate: "2026-11-07",
			expectedLastDate:  "2026-11-13",
			expectedStart:     time.Date(2026, 11, 7, 0, 0, 0, 0, loc).UTC(),
		},
		{
			name:              "00:10 VN - 30d",
			now:               tB,
			r:                 domain.DashboardRange30d,
			expectedRange:     domain.DashboardRange30d,
			expectedCount:     30,
			expectedFirstDate: "2026-10-15",
			expectedLastDate:  "2026-11-13",
			expectedStart:     time.Date(2026, 10, 15, 0, 0, 0, 0, loc).UTC(),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var recordedStart, recordedEnd time.Time
			var recordedLoc *time.Location
			repo := &mockDashboardRepo{
				getDataFn: func(ctx context.Context, start, end time.Time, l *time.Location) (*domain.DashboardRawData, error) {
					recordedStart = start
					recordedEnd = end
					recordedLoc = l
					return &domain.DashboardRawData{}, nil
				},
			}

			uc := New(Dependencies{
				Repo: repo,
				Clock: func() time.Time {
					return tt.now
				},
				Loc: loc,
			})

			res, err := uc.GetDashboard(context.Background(), tt.r)
			require.NoError(t, err)
			assert.Equal(t, tt.expectedRange, res.Range)
			assert.Equal(t, tt.expectedStart, res.RangeStart)
			assert.Equal(t, tt.now.UTC(), res.GeneratedAt)
			assert.Equal(t, tt.now, recordedEnd)
			assert.Equal(t, tt.expectedStart, recordedStart.UTC())
			assert.Equal(t, loc, recordedLoc)

			require.Len(t, res.DailyRevenue, tt.expectedCount)
			assert.Equal(t, tt.expectedFirstDate, res.DailyRevenue[0].Date)
			assert.Equal(t, tt.expectedLastDate, res.DailyRevenue[len(res.DailyRevenue)-1].Date)

			// Ascending date order check
			for i := 1; i < len(res.DailyRevenue); i++ {
				assert.True(t, res.DailyRevenue[i-1].Date < res.DailyRevenue[i].Date,
					"dates must be strictly ascending: %s < %s", res.DailyRevenue[i-1].Date, res.DailyRevenue[i].Date)
			}
		})
	}
}

func TestGetDashboard_DailyPointsAndGapFilling(t *testing.T) {
	loc := domain.VietnamLocation
	fixedNow := time.Date(2026, 11, 12, 10, 0, 0, 0, loc)

	repo := &mockDashboardRepo{
		getDataFn: func(ctx context.Context, start, end time.Time, l *time.Location) (*domain.DashboardRawData, error) {
			return &domain.DashboardRawData{
				DailyDelivered: []domain.DashboardDailyDelivered{
					{Date: "2026-11-08", DeliveredVnd: "50000000", DeliveredOrders: 2},
					{Date: "2026-11-12", DeliveredVnd: "75990000", DeliveredOrders: 3},
				},
				DailyRefunded: []domain.DashboardDailyRefunded{
					{Date: "2026-11-08", RefundedVnd: "10000000"},
					{Date: "2026-11-10", RefundedVnd: "15990000"},
				},
			}, nil
		},
	}

	uc := New(Dependencies{
		Repo:  repo,
		Clock: func() time.Time { return fixedNow },
		Loc:   loc,
	})

	res, err := uc.GetDashboard(context.Background(), domain.DashboardRange7d)
	require.NoError(t, err)
	require.Len(t, res.DailyRevenue, 7)

	// Check gap days (Nov 6, 7, 9, 11) have "0"
	assert.Equal(t, "2026-11-06", res.DailyRevenue[0].Date)
	assert.Equal(t, domain.MoneyVND("0"), res.DailyRevenue[0].DeliveredVnd)
	assert.Equal(t, domain.MoneyVND("0"), res.DailyRevenue[0].RefundedVnd)
	assert.Equal(t, "0", res.DailyRevenue[0].NetVnd)

	// Check Nov 8: 50M delivered, 10M refunded -> net 40M
	assert.Equal(t, "2026-11-08", res.DailyRevenue[2].Date)
	assert.Equal(t, domain.MoneyVND("50000000"), res.DailyRevenue[2].DeliveredVnd)
	assert.Equal(t, domain.MoneyVND("10000000"), res.DailyRevenue[2].RefundedVnd)
	assert.Equal(t, "40000000", res.DailyRevenue[2].NetVnd)

	// Check Nov 10: 0 delivered, 15.99M refunded -> net -15.99M
	assert.Equal(t, "2026-11-10", res.DailyRevenue[4].Date)
	assert.Equal(t, domain.MoneyVND("0"), res.DailyRevenue[4].DeliveredVnd)
	assert.Equal(t, domain.MoneyVND("15990000"), res.DailyRevenue[4].RefundedVnd)
	assert.Equal(t, "-15990000", res.DailyRevenue[4].NetVnd)

	// Check Nov 12: 75.99M delivered, 0 refunded -> net 75.99M
	assert.Equal(t, "2026-11-12", res.DailyRevenue[6].Date)
	assert.Equal(t, domain.MoneyVND("75990000"), res.DailyRevenue[6].DeliveredVnd)
	assert.Equal(t, domain.MoneyVND("0"), res.DailyRevenue[6].RefundedVnd)
	assert.Equal(t, "75990000", res.DailyRevenue[6].NetVnd)

	// Totals
	assert.Equal(t, domain.MoneyVND("125990000"), res.Revenue.DeliveredVnd)
	assert.Equal(t, domain.MoneyVND("25990000"), res.Revenue.RefundedVnd)
	assert.Equal(t, "100000000", res.Revenue.NetVnd)
	assert.Equal(t, int64(5), res.Revenue.DeliveredOrders)
	assert.Equal(t, domain.MoneyVND("25198000"), res.Revenue.AverageOrderVnd) // 125990000 / 5 = 25198000
}

func TestGetDashboard_NegativeNetVnd(t *testing.T) {
	loc := domain.VietnamLocation
	fixedNow := time.Date(2026, 11, 12, 10, 0, 0, 0, loc)

	repo := &mockDashboardRepo{
		getDataFn: func(ctx context.Context, start, end time.Time, l *time.Location) (*domain.DashboardRawData, error) {
			return &domain.DashboardRawData{
				DailyDelivered: []domain.DashboardDailyDelivered{
					{Date: "2026-11-12", DeliveredVnd: "100000", DeliveredOrders: 1},
				},
				DailyRefunded: []domain.DashboardDailyRefunded{
					{Date: "2026-11-12", RefundedVnd: "500000"},
				},
			}, nil
		},
	}

	uc := New(Dependencies{
		Repo:  repo,
		Clock: func() time.Time { return fixedNow },
		Loc:   loc,
	})

	res, err := uc.GetDashboard(context.Background(), domain.DashboardRangeToday)
	require.NoError(t, err)
	assert.Equal(t, "-400000", res.Revenue.NetVnd)
	assert.Equal(t, "-400000", res.DailyRevenue[0].NetVnd)
}

func TestGetDashboard_AverageOrderVnd_ZeroOrders(t *testing.T) {
	loc := domain.VietnamLocation
	fixedNow := time.Date(2026, 11, 12, 10, 0, 0, 0, loc)

	repo := &mockDashboardRepo{
		getDataFn: func(ctx context.Context, start, end time.Time, l *time.Location) (*domain.DashboardRawData, error) {
			return &domain.DashboardRawData{}, nil
		},
	}

	uc := New(Dependencies{
		Repo:  repo,
		Clock: func() time.Time { return fixedNow },
		Loc:   loc,
	})

	res, err := uc.GetDashboard(context.Background(), domain.DashboardRange7d)
	require.NoError(t, err)
	assert.Equal(t, int64(0), res.Revenue.DeliveredOrders)
	assert.Equal(t, domain.MoneyVND("0"), res.Revenue.AverageOrderVnd)
}

func TestGetDashboard_ByStatus9KeysGuaranteed(t *testing.T) {
	loc := domain.VietnamLocation
	fixedNow := time.Date(2026, 11, 12, 10, 0, 0, 0, loc)

	expectedStatuses := []string{
		"pending_confirmation",
		"confirmed",
		"preparing",
		"shipped",
		"delivered",
		"cancel_requested",
		"cancelled",
		"partially_returned",
		"returned",
	}

	t.Run("empty status map filled with 0 for all 9 statuses", func(t *testing.T) {
		repo := &mockDashboardRepo{
			getDataFn: func(ctx context.Context, start, end time.Time, l *time.Location) (*domain.DashboardRawData, error) {
				return &domain.DashboardRawData{
					OrdersSummary: domain.DashboardOrdersSummary{
						ByStatus: map[string]int64{},
					},
				}, nil
			},
		}

		uc := New(Dependencies{
			Repo:  repo,
			Clock: func() time.Time { return fixedNow },
			Loc:   loc,
		})

		res, err := uc.GetDashboard(context.Background(), domain.DashboardRangeToday)
		require.NoError(t, err)
		require.Len(t, res.Orders.ByStatus, 9)
		for _, s := range expectedStatuses {
			val, ok := res.Orders.ByStatus[s]
			assert.True(t, ok, "missing status key %s", s)
			assert.Equal(t, int64(0), val)
		}
	})

	t.Run("partial status map preserves values and fills remaining with 0", func(t *testing.T) {
		repo := &mockDashboardRepo{
			getDataFn: func(ctx context.Context, start, end time.Time, l *time.Location) (*domain.DashboardRawData, error) {
				return &domain.DashboardRawData{
					OrdersSummary: domain.DashboardOrdersSummary{
						ByStatus: map[string]int64{
							"delivered": 42,
							"cancelled": 5,
						},
					},
				}, nil
			},
		}

		uc := New(Dependencies{
			Repo:  repo,
			Clock: func() time.Time { return fixedNow },
			Loc:   loc,
		})

		res, err := uc.GetDashboard(context.Background(), domain.DashboardRangeToday)
		require.NoError(t, err)
		assert.Equal(t, int64(42), res.Orders.ByStatus["delivered"])
		assert.Equal(t, int64(5), res.Orders.ByStatus["cancelled"])
		assert.Equal(t, int64(0), res.Orders.ByStatus["pending_confirmation"])
	})
}

func TestGetDashboard_NilSlicesNormalized(t *testing.T) {
	loc := domain.VietnamLocation
	fixedNow := time.Date(2026, 11, 12, 10, 0, 0, 0, loc)

	repo := &mockDashboardRepo{
		getDataFn: func(ctx context.Context, start, end time.Time, l *time.Location) (*domain.DashboardRawData, error) {
			return &domain.DashboardRawData{
				TopProducts: nil,
				LowStock: domain.DashboardLowStockData{
					Threshold: 5,
					Total:     1,
					Items: []domain.DashboardLowStockItem{
						{
							VariantID:     "v-1",
							ProductID:     "p-1",
							ProductName:   "Item without options",
							Options:       nil,
							StockQuantity: 3,
						},
					},
				},
			}, nil
		},
	}

	uc := New(Dependencies{
		Repo:  repo,
		Clock: func() time.Time { return fixedNow },
		Loc:   loc,
	})

	res, err := uc.GetDashboard(context.Background(), domain.DashboardRangeToday)
	require.NoError(t, err)
	assert.NotNil(t, res.TopProducts)
	assert.Empty(t, res.TopProducts)
	require.Len(t, res.LowStock.Items, 1)
	assert.NotNil(t, res.LowStock.Items[0].Options)
	assert.Empty(t, res.LowStock.Items[0].Options)
}

func TestGetDashboard_RepoError(t *testing.T) {
	expectedErr := errors.New("database connection refused")
	repo := &mockDashboardRepo{
		getDataFn: func(ctx context.Context, start, end time.Time, l *time.Location) (*domain.DashboardRawData, error) {
			return nil, expectedErr
		},
	}

	uc := New(Dependencies{
		Repo: repo,
	})

	res, err := uc.GetDashboard(context.Background(), domain.DashboardRange7d)
	assert.Nil(t, res)
	assert.ErrorIs(t, err, expectedErr)
}
