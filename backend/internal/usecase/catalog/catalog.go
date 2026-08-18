package catalog

import (
	"context"
	"fmt"
	"math/big"
	"regexp"
	"strconv"
	"strings"

	"commerce-backend/internal/domain"
)

var (
	uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
)

type Dependencies struct {
	Catalog domain.CatalogRepository
}

type UseCase struct {
	catalog domain.CatalogRepository
}

func New(deps Dependencies) *UseCase {
	return &UseCase{catalog: deps.Catalog}
}

func (uc *UseCase) ListCategories(ctx context.Context) ([]domain.Category, error) {
	return uc.catalog.ListCategories(ctx)
}

func (uc *UseCase) ListAdminCategories(ctx context.Context) ([]domain.Category, error) {
	return uc.catalog.ListAdminCategories(ctx)
}

func (uc *UseCase) CreateCategory(ctx context.Context, name string) (*domain.Category, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, domain.NewValidationError(map[string]string{"name": "Tên danh mục không được để trống"})
	}
	return uc.catalog.CreateCategory(ctx, name)
}

func (uc *UseCase) RenameCategory(ctx context.Context, id, name string) (*domain.Category, error) {
	if !uuidPattern.MatchString(id) {
		return nil, domain.ErrInvalidCategoryID
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, domain.NewValidationError(map[string]string{"name": "Tên danh mục không được để trống"})
	}
	return uc.catalog.UpdateCategory(ctx, id, name)
}

func (uc *UseCase) DeleteCategory(ctx context.Context, id string) (*domain.Category, error) {
	if !uuidPattern.MatchString(id) {
		return nil, domain.ErrInvalidCategoryID
	}
	return uc.catalog.DeleteCategory(ctx, id)
}

func (uc *UseCase) ListBrands(ctx context.Context) ([]string, error) {
	return uc.catalog.ListBrands(ctx)
}

func (uc *UseCase) SearchProducts(ctx context.Context, f domain.ProductFilter) ([]domain.Product, error) {
	if err := uc.validateFilter(&f); err != nil {
		return nil, err
	}
	return uc.catalog.ListProducts(ctx, f)
}

func (uc *UseCase) ListFeaturedProducts(ctx context.Context) ([]domain.Product, error) {
	return uc.catalog.ListFeaturedProducts(ctx)
}

func (uc *UseCase) GetProduct(ctx context.Context, id string) (*domain.Product, error) {
	if !uuidPattern.MatchString(id) {
		return nil, domain.ErrInvalidProductID
	}
	return uc.catalog.GetProductByID(ctx, id)
}

func (uc *UseCase) validateFilter(f *domain.ProductFilter) error {
	f.Query = strings.TrimSpace(f.Query)
	if f.CategoryID != "" && len(f.CategoryIDs) == 0 {
		f.CategoryIDs = []string{f.CategoryID}
	}
	for i := range f.CategoryIDs {
		f.CategoryIDs[i] = strings.TrimSpace(f.CategoryIDs[i])
	}
	var cleanBrands []string
	for _, b := range f.Brands {
		trimmed := strings.TrimSpace(b)
		if trimmed != "" {
			cleanBrands = append(cleanBrands, trimmed)
		}
	}
	f.Brands = cleanBrands
	fields := map[string]string{}

	for _, id := range f.CategoryIDs {
		if !uuidPattern.MatchString(id) {
			fields["category_id"] = "must be a valid category id"
		}
	}
	if f.MinPriceVND != nil && !validMoney(string(*f.MinPriceVND)) {
		fields["min_price"] = "must be a canonical non-negative VND integer"
	}
	if f.MaxPriceVND != nil && !validMoney(string(*f.MaxPriceVND)) {
		fields["max_price"] = "must be a canonical non-negative VND integer"
	}
	if f.MinPriceVND != nil && f.MaxPriceVND != nil && validMoney(string(*f.MinPriceVND)) && validMoney(string(*f.MaxPriceVND)) {
		min, _ := new(big.Int).SetString(string(*f.MinPriceVND), 10)
		max, _ := new(big.Int).SetString(string(*f.MaxPriceVND), 10)
		if min.Cmp(max) > 0 {
			fields["min_price"] = "must be less than or equal to max_price"
			fields["max_price"] = "must be greater than or equal to min_price"
		}
	}
	if f.MinPrice != "" && !validLegacyDecimal(f.MinPrice) {
		fields["min_price"] = "must be a non-negative decimal value"
	}
	if f.MaxPrice != "" && !validLegacyDecimal(f.MaxPrice) {
		fields["max_price"] = "must be a non-negative decimal value"
	}
	if f.MinPrice != "" && f.MaxPrice != "" && validLegacyDecimal(f.MinPrice) && validLegacyDecimal(f.MaxPrice) {
		min, _ := strconv.ParseFloat(f.MinPrice, 64)
		max, _ := strconv.ParseFloat(f.MaxPrice, 64)
		if min > max {
			fields["min_price"] = "must be less than or equal to max_price"
			fields["max_price"] = "must be greater than or equal to min_price"
		}
	}
	if len(fields) > 0 {
		return domain.NewFilterValidationError(fields)
	}
	return nil
}

func (uc *UseCase) ListAdminProducts(ctx context.Context, query string) ([]domain.Product, error) {
	return uc.catalog.ListAdminProducts(ctx, strings.TrimSpace(query))
}

func (uc *UseCase) GetAdminProduct(ctx context.Context, id string) (*domain.Product, error) {
	if !uuidPattern.MatchString(id) {
		return nil, domain.ErrInvalidProductID
	}
	return uc.catalog.GetAdminProductByID(ctx, id)
}

func (uc *UseCase) CreateProduct(ctx context.Context, input domain.SaveProductInput) (*domain.Product, error) {
	if err := uc.validateSaveProductInput(&input); err != nil {
		return nil, err
	}
	_, err := uc.catalog.GetCategoryByID(ctx, input.CategoryID)
	if err != nil {
		return nil, domain.NewValidationError(map[string]string{"categoryId": "Danh mục không tồn tại"})
	}
	return uc.catalog.CreateProduct(ctx, input)
}

func (uc *UseCase) UpdateProduct(ctx context.Context, id string, input domain.SaveProductInput) (*domain.Product, error) {
	if !uuidPattern.MatchString(id) {
		return nil, domain.ErrInvalidProductID
	}
	if err := uc.validateSaveProductInput(&input); err != nil {
		return nil, err
	}
	_, err := uc.catalog.GetCategoryByID(ctx, input.CategoryID)
	if err != nil {
		return nil, domain.NewValidationError(map[string]string{"categoryId": "Danh mục không tồn tại"})
	}
	return uc.catalog.UpdateProduct(ctx, id, input)
}

func (uc *UseCase) DeleteProduct(ctx context.Context, id string) error {
	if !uuidPattern.MatchString(id) {
		return domain.ErrInvalidProductID
	}
	return uc.catalog.DeleteProduct(ctx, id)
}

func (uc *UseCase) validateSaveProductInput(input *domain.SaveProductInput) error {
	input.Name = strings.TrimSpace(input.Name)
	input.Model = strings.TrimSpace(input.Model)
	input.Brand = strings.TrimSpace(input.Brand)
	input.Description = strings.TrimSpace(input.Description)
	input.CategoryID = strings.TrimSpace(input.CategoryID)
	input.Price = strings.TrimSpace(input.Price)
	input.Currency = strings.TrimSpace(input.Currency)
	if input.Currency == "" {
		input.Currency = "VND"
	}

	fields := map[string]string{}
	if input.Name == "" {
		fields["name"] = "Tên sản phẩm không được để trống"
	}
	if input.CategoryID == "" || !uuidPattern.MatchString(input.CategoryID) {
		fields["categoryId"] = "Danh mục không hợp lệ"
	}

	if !input.HasVariants {
		if input.Price == "" {
			fields["price"] = "Giá sản phẩm không được để trống"
		} else if !validPriceInput(input.Price) {
			fields["price"] = "Giá sản phẩm phải là số không âm"
		}
		if input.StockQuantity < 0 {
			fields["stockQuantity"] = "Số lượng tồn kho không được âm"
		}
	} else {
		if len(input.OptionGroups) == 0 {
			fields["optionGroups"] = "Phải có ít nhất một nhóm thuộc tính"
		} else {
			for i, group := range input.OptionGroups {
				trimmedLabel := strings.TrimSpace(group.Label)
				input.OptionGroups[i].Label = trimmedLabel
				if trimmedLabel == "" {
					fields[fmt.Sprintf("optionGroups[%d].label", i)] = "Tên nhóm thuộc tính không được để trống"
				}
				if len(group.Values) == 0 {
					fields[fmt.Sprintf("optionGroups[%d].values", i)] = "Nhóm thuộc tính phải có ít nhất một giá trị"
				} else {
					seenVals := make(map[string]bool)
					hasDup := false
					for j, val := range group.Values {
						trimmedVal := strings.TrimSpace(val.Label)
						input.OptionGroups[i].Values[j].Label = trimmedVal
						if trimmedVal != "" {
							lower := strings.ToLower(trimmedVal)
							if seenVals[lower] {
								hasDup = true
							}
							seenVals[lower] = true
						}
					}
					if hasDup {
						fields[fmt.Sprintf("optionGroups[%d].values", i)] = "Giá trị thuộc tính không được trùng nhau"
					}
				}
			}
		}

		if len(input.OptionGroups) > 0 && len(input.Variants) == 0 {
			fields["variants"] = "Phải có ít nhất một biến thể"
		} else {
			seenCombos := make(map[string]bool)
			for i, variant := range input.Variants {
				if len(variant.OptionValueIDs) != len(input.OptionGroups) {
					fields[fmt.Sprintf("variants[%d]", i)] = "Mỗi biến thể phải chọn đầy đủ giá trị cho từng nhóm thuộc tính"
				} else {
					var comboKeys []string
					missingGroup := false
					for _, grp := range input.OptionGroups {
						valID, ok := variant.OptionValueIDs[grp.ID]
						if !ok || valID == "" {
							missingGroup = true
							break
						}
						comboKeys = append(comboKeys, grp.ID+":"+valID)
					}
					if missingGroup {
						fields[fmt.Sprintf("variants[%d]", i)] = "Mỗi biến thể phải chọn đầy đủ giá trị cho từng nhóm thuộc tính"
					} else {
						comboSig := strings.Join(comboKeys, "|")
						if seenCombos[comboSig] {
							fields[fmt.Sprintf("variants[%d]", i)] = "Tổ hợp thuộc tính của biến thể bị trùng lặp"
						}
						seenCombos[comboSig] = true
					}
				}
				trimmedPrice := strings.TrimSpace(variant.PriceVND)
				input.Variants[i].PriceVND = trimmedPrice
				if trimmedPrice == "" || !validPriceInput(trimmedPrice) {
					fields[fmt.Sprintf("variants[%d].priceVnd", i)] = "Giá biến thể phải là số không âm"
				}
				if variant.StockQuantity < 0 {
					fields[fmt.Sprintf("variants[%d].stockQuantity", i)] = "Số lượng tồn kho không được âm"
				}
			}
		}

		if input.Price != "" && !validPriceInput(input.Price) {
			fields["price"] = "Giá sản phẩm phải là số không âm"
		}
		if input.StockQuantity < 0 {
			fields["stockQuantity"] = "Số lượng tồn kho không được âm"
		}
	}

	if len(fields) > 0 {
		return domain.NewValidationError(fields)
	}
	return nil
}

func validPriceInput(s string) bool {
	if s == "" {
		return false
	}
	if domain.MoneyVND(s).IsCanonical() {
		return true
	}
	return regexp.MustCompile(`^(?:[0-9]+|[0-9]*\.[0-9]{1,2})$`).MatchString(s)
}

func validMoney(s string) bool {
	return len(s) <= 38 && domain.MoneyVND(s).IsCanonical()
}

func validLegacyDecimal(s string) bool {
	return strings.TrimSpace(s) != "" && regexp.MustCompile(`^(?:[0-9]+|[0-9]*\.[0-9]+)$`).MatchString(s)
}
