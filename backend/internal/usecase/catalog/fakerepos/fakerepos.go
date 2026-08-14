package fakerepos

import (
	"context"
	"math/big"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"commerce-backend/internal/domain"
)

type Catalog struct {
	mu         sync.Mutex
	categories []domain.Category
	products   []*domain.Product
}

func NewCatalog() *Catalog {
	return &Catalog{}
}

func (f *Catalog) AddCategory(c domain.Category) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.categories = append(f.categories, c)
}

func (f *Catalog) AddProduct(p domain.Product) {
	f.addProduct(p, nil)
}

// AddProductWithActiveState preserves an explicitly supplied active state for
// legacy-shaped fixtures while AddProduct keeps its zero-value compatibility.
func (f *Catalog) AddProductWithActiveState(p domain.Product, active bool) {
	f.addProduct(p, &active)
}

func (f *Catalog) addProduct(p domain.Product, active *bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if active != nil {
		p.Active = *active
	}
	if active == nil && isLegacyProduct(p) {
		p.Active = true
		p.Variants = []domain.ProductVariant{{ID: p.ID, StockQuantity: p.StockQuantity, Active: true}}
	} else if active != nil && isLegacyProductFields(p) {
		p.Variants = []domain.ProductVariant{{ID: p.ID, StockQuantity: p.StockQuantity, Active: *active}}
	}
	p.CreatedAt = time.Now()
	p.UpdatedAt = time.Now()
	f.products = append(f.products, &p)
}

func (f *Catalog) ListCategories(ctx context.Context) ([]domain.Category, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	byID := make(map[string]domain.Category)
	for _, product := range f.products {
		if !publicEligible(product) {
			continue
		}
		category := product.Brand
		if category.ID == "" {
			category = product.Category
		}
		if category.ID != "" {
			byID[category.ID] = category
		}
	}
	out := make([]domain.Category, 0, len(byID))
	for _, category := range byID {
		out = append(out, category)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func (f *Catalog) ListProducts(ctx context.Context, filt domain.ProductFilter) ([]domain.Product, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	query := strings.ToLower(strings.TrimSpace(filt.Query))
	categoryIDs := filt.CategoryIDs
	if len(categoryIDs) == 0 && filt.CategoryID != "" {
		categoryIDs = []string{filt.CategoryID}
	}
	knownCategoryIDs := make(map[string]bool, len(f.categories))
	for _, category := range f.categories {
		knownCategoryIDs[category.ID] = true
	}
	filteredCategoryIDs := categoryIDs[:0]
	for _, id := range categoryIDs {
		if knownCategoryIDs[id] {
			filteredCategoryIDs = append(filteredCategoryIDs, id)
		}
	}
	categoryIDs = filteredCategoryIDs

	matches := make([]domain.Product, 0, len(f.products))
	for _, p := range f.products {
		if !publicEligible(p) {
			continue
		}
		brand := p.Brand
		if brand.ID == "" {
			brand = p.Category
		}
		if query != "" && !strings.Contains(strings.ToLower(p.Name), query) && !strings.Contains(strings.ToLower(p.Model), query) && !strings.Contains(strings.ToLower(brand.Name), query) {
			continue
		}
		if len(categoryIDs) > 0 && !contains(categoryIDs, brand.ID) && !contains(categoryIDs, p.Category.ID) {
			continue
		}
		activeVariants := 0
		inStock := false
		matchedPrice := false
		for _, variant := range p.Variants {
			if !variant.Active {
				continue
			}
			activeVariants++
			if variant.StockQuantity > 0 {
				inStock = true
			}
			price := string(variant.PriceVND)
			if price == "" {
				price = p.Price
			}
			if !matchesMoneyRange(price, filt) {
				continue
			}
			if filt.MinPriceVND != nil || filt.MaxPriceVND != nil {
				matchedPrice = true
			}
		}
		if len(p.Variants) == 0 {
			inStock = p.InStock()
		}
		if len(p.Variants) > 0 && activeVariants == 0 {
			continue
		}
		if (filt.MinPriceVND != nil || filt.MaxPriceVND != nil) && !matchedPrice {
			continue
		}
		if filt.MinPriceVND == nil && filt.MaxPriceVND == nil {
			price, _ := strconv.ParseFloat(p.Price, 64)
			if filt.MinPrice != "" {
				min, _ := strconv.ParseFloat(filt.MinPrice, 64)
				if price < min {
					continue
				}
			}
			if filt.MaxPrice != "" {
				max, _ := strconv.ParseFloat(filt.MaxPrice, 64)
				if price > max {
					continue
				}
			}
		}
		if filt.InStock != nil && inStock != *filt.InStock {
			continue
		}
		matches = append(matches, *p)
	}
	sort.Slice(matches, func(i, j int) bool {
		if matches[i].Name != matches[j].Name {
			return matches[i].Name < matches[j].Name
		}
		return matches[i].ID < matches[j].ID
	})
	return matches, nil
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func matchesMoneyRange(price string, filter domain.ProductFilter) bool {
	if filter.MinPriceVND == nil && filter.MaxPriceVND == nil {
		return true
	}
	if strings.Contains(price, ".") {
		legacyPrice, err := strconv.ParseFloat(price, 64)
		if err != nil {
			return false
		}
		if filter.MinPriceVND != nil && legacyPrice < legacyBound(string(*filter.MinPriceVND)) {
			return false
		}
		if filter.MaxPriceVND != nil && legacyPrice > legacyBound(string(*filter.MaxPriceVND)) {
			return false
		}
		return true
	}
	p, ok := new(big.Int).SetString(price, 10)
	if !ok {
		return false
	}
	if filter.MinPriceVND != nil {
		min, _ := new(big.Int).SetString(string(*filter.MinPriceVND), 10)
		if p.Cmp(min) < 0 {
			return false
		}
	}
	if filter.MaxPriceVND != nil {
		max, _ := new(big.Int).SetString(string(*filter.MaxPriceVND), 10)
		if p.Cmp(max) > 0 {
			return false
		}
	}
	return true
}

func legacyBound(value string) float64 {
	if value == "" {
		return 0
	}
	bound, _ := strconv.ParseFloat(value, 64)
	return bound
}

func (f *Catalog) ListFeaturedProducts(ctx context.Context) ([]domain.Product, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]domain.Product, 0)
	for _, p := range f.products {
		if p.Featured && publicEligible(p) {
			out = append(out, *p)
		}
	}
	return out, nil
}

func (f *Catalog) GetProductByID(ctx context.Context, id string) (*domain.Product, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, p := range f.products {
		if p.ID == id {
			if !publicEligible(p) {
				return nil, domain.ErrProductNotFound
			}
			out := clonePublicProduct(*p)
			return &out, nil
		}
	}
	return nil, domain.ErrProductNotFound
}

func clonePublicProduct(product domain.Product) domain.Product {
	product.ImageURLs = append([]string(nil), product.ImageURLs...)
	activeVariants := make([]domain.ProductVariant, 0, len(product.Variants))
	usedValues := make(map[string]bool)
	for _, variant := range product.Variants {
		if !variant.Active {
			continue
		}
		optionIDs := make(map[string]string, len(variant.OptionValueIDs))
		for groupID, valueID := range variant.OptionValueIDs {
			optionIDs[groupID] = valueID
			usedValues[valueID] = true
		}
		variant.OptionValueIDs = optionIDs
		activeVariants = append(activeVariants, variant)
	}
	product.Variants = activeVariants
	groups := make([]domain.OptionGroup, 0, len(product.OptionGroups))
	for _, group := range product.OptionGroups {
		values := make([]domain.OptionValue, 0, len(group.Values))
		for _, value := range group.Values {
			if usedValues[value.ID] {
				values = append(values, value)
			}
		}
		group.Values = values
		groups = append(groups, group)
	}
	product.OptionGroups = groups
	return product
}

func publicEligible(p *domain.Product) bool {
	if len(p.Variants) == 0 {
		return false
	}
	if !p.Active {
		return false
	}
	for _, variant := range p.Variants {
		if variant.Active {
			return true
		}
	}
	return false
}

func isLegacyProduct(p domain.Product) bool {
	return isLegacyProductFields(p) && !p.Featured
}

func isLegacyProductFields(p domain.Product) bool {
	return len(p.Variants) == 0 && p.Price != "" && p.Currency != "" &&
		p.Brand.ID == "" && p.Model == ""
}

var _ domain.CatalogRepository = (*Catalog)(nil)
