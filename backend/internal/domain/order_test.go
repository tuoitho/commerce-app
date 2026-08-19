package domain

import (
	"reflect"
	"testing"
)

func TestOrderStatus_AllEightStatuses(t *testing.T) {
	statuses := []OrderStatus{
		OrderStatusPendingConfirmation,
		OrderStatusConfirmed,
		OrderStatusPreparing,
		OrderStatusCancelRequested,
		OrderStatusShipped,
		OrderStatusDelivered,
		OrderStatusCancelled,
		OrderStatusReturned,
	}

	expectedCodes := []string{
		"pending_confirmation",
		"confirmed",
		"preparing",
		"cancel_requested",
		"shipped",
		"delivered",
		"cancelled",
		"returned",
	}

	if len(statuses) != 8 {
		t.Fatalf("expected exactly 8 order statuses, got %d", len(statuses))
	}

	seen := make(map[OrderStatus]bool)
	for i, s := range statuses {
		if string(s) != expectedCodes[i] {
			t.Errorf("expected status %d to have code %q, got %q", i, expectedCodes[i], string(s))
		}
		if !s.IsValid() {
			t.Errorf("expected status %q to be valid", s)
		}
		if seen[s] {
			t.Errorf("duplicate status: %q", s)
		}
		seen[s] = true
	}

	invalidStatuses := []OrderStatus{"", "pending", "unknown", "in_transit"}
	for _, inv := range invalidStatuses {
		if inv.IsValid() {
			t.Errorf("expected status %q to be invalid", inv)
		}
	}
}

func TestOrderStatusBucket_Mapping(t *testing.T) {
	tests := []struct {
		bucket           OrderStatusBucket
		valid            bool
		expectedStatuses []OrderStatus
	}{
		{
			bucket:           OrderStatusBucketAll,
			valid:            true,
			expectedStatuses: nil,
		},
		{
			bucket:           OrderStatusBucketPending,
			valid:            true,
			expectedStatuses: []OrderStatus{OrderStatusPendingConfirmation},
		},
		{
			bucket:           OrderStatusBucketPickup,
			valid:            true,
			expectedStatuses: []OrderStatus{OrderStatusConfirmed, OrderStatusPreparing, OrderStatusCancelRequested},
		},
		{
			bucket:           OrderStatusBucketDelivery,
			valid:            true,
			expectedStatuses: []OrderStatus{OrderStatusShipped},
		},
		{
			bucket:           OrderStatusBucketDelivered,
			valid:            true,
			expectedStatuses: []OrderStatus{OrderStatusDelivered},
		},
		{
			bucket:           OrderStatusBucketReturns,
			valid:            true,
			expectedStatuses: []OrderStatus{OrderStatusReturned},
		},
		{
			bucket:           OrderStatusBucketCancelled,
			valid:            true,
			expectedStatuses: []OrderStatus{OrderStatusCancelled},
		},
		{
			bucket: OrderStatusBucket("invalid_bucket"),
			valid:  false,
		},
	}

	for _, tt := range tests {
		t.Run(string(tt.bucket), func(t *testing.T) {
			if tt.bucket.IsValid() != tt.valid {
				t.Errorf("expected IsValid() = %v for bucket %q, got %v", tt.valid, tt.bucket, tt.bucket.IsValid())
			}
			if tt.valid {
				got := tt.bucket.Statuses()
				if !reflect.DeepEqual(got, tt.expectedStatuses) {
					t.Errorf("expected statuses %v for bucket %q, got %v", tt.expectedStatuses, tt.bucket, got)
				}
			}
		})
	}
}
