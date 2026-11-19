package catalog

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"math/big"
	"mime"
	"net/http"
	"net/url"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"

	"commerce-backend/internal/domain"
)

const productImageObjectPrefix = "products/"

var (
	uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
)

type Dependencies struct {
	Catalog    domain.CatalogRepository
	MediaStore domain.ReviewMediaStore
}

type UseCase struct {
	catalog    domain.CatalogRepository
	mediaStore domain.ReviewMediaStore
}

func New(deps Dependencies) *UseCase {
	return &UseCase{catalog: deps.Catalog, mediaStore: deps.MediaStore}
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
	switch f.Sort {
	case domain.ProductSortDefault,
		domain.ProductSortBestselling,
		domain.ProductSortNewest,
		domain.ProductSortPriceAsc,
		domain.ProductSortPriceDesc,
		domain.ProductSortRatingDesc:
	default:
		fields["sort"] = "must be one of bestselling, newest, price_asc, price_desc, rating_desc"
	}
	if f.MinRating != nil && (math.IsNaN(*f.MinRating) || math.IsInf(*f.MinRating, 0) || *f.MinRating < 1 || *f.MinRating > 5) {
		fields["min_rating"] = "must be a number between 1 and 5"
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

	if len(input.ImageURLs) > 0 {
		cleaned := make([]string, len(input.ImageURLs))
		for i, raw := range input.ImageURLs {
			trimmed := strings.TrimSpace(raw)
			cleaned[i] = trimmed
			if !isValidProductImageURL(trimmed) {
				fields[fmt.Sprintf("imageUrls[%d]", i)] = "Đường dẫn ảnh phải là URL http(s) hợp lệ hoặc /media/products/..."
			}
		}
		input.ImageURLs = cleaned
	}

	if input.Specs == nil {
		input.Specs = []domain.SpecGroup{}
	} else if len(input.Specs) > domain.MaxProductSpecGroups {
		fields["specs"] = "Tối đa 12 nhóm thông số kỹ thuật"
	} else {
		cleanedSpecs := make([]domain.SpecGroup, len(input.Specs))
		seenGroups := make(map[string]bool, len(input.Specs))
		for i, g := range input.Specs {
			trimmedGroup := strings.TrimSpace(g.Group)
			groupLen := utf8.RuneCountInString(trimmedGroup)
			if groupLen == 0 || groupLen > domain.MaxProductSpecGroupLen {
				fields[fmt.Sprintf("specs[%d].group", i)] = "Tên nhóm thông số phải dài từ 1 đến 80 ký tự"
			} else {
				lowerGroup := strings.ToLower(trimmedGroup)
				if seenGroups[lowerGroup] {
					fields[fmt.Sprintf("specs[%d].group", i)] = "Tên nhóm thông số không được trùng nhau"
				}
				seenGroups[lowerGroup] = true
			}

			var cleanedItems []domain.SpecItem
			if len(g.Items) == 0 {
				fields[fmt.Sprintf("specs[%d].items", i)] = "Mỗi nhóm thông số phải có ít nhất một dòng"
			} else if len(g.Items) > domain.MaxProductSpecItemsPerGroup {
				fields[fmt.Sprintf("specs[%d].items", i)] = "Mỗi nhóm tối đa 20 dòng thông số"
			} else {
				cleanedItems = make([]domain.SpecItem, len(g.Items))
				for j, item := range g.Items {
					trimmedLabel := strings.TrimSpace(item.Label)
					trimmedValue := strings.TrimSpace(item.Value)
					labelLen := utf8.RuneCountInString(trimmedLabel)
					valueLen := utf8.RuneCountInString(trimmedValue)
					if labelLen == 0 || labelLen > domain.MaxProductSpecLabelLen {
						fields[fmt.Sprintf("specs[%d].items[%d].label", i, j)] = "Nhãn thông số phải dài từ 1 đến 80 ký tự"
					}
					if valueLen == 0 || valueLen > domain.MaxProductSpecValueLen {
						fields[fmt.Sprintf("specs[%d].items[%d].value", i, j)] = "Giá trị thông số phải dài từ 1 đến 300 ký tự"
					}
					cleanedItems[j] = domain.SpecItem{Label: trimmedLabel, Value: trimmedValue}
				}
			}
			cleanedSpecs[i] = domain.SpecGroup{Group: trimmedGroup, Items: cleanedItems}
		}
		input.Specs = cleanedSpecs
	}

	if len(fields) > 0 {
		return domain.NewValidationError(fields)
	}
	return nil
}

func (uc *UseCase) UploadProductImage(ctx context.Context, input domain.UploadProductImageInput) (*domain.UploadedProductImage, error) {
	if uc.mediaStore == nil {
		return nil, errors.New("product media store is not configured")
	}
	if input.Reader == nil || input.Size <= 0 || input.Size > domain.MaxProductImageBytes {
		return nil, domain.NewValidationError(map[string]string{
			"file": "Ảnh sản phẩm phải có dung lượng từ 1 byte đến tối đa 10 MB",
		})
	}

	data, err := io.ReadAll(io.LimitReader(input.Reader, domain.MaxProductImageBytes+1))
	if err != nil {
		return nil, domain.NewValidationError(map[string]string{
			"file": "Không thể đọc tệp ảnh sản phẩm",
		})
	}
	if len(data) == 0 || int64(len(data)) > domain.MaxProductImageBytes {
		return nil, domain.NewValidationError(map[string]string{
			"file": "Ảnh sản phẩm phải có dung lượng từ 1 byte đến tối đa 10 MB",
		})
	}

	sniffLen := len(data)
	if sniffLen > 512 {
		sniffLen = 512
	}
	detectedMIME := normalizeImageMIME(http.DetectContentType(data[:sniffLen]))
	ext, supported := productImageExtensionForMIME(detectedMIME)
	if !supported {
		return nil, domain.NewValidationError(map[string]string{
			"file": "Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP",
		})
	}

	if declared := normalizeDeclaredImageMIME(input.DeclaredContentType); declared != "" && declared != "application/octet-stream" && declared != detectedMIME {
		return nil, domain.NewValidationError(map[string]string{
			"file": "Định dạng ảnh thực tế không khớp với khai báo (chỉ hỗ trợ JPEG, PNG hoặc WebP)",
		})
	}

	key := uuid.NewString() + "." + ext
	objectKey := productImageObjectPrefix + key
	if err := uc.mediaStore.PutObject(ctx, objectKey, bytes.NewReader(data), int64(len(data)), detectedMIME); err != nil {
		return nil, err
	}

	return &domain.UploadedProductImage{
		Key:       key,
		URL:       "/media/products/" + key,
		MimeType:  detectedMIME,
		SizeBytes: int64(len(data)),
	}, nil
}

func (uc *UseCase) StatProductImage(ctx context.Context, imageKey string) (*domain.ReviewObjectInfo, error) {
	if !domain.ProductImageKeyRegex.MatchString(imageKey) || uc.mediaStore == nil {
		return nil, domain.ErrProductImageNotFound
	}
	info, err := uc.mediaStore.StatObject(ctx, productImageObjectPrefix+imageKey)
	if err != nil {
		if isStorageNotFound(err) {
			return nil, domain.ErrProductImageNotFound
		}
		return nil, err
	}
	if strings.TrimSpace(info.ContentType) == "" {
		info.ContentType = contentTypeForProductImageKey(imageKey)
	}
	return info, nil
}

func (uc *UseCase) OpenProductImage(ctx context.Context, imageKey string) (io.ReadCloser, *domain.ReviewObjectInfo, error) {
	if !domain.ProductImageKeyRegex.MatchString(imageKey) || uc.mediaStore == nil {
		return nil, nil, domain.ErrProductImageNotFound
	}
	info, err := uc.StatProductImage(ctx, imageKey)
	if err != nil {
		return nil, nil, err
	}
	stream, err := uc.mediaStore.GetObject(ctx, productImageObjectPrefix+imageKey)
	if err != nil {
		if isStorageNotFound(err) {
			return nil, nil, domain.ErrProductImageNotFound
		}
		return nil, nil, err
	}
	return stream, info, nil
}

func isValidProductImageURL(raw string) bool {
	if raw == "" {
		return false
	}
	if strings.HasPrefix(raw, "/media/products/") {
		key := strings.TrimPrefix(raw, "/media/products/")
		return domain.ProductImageKeyRegex.MatchString(key)
	}
	parsed, err := url.ParseRequestURI(raw)
	if err != nil {
		return false
	}
	scheme := strings.ToLower(parsed.Scheme)
	return (scheme == "http" || scheme == "https") && parsed.Host != ""
}

func normalizeDeclaredImageMIME(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	if parsed, _, err := mime.ParseMediaType(trimmed); err == nil && parsed != "" {
		trimmed = parsed
	}
	return normalizeImageMIME(trimmed)
}

func normalizeImageMIME(v string) string {
	lower := strings.ToLower(strings.TrimSpace(v))
	if lower == "image/jpg" {
		return "image/jpeg"
	}
	return lower
}

func productImageExtensionForMIME(mimeType string) (string, bool) {
	switch mimeType {
	case "image/jpeg":
		return "jpg", true
	case "image/png":
		return "png", true
	case "image/webp":
		return "webp", true
	default:
		return "", false
	}
}

func contentTypeForProductImageKey(imageKey string) string {
	switch strings.ToLower(filepath.Ext(imageKey)) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	default:
		return "application/octet-stream"
	}
}

func isStorageNotFound(err error) bool {
	if err == nil {
		return false
	}
	lower := strings.ToLower(err.Error())
	return strings.Contains(lower, "nosuchkey") ||
		strings.Contains(lower, "not found") ||
		strings.Contains(lower, "does not exist") ||
		strings.Contains(lower, "404")
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
