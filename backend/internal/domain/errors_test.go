package domain

import (
	"testing"
)

func TestProductChangedError_Formatting(t *testing.T) {
	tests := []struct {
		name     string
		products []string
		expected string
	}{
		{
			name:     "single product",
			products: []string{"Áo thun nam"},
			expected: "Sản phẩm Áo thun nam vừa được cập nhật. Vui lòng tải lại để xem thông tin mới nhất.",
		},
		{
			name:     "multiple products",
			products: []string{"Áo thun nam", "Quần jean"},
			expected: "Các sản phẩm Áo thun nam, Quần jean vừa được cập nhật. Vui lòng tải lại để xem thông tin mới nhất.",
		},
		{
			name:     "no products",
			products: nil,
			expected: "Sản phẩm vừa được cập nhật. Vui lòng tải lại để xem thông tin mới nhất.",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := &ProductChangedError{Products: tt.products}
			if got := err.Error(); got != tt.expected {
				t.Errorf("expected %q, got %q", tt.expected, got)
			}
		})
	}
}

func TestSentinelErrors_Defined(t *testing.T) {
	sentinels := []struct {
		name string
		err  error
	}{
		{"ErrCartEmpty", ErrCartEmpty},
		{"ErrAddressNotFound", ErrAddressNotFound},
		{"ErrOrderNotFound", ErrOrderNotFound},
		{"ErrOrderNotCancellable", ErrOrderNotCancellable},
		{"ErrOrderNotCancelRequested", ErrOrderNotCancelRequested},
		{"ErrOrderItemNotFound", ErrOrderItemNotFound},
		{"ErrReviewNotFound", ErrReviewNotFound},
		{"ErrReviewNotEligible", ErrReviewNotEligible},
		{"ErrReviewAlreadyExists", ErrReviewAlreadyExists},
		{"ErrReviewEditLimitReached", ErrReviewEditLimitReached},
		{"ErrReviewMediaNotFound", ErrReviewMediaNotFound},
	}

	for _, s := range sentinels {
		if s.err == nil {
			t.Errorf("expected %s to be non-nil", s.name)
		}
	}
}
