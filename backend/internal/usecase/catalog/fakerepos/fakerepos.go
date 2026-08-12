package fakerepos

import (
	"context"
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
	f.mu.Lock()
	defer f.mu.Unlock()
	p.CreatedAt = time.Now()
	p.UpdatedAt = time.Now()
	f.products = append(f.products, &p)
}

func (f *Catalog) ListCategories(ctx context.Context) ([]domain.Category, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]domain.Category, len(f.categories))
	copy(out, f.categories)
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func (f *Catalog) ListProducts(ctx context.Context, filt domain.ProductFilter) ([]domain.Product, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	query := strings.ToLower(strings.TrimSpace(filt.Query))
	var minP, maxP float64
	var hasMin, hasMax bool
	if filt.MinPrice != "" {
		minP, _ = strconv.ParseFloat(filt.MinPrice, 64)
		hasMin = true
	}
	if filt.MaxPrice != "" {
		maxP, _ = strconv.ParseFloat(filt.MaxPrice, 64)
		hasMax = true
	}

	matches := make([]domain.Product, 0, len(f.products))
	for _, p := range f.products {
		if query != "" && !strings.Contains(strings.ToLower(p.Name), query) {
			continue
		}
		if filt.CategoryID != "" && p.Category.ID != filt.CategoryID {
			continue
		}
		price, _ := strconv.ParseFloat(p.Price, 64)
		if hasMin && price < minP {
			continue
		}
		if hasMax && price > maxP {
			continue
		}
		if filt.InStock != nil && p.InStock() != *filt.InStock {
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

func (f *Catalog) GetProductByID(ctx context.Context, id string) (*domain.Product, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, p := range f.products {
		if p.ID == id {
			out := *p
			return &out, nil
		}
	}
	return nil, domain.ErrProductNotFound
}

var _ domain.CatalogRepository = (*Catalog)(nil)
