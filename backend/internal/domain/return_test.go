package domain

import (
	"testing"
	"time"
)

func TestReturnStatus_Validation(t *testing.T) {
	validStatuses := []ReturnStatus{
		ReturnStatusPendingApproval,
		ReturnStatusApproved,
		ReturnStatusReceived,
		ReturnStatusRefunded,
		ReturnStatusRejected,
		ReturnStatusCancelled,
	}

	for _, s := range validStatuses {
		if !s.IsValid() {
			t.Errorf("expected status %q to be valid", s)
		}
	}

	invalidStatuses := []ReturnStatus{"", "pending", "completed", "failed"}
	for _, s := range invalidStatuses {
		if s.IsValid() {
			t.Errorf("expected status %q to be invalid", s)
		}
	}
}

func TestReturnReasonCode_Validation(t *testing.T) {
	validCodes := []ReturnReasonCode{
		ReturnReasonDefective,
		ReturnReasonNotAsDescribed,
		ReturnReasonWrongOrMissing,
		ReturnReasonChangedMind,
	}

	for _, c := range validCodes {
		if !c.IsValid() {
			t.Errorf("expected reason code %q to be valid", c)
		}
	}

	invalidCodes := []ReturnReasonCode{"", "broken", "other", "unknown"}
	for _, c := range invalidCodes {
		if c.IsValid() {
			t.Errorf("expected reason code %q to be invalid", c)
		}
	}
}

func TestCalculateReturnDeadline_AsiaHoChiMinh(t *testing.T) {
	loc := time.FixedZone("Asia/Ho_Chi_Minh", 7*3600)

	// Delivered on 2026-09-01 at 08:00 local time
	deliveredAt := time.Date(2026, 9, 1, 8, 0, 0, 0, loc).UTC()
	deadline := CalculateReturnDeadline(deliveredAt)

	// Expected: end of 2026-09-08 in Asia/Ho_Chi_Minh (23:59:59.999999999)
	expectedDeadlineLocal := time.Date(2026, 9, 8, 23, 59, 59, 999999999, loc)
	expectedDeadlineUTC := expectedDeadlineLocal.UTC()

	if !deadline.Equal(expectedDeadlineUTC) {
		t.Errorf("CalculateReturnDeadline() = %v, want %v", deadline, expectedDeadlineUTC)
	}

	// Delivered on 2026-09-01 at 23:59 local time (still day 1)
	deliveredLate := time.Date(2026, 9, 1, 23, 59, 0, 0, loc).UTC()
	deadlineLate := CalculateReturnDeadline(deliveredLate)
	if !deadlineLate.Equal(expectedDeadlineUTC) {
		t.Errorf("CalculateReturnDeadline() late = %v, want %v", deadlineLate, expectedDeadlineUTC)
	}
}

func TestCalculateReturnEligibility(t *testing.T) {
	loc := time.FixedZone("Asia/Ho_Chi_Minh", 7*3600)
	deliveredAt := time.Date(2026, 9, 1, 10, 0, 0, 0, loc).UTC()
	deadline := CalculateReturnDeadline(deliveredAt)

	tests := []struct {
		name         string
		order        Order
		latestReturn *ReturnRequest
		now          time.Time
		wantEligible bool
		wantDeadline bool
	}{
		{
			name: "order not delivered",
			order: Order{
				Status:      OrderStatusShipped,
				DeliveredAt: &deliveredAt,
			},
			now:          time.Date(2026, 9, 3, 10, 0, 0, 0, loc).UTC(),
			wantEligible: false,
			wantDeadline: false,
		},
		{
			name: "order delivered but deliveredAt is nil",
			order: Order{
				Status:      OrderStatusDelivered,
				DeliveredAt: nil,
			},
			now:          time.Date(2026, 9, 3, 10, 0, 0, 0, loc).UTC(),
			wantEligible: false,
			wantDeadline: false,
		},
		{
			name: "order delivered within 7 days no prior return",
			order: Order{
				Status:      OrderStatusDelivered,
				DeliveredAt: &deliveredAt,
			},
			latestReturn: nil,
			now:          time.Date(2026, 9, 5, 12, 0, 0, 0, loc).UTC(),
			wantEligible: true,
			wantDeadline: true,
		},
		{
			name: "order delivered past 7 days deadline",
			order: Order{
				Status:      OrderStatusDelivered,
				DeliveredAt: &deliveredAt,
			},
			latestReturn: nil,
			now:          time.Date(2026, 9, 9, 0, 0, 0, 1, loc).UTC(),
			wantEligible: false,
			wantDeadline: true,
		},
		{
			name: "within 7 days with pending_approval return",
			order: Order{
				Status:      OrderStatusDelivered,
				DeliveredAt: &deliveredAt,
			},
			latestReturn: &ReturnRequest{Status: ReturnStatusPendingApproval},
			now:          time.Date(2026, 9, 5, 12, 0, 0, 0, loc).UTC(),
			wantEligible: false,
			wantDeadline: true,
		},
		{
			name: "within 7 days with approved return",
			order: Order{
				Status:      OrderStatusDelivered,
				DeliveredAt: &deliveredAt,
			},
			latestReturn: &ReturnRequest{Status: ReturnStatusApproved},
			now:          time.Date(2026, 9, 5, 12, 0, 0, 0, loc).UTC(),
			wantEligible: false,
			wantDeadline: true,
		},
		{
			name: "within 7 days with received return",
			order: Order{
				Status:      OrderStatusDelivered,
				DeliveredAt: &deliveredAt,
			},
			latestReturn: &ReturnRequest{Status: ReturnStatusReceived},
			now:          time.Date(2026, 9, 5, 12, 0, 0, 0, loc).UTC(),
			wantEligible: false,
			wantDeadline: true,
		},
		{
			name: "within 7 days with refunded return",
			order: Order{
				Status:      OrderStatusDelivered,
				DeliveredAt: &deliveredAt,
			},
			latestReturn: &ReturnRequest{Status: ReturnStatusRefunded},
			now:          time.Date(2026, 9, 5, 12, 0, 0, 0, loc).UTC(),
			wantEligible: false,
			wantDeadline: true,
		},
		{
			name: "within 7 days with cancelled return (allowed to retry)",
			order: Order{
				Status:      OrderStatusDelivered,
				DeliveredAt: &deliveredAt,
			},
			latestReturn: &ReturnRequest{Status: ReturnStatusCancelled},
			now:          time.Date(2026, 9, 5, 12, 0, 0, 0, loc).UTC(),
			wantEligible: true,
			wantDeadline: true,
		},
		{
			name: "within 7 days with rejected return (allowed to retry)",
			order: Order{
				Status:      OrderStatusDelivered,
				DeliveredAt: &deliveredAt,
			},
			latestReturn: &ReturnRequest{Status: ReturnStatusRejected},
			now:          time.Date(2026, 9, 5, 12, 0, 0, 0, loc).UTC(),
			wantEligible: true,
			wantDeadline: true,
		},
		{
			name: "past 7 days with cancelled return",
			order: Order{
				Status:      OrderStatusDelivered,
				DeliveredAt: &deliveredAt,
			},
			latestReturn: &ReturnRequest{Status: ReturnStatusCancelled},
			now:          time.Date(2026, 9, 9, 1, 0, 0, 0, loc).UTC(),
			wantEligible: false,
			wantDeadline: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := CalculateReturnEligibility(tt.order, tt.latestReturn, tt.now)
			if res.Eligible != tt.wantEligible {
				t.Errorf("Eligible = %v, want %v", res.Eligible, tt.wantEligible)
			}
			if (res.Deadline != nil) != tt.wantDeadline {
				t.Errorf("Deadline presence = %v, want %v", res.Deadline != nil, tt.wantDeadline)
			}
			if tt.wantDeadline && res.Deadline != nil {
				if !res.Deadline.Equal(deadline) {
					t.Errorf("Deadline = %v, want %v", res.Deadline, deadline)
				}
			}
		})
	}
}
