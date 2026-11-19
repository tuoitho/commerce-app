package domain

import (
	"context"
	"math/big"
	"regexp"
	"strings"
	"time"
)

type VoucherType string

const (
	VoucherTypePercent     VoucherType = "percent"
	VoucherTypeFixedAmount VoucherType = "fixed_amount"
	VoucherTypeFreeship    VoucherType = "freeship"
)

func (t VoucherType) IsValid() bool {
	switch t {
	case VoucherTypePercent, VoucherTypeFixedAmount, VoucherTypeFreeship:
		return true
	default:
		return false
	}
}

type VoucherEffectiveStatus string

const (
	VoucherStatusScheduled VoucherEffectiveStatus = "scheduled"
	VoucherStatusActive    VoucherEffectiveStatus = "active"
	VoucherStatusExhausted VoucherEffectiveStatus = "exhausted"
	VoucherStatusExpired   VoucherEffectiveStatus = "expired"
	VoucherStatusInactive  VoucherEffectiveStatus = "inactive"
)

type VoucherScopeType string

const (
	VoucherScopeAll        VoucherScopeType = "all"
	VoucherScopeCategories VoucherScopeType = "categories"
	VoucherScopeProducts   VoucherScopeType = "products"
)

func (s VoucherScopeType) IsValid() bool {
	switch s {
	case VoucherScopeAll, VoucherScopeCategories, VoucherScopeProducts:
		return true
	default:
		return false
	}
}

type VoucherScopeTarget struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type VoucherWalletStatus string

const (
	VoucherWalletAvailable VoucherWalletStatus = "available"
	VoucherWalletUsedUp    VoucherWalletStatus = "used_up"
	VoucherWalletExpired   VoucherWalletStatus = "expired"
	VoucherWalletExhausted VoucherWalletStatus = "exhausted"
	VoucherWalletInactive  VoucherWalletStatus = "inactive"
	VoucherWalletScheduled VoucherWalletStatus = "scheduled"
)

// DeriveVoucherWalletStatus computes the wallet status of a claimed voucher at now.
func DeriveVoucherWalletStatus(
	active bool,
	startsAt, endsAt, now time.Time,
	usageLimit *int,
	usedCount int,
	userRemainingUses int,
) VoucherWalletStatus {
	if !active {
		return VoucherWalletInactive
	}
	if now.After(endsAt) {
		return VoucherWalletExpired
	}
	if now.Before(startsAt) {
		return VoucherWalletScheduled
	}
	if userRemainingUses <= 0 {
		return VoucherWalletUsedUp
	}
	if usageLimit != nil && usedCount >= *usageLimit {
		return VoucherWalletExhausted
	}
	return VoucherWalletAvailable
}

type VoucherScopeLine struct {
	ProductID    string
	CategoryID   string
	LineTotalVND MoneyVND
}

// EvaluateVoucherScope computes the eligible subtotal and item count for a voucher scope.
func EvaluateVoucherScope(
	scopeType VoucherScopeType,
	categoryIDs []string,
	productIDs []string,
	lines []VoucherScopeLine,
) (MoneyVND, int, error) {
	if scopeType == "" {
		scopeType = VoucherScopeAll
	}
	catSet := make(map[string]struct{}, len(categoryIDs))
	for _, id := range categoryIDs {
		catSet[id] = struct{}{}
	}
	prodSet := make(map[string]struct{}, len(productIDs))
	for _, id := range productIDs {
		prodSet[id] = struct{}{}
	}

	var eligible MoneyVND = "0"
	count := 0
	for _, line := range lines {
		var matched bool
		switch scopeType {
		case VoucherScopeAll:
			matched = true
		case VoucherScopeCategories:
			_, matched = catSet[line.CategoryID]
		case VoucherScopeProducts:
			_, matched = prodSet[line.ProductID]
		default:
			matched = false
		}
		if !matched {
			continue
		}
		var err error
		eligible, err = AddMoneyVND(eligible, line.LineTotalVND)
		if err != nil {
			return "", 0, err
		}
		count++
	}
	return eligible, count, nil
}

var voucherCodePattern = regexp.MustCompile(`^[A-Z0-9_-]{3,32}$`)

// NormalizeVoucherCode trims surrounding whitespace and converts to uppercase.
func NormalizeVoucherCode(code string) string {
	return strings.ToUpper(strings.TrimSpace(code))
}

// IsValidVoucherCode checks whether a normalized code matches ^[A-Z0-9_-]{3,32}$.
func IsValidVoucherCode(code string) bool {
	return voucherCodePattern.MatchString(code)
}

// DeriveVoucherEffectiveStatus computes the effective status of a voucher at now.
func DeriveVoucherEffectiveStatus(active bool, startsAt, endsAt, now time.Time, usageLimit *int, usedCount int) VoucherEffectiveStatus {
	if !active {
		return VoucherStatusInactive
	}
	if now.After(endsAt) {
		return VoucherStatusExpired
	}
	if now.Before(startsAt) {
		return VoucherStatusScheduled
	}
	if usageLimit != nil && usedCount >= *usageLimit {
		return VoucherStatusExhausted
	}
	return VoucherStatusActive
}

// CalculateVoucherDiscount computes the canonical VND discount per PD-1.
func CalculateVoucherDiscount(
	voucherType VoucherType,
	discountValue MoneyVND,
	maxDiscountVND *MoneyVND,
	subtotalVND MoneyVND,
	shippingFeeVND MoneyVND,
) (MoneyVND, error) {
	sub, ok := parseBigIntMoney(subtotalVND)
	if !ok {
		return "", ErrInvalidMoneyVND
	}
	ship, ok := parseBigIntMoney(shippingFeeVND)
	if !ok {
		return "", ErrInvalidMoneyVND
	}
	val, ok := parseBigIntMoney(discountValue)
	if !ok {
		return "", ErrInvalidMoneyVND
	}

	var maxCap *big.Int
	if maxDiscountVND != nil {
		parsedMax, okMax := parseBigIntMoney(*maxDiscountVND)
		if !okMax {
			return "", ErrInvalidMoneyVND
		}
		maxCap = parsedMax
	}

	discount := new(big.Int)
	switch voucherType {
	case VoucherTypePercent:
		// trunc(subtotalVnd * discountValue / 100)
		discount.Mul(sub, val)
		discount.Div(discount, big.NewInt(100))
		if maxCap != nil && discount.Cmp(maxCap) > 0 {
			discount.Set(maxCap)
		}
		if discount.Cmp(sub) > 0 {
			discount.Set(sub)
		}
	case VoucherTypeFixedAmount:
		discount.Set(val)
		if discount.Cmp(sub) > 0 {
			discount.Set(sub)
		}
	case VoucherTypeFreeship:
		discount.Set(ship)
		if maxCap != nil && discount.Cmp(maxCap) > 0 {
			discount.Set(maxCap)
		}
	default:
		return "0", nil
	}

	if discount.Sign() < 0 {
		return "0", nil
	}
	return MoneyVND(discount.String()), nil
}

// CalculateCheckoutTotal computes subtotalVnd + shippingFeeVnd - discountVnd, clamped at >= 0.
func CalculateCheckoutTotal(subtotalVND, shippingFeeVND, discountVND MoneyVND) (MoneyVND, error) {
	sub, ok := parseBigIntMoney(subtotalVND)
	if !ok {
		return "", ErrInvalidMoneyVND
	}
	ship, ok := parseBigIntMoney(shippingFeeVND)
	if !ok {
		return "", ErrInvalidMoneyVND
	}
	disc, ok := parseBigIntMoney(discountVND)
	if !ok {
		return "", ErrInvalidMoneyVND
	}
	total := new(big.Int).Add(sub, ship)
	total.Sub(total, disc)
	if total.Sign() < 0 {
		return "0", nil
	}
	return MoneyVND(total.String()), nil
}

func parseBigIntMoney(m MoneyVND) (*big.Int, bool) {
	if !m.IsCanonical() {
		return nil, false
	}
	n, ok := new(big.Int).SetString(string(m), 10)
	return n, ok
}

type DeliveryMethod string

const (
	DeliveryMethodStandard  DeliveryMethod = "standard"
	DeliveryMethodExpress2H DeliveryMethod = "express_2h"
)

func (d DeliveryMethod) IsValid() bool {
	return d == DeliveryMethodStandard || d == DeliveryMethodExpress2H
}

type ShippingConfig struct {
	StandardHNHCMVND      MoneyVND
	StandardMajorCityVND  MoneyVND
	StandardOtherVND      MoneyVND
	Express2HVND          MoneyVND
	FreeShippingThreshold MoneyVND
}

func DefaultShippingConfig() ShippingConfig {
	return ShippingConfig{
		StandardHNHCMVND:      "25000",
		StandardMajorCityVND:  "30000",
		StandardOtherVND:      "40000",
		Express2HVND:          "60000",
		FreeShippingThreshold: "5000000",
	}
}

func (s ShippingConfig) WithDefaults() ShippingConfig {
	def := DefaultShippingConfig()
	if !s.StandardHNHCMVND.IsCanonical() {
		s.StandardHNHCMVND = def.StandardHNHCMVND
	}
	if !s.StandardMajorCityVND.IsCanonical() {
		s.StandardMajorCityVND = def.StandardMajorCityVND
	}
	if !s.StandardOtherVND.IsCanonical() {
		s.StandardOtherVND = def.StandardOtherVND
	}
	if !s.Express2HVND.IsCanonical() {
		s.Express2HVND = def.Express2HVND
	}
	if !s.FreeShippingThreshold.IsCanonical() {
		s.FreeShippingThreshold = def.FreeShippingThreshold
	}
	return s
}

type ShippingQuote struct {
	DeliveryMethod           DeliveryMethod
	ExpressAvailable         bool
	StandardShippingFeeVND   MoneyVND
	ExpressShippingFeeVND    MoneyVND
	FreeShippingThresholdVND MoneyVND
	ShippingFeeVND           MoneyVND
}

// CalculateShippingQuote computes regional standard & express-2h fees per PD-8.
func CalculateShippingQuote(provinceCode int32, subtotalVND MoneyVND, deliveryMethod DeliveryMethod, cfg ShippingConfig) (ShippingQuote, error) {
	cfg = cfg.WithDefaults()
	if deliveryMethod == "" {
		deliveryMethod = DeliveryMethodStandard
	}
	if !deliveryMethod.IsValid() {
		return ShippingQuote{}, NewValidationError(map[string]string{"deliveryMethod": "Phương thức vận chuyển không hợp lệ"})
	}
	if !subtotalVND.IsCanonical() {
		return ShippingQuote{}, ErrInvalidMoneyVND
	}

	var expressAvailable bool
	var baseStandard MoneyVND
	switch provinceCode {
	case 1, 79:
		expressAvailable = true
		baseStandard = cfg.StandardHNHCMVND
	case 31, 46, 48, 92:
		expressAvailable = false
		baseStandard = cfg.StandardMajorCityVND
	default:
		expressAvailable = false
		baseStandard = cfg.StandardOtherVND
	}

	stdFee := baseStandard
	if CompareMoneyVND(subtotalVND, cfg.FreeShippingThreshold) >= 0 {
		stdFee = "0"
	}

	if deliveryMethod == DeliveryMethodExpress2H && !expressAvailable {
		return ShippingQuote{}, ErrExpressDeliveryUnavailable
	}

	selectedFee := stdFee
	if deliveryMethod == DeliveryMethodExpress2H {
		selectedFee = cfg.Express2HVND
	}

	return ShippingQuote{
		DeliveryMethod:           deliveryMethod,
		ExpressAvailable:         expressAvailable,
		StandardShippingFeeVND:   stdFee,
		ExpressShippingFeeVND:    cfg.Express2HVND,
		FreeShippingThresholdVND: cfg.FreeShippingThreshold,
		ShippingFeeVND:           selectedFee,
	}, nil
}

type Voucher struct {
	ID              string                 `json:"id"`
	Code            string                 `json:"code"`
	Title           string                 `json:"title"`
	Description     string                 `json:"description"`
	VoucherType     VoucherType            `json:"voucherType"`
	ScopeType       VoucherScopeType       `json:"scopeType"`
	ScopeCategories []VoucherScopeTarget   `json:"scopeCategories"`
	ScopeProducts   []VoucherScopeTarget   `json:"scopeProducts"`
	DiscountValue   MoneyVND               `json:"discountValue"`
	MaxDiscountVND  *MoneyVND              `json:"maxDiscountVnd"`
	MinOrderVND     MoneyVND               `json:"minOrderVnd"`
	UsageLimit      *int                   `json:"usageLimit"`
	UsedCount       int                    `json:"usedCount"`
	PerUserLimit    int                    `json:"perUserLimit"`
	StartsAt        time.Time              `json:"startsAt"`
	EndsAt          time.Time              `json:"endsAt"`
	Active          bool                   `json:"active"`
	EffectiveStatus VoucherEffectiveStatus `json:"effectiveStatus"`
	CreatedAt       time.Time              `json:"createdAt"`
	UpdatedAt       time.Time              `json:"updatedAt"`
}

type AvailableVoucher struct {
	ID                string               `json:"id"`
	Code              string               `json:"code"`
	Title             string               `json:"title"`
	Description       string               `json:"description"`
	VoucherType       VoucherType          `json:"voucherType"`
	ScopeType         VoucherScopeType     `json:"scopeType"`
	ScopeCategories   []VoucherScopeTarget `json:"scopeCategories"`
	ScopeProducts     []VoucherScopeTarget `json:"scopeProducts"`
	DiscountValue     MoneyVND             `json:"discountValue"`
	MaxDiscountVND    *MoneyVND            `json:"maxDiscountVnd"`
	MinOrderVND       MoneyVND             `json:"minOrderVnd"`
	UsageLimit        *int                 `json:"usageLimit"`
	UsedCount         int                  `json:"usedCount"`
	PerUserLimit      int                  `json:"perUserLimit"`
	UserRemainingUses int                  `json:"userRemainingUses"`
	StartsAt          time.Time            `json:"startsAt"`
	EndsAt            time.Time            `json:"endsAt"`
	ClaimedAt         time.Time            `json:"claimedAt"`
}

type DiscoverVoucher struct {
	ID                string               `json:"id"`
	Code              string               `json:"code"`
	Title             string               `json:"title"`
	Description       string               `json:"description"`
	VoucherType       VoucherType          `json:"voucherType"`
	ScopeType         VoucherScopeType     `json:"scopeType"`
	ScopeCategories   []VoucherScopeTarget `json:"scopeCategories"`
	ScopeProducts     []VoucherScopeTarget `json:"scopeProducts"`
	DiscountValue     MoneyVND             `json:"discountValue"`
	MaxDiscountVND    *MoneyVND            `json:"maxDiscountVnd"`
	MinOrderVND       MoneyVND             `json:"minOrderVnd"`
	UsageLimit        *int                 `json:"usageLimit"`
	UsedCount         int                  `json:"usedCount"`
	PerUserLimit      int                  `json:"perUserLimit"`
	UserRemainingUses int                  `json:"userRemainingUses"`
	StartsAt          time.Time            `json:"startsAt"`
	EndsAt            time.Time            `json:"endsAt"`
	Claimed           bool                 `json:"claimed"`
	ClaimedAt         *time.Time           `json:"claimedAt"`
}

type UserVoucher struct {
	ID                string               `json:"id"`
	Code              string               `json:"code"`
	Title             string               `json:"title"`
	Description       string               `json:"description"`
	VoucherType       VoucherType          `json:"voucherType"`
	ScopeType         VoucherScopeType     `json:"scopeType"`
	ScopeCategories   []VoucherScopeTarget `json:"scopeCategories"`
	ScopeProducts     []VoucherScopeTarget `json:"scopeProducts"`
	DiscountValue     MoneyVND             `json:"discountValue"`
	MaxDiscountVND    *MoneyVND            `json:"maxDiscountVnd"`
	MinOrderVND       MoneyVND             `json:"minOrderVnd"`
	UsageLimit        *int                 `json:"usageLimit"`
	UsedCount         int                  `json:"usedCount"`
	PerUserLimit      int                  `json:"perUserLimit"`
	UserRemainingUses int                  `json:"userRemainingUses"`
	StartsAt          time.Time            `json:"startsAt"`
	EndsAt            time.Time            `json:"endsAt"`
	ClaimedAt         time.Time            `json:"claimedAt"`
	WalletStatus      VoucherWalletStatus  `json:"walletStatus"`
}

type SaveVoucherInput struct {
	Code           string
	Title          string
	Description    string
	VoucherType    VoucherType
	ScopeType      VoucherScopeType
	CategoryIDs    []string
	ProductIDs     []string
	DiscountValue  MoneyVND
	MaxDiscountVND *MoneyVND
	MinOrderVND    MoneyVND
	UsageLimit     *int
	PerUserLimit   int
	StartsAt       time.Time
	EndsAt         time.Time
	Active         bool
}

type VoucherListFilter struct {
	Query  string
	Status string
	Limit  int
	Offset int
}

type VoucherRepository interface {
	ListAdmin(ctx context.Context, filter VoucherListFilter) ([]Voucher, int64, error)
	GetAdminByID(ctx context.Context, id string) (*Voucher, error)
	Create(ctx context.Context, input SaveVoucherInput) (*Voucher, error)
	Update(ctx context.Context, id string, input SaveVoucherInput) (*Voucher, error)
	Delete(ctx context.Context, id string) error
	ListAvailableForUser(ctx context.Context, userID string, now time.Time) ([]AvailableVoucher, error)
	ListDiscoverForUser(ctx context.Context, userID string, now time.Time) ([]DiscoverVoucher, error)
	ClaimForUser(ctx context.Context, userID, voucherID string, now time.Time) (*UserVoucher, error)
	ListWalletForUser(ctx context.Context, userID string, statusFilter string, now time.Time) ([]UserVoucher, error)
}
