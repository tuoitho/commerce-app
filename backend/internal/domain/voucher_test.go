package domain

import (
	"errors"
	"testing"
	"time"
)

func intPtrDomain(v int) *int { return &v }

func TestNormalizeAndValidateVoucherCode(t *testing.T) {
	if got := NormalizeVoucherCode("  aura500k \t"); got != "AURA500K" {
		t.Fatalf("NormalizeVoucherCode = %q, want AURA500K", got)
	}

	valid := []string{"ABC", "AURA-500_K", "12345678901234567890123456789012"}
	for _, code := range valid {
		if !IsValidVoucherCode(code) {
			t.Errorf("expected code %q to be valid", code)
		}
	}

	invalid := []string{"", "AB", "abc", "AURA 500", "AURA!500", "123456789012345678901234567890123"}
	for _, code := range invalid {
		if IsValidVoucherCode(code) {
			t.Errorf("expected code %q to be invalid", code)
		}
	}
}

func TestDeriveVoucherEffectiveStatus(t *testing.T) {
	now := time.Date(2026, 11, 18, 12, 0, 0, 0, time.UTC)
	past := now.Add(-1 * time.Hour)
	future := now.Add(1 * time.Hour)
	farFuture := now.Add(2 * time.Hour)

	tests := []struct {
		name       string
		active     bool
		startsAt   time.Time
		endsAt     time.Time
		usageLimit *int
		usedCount  int
		want       VoucherEffectiveStatus
	}{
		{"inactive overrides everything", false, past, future, nil, 0, VoucherStatusInactive},
		{"expired when now > endsAt", true, past.Add(-time.Hour), past, nil, 0, VoucherStatusExpired},
		{"scheduled when now < startsAt", true, future, farFuture, nil, 0, VoucherStatusScheduled},
		{"exhausted when usedCount >= usageLimit", true, past, future, intPtrDomain(10), 10, VoucherStatusExhausted},
		{"active at exact startsAt boundary", true, now, future, intPtrDomain(10), 9, VoucherStatusActive},
		{"active at exact endsAt boundary", true, past, now, nil, 5, VoucherStatusActive},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := DeriveVoucherEffectiveStatus(tt.active, tt.startsAt, tt.endsAt, now, tt.usageLimit, tt.usedCount)
			if got != tt.want {
				t.Errorf("DeriveVoucherEffectiveStatus() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestCalculateVoucherDiscount_PD1(t *testing.T) {
	tests := []struct {
		name           string
		voucherType    VoucherType
		discountValue  MoneyVND
		maxDiscountVND *MoneyVND
		subtotalVND    MoneyVND
		shippingFeeVND MoneyVND
		want           MoneyVND
	}{
		{
			name:           "percent with truncation and cap",
			voucherType:    VoucherTypePercent,
			discountValue:  "15",
			maxDiscountVND: MoneyVNDPtr("500000"),
			subtotalVND:    "10000000",
			shippingFeeVND: "25000",
			want:           "500000",
		},
		{
			name:           "percent without cap truncates integer division",
			voucherType:    VoucherTypePercent,
			discountValue:  "15",
			maxDiscountVND: nil,
			subtotalVND:    "1005",
			shippingFeeVND: "25000",
			want:           "150", // trunc(1005 * 15 / 100) = 150
		},
		{
			name:           "percent 100% equals subtotal",
			voucherType:    VoucherTypePercent,
			discountValue:  "100",
			maxDiscountVND: nil,
			subtotalVND:    "2500000",
			shippingFeeVND: "25000",
			want:           "2500000",
		},
		{
			name:           "fixed_amount capped at subtotal",
			voucherType:    VoucherTypeFixedAmount,
			discountValue:  "1000000",
			maxDiscountVND: nil,
			subtotalVND:    "600000",
			shippingFeeVND: "40000",
			want:           "600000",
		},
		{
			name:           "fixed_amount normal",
			voucherType:    VoucherTypeFixedAmount,
			discountValue:  "500000",
			maxDiscountVND: nil,
			subtotalVND:    "10000000",
			shippingFeeVND: "0",
			want:           "500000",
		},
		{
			name:           "freeship without cap waives full shipping fee (express_2h)",
			voucherType:    VoucherTypeFreeship,
			discountValue:  "0",
			maxDiscountVND: nil,
			subtotalVND:    "2000000",
			shippingFeeVND: "60000",
			want:           "60000",
		},
		{
			name:           "freeship with cap limits discount on express_2h",
			voucherType:    VoucherTypeFreeship,
			discountValue:  "0",
			maxDiscountVND: MoneyVNDPtr("30000"),
			subtotalVND:    "2000000",
			shippingFeeVND: "60000",
			want:           "30000",
		},
		{
			name:           "freeship with cap higher than shipping fee caps at shipping fee",
			voucherType:    VoucherTypeFreeship,
			discountValue:  "0",
			maxDiscountVND: MoneyVNDPtr("50000"),
			subtotalVND:    "2000000",
			shippingFeeVND: "25000",
			want:           "25000",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := CalculateVoucherDiscount(tt.voucherType, tt.discountValue, tt.maxDiscountVND, tt.subtotalVND, tt.shippingFeeVND)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("CalculateVoucherDiscount() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestCalculateShippingQuote_PD8(t *testing.T) {
	cfg := DefaultShippingConfig()

	tests := []struct {
		name           string
		provinceCode   int32
		subtotalVND    MoneyVND
		deliveryMethod DeliveryMethod
		wantExpress    bool
		wantStdFee     MoneyVND
		wantSelected   MoneyVND
		wantErr        error
	}{
		{
			name:           "Hanoi below free threshold standard",
			provinceCode:   1,
			subtotalVND:    "4999999",
			deliveryMethod: DeliveryMethodStandard,
			wantExpress:    true,
			wantStdFee:     "25000",
			wantSelected:   "25000",
		},
		{
			name:           "HCM at free threshold standard is 0",
			provinceCode:   79,
			subtotalVND:    "5000000",
			deliveryMethod: DeliveryMethodStandard,
			wantExpress:    true,
			wantStdFee:     "0",
			wantSelected:   "0",
		},
		{
			name:           "HCM above free threshold express_2h still costs 60000",
			provinceCode:   79,
			subtotalVND:    "25000000",
			deliveryMethod: DeliveryMethodExpress2H,
			wantExpress:    true,
			wantStdFee:     "0",
			wantSelected:   "60000",
		},
		{
			name:           "Major cities (Hai Phong 31, Hue 46, Da Nang 48, Can Tho 92) below threshold",
			provinceCode:   48,
			subtotalVND:    "1000000",
			deliveryMethod: DeliveryMethodStandard,
			wantExpress:    false,
			wantStdFee:     "30000",
			wantSelected:   "30000",
		},
		{
			name:           "Major city express_2h rejected",
			provinceCode:   31,
			subtotalVND:    "1000000",
			deliveryMethod: DeliveryMethodExpress2H,
			wantErr:        ErrExpressDeliveryUnavailable,
		},
		{
			name:           "Hue 46 and Can Tho 92 standard",
			provinceCode:   46,
			subtotalVND:    "1000000",
			deliveryMethod: DeliveryMethodStandard,
			wantExpress:    false,
			wantStdFee:     "30000",
			wantSelected:   "30000",
		},
		{
			name:           "Can Tho 92 standard",
			provinceCode:   92,
			subtotalVND:    "1000000",
			deliveryMethod: DeliveryMethodStandard,
			wantExpress:    false,
			wantStdFee:     "30000",
			wantSelected:   "30000",
		},
		{
			name:           "Other province below threshold",
			provinceCode:   49,
			subtotalVND:    "1000000",
			deliveryMethod: DeliveryMethodStandard,
			wantExpress:    false,
			wantStdFee:     "40000",
			wantSelected:   "40000",
		},
		{
			name:           "Other province at threshold free standard",
			provinceCode:   49,
			subtotalVND:    "5000000",
			deliveryMethod: DeliveryMethodStandard,
			wantExpress:    false,
			wantStdFee:     "0",
			wantSelected:   "0",
		},
		{
			name:           "Empty deliveryMethod defaults to standard",
			provinceCode:   1,
			subtotalVND:    "1000000",
			deliveryMethod: "",
			wantExpress:    true,
			wantStdFee:     "25000",
			wantSelected:   "25000",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := CalculateShippingQuote(tt.provinceCode, tt.subtotalVND, tt.deliveryMethod, cfg)
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("error = %v, want %v", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got.ExpressAvailable != tt.wantExpress {
				t.Errorf("ExpressAvailable = %v, want %v", got.ExpressAvailable, tt.wantExpress)
			}
			if got.StandardShippingFeeVND != tt.wantStdFee {
				t.Errorf("StandardShippingFeeVND = %q, want %q", got.StandardShippingFeeVND, tt.wantStdFee)
			}
			if got.ShippingFeeVND != tt.wantSelected {
				t.Errorf("ShippingFeeVND = %q, want %q", got.ShippingFeeVND, tt.wantSelected)
			}
			if got.ExpressShippingFeeVND != "60000" {
				t.Errorf("ExpressShippingFeeVND = %q, want 60000", got.ExpressShippingFeeVND)
			}
		})
	}
}

func TestFormatVNDAndErrors(t *testing.T) {
	if got := FormatVND("10000000"); got != "10.000.000" {
		t.Errorf("FormatVND = %q, want 10.000.000", got)
	}
	if got := FormatVND("0"); got != "0" {
		t.Errorf("FormatVND(0) = %q, want 0", got)
	}
	minErr := &VoucherMinOrderError{MinOrderVND: "10000000"}
	if minErr.Error() != "Đơn hàng chưa đạt giá trị tối thiểu 10.000.000 ₫ để áp dụng mã này" {
		t.Errorf("VoucherMinOrderError = %q", minErr.Error())
	}
	fsErr := &FlashSaleQuotaExceededError{ProductName: "iPhone 16", Remaining: 2}
	if fsErr.Error() != "Sản phẩm iPhone 16 chỉ còn 2 suất giá Flash Sale" {
		t.Errorf("FlashSaleQuotaExceededError = %q", fsErr.Error())
	}
}
