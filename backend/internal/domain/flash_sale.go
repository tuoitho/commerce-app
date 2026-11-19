package domain

import (
	"context"
	"math"
	"math/big"
	"time"
)

const (
	FlashSaleNameMaxLength = 120
	FlashSaleMinItems      = 1
	FlashSaleMaxItems      = 50
	FlashSaleQuotaMin      = 1
	FlashSaleQuotaMax      = 100000
)

type FlashSaleStatus string

const (
	FlashSaleStatusScheduled FlashSaleStatus = "scheduled"
	FlashSaleStatusRunning   FlashSaleStatus = "running"
	FlashSaleStatusEnded     FlashSaleStatus = "ended"
	FlashSaleStatusInactive  FlashSaleStatus = "inactive"
)

func DeriveFlashSaleStatus(active bool, startsAt, endsAt, now time.Time) FlashSaleStatus {
	if !active {
		return FlashSaleStatusInactive
	}
	if now.Before(startsAt) {
		return FlashSaleStatusScheduled
	}
	if !now.Before(endsAt) {
		return FlashSaleStatusEnded
	}
	return FlashSaleStatusRunning
}

func ComputeDiscountPercent(regularPriceVND, promoPriceVND MoneyVND) int {
	reg, okReg := new(big.Int).SetString(string(regularPriceVND), 10)
	promo, okPromo := new(big.Int).SetString(string(promoPriceVND), 10)
	if !okReg || !okPromo || reg.Sign() <= 0 || promo.Cmp(reg) >= 0 {
		return 0
	}
	diff := new(big.Int).Sub(reg, promo)
	regFloat, _ := new(big.Float).SetInt(reg).Float64()
	diffFloat, _ := new(big.Float).SetInt(diff).Float64()
	if regFloat <= 0 {
		return 0
	}
	pct := int(math.Round((diffFloat * 100) / regFloat))
	if pct < 0 {
		return 0
	}
	if pct > 99 && promo.Sign() > 0 {
		return 99
	}
	return pct
}

type FlashSalePublicItem struct {
	ProductID       string   `json:"productId"`
	VariantID       string   `json:"variantId"`
	ProductName     string   `json:"productName"`
	Brand           string   `json:"brand"`
	Model           string   `json:"model"`
	ImageURL        string   `json:"imageUrl"`
	OptionLabel     string   `json:"optionLabel"`
	RegularPriceVND MoneyVND `json:"regularPriceVnd"`
	FlashPriceVND   MoneyVND `json:"flashPriceVnd"`
	DiscountPercent int      `json:"discountPercent"`
	Quota           int      `json:"quota"`
	SoldQuantity    int      `json:"soldQuantity"`
	InStock         bool     `json:"inStock"`
}

type FlashSaleCampaignPublic struct {
	ID       string                `json:"id"`
	Name     string                `json:"name"`
	StartsAt time.Time             `json:"startsAt"`
	EndsAt   time.Time             `json:"endsAt"`
	Items    []FlashSalePublicItem `json:"items"`
}

type AdminFlashSaleSummary struct {
	ID           string          `json:"id"`
	Name         string          `json:"name"`
	StartsAt     time.Time       `json:"startsAt"`
	EndsAt       time.Time       `json:"endsAt"`
	Active       bool            `json:"active"`
	Status       FlashSaleStatus `json:"status"`
	VariantCount int             `json:"variantCount"`
	TotalQuota   int             `json:"totalQuota"`
	TotalSold    int             `json:"totalSold"`
	CreatedAt    time.Time       `json:"createdAt"`
	UpdatedAt    time.Time       `json:"updatedAt"`
}

type AdminFlashSaleItem struct {
	ProductID       string   `json:"productId"`
	VariantID       string   `json:"variantId"`
	ProductName     string   `json:"productName"`
	Brand           string   `json:"brand"`
	Model           string   `json:"model"`
	ImageURL        string   `json:"imageUrl"`
	OptionLabel     string   `json:"optionLabel"`
	VariantActive   bool     `json:"variantActive"`
	RegularPriceVND MoneyVND `json:"regularPriceVnd"`
	FlashPriceVND   MoneyVND `json:"flashPriceVnd"`
	Quota           int      `json:"quota"`
	SoldQuantity    int      `json:"soldQuantity"`
	Position        int      `json:"position"`
}

type AdminFlashSaleDetail struct {
	ID        string               `json:"id"`
	Name      string               `json:"name"`
	StartsAt  time.Time            `json:"startsAt"`
	EndsAt    time.Time            `json:"endsAt"`
	Active    bool                 `json:"active"`
	Status    FlashSaleStatus      `json:"status"`
	CreatedAt time.Time            `json:"createdAt"`
	UpdatedAt time.Time            `json:"updatedAt"`
	Items     []AdminFlashSaleItem `json:"items"`
}

type FlashSaleItemInput struct {
	VariantID     string
	FlashPriceVND MoneyVND
	Quota         int
}

type SaveFlashSaleInput struct {
	Name      string
	StartsAt  time.Time
	EndsAt    time.Time
	Active    bool
	CreatedBy string
	Items     []FlashSaleItemInput
}

type FlashSaleListFilter struct {
	Status string
	Limit  int
	Offset int
}

type FlashSaleValidationVariant struct {
	ID              string
	ProductID       string
	VariantActive   bool
	ProductActive   bool
	RegularPriceVND MoneyVND
}

type FlashSaleValidationData struct {
	Variants map[string]FlashSaleValidationVariant
	Sold     map[string]int
}

type FlashSaleRepository interface {
	GetCurrentPublic(ctx context.Context) (*FlashSaleCampaignPublic, error)
	ListAdmin(ctx context.Context, filter FlashSaleListFilter) ([]AdminFlashSaleSummary, int64, error)
	GetAdminByID(ctx context.Context, id string) (*AdminFlashSaleDetail, error)
	ValidationData(ctx context.Context, flashSaleID string, variantIDs []string) (*FlashSaleValidationData, error)
	Create(ctx context.Context, input SaveFlashSaleInput, resolvedProductIDs map[string]string) (*AdminFlashSaleDetail, error)
	Update(ctx context.Context, id string, input SaveFlashSaleInput, resolvedProductIDs map[string]string) (*AdminFlashSaleDetail, error)
	Delete(ctx context.Context, id string) error
}
