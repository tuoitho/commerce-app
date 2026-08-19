package http

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	addressuc "commerce-backend/internal/usecase/address"
)

type addressHandler struct {
	uc *addressuc.UseCase
}

func newAddressHandler(uc *addressuc.UseCase) *addressHandler {
	return &addressHandler{uc: uc}
}

type addressResponse struct {
	ID            string    `json:"id"`
	UserID        string    `json:"userId"`
	RecipientName string    `json:"recipientName"`
	Phone         string    `json:"phone"`
	ProvinceCode  int       `json:"provinceCode"`
	ProvinceName  string    `json:"provinceName"`
	WardCode      int       `json:"wardCode"`
	WardName      string    `json:"wardName"`
	DetailAddress string    `json:"detailAddress"`
	IsDefault     bool      `json:"isDefault"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

func toAddressResponse(addr domain.Address) addressResponse {
	return addressResponse{
		ID:            addr.ID,
		UserID:        addr.UserID,
		RecipientName: addr.RecipientName,
		Phone:         addr.Phone,
		ProvinceCode:  addr.ProvinceCode,
		ProvinceName:  addr.ProvinceName,
		WardCode:      addr.WardCode,
		WardName:      addr.WardName,
		DetailAddress: addr.DetailAddress,
		IsDefault:     addr.IsDefault,
		CreatedAt:     addr.CreatedAt,
		UpdatedAt:     addr.UpdatedAt,
	}
}

func toAddressResponses(addrs []domain.Address) []addressResponse {
	resp := make([]addressResponse, len(addrs))
	for i, a := range addrs {
		resp[i] = toAddressResponse(a)
	}
	return resp
}

type addressRequest struct {
	RecipientName string `json:"recipientName"`
	Phone         string `json:"phone"`
	ProvinceCode  int    `json:"provinceCode"`
	WardCode      int    `json:"wardCode"`
	DetailAddress string `json:"detailAddress"`
	IsDefault     bool   `json:"isDefault"`
}

func (req addressRequest) toDomain() domain.AddressInput {
	return domain.AddressInput{
		RecipientName: req.RecipientName,
		Phone:         req.Phone,
		ProvinceCode:  req.ProvinceCode,
		WardCode:      req.WardCode,
		DetailAddress: req.DetailAddress,
		IsDefault:     req.IsDefault,
	}
}

func (h *addressHandler) List(c *gin.Context) {
	userID := callerUserID(c)
	if h.uc == nil {
		writeSuccess(c, http.StatusOK, "Danh sách địa chỉ", []addressResponse{})
		return
	}

	addrs, err := h.uc.List(c.Request.Context(), userID)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Danh sách địa chỉ", toAddressResponses(addrs))
}

func (h *addressHandler) Create(c *gin.Context) {
	var req addressRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, domain.NewValidationError(map[string]string{"body": "Dữ liệu không hợp lệ"}))
		return
	}

	userID := callerUserID(c)
	if h.uc == nil {
		writeError(c, domain.ErrNotFound)
		return
	}

	addr, err := h.uc.Create(c.Request.Context(), userID, req.toDomain())
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusCreated, "Thêm địa chỉ thành công", toAddressResponse(*addr))
}

func (h *addressHandler) Update(c *gin.Context) {
	id := c.Param("id")
	var req addressRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, domain.NewValidationError(map[string]string{"body": "Dữ liệu không hợp lệ"}))
		return
	}

	userID := callerUserID(c)
	if h.uc == nil {
		writeError(c, domain.ErrNotFound)
		return
	}

	addr, err := h.uc.Update(c.Request.Context(), userID, id, req.toDomain())
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Cập nhật địa chỉ thành công", toAddressResponse(*addr))
}

func (h *addressHandler) SetDefault(c *gin.Context) {
	id := c.Param("id")
	userID := callerUserID(c)
	if h.uc == nil {
		writeError(c, domain.ErrNotFound)
		return
	}

	addr, err := h.uc.SetDefault(c.Request.Context(), userID, id)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Đặt địa chỉ mặc định thành công", toAddressResponse(*addr))
}

func (h *addressHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	userID := callerUserID(c)
	if h.uc == nil {
		writeError(c, domain.ErrNotFound)
		return
	}

	err := h.uc.Delete(c.Request.Context(), userID, id)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Xóa địa chỉ thành công", nil)
}
