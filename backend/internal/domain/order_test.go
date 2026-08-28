package domain

import (
	"reflect"
	"testing"
)

func TestOrderStatus_AllNineStatuses(t *testing.T) {
	statuses := []OrderStatus{
		OrderStatusPendingConfirmation,
		OrderStatusConfirmed,
		OrderStatusPreparing,
		OrderStatusCancelRequested,
		OrderStatusShipped,
		OrderStatusDelivered,
		OrderStatusCancelled,
		OrderStatusPartiallyReturned,
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
		"partially_returned",
		"returned",
	}

	if len(statuses) != 9 {
		t.Fatalf("expected exactly 9 order statuses, got %d", len(statuses))
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
			expectedStatuses: []OrderStatus{OrderStatusPartiallyReturned, OrderStatusReturned},
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

func TestOrderAdminAction_IsValid(t *testing.T) {
	tests := []struct {
		action OrderAdminAction
		valid  bool
	}{
		{action: OrderAdminActionConfirmPreparing, valid: true},
		{action: OrderAdminActionShip, valid: true},
		{action: OrderAdminActionDeliver, valid: true},
		{action: OrderAdminActionApproveCancel, valid: true},
		{action: OrderAdminActionDeclineCancel, valid: true},
		{action: OrderAdminAction(""), valid: false},
		{action: OrderAdminAction("unknown"), valid: false},
		{action: OrderAdminAction("cancel"), valid: false},
		{action: OrderAdminAction("preparing"), valid: false},
	}

	for _, tt := range tests {
		t.Run(string(tt.action), func(t *testing.T) {
			if got := tt.action.IsValid(); got != tt.valid {
				t.Errorf("OrderAdminAction(%q).IsValid() = %v, want %v", tt.action, got, tt.valid)
			}
		})
	}
}

func TestOrderAdminAction_Transition(t *testing.T) {
	tests := []struct {
		name         string
		action       OrderAdminAction
		wantFrom     OrderStatus
		wantTo       OrderStatus
		wantRestock  bool
		wantOk       bool
	}{
		{
			name:        "confirm_preparing: confirmed -> preparing, no restock",
			action:      OrderAdminActionConfirmPreparing,
			wantFrom:    OrderStatusConfirmed,
			wantTo:      OrderStatusPreparing,
			wantRestock: false,
			wantOk:      true,
		},
		{
			name:        "ship: preparing -> shipped, no restock",
			action:      OrderAdminActionShip,
			wantFrom:    OrderStatusPreparing,
			wantTo:      OrderStatusShipped,
			wantRestock: false,
			wantOk:      true,
		},
		{
			name:        "deliver: shipped -> delivered, no restock",
			action:      OrderAdminActionDeliver,
			wantFrom:    OrderStatusShipped,
			wantTo:      OrderStatusDelivered,
			wantRestock: false,
			wantOk:      true,
		},
		{
			name:        "approve_cancel: cancel_requested -> cancelled, with restock",
			action:      OrderAdminActionApproveCancel,
			wantFrom:    OrderStatusCancelRequested,
			wantTo:      OrderStatusCancelled,
			wantRestock: true,
			wantOk:      true,
		},
		{
			name:        "decline_cancel: cancel_requested -> preparing, no restock",
			action:      OrderAdminActionDeclineCancel,
			wantFrom:    OrderStatusCancelRequested,
			wantTo:      OrderStatusPreparing,
			wantRestock: false,
			wantOk:      true,
		},
		{
			name:        "unknown action: not ok",
			action:      OrderAdminAction("invalid"),
			wantFrom:    "",
			wantTo:      "",
			wantRestock: false,
			wantOk:      false,
		},
		{
			name:        "empty action: not ok",
			action:      OrderAdminAction(""),
			wantFrom:    "",
			wantTo:      "",
			wantRestock: false,
			wantOk:      false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotFrom, gotTo, gotRestock, gotOk := tt.action.Transition()
			if gotOk != tt.wantOk {
				t.Fatalf("Transition() ok = %v, want %v", gotOk, tt.wantOk)
			}
			if gotFrom != tt.wantFrom {
				t.Errorf("Transition() from = %v, want %v", gotFrom, tt.wantFrom)
			}
			if gotTo != tt.wantTo {
				t.Errorf("Transition() to = %v, want %v", gotTo, tt.wantTo)
			}
			if gotRestock != tt.wantRestock {
				t.Errorf("Transition() restock = %v, want %v", gotRestock, tt.wantRestock)
			}
		})
	}
}

func TestOrder_BuyerEmailField(t *testing.T) {
	o := Order{
		ID:         "test-id",
		BuyerEmail: "buyer@example.com",
	}
	if o.BuyerEmail != "buyer@example.com" {
		t.Errorf("expected BuyerEmail to be buyer@example.com, got %q", o.BuyerEmail)
	}
}

