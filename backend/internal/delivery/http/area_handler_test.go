package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	areauc "commerce-backend/internal/usecase/area"
)

type fakeAreaUseCaseRepo struct {
	provinces []domain.Province
	wards     map[int][]domain.Ward
}

func (f *fakeAreaUseCaseRepo) ListProvinces(_ context.Context) ([]domain.Province, error) {
	return f.provinces, nil
}

func (f *fakeAreaUseCaseRepo) ListWards(_ context.Context, provinceCode int) ([]domain.Ward, error) {
	w, ok := f.wards[provinceCode]
	if !ok {
		return nil, domain.ErrNotFound
	}
	return w, nil
}

func (f *fakeAreaUseCaseRepo) Resolve(_ context.Context, provinceCode, wardCode int) (domain.Province, domain.Ward, error) {
	var targetP *domain.Province
	for _, p := range f.provinces {
		if p.Code == provinceCode {
			targetP = &p
			break
		}
	}
	if targetP == nil {
		return domain.Province{}, domain.Ward{}, domain.ErrNotFound
	}

	wards, ok := f.wards[provinceCode]
	if !ok {
		return domain.Province{}, domain.Ward{}, domain.ErrNotFound
	}

	for _, w := range wards {
		if w.Code == wardCode {
			return *targetP, w, nil
		}
	}

	return domain.Province{}, domain.Ward{}, domain.ErrNotFound
}

func newAreaTestRouter(repo *fakeAreaUseCaseRepo) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	uc := areauc.New(areauc.Dependencies{Area: repo})
	NewRouter(r, Dependencies{
		Area: uc,
	})
	return r
}

func TestAreaHandler_ListProvinces(t *testing.T) {
	repo := &fakeAreaUseCaseRepo{
		provinces: []domain.Province{
			{Code: 1, Name: "Thành phố Hà Nội"},
			{Code: 79, Name: "Thành phố Hồ Chí Minh"},
		},
	}
	router := newAreaTestRouter(repo)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/provinces", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d, body: %s", w.Code, w.Body.String())
	}

	var resp struct {
		Success bool `json:"success"`
		Data    []struct {
			Code int    `json:"code"`
			Name string `json:"name"`
		} `json:"data"`
	}

	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if !resp.Success {
		t.Errorf("expected success to be true")
	}
	if len(resp.Data) != 2 {
		t.Fatalf("expected 2 provinces, got %d", len(resp.Data))
	}
	if resp.Data[0].Code != 1 || resp.Data[0].Name != "Thành phố Hà Nội" {
		t.Errorf("unexpected province data: %+v", resp.Data[0])
	}
}

func TestAreaHandler_ListWards_Success(t *testing.T) {
	repo := &fakeAreaUseCaseRepo{
		provinces: []domain.Province{
			{Code: 1, Name: "Thành phố Hà Nội"},
		},
		wards: map[int][]domain.Ward{
			1: {
				{Code: 4, ProvinceCode: 1, Name: "Phường Ba Đình"},
			},
		},
	}
	router := newAreaTestRouter(repo)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/provinces/1/wards", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d, body: %s", w.Code, w.Body.String())
	}

	var resp struct {
		Success bool `json:"success"`
		Data    []struct {
			Code         int    `json:"code"`
			ProvinceCode int    `json:"provinceCode"`
			Name         string `json:"name"`
		} `json:"data"`
	}

	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if !resp.Success {
		t.Errorf("expected success to be true")
	}
	if len(resp.Data) != 1 {
		t.Fatalf("expected 1 ward, got %d", len(resp.Data))
	}
	if resp.Data[0].Code != 4 || resp.Data[0].ProvinceCode != 1 || resp.Data[0].Name != "Phường Ba Đình" {
		t.Errorf("unexpected ward data: %+v", resp.Data[0])
	}
}

func TestAreaHandler_ListWards_NotFound(t *testing.T) {
	repo := &fakeAreaUseCaseRepo{
		provinces: []domain.Province{
			{Code: 1, Name: "Thành phố Hà Nội"},
		},
		wards: map[int][]domain.Ward{},
	}
	router := newAreaTestRouter(repo)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/provinces/999999/wards", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d, body: %s", w.Code, w.Body.String())
	}

	var resp ResponseEnvelope
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp.Success {
		t.Errorf("expected success to be false")
	}
	if resp.Error == nil || resp.Error.Code != "not_found" {
		t.Errorf("expected error code not_found, got %+v", resp.Error)
	}
	if resp.Message == "" {
		t.Errorf("expected non-empty error message")
	}
}

func TestAreaHandler_ListWards_InvalidCode(t *testing.T) {
	repo := &fakeAreaUseCaseRepo{}
	router := newAreaTestRouter(repo)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/provinces/abc/wards", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d, body: %s", w.Code, w.Body.String())
	}

	var resp ResponseEnvelope
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp.Success {
		t.Errorf("expected success to be false")
	}
	if resp.Error == nil || resp.Error.Code != "not_found" {
		t.Errorf("expected error code not_found, got %+v", resp.Error)
	}
}
