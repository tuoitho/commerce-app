package http

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	areauc "commerce-backend/internal/usecase/area"
)

type areaHandler struct {
	uc *areauc.UseCase
}

func newAreaHandler(uc *areauc.UseCase) *areaHandler {
	return &areaHandler{uc: uc}
}

type provinceResponse struct {
	Code int    `json:"code"`
	Name string `json:"name"`
}

type wardResponse struct {
	Code         int    `json:"code"`
	ProvinceCode int    `json:"provinceCode"`
	Name         string `json:"name"`
}

func (h *areaHandler) ListProvinces(c *gin.Context) {
	if h.uc == nil {
		writeSuccess(c, http.StatusOK, "Danh sách tỉnh/thành phố", []provinceResponse{})
		return
	}

	provinces, err := h.uc.ListProvinces(c.Request.Context())
	if err != nil {
		writeError(c, err)
		return
	}

	resp := make([]provinceResponse, len(provinces))
	for i, p := range provinces {
		resp[i] = provinceResponse{
			Code: p.Code,
			Name: p.Name,
		}
	}

	writeSuccess(c, http.StatusOK, "Danh sách tỉnh/thành phố", resp)
}

func (h *areaHandler) ListWards(c *gin.Context) {
	codeStr := c.Param("code")
	code, err := strconv.Atoi(codeStr)
	if err != nil {
		writeError(c, domain.ErrNotFound)
		return
	}

	if h.uc == nil {
		writeError(c, domain.ErrNotFound)
		return
	}

	wards, err := h.uc.ListWards(c.Request.Context(), code)
	if err != nil {
		writeError(c, err)
		return
	}

	resp := make([]wardResponse, len(wards))
	for i, w := range wards {
		resp[i] = wardResponse{
			Code:         w.Code,
			ProvinceCode: w.ProvinceCode,
			Name:         w.Name,
		}
	}

	writeSuccess(c, http.StatusOK, "Danh sách phường/xã", resp)
}
