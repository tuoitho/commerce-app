package http

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	flashsaleuc "commerce-backend/internal/usecase/flashsale"
)

const (
	defaultAdminFlashSalePage  = 1
	defaultAdminFlashSaleLimit = 20
)

type adminFlashSaleHandler struct {
	uc *flashsaleuc.UseCase
}

func newAdminFlashSaleHandler(uc *flashsaleuc.UseCase) *adminFlashSaleHandler {
	return &adminFlashSaleHandler{uc: uc}
}

type saveFlashSaleItemRequest struct {
	VariantID     string `json:"variantId"`
	FlashPriceVND string `json:"flashPriceVnd"`
	Quota         int    `json:"quota"`
}

type saveFlashSaleRequest struct {
	Name     string                     `json:"name"`
	StartsAt string                     `json:"startsAt"`
	EndsAt   string                     `json:"endsAt"`
	Active   bool                       `json:"active"`
	Items    []saveFlashSaleItemRequest `json:"items"`
}

func (r saveFlashSaleRequest) toDomain() (domain.SaveFlashSaleInput, error) {
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
		return domain.SaveFlashSaleInput{}, domain.NewValidationError(fields)
	}

	items := make([]domain.FlashSaleItemInput, len(r.Items))
	for i, it := range r.Items {
		items[i] = domain.FlashSaleItemInput{
			VariantID:     it.VariantID,
			FlashPriceVND: domain.MoneyVND(it.FlashPriceVND),
			Quota:         it.Quota,
		}
	}
	return domain.SaveFlashSaleInput{
		Name:     r.Name,
		StartsAt: startsAt,
		EndsAt:   endsAt,
		Active:   r.Active,
		Items:    items,
	}, nil
}

func (h *adminFlashSaleHandler) List(c *gin.Context) {
	page := parsePositiveQuery(c, "page", defaultAdminFlashSalePage)
	limit := parsePositiveQuery(c, "limit", defaultAdminFlashSaleLimit)

	res, err := h.uc.ListAdmin(c.Request.Context(), flashsaleuc.ListInput{
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
	writePaginatedSuccess(c, http.StatusOK, "Lấy danh sách chiến dịch Flash Sale thành công", res.Items, PaginationMeta{
		Page:       page,
		Limit:      limit,
		Total:      total,
		TotalPages: totalPages,
		HasNext:    page < totalPages,
		HasPrev:    page > 1,
	})
}

func (h *adminFlashSaleHandler) GetByID(c *gin.Context) {
	detail, err := h.uc.GetAdminByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "Lấy chi tiết chiến dịch Flash Sale thành công", detail)
}

func (h *adminFlashSaleHandler) Create(c *gin.Context) {
	var req saveFlashSaleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, domain.NewValidationError(map[string]string{"body": "Dữ liệu không hợp lệ"}))
		return
	}
	in, err := req.toDomain()
	if err != nil {
		writeError(c, err)
		return
	}
	detail, err := h.uc.Create(c.Request.Context(), callerUserID(c), in)
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusCreated, "Tạo chiến dịch Flash Sale thành công", detail)
}

func (h *adminFlashSaleHandler) Update(c *gin.Context) {
	var req saveFlashSaleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, domain.NewValidationError(map[string]string{"body": "Dữ liệu không hợp lệ"}))
		return
	}
	in, err := req.toDomain()
	if err != nil {
		writeError(c, err)
		return
	}
	detail, err := h.uc.Update(c.Request.Context(), c.Param("id"), in)
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "Cập nhật chiến dịch Flash Sale thành công", detail)
}

func (h *adminFlashSaleHandler) Delete(c *gin.Context) {
	if err := h.uc.Delete(c.Request.Context(), c.Param("id")); err != nil {
		writeError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
