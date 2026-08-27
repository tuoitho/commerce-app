package fakerepos

import (
	"context"
	"math/big"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

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

func (f *Catalog) ListAdminCategories(ctx context.Context) ([]domain.Category, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := append([]domain.Category(nil), f.categories...)
	sort.Slice(out, func(i, j int) bool {
		if out[i].Name != out[j].Name {
			return out[i].Name < out[j].Name
		}
		return out[i].ID < out[j].ID
	})
	return out, nil
}
func (f *Catalog) CreateCategory(ctx context.Context, name string) (*domain.Category, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, c := range f.categories {
		if strings.EqualFold(strings.TrimSpace(c.Name), name) {
			return nil, domain.ErrCategoryNameInUse
		}
	}
	c := domain.Category{ID: uuid.New().String(), Name: name}
	f.categories = append(f.categories, c)
	return &c, nil
}
func (f *Catalog) UpdateCategory(ctx context.Context, id, name string) (*domain.Category, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	idx := -1
	for i := range f.categories {
		if f.categories[i].ID == id {
			idx = i
		}
		if f.categories[i].ID != id && strings.EqualFold(strings.TrimSpace(f.categories[i].Name), name) {
			return nil, domain.ErrCategoryNameInUse
		}
	}
	if idx < 0 {
		return nil, domain.ErrCategoryNotFound
	}
	f.categories[idx].Name = name
	for _, product := range f.products {
		if product.Category.ID == id {
			product.Category.Name = name
		}
	}
	c := f.categories[idx]
	return &c, nil
}
func (f *Catalog) DeleteCategory(ctx context.Context, id string) (*domain.Category, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	idx := -1
	for i, c := range f.categories {
		if c.ID == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		return nil, domain.ErrCategoryNotFound
	}
	for _, p := range f.products {
		if p.Category.ID == id {
			return nil, domain.ErrCategoryInUse
		}
	}
	c := f.categories[idx]
	f.categories = append(f.categories[:idx], f.categories[idx+1:]...)
	return &c, nil
}

func (f *Catalog) ListCategories(ctx context.Context) ([]domain.Category, error) {
	return f.ListAdminCategories(ctx)
}

func (f *Catalog) ListBrands(ctx context.Context) ([]string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	byBrand := make(map[string]bool)
	for _, product := range f.products {
		if !publicEligible(product) {
			continue
		}
		trimmed := strings.TrimSpace(product.Brand)
		if trimmed != "" {
			byBrand[product.Brand] = true
		}
	}
	out := make([]string, 0, len(byBrand))
	for brand := range byBrand {
		out = append(out, brand)
	}
	sort.Strings(out)
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
		if query != "" && !strings.Contains(strings.ToLower(p.Name), query) && !strings.Contains(strings.ToLower(p.Model), query) && !strings.Contains(strings.ToLower(p.Brand), query) && !strings.Contains(strings.ToLower(p.Category.Name), query) {
			continue
		}
		if len(categoryIDs) > 0 && !contains(categoryIDs, p.Category.ID) {
			continue
		}
		if len(filt.Brands) > 0 {
			matchedBrand := false
			for _, b := range filt.Brands {
				if strings.EqualFold(p.Brand, b) {
					matchedBrand = true
					break
				}
			}
			if !matchedBrand {
				continue
			}
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
		p.Brand == "" && p.Model == ""
}

func (f *Catalog) GetCategoryByID(ctx context.Context, id string) (*domain.Category, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, c := range f.categories {
		if c.ID == id {
			res := c
			return &res, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (f *Catalog) ListAdminProducts(ctx context.Context, query string) ([]domain.Product, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	q := strings.ToLower(strings.TrimSpace(query))
	matches := make([]domain.Product, 0, len(f.products))
	for _, p := range f.products {
		if !p.Active {
			continue
		}
		if q != "" && !strings.Contains(strings.ToLower(p.Name), q) &&
			!strings.Contains(strings.ToLower(p.Model), q) &&
			!strings.Contains(strings.ToLower(p.Brand), q) &&
			!strings.Contains(strings.ToLower(p.Category.Name), q) {
			continue
		}
		matches = append(matches, cloneAdminProduct(*p))
	}
	sort.Slice(matches, func(i, j int) bool {
		if matches[i].Name != matches[j].Name {
			return matches[i].Name < matches[j].Name
		}
		return matches[i].ID < matches[j].ID
	})
	return matches, nil
}

func (f *Catalog) GetAdminProductByID(ctx context.Context, id string) (*domain.Product, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, p := range f.products {
		if p.ID == id && p.Active {
			out := cloneAdminProduct(*p)
			return &out, nil
		}
	}
	return nil, domain.ErrProductNotFound
}

func (f *Catalog) CreateProduct(ctx context.Context, input domain.SaveProductInput) (*domain.Product, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	var matchedCategory *domain.Category
	for _, c := range f.categories {
		if c.ID == input.CategoryID {
			res := c
			matchedCategory = &res
			break
		}
	}
	if matchedCategory == nil {
		return nil, domain.NewValidationError(map[string]string{"categoryId": "Danh mục không tồn tại"})
	}

	id := uuid.New().String()
	now := time.Now()
	currency := input.Currency
	if currency == "" {
		currency = "VND"
	}

	var optionGroups []domain.OptionGroup
	var variants []domain.ProductVariant
	price := input.Price
	stockQuantity := input.StockQuantity

	if input.HasVariants && len(input.OptionGroups) > 0 {
		for _, g := range input.OptionGroups {
			gid := g.ID
			if gid == "" {
				gid = uuid.New().String()
			}
			vals := make([]domain.OptionValue, 0, len(g.Values))
			for _, v := range g.Values {
				vid := v.ID
				if vid == "" {
					vid = uuid.New().String()
				}
				vals = append(vals, domain.OptionValue{ID: vid, Label: v.Label})
			}
			optionGroups = append(optionGroups, domain.OptionGroup{
				ID:       gid,
				Label:    g.Label,
				Position: g.Position,
				Values:   vals,
			})
		}
		var minActive, maxActive *big.Int
		var minAll, maxAll *big.Int
		var activeStock int64
		for _, v := range input.Variants {
			varID := v.ID
			if varID == "" {
				varID = uuid.New().String()
			}
			optIDs := make(map[string]string, len(v.OptionValueIDs))
			for gid, vid := range v.OptionValueIDs {
				optIDs[gid] = vid
			}
			variants = append(variants, domain.ProductVariant{
				ID:             varID,
				OptionValueIDs: optIDs,
				PriceVND:       domain.MoneyVND(v.PriceVND),
				StockQuantity:  v.StockQuantity,
				Active:         v.Active,
			})
			pInt, ok := new(big.Int).SetString(v.PriceVND, 10)
			if ok {
				if minAll == nil || pInt.Cmp(minAll) < 0 {
					minAll = pInt
				}
				if maxAll == nil || pInt.Cmp(maxAll) > 0 {
					maxAll = pInt
				}
				if v.Active {
					if minActive == nil || pInt.Cmp(minActive) < 0 {
						minActive = pInt
					}
					if maxActive == nil || pInt.Cmp(maxActive) > 0 {
						maxActive = pInt
					}
					activeStock += v.StockQuantity
				}
			}
		}
		if minActive != nil {
			price = minActive.String()
			stockQuantity = activeStock
		} else if minAll != nil {
			price = minAll.String()
			stockQuantity = 0
		}
	}

	p := &domain.Product{
		ID:            id,
		Name:          input.Name,
		Model:         input.Model,
		Brand:         input.Brand,
		Description:   input.Description,
		Category:      *matchedCategory,
		Price:         price,
		Currency:      currency,
		StockQuantity: stockQuantity,
		Featured:      input.Featured,
		Active:        true,
		ImageURLs:     append([]string(nil), input.ImageURLs...),
		CreatedAt:     now,
		UpdatedAt:     now,
		OptionGroups:  optionGroups,
		Variants:      variants,
		MinPriceVND:   domain.MoneyVND(price),
		MaxPriceVND:   domain.MoneyVND(price),
	}
	f.products = append(f.products, p)
	out := cloneAdminProduct(*p)
	return &out, nil
}

func (f *Catalog) UpdateProduct(ctx context.Context, id string, input domain.SaveProductInput) (*domain.Product, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	var target *domain.Product
	for _, p := range f.products {
		if p.ID == id && p.Active {
			target = p
			break
		}
	}
	if target == nil {
		return nil, domain.ErrProductNotFound
	}

	var matchedCategory *domain.Category
	for _, c := range f.categories {
		if c.ID == input.CategoryID {
			res := c
			matchedCategory = &res
			break
		}
	}
	if matchedCategory == nil {
		return nil, domain.NewValidationError(map[string]string{"categoryId": "Danh mục không tồn tại"})
	}

	currency := input.Currency
	if currency == "" {
		currency = "VND"
	}

	var optionGroups []domain.OptionGroup
	var variants []domain.ProductVariant
	price := input.Price
	stockQuantity := input.StockQuantity

	if input.HasVariants && len(input.OptionGroups) > 0 {
		for _, g := range input.OptionGroups {
			gid := g.ID
			if gid == "" {
				gid = uuid.New().String()
			}
			vals := make([]domain.OptionValue, 0, len(g.Values))
			for _, v := range g.Values {
				vid := v.ID
				if vid == "" {
					vid = uuid.New().String()
				}
				vals = append(vals, domain.OptionValue{ID: vid, Label: v.Label})
			}
			optionGroups = append(optionGroups, domain.OptionGroup{
				ID:       gid,
				Label:    g.Label,
				Position: g.Position,
				Values:   vals,
			})
		}
		var minActive, maxActive *big.Int
		var minAll, maxAll *big.Int
		var activeStock int64
		for _, v := range input.Variants {
			varID := v.ID
			if varID == "" {
				varID = uuid.New().String()
			}
			optIDs := make(map[string]string, len(v.OptionValueIDs))
			for gid, vid := range v.OptionValueIDs {
				optIDs[gid] = vid
			}
			variants = append(variants, domain.ProductVariant{
				ID:             varID,
				OptionValueIDs: optIDs,
				PriceVND:       domain.MoneyVND(v.PriceVND),
				StockQuantity:  v.StockQuantity,
				Active:         v.Active,
			})
			pInt, ok := new(big.Int).SetString(v.PriceVND, 10)
			if ok {
				if minAll == nil || pInt.Cmp(minAll) < 0 {
					minAll = pInt
				}
				if maxAll == nil || pInt.Cmp(maxAll) > 0 {
					maxAll = pInt
				}
				if v.Active {
					if minActive == nil || pInt.Cmp(minActive) < 0 {
						minActive = pInt
					}
					if maxActive == nil || pInt.Cmp(maxActive) > 0 {
						maxActive = pInt
					}
					activeStock += v.StockQuantity
				}
			}
		}
		if minActive != nil {
			price = minActive.String()
			stockQuantity = activeStock
		} else if minAll != nil {
			price = minAll.String()
			stockQuantity = 0
		}
	}

	target.Name = input.Name
	target.Model = input.Model
	target.Brand = input.Brand
	target.Description = input.Description
	target.Category = *matchedCategory
	target.Price = price
	target.Currency = currency
	target.StockQuantity = stockQuantity
	target.Featured = input.Featured
	target.ImageURLs = append([]string(nil), input.ImageURLs...)
	target.OptionGroups = optionGroups
	target.Variants = variants
	target.UpdatedAt = time.Now()
	target.MinPriceVND = domain.MoneyVND(price)
	target.MaxPriceVND = domain.MoneyVND(price)

	out := cloneAdminProduct(*target)
	return &out, nil
}

func (f *Catalog) DeleteProduct(ctx context.Context, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	for _, p := range f.products {
		if p.ID == id && p.Active {
			p.Active = false
			p.UpdatedAt = time.Now()
			return nil
		}
	}
	return domain.ErrProductNotFound
}

func cloneAdminProduct(product domain.Product) domain.Product {
	product.ImageURLs = append([]string(nil), product.ImageURLs...)
	groups := make([]domain.OptionGroup, 0, len(product.OptionGroups))
	for _, g := range product.OptionGroups {
		vals := append([]domain.OptionValue(nil), g.Values...)
		groups = append(groups, domain.OptionGroup{
			ID:       g.ID,
			Label:    g.Label,
			Position: g.Position,
			Values:   vals,
		})
	}
	product.OptionGroups = groups

	vars := make([]domain.ProductVariant, 0, len(product.Variants))
	for _, v := range product.Variants {
		optIDs := make(map[string]string, len(v.OptionValueIDs))
		for k, val := range v.OptionValueIDs {
			optIDs[k] = val
		}
		vars = append(vars, domain.ProductVariant{
			ID:             v.ID,
			OptionValueIDs: optIDs,
			PriceVND:       v.PriceVND,
			StockQuantity:  v.StockQuantity,
			Active:         v.Active,
		})
	}
	product.Variants = vars

	if len(product.Variants) > 0 {
		var minPrice, maxPrice *big.Int
		var minAll, maxAll *big.Int
		var activeStock int64
		hasActive := false
		for _, v := range product.Variants {
			price, ok := new(big.Int).SetString(string(v.PriceVND), 10)
			if ok {
				if minAll == nil || price.Cmp(minAll) < 0 {
					minAll = price
				}
				if maxAll == nil || price.Cmp(maxAll) > 0 {
					maxAll = price
				}
				if v.Active {
					hasActive = true
					if minPrice == nil || price.Cmp(minPrice) < 0 {
						minPrice = price
					}
					if maxPrice == nil || price.Cmp(maxPrice) > 0 {
						maxPrice = price
					}
					activeStock += v.StockQuantity
				}
			}
		}
		if hasActive && minPrice != nil {
			product.MinPriceVND = domain.MoneyVND(minPrice.String())
			product.MaxPriceVND = domain.MoneyVND(maxPrice.String())
			product.Price = minPrice.String()
			product.StockQuantity = activeStock
		} else if minAll != nil {
			product.MinPriceVND = domain.MoneyVND(minAll.String())
			product.MaxPriceVND = domain.MoneyVND(maxAll.String())
			product.Price = minAll.String()
			product.StockQuantity = 0
		}
	} else if product.Price != "" {
		product.MinPriceVND = domain.MoneyVND(product.Price)
		product.MaxPriceVND = domain.MoneyVND(product.Price)
	}
	return product
}

var _ domain.CatalogRepository = (*Catalog)(nil)
