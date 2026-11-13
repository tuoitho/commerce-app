package live

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"commerce-backend/internal/domain"
)

const (
	msgProductInvalid   = "Sản phẩm không tồn tại hoặc đã ngừng kinh doanh"
	msgProductDuplicate = "Sản phẩm bị trùng"
	msgVariantInvalid   = "Biến thể không thuộc sản phẩm hoặc đã ngừng kinh doanh"
	msgVariantDuplicate = "Biến thể bị trùng"
	msgPriceNotPositive = "Giá live phải là số nguyên dương"
	msgPriceNotBelow    = "Giá live phải nhỏ hơn giá thường"
	msgQuotaRange       = "Số suất phải từ 1 đến 100000"
)

// validateProducts checks a live cart against the catalog, recording problems
// in fields keyed by the request path. It returns the trimmed input.
func (uc *UseCase) validateProducts(ctx context.Context, sessionID string, products []domain.LiveProductInput, fields map[string]string) ([]domain.LiveProductInput, error) {
	if len(products) > domain.LiveMaxProducts {
		fields["products"] = "Tối đa 50 sản phẩm"
		return nil, nil
	}
	normalized := make([]domain.LiveProductInput, len(products))
	var productIDs, variantIDs []string
	for i, p := range products {
		normalized[i] = domain.LiveProductInput{ProductID: strings.TrimSpace(p.ProductID)}
		if isUUID(normalized[i].ProductID) {
			productIDs = append(productIDs, normalized[i].ProductID)
		}
		for _, v := range p.Variants {
			v.VariantID = strings.TrimSpace(v.VariantID)
			v.LivePriceVND = domain.MoneyVND(strings.TrimSpace(string(v.LivePriceVND)))
			normalized[i].Variants = append(normalized[i].Variants, v)
			if isUUID(v.VariantID) {
				variantIDs = append(variantIDs, v.VariantID)
			}
		}
	}
	if len(normalized) == 0 {
		return normalized, nil
	}
	data, err := uc.repo.ValidationData(ctx, sessionID, productIDs, variantIDs)
	if err != nil {
		return nil, err
	}

	seenProducts := map[string]bool{}
	seenVariants := map[string]bool{}
	for i, p := range normalized {
		key := fmt.Sprintf("products[%d]", i)
		product, ok := data.Products[p.ProductID]
		switch {
		case !ok || !product.Active:
			fields[key+".productId"] = msgProductInvalid
		case seenProducts[p.ProductID]:
			fields[key+".productId"] = msgProductDuplicate
		}
		seenProducts[p.ProductID] = true

		for j, v := range p.Variants {
			vkey := fmt.Sprintf("%s.variants[%d]", key, j)
			variant, ok := data.Variants[v.VariantID]
			switch {
			case !ok || !variant.Active || variant.ProductID != p.ProductID:
				fields[vkey+".variantId"] = msgVariantInvalid
			case seenVariants[v.VariantID]:
				fields[vkey+".variantId"] = msgVariantDuplicate
			}
			seenVariants[v.VariantID] = true

			switch {
			case !v.LivePriceVND.IsCanonical() || v.LivePriceVND == "0":
				fields[vkey+".livePriceVnd"] = msgPriceNotPositive
			case ok && domain.CompareMoneyVND(v.LivePriceVND, variant.RegularPriceVND) >= 0:
				fields[vkey+".livePriceVnd"] = msgPriceNotBelow
			}

			if v.Quota != nil {
				sold := data.Sold[v.VariantID]
				switch {
				case *v.Quota < domain.LiveQuotaMin || *v.Quota > domain.LiveQuotaMax:
					fields[vkey+".quota"] = msgQuotaRange
				case *v.Quota < sold:
					fields[vkey+".quota"] = fmt.Sprintf("Số suất không được nhỏ hơn số đã bán (%d)", sold)
				}
			}
		}
	}
	return normalized, nil
}

// buildLiveProducts projects the stored live cart into the viewer shape,
// hiding discontinued products and products without an active variant.
func buildLiveProducts(products []domain.LiveCatalogProduct, variants []domain.LiveCatalogVariant) []domain.LiveProduct {
	byProduct := map[string][]domain.LiveCatalogVariant{}
	for _, v := range variants {
		byProduct[v.ProductID] = append(byProduct[v.ProductID], v)
	}
	out := []domain.LiveProduct{}
	for _, p := range products {
		if !p.Active {
			continue
		}
		lp := domain.LiveProduct{
			ProductID:  p.ProductID,
			Position:   p.Position,
			Name:       p.Name,
			Brand:      p.Brand,
			ImageURL:   p.ImageURL,
			LivePrices: []domain.LiveVariantPrice{},
		}
		hasActive := false
		for _, v := range byProduct[p.ProductID] {
			if v.HasLivePrice {
				lp.LivePrices = append(lp.LivePrices, livePrice(v))
			}
			if !v.Active {
				continue
			}
			effective := v.RegularPriceVND
			if v.LiveActive {
				effective = v.LivePriceVND
				lp.HasLivePrice = true
			}
			if !hasActive {
				lp.MinPriceVND, lp.MaxPriceVND = effective, effective
				lp.RegularMinPriceVND, lp.RegularMaxPriceVND = v.RegularPriceVND, v.RegularPriceVND
				hasActive = true
			} else {
				lp.MinPriceVND = minMoney(lp.MinPriceVND, effective)
				lp.MaxPriceVND = maxMoney(lp.MaxPriceVND, effective)
				lp.RegularMinPriceVND = minMoney(lp.RegularMinPriceVND, v.RegularPriceVND)
				lp.RegularMaxPriceVND = maxMoney(lp.RegularMaxPriceVND, v.RegularPriceVND)
			}
			if v.StockQuantity > 0 {
				lp.InStock = true
			}
		}
		if hasActive {
			out = append(out, lp)
		}
	}
	return out
}

func livePrice(v domain.LiveCatalogVariant) domain.LiveVariantPrice {
	price := domain.LiveVariantPrice{
		VariantID:       v.VariantID,
		OptionLabel:     v.OptionLabel,
		RegularPriceVND: v.RegularPriceVND,
		LivePriceVND:    v.LivePriceVND,
		Sold:            v.Sold,
		Active:          v.LiveActive,
	}
	if v.Quota != nil {
		quota := *v.Quota
		remaining := quota - v.Sold
		if remaining < 0 {
			remaining = 0
		}
		price.Quota, price.Remaining = &quota, &remaining
	}
	return price
}

func minMoney(a, b domain.MoneyVND) domain.MoneyVND {
	if domain.CompareMoneyVND(b, a) < 0 {
		return b
	}
	return a
}

func maxMoney(a, b domain.MoneyVND) domain.MoneyVND {
	if domain.CompareMoneyVND(b, a) > 0 {
		return b
	}
	return a
}

func isUUID(s string) bool {
	_, err := uuid.Parse(s)
	return err == nil
}
