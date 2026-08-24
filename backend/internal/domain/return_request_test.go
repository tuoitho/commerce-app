package domain

import "testing"

func TestReturnRequestStatus_IsValid(t *testing.T) {
	valid := []ReturnRequestStatus{
		ReturnStatusPendingApproval,
		ReturnStatusApproved,
		ReturnStatusReceived,
		ReturnStatusRefunded,
		ReturnStatusRejected,
		ReturnStatusCancelled,
	}
	for _, s := range valid {
		if !s.IsValid() {
			t.Errorf("expected %s to be valid", s)
		}
	}
	if ReturnRequestStatus("unknown").IsValid() {
		t.Error("expected unknown status to be invalid")
	}
}

func TestReturnRequestStatus_ConsumesQuantity(t *testing.T) {
	consuming := []ReturnRequestStatus{
		ReturnStatusPendingApproval,
		ReturnStatusApproved,
		ReturnStatusReceived,
		ReturnStatusRefunded,
	}
	for _, s := range consuming {
		if !s.ConsumesQuantity() {
			t.Errorf("expected %s to consume quantity", s)
		}
	}
	notConsuming := []ReturnRequestStatus{ReturnStatusRejected, ReturnStatusCancelled}
	for _, s := range notConsuming {
		if s.ConsumesQuantity() {
			t.Errorf("expected %s to NOT consume quantity", s)
		}
	}
}

func TestReturnReasonCode_IsValidAndLabel(t *testing.T) {
	for code, label := range returnReasonLabels {
		if !code.IsValid() {
			t.Errorf("expected %s to be valid", code)
		}
		if label == "" {
			t.Errorf("expected non-empty Vietnamese label for %s", code)
		}
	}
	if ReturnReasonCode("other").IsValid() {
		t.Error("expected unknown reason to be invalid")
	}
}

func TestReturnAdminAction_AllowedFrom(t *testing.T) {
	tests := []struct {
		action   ReturnAdminAction
		expected ReturnRequestStatus
	}{
		{ReturnActionApprove, ReturnStatusPendingApproval},
		{ReturnActionReject, ReturnStatusPendingApproval},
		{ReturnActionReceive, ReturnStatusApproved},
		{ReturnActionRefund, ReturnStatusReceived},
	}
	for _, tt := range tests {
		from, ok := tt.action.AllowedFrom()
		if !ok {
			t.Fatalf("expected action %s to be valid", tt.action)
		}
		if from != tt.expected {
			t.Errorf("action %s: expected allowed from %s, got %s", tt.action, tt.expected, from)
		}
	}

	allStatuses := []ReturnRequestStatus{
		ReturnStatusPendingApproval,
		ReturnStatusApproved,
		ReturnStatusReceived,
		ReturnStatusRefunded,
		ReturnStatusRejected,
		ReturnStatusCancelled,
	}
	for _, from := range allStatuses {
		for _, to := range allStatuses {
			action := mapTransitionAction(from, to)
			if action == "" {
				continue
			}
			allowedFrom, ok := action.AllowedFrom()
			if !ok || allowedFrom != from {
				t.Errorf("transition %s->%s via action %s has inconsistent AllowedFrom", from, to, action)
			}
		}
	}

	if ReturnAdminAction("cancel_all").IsValid() {
		t.Error("expected unknown admin action to be invalid")
	}
}

func mapTransitionAction(from, to ReturnRequestStatus) ReturnAdminAction {
	switch {
	case from == ReturnStatusPendingApproval && to == ReturnStatusApproved:
		return ReturnActionApprove
	case from == ReturnStatusPendingApproval && to == ReturnStatusRejected:
		return ReturnActionReject
	case from == ReturnStatusApproved && to == ReturnStatusReceived:
		return ReturnActionReceive
	case from == ReturnStatusReceived && to == ReturnStatusRefunded:
		return ReturnActionRefund
	default:
		return ""
	}
}

func TestReturnWindowDays(t *testing.T) {
	if ReturnWindowDays != 7 {
		t.Errorf("expected ReturnWindowDays=7, got %d", ReturnWindowDays)
	}
}
