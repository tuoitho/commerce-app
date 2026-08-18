package http

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	cataloguc "commerce-backend/internal/usecase/catalog"
)

type adminCatalogHandler struct {
	uc *cataloguc.UseCase
}

func newAdminCatalogHandler(uc *cataloguc.UseCase) *adminCatalogHandler {
	return &adminCatalogHandler{uc: uc}
}

type optionValueInputDTO struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Position int    `json:"position"`
}

type optionGroupInputDTO struct {
	ID       string                `json:"id"`
	Label    string                `json:"label"`
	Position int                   `json:"position"`
	Values   []optionValueInputDTO `json:"values"`
}

type variantInputDTO struct {
	ID             string            `json:"id"`
	OptionValueIDs map[string]string `json:"optionValueIds"`
	PriceVND       string            `json:"priceVnd"`
	PriceVNDAlt    string            `json:"priceVND,omitempty"`
	StockQuantity  int64             `json:"stockQuantity"`
	Active         bool              `json:"active"`
}

type saveProductRequest struct {
	Name          string                `json:"name"`
	Model         string                `json:"model"`
	Brand         string                `json:"brand"`
	Description   string                `json:"description"`
	CategoryID    string                `json:"categoryId"`
	Price         string                `json:"price"`
	Currency      string                `json:"currency"`
	StockQuantity int64                 `json:"stockQuantity"`
	Featured      bool                  `json:"featured"`
	ImageURLs     []string              `json:"imageUrls"`
	HasVariants   bool                  `json:"hasVariants"`
	OptionGroups  []optionGroupInputDTO `json:"optionGroups"`
	Variants      []variantInputDTO     `json:"variants"`
}

func (req saveProductRequest) toDomain() domain.SaveProductInput {
	var optionGroups []domain.OptionGroupInput
	if len(req.OptionGroups) > 0 {
		optionGroups = make([]domain.OptionGroupInput, 0, len(req.OptionGroups))
		for i, g := range req.OptionGroups {
			pos := g.Position
			if pos == 0 {
				pos = i
			}
			var vals []domain.OptionValueInput
			if len(g.Values) > 0 {
				vals = make([]domain.OptionValueInput, 0, len(g.Values))
				for j, v := range g.Values {
					vPos := v.Position
					if vPos == 0 {
						vPos = j
					}
					vals = append(vals, domain.OptionValueInput{
						ID:       v.ID,
						Label:    v.Label,
						Position: vPos,
					})
				}
			}
			optionGroups = append(optionGroups, domain.OptionGroupInput{
				ID:       g.ID,
				Label:    g.Label,
				Position: pos,
				Values:   vals,
			})
		}
	}

	var variants []domain.VariantInput
	if len(req.Variants) > 0 {
		variants = make([]domain.VariantInput, 0, len(req.Variants))
		for _, v := range req.Variants {
			price := v.PriceVND
			if price == "" && v.PriceVNDAlt != "" {
				price = v.PriceVNDAlt
			}
			optIDs := v.OptionValueIDs
			if optIDs == nil {
				optIDs = make(map[string]string)
			}
			variants = append(variants, domain.VariantInput{
				ID:             v.ID,
				OptionValueIDs: optIDs,
				PriceVND:       price,
				StockQuantity:  v.StockQuantity,
				Active:         v.Active,
			})
		}
	}

	return domain.SaveProductInput{
		Name:          req.Name,
		Model:         req.Model,
		Brand:         req.Brand,
		Description:   req.Description,
		CategoryID:    req.CategoryID,
		Price:         req.Price,
		Currency:      req.Currency,
		StockQuantity: req.StockQuantity,
		Featured:      req.Featured,
		ImageURLs:     req.ImageURLs,
		HasVariants:   req.HasVariants,
		OptionGroups:  optionGroups,
		Variants:      variants,
	}
}

type categoryRequest struct {
	Name *string `json:"name"`
}

func invalidCategoryName() *domain.ValidationError {
	return domain.NewValidationError(map[string]string{"name": "Tên danh mục không hợp lệ"})
}

func (req categoryRequest) validName() bool {
	return req.Name != nil && strings.TrimSpace(*req.Name) != ""
}

func toCategoryResponse(c domain.Category) gin.H { return gin.H{"id": c.ID, "name": c.Name} }
func (h *adminCatalogHandler) ListCategories(c *gin.Context) {
	cats, err := h.uc.ListAdminCategories(c)
	if err != nil {
		writeError(c, err)
		return
	}
	out := make([]gin.H, 0, len(cats))
	for _, x := range cats {
		out = append(out, toCategoryResponse(x))
	}
	writeSuccess(c, http.StatusOK, "Lấy danh sách danh mục thành công", out)
}
func (h *adminCatalogHandler) CreateCategory(c *gin.Context) {
	var req categoryRequest
	if c.ShouldBindJSON(&req) != nil || !req.validName() {
		writeError(c, invalidCategoryName())
		return
	}
	cat, err := h.uc.CreateCategory(c, *req.Name)
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusCreated, "Tạo danh mục thành công", toCategoryResponse(*cat))
}
func (h *adminCatalogHandler) UpdateCategory(c *gin.Context) {
	var req categoryRequest
	if c.ShouldBindJSON(&req) != nil || !req.validName() {
		writeError(c, invalidCategoryName())
		return
	}
	cat, err := h.uc.RenameCategory(c, c.Param("id"), *req.Name)
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "Đổi tên danh mục thành công", toCategoryResponse(*cat))
}
func (h *adminCatalogHandler) DeleteCategory(c *gin.Context) {
	cat, err := h.uc.DeleteCategory(c, c.Param("id"))
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "Xoá danh mục thành công", toCategoryResponse(*cat))
}

func (h *adminCatalogHandler) ListProducts(c *gin.Context) {
	pageStr, pageSet := c.GetQuery("page")
	limitStr, limitSet := c.GetQuery("limit")

	fields := map[string]string{}
	page := 1
	limit := 10

	if pageSet {
		if pageStr == "" {
			fields["page"] = "must not be empty"
		} else {
			p, err := strconv.Atoi(pageStr)
			if err != nil || p < 1 {
				fields["page"] = "must be a positive integer"
			} else {
				page = p
			}
		}
	}

	if limitSet {
		if limitStr == "" {
			fields["limit"] = "must not be empty"
		} else {
			l, err := strconv.Atoi(limitStr)
			if err != nil || l < 1 || l > 100 {
				fields["limit"] = "must be a positive integer between 1 and 100"
			} else {
				limit = l
			}
		}
	}

	if len(fields) > 0 {
		writeError(c, domain.NewValidationError(fields))
		return
	}

	products, err := h.uc.ListAdminProducts(c, c.Query("q"))
	if err != nil {
		writeError(c, err)
		return
	}

	out := make([]productSummaryResponse, 0, len(products))
	for _, p := range products {
		out = append(out, toSummaryResponse(p))
	}

	total := len(out)
	totalPages := 0
	if total > 0 {
		totalPages = (total + limit - 1) / limit
	}
	offset := (page - 1) * limit
	var pageItems []productSummaryResponse
	if offset < total {
		end := offset + limit
		if end > total {
			end = total
		}
		pageItems = out[offset:end]
	} else {
		pageItems = []productSummaryResponse{}
	}

	pagination := PaginationMeta{
		Page:       page,
		Limit:      limit,
		Total:      total,
		TotalPages: totalPages,
		HasNext:    page < totalPages,
		HasPrev:    page > 1,
	}

	writePaginatedSuccess(c, http.StatusOK, "", pageItems, pagination)
}

func (h *adminCatalogHandler) GetProduct(c *gin.Context) {
	product, err := h.uc.GetAdminProduct(c, c.Param("id"))
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "", toDetailResponse(*product))
}

func (h *adminCatalogHandler) CreateProduct(c *gin.Context) {
	var req saveProductRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, domain.NewValidationError(map[string]string{"body": "invalid JSON body"}))
		return
	}

	input := req.toDomain()
	created, err := h.uc.CreateProduct(c, input)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusCreated, "Tạo sản phẩm thành công", toDetailResponse(*created))
}

func (h *adminCatalogHandler) UpdateProduct(c *gin.Context) {
	var req saveProductRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, domain.NewValidationError(map[string]string{"body": "invalid JSON body"}))
		return
	}

	input := req.toDomain()
	updated, err := h.uc.UpdateProduct(c, c.Param("id"), input)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Cập nhật sản phẩm thành công", toDetailResponse(*updated))
}

func (h *adminCatalogHandler) DeleteProduct(c *gin.Context) {
	err := h.uc.DeleteProduct(c, c.Param("id"))
	if err != nil {
		writeError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
