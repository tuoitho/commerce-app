package repository

import (
	"errors"
	"testing"

	"commerce-backend/internal/domain"
)

func TestValidateProductPriceFilterRejectsLegacyBounds(t *testing.T) {
	for name, filter := range map[string]domain.ProductFilter{
		"legacy min": {MinPrice: "25.00"},
		"legacy max": {MaxPrice: "60.00"},
	} {
		t.Run(name, func(t *testing.T) {
			var filterErr *domain.FilterValidationError
			if !errors.As(validateProductPriceFilter(filter), &filterErr) {
				t.Fatal("expected filter validation error")
			}
		})
	}
}

func TestValidateProductPriceFilterRejectsInvalidCanonicalBounds(t *testing.T) {
	for name, value := range map[string]domain.MoneyVND{
		"leading zero": "01",
		"decimal":      "1.0",
		"too long":     "100000000000000000000000000000000000000",
	} {
		t.Run(name, func(t *testing.T) {
			var filterErr *domain.FilterValidationError
			if !errors.As(validateProductPriceFilter(domain.ProductFilter{MinPriceVND: &value}), &filterErr) {
				t.Fatal("expected filter validation error")
			}
		})
	}
}

func TestValidateProductPriceFilterAcceptsCanonicalBounds(t *testing.T) {
	min, max := domain.MoneyVND("0"), domain.MoneyVND("99999999999999999999999999999999999999")
	if err := validateProductPriceFilter(domain.ProductFilter{MinPriceVND: &min, MaxPriceVND: &max}); err != nil {
		t.Fatal(err)
	}
}
