package repository

import (
	"testing"

	"commerce-backend/internal/domain"
)

func TestComputeSuggestedRefund_FirstRefundIncludesShipping(t *testing.T) {
	items := []domain.ReturnRequestItem{
		{UnitPriceVND: "500000", Quantity: 1},
	}
	got := computeSuggestedRefund(items, "20000", false)
	if got != "520000" {
		t.Errorf("expected 520000 (500000x1 + shipping 20000), got %s", got)
	}
}

func TestComputeSuggestedRefund_SubsequentRefundExcludesShipping(t *testing.T) {
	items := []domain.ReturnRequestItem{
		{UnitPriceVND: "300000", Quantity: 1},
	}
	got := computeSuggestedRefund(items, "20000", true)
	if got != "300000" {
		t.Errorf("expected 300000 (item value only, no second shipping), got %s", got)
	}
}

func TestComputeSuggestedRefund_MultiLineAggregation(t *testing.T) {
	items := []domain.ReturnRequestItem{
		{UnitPriceVND: "500000", Quantity: 2},
		{UnitPriceVND: "300000", Quantity: 1},
	}
	got := computeSuggestedRefund(items, "0", false)
	if got != "1300000" {
		t.Errorf("expected 1300000, got %s", got)
	}
}
