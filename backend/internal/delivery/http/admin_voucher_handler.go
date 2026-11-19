package http

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	voucheruc "commerce-backend/internal/usecase/voucher"
)

const (
	defaultAdminVoucherPage  = 1
	defaultAdminVoucherLimit = 20
)

type adminVoucherHandler struct {
	uc *voucheruc.UseCase
}

func newAdminVoucherHandler(uc *voucheruc.UseCase) *adminVoucherHandler {
	return &adminVoucherHandler{uc: uc}
}

type saveVoucherRequest struct {
	Code           string   `json:"code"`
	Title          string   `json:"title"`
	Description    string   `json:"description"`
	VoucherType    string   `json:"voucherType"`
	ScopeType      string   `json:"scopeType"`
	CategoryIDs    []string `json:"categoryIds"`
	ProductIDs     []string `json:"productIds"`
	DiscountValue  string   `json:"discountValue"`
	MaxDiscountVND *string  `json:"maxDiscountVnd"`
	MinOrderVND    string   `json:"minOrderVnd"`
	UsageLimit     *int     `json:"usageLimit"`
	PerUserLimit   int      `json:"perUserLimit"`
	StartsAt       string   `json:"startsAt"`
	EndsAt         string   `json:"endsAt"`
	Active         bool     `json:"active"`
}

func (r saveVoucherRequest) toDomain() (domain.SaveVoucherInput, error) {
	fields := map[string]string{}
	var startsAt, endsAt time.Time

	if s := strings.TrimSpace(r.StartsAt); s == "" {
		fields["startsAt"] = "Thời gian bắt đầu không hợp lệ"
	} else if t, err := time.Parse(time.RFC3339Nano, s); err != nil {
		fields["startsAt"] = "Thời gian bắt đầu phải theo định dạng RFC3339"
	} else {
		startsAt = t.UTC()
	}

	if s := strings.TrimSpace(r.EndsAt); s == "" {
		fields["endsAt"] = "Thời gian kết thúc không hợp lệ"
	} else if t, err := time.Parse(time.RFC3339Nano, s); err != nil {
		fields["endsAt"] = "Thời gian kết thúc phải theo định dạng RFC3339"
	} else {
		endsAt = t.UTC()
	}

	if len(fields) > 0 {
		return domain.SaveVoucherInput{}, domain.NewValidationError(fields)
	}

	var maxDiscount *domain.MoneyVND
	if r.MaxDiscountVND != nil {
		val := domain.MoneyVND(*r.MaxDiscountVND)
		maxDiscount = &val
	}

	return domain.SaveVoucherInput{
		Code:           r.Code,
		Title:          r.Title,
		Description:    r.Description,
		VoucherType:    domain.VoucherType(r.VoucherType),
		ScopeType:      domain.VoucherScopeType(r.ScopeType),
		CategoryIDs:    r.CategoryIDs,
		ProductIDs:     r.ProductIDs,
		DiscountValue:  domain.MoneyVND(r.DiscountValue),
		MaxDiscountVND: maxDiscount,
		MinOrderVND:    domain.MoneyVND(r.MinOrderVND),
		UsageLimit:     r.UsageLimit,
		PerUserLimit:   r.PerUserLimit,
		StartsAt:       startsAt,
		EndsAt:         endsAt,
		Active:         r.Active,
	}, nil
}

func (h *adminVoucherHandler) List(c *gin.Context) {
	page := parsePositiveQuery(c, "page", defaultAdminVoucherPage)
	limit := parsePositiveQuery(c, "limit", defaultAdminVoucherLimit)

	res, err := h.uc.ListAdmin(c.Request.Context(), voucheruc.ListInput{
		Query:  c.Query("q"),
		Status: c.Query("status"),
		Page:   page,
		Limit:  limit,
	})
	if err != nil {
		writeError(c, err)
		return
	}

	total := int(res.Total)
	totalPages := 0
	if total > 0 {
		totalPages = (total + limit - 1) / limit
	}
	writePaginatedSuccess(c, http.StatusOK, "Lấy danh sách mã giảm giá thành công", res.Items, PaginationMeta{
		Page:       page,
		Limit:      limit,
		Total:      total,
		TotalPages: totalPages,
		HasNext:    page < totalPages,
		HasPrev:    page > 1,
	})
}

func (h *adminVoucherHandler) GetByID(c *gin.Context) {
	v, err := h.uc.GetAdminByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "Lấy chi tiết mã giảm giá thành công", v)
}

func (h *adminVoucherHandler) Create(c *gin.Context) {
	var req saveVoucherRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, domain.NewValidationError(map[string]string{"body": "Dữ liệu không hợp lệ"}))
		return
	}
	in, err := req.toDomain()
	if err != nil {
		writeError(c, err)
		return
	}
	v, err := h.uc.Create(c.Request.Context(), in)
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusCreated, "Tạo mã giảm giá thành công", v)
}

func (h *adminVoucherHandler) Update(c *gin.Context) {
	var req saveVoucherRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, domain.NewValidationError(map[string]string{"body": "Dữ liệu không hợp lệ"}))
		return
	}
	in, err := req.toDomain()
	if err != nil {
		writeError(c, err)
		return
	}
	v, err := h.uc.Update(c.Request.Context(), c.Param("id"), in)
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "Cập nhật mã giảm giá thành công", v)
}

func (h *adminVoucherHandler) Delete(c *gin.Context) {
	if err := h.uc.Delete(c.Request.Context(), c.Param("id")); err != nil {
		writeError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
