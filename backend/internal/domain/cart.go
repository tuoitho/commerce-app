package domain

import (
	"math/big"
	"regexp"
)

type CartAvailability string

const (
	CartAvailable         CartAvailability = "available"
	CartUnavailable       CartAvailability = "unavailable"
	CartOutOfStock        CartAvailability = "out_of_stock"
	CartInsufficientStock CartAvailability = "insufficient_stock"
)

type CartOption struct {
	GroupLabel string `json:"groupLabel"`
	ValueLabel string `json:"valueLabel"`
}

type CartItem struct {
	ID            string
	VariantID     string
	ProductID     string
	BrandName     string
	ProductName   string
	Model         string
	ImageURL      string
	Options       []CartOption
	UnitPriceVND  *MoneyVND
	LineTotalVND  *MoneyVND
	StockQuantity int64
	Quantity      int64
	Selected      bool
	Availability  CartAvailability
	// IsLivePrice reports that UnitPriceVND is a live-session price.
	IsLivePrice bool
}

type Cart struct {
	Items             []CartItem
	TotalUnits        int64
	SelectedLineCount int
	SelectedTotalVND  MoneyVND
	ShippingFeeVND    MoneyVND
}


func MoneyVNDPtr(value MoneyVND) *MoneyVND { return &value }

var canonicalMoneyPattern = regexp.MustCompile(`^(?:0|[1-9][0-9]*)$`)

func (m MoneyVND) IsCanonical() bool {
	return canonicalMoneyPattern.MatchString(string(m))
}

func AddMoneyVND(values ...MoneyVND) (MoneyVND, error) {
	total := new(big.Int)
	for _, value := range values {
		if !value.IsCanonical() {
			return "", ErrInvalidMoneyVND
		}
		n, ok := new(big.Int).SetString(string(value), 10)
		if !ok {
			return "", ErrInvalidMoneyVND
		}
		total.Add(total, n)
	}
	return MoneyVND(total.String()), nil
}
