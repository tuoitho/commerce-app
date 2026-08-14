package domain

import (
	"errors"
	"testing"
)

func TestMoneyVNDCanonical(t *testing.T) {
	for _, value := range []MoneyVND{"0", "999", "99999999999999999999999999999999999999"} {
		if !value.IsCanonical() {
			t.Errorf("%q should be canonical", value)
		}
	}
	for _, value := range []MoneyVND{"", "01", "+1", "-1", "1.0", "1,000"} {
		if value.IsCanonical() {
			t.Errorf("%q should be rejected", value)
		}
	}
}

func TestMoneyVNDSumPreservesPrecision(t *testing.T) {
	got, err := AddMoneyVND("99999999999999999999999999999999999999", "1")
	if err != nil || got != "100000000000000000000000000000000000000" {
		t.Fatalf("sum = %q, err = %v", got, err)
	}
}

func TestCartAvailabilityValuesAreStable(t *testing.T) {
	if CartAvailable != "available" || CartUnavailable != "unavailable" || CartOutOfStock != "out_of_stock" || CartInsufficientStock != "insufficient_stock" {
		t.Fatal("cart availability values changed")
	}
	if !errors.Is(ErrCartItemNotFound, ErrCartItemNotFound) || !errors.Is(ErrVariantNotFound, ErrVariantNotFound) {
		t.Fatal("cart sentinel errors are not stable")
	}
}

func TestCartItemLineTotalIsNullable(t *testing.T) {
	item := CartItem{Availability: CartOutOfStock}
	if item.LineTotalVND != nil {
		t.Fatal("unavailable line total should be nullable")
	}
	value := MoneyVND("2000")
	item = CartItem{Availability: CartAvailable, UnitPriceVND: &value, LineTotalVND: &value}
	if item.LineTotalVND == nil || *item.LineTotalVND != "2000" {
		t.Fatalf("unexpected available line total: %#v", item.LineTotalVND)
	}
}
