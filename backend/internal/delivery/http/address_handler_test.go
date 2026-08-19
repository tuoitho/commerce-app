package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security/jwt"
	addressuc "commerce-backend/internal/usecase/address"
)

const addressTestUser = "11111111-1111-1111-1111-111111111111"
const otherAddressUser = "22222222-2222-2222-2222-222222222222"

type fakeAddressUsecaseRepo struct {
	addresses map[string][]domain.Address
}

func newFakeAddressUsecaseRepo() *fakeAddressUsecaseRepo {
	return &fakeAddressUsecaseRepo{
		addresses: make(map[string][]domain.Address),
	}
}

func (f *fakeAddressUsecaseRepo) ListByUser(_ context.Context, userID string) ([]domain.Address, error) {
	list, ok := f.addresses[userID]
	if !ok {
		return []domain.Address{}, nil
	}
	result := make([]domain.Address, len(list))
	copy(result, list)
	return result, nil
}

func (f *fakeAddressUsecaseRepo) GetByID(_ context.Context, userID, id string) (*domain.Address, error) {
	list := f.addresses[userID]
	for _, a := range list {
		if a.ID == id {
			cp := a
			return &cp, nil
		}
	}
	return nil, domain.ErrAddressNotFound
}

func (f *fakeAddressUsecaseRepo) Create(_ context.Context, userID string, input domain.AddressInput) (*domain.Address, error) {
	list := f.addresses[userID]
	isDefault := input.IsDefault
	if len(list) == 0 {
		isDefault = true
	} else if isDefault {
		for i := range list {
			list[i].IsDefault = false
		}
	}

	newAddr := domain.Address{
		ID:            "addr-12345",
		UserID:        userID,
		RecipientName: input.RecipientName,
		Phone:         input.Phone,
		ProvinceCode:  input.ProvinceCode,
		ProvinceName:  "Thành phố Hà Nội",
		WardCode:      input.WardCode,
		WardName:      "Phường Ba Đình",
		DetailAddress: input.DetailAddress,
		IsDefault:     isDefault,
		CreatedAt:     time.Now().UTC(),
		UpdatedAt:     time.Now().UTC(),
	}
	list = append(list, newAddr)
	f.addresses[userID] = list
	cp := newAddr
	return &cp, nil
}

func (f *fakeAddressUsecaseRepo) Update(_ context.Context, userID, id string, input domain.AddressInput) (*domain.Address, error) {
	list := f.addresses[userID]
	idx := -1
	for i, a := range list {
		if a.ID == id {
			idx = i
			break
		}
	}
	if idx == -1 {
		return nil, domain.ErrAddressNotFound
	}

	if input.IsDefault {
		for i := range list {
			list[i].IsDefault = false
		}
	}

	list[idx].RecipientName = input.RecipientName
	list[idx].Phone = input.Phone
	list[idx].ProvinceCode = input.ProvinceCode
	list[idx].ProvinceName = "Thành phố Hà Nội"
	list[idx].WardCode = input.WardCode
	list[idx].WardName = "Phường Ba Đình"
	list[idx].DetailAddress = input.DetailAddress
	list[idx].IsDefault = input.IsDefault
	list[idx].UpdatedAt = time.Now().UTC()

	f.addresses[userID] = list
	cp := list[idx]
	return &cp, nil
}

func (f *fakeAddressUsecaseRepo) Delete(_ context.Context, userID, id string) error {
	list := f.addresses[userID]
	idx := -1
	for i, a := range list {
		if a.ID == id {
			idx = i
			break
		}
	}
	if idx == -1 {
		return domain.ErrAddressNotFound
	}

	f.addresses[userID] = append(list[:idx], list[idx+1:]...)
	return nil
}

func (f *fakeAddressUsecaseRepo) SetDefault(_ context.Context, userID, id string) (*domain.Address, error) {
	list := f.addresses[userID]
	idx := -1
	for i, a := range list {
		if a.ID == id {
			idx = i
			break
		}
	}
	if idx == -1 {
		return nil, domain.ErrAddressNotFound
	}

	for i := range list {
		list[i].IsDefault = (i == idx)
	}
	list[idx].UpdatedAt = time.Now().UTC()

	f.addresses[userID] = list
	cp := list[idx]
	return &cp, nil
}

func newAddressTestRouter(addrRepo *fakeAddressUsecaseRepo) (*gin.Engine, string) {
	gin.SetMode(gin.TestMode)
	manager := jwt.NewManager(testSecret, "commerce-backend")
	token, _ := manager.GenerateAccessToken(addressTestUser, domain.RoleCustomer, 15*time.Minute)

	areaRepo := &fakeAreaUseCaseRepo{
		provinces: []domain.Province{
			{Code: 1, Name: "Thành phố Hà Nội"},
			{Code: 79, Name: "Thành phố Hồ Chí Minh"},
		},
		wards: map[int][]domain.Ward{
			1: {
				{Code: 4, ProvinceCode: 1, Name: "Phường Ba Đình"},
			},
			79: {
				{Code: 760, ProvinceCode: 79, Name: "Phường Bến Nghé"},
			},
		},
	}

	uc := addressuc.New(addressuc.Dependencies{
		Address: addrRepo,
		Area:    areaRepo,
	})

	router := gin.New()
	NewRouter(router, Dependencies{
		Address: uc,
		JWT:     manager,
	})
	return router, token
}

func execAddressRequest(router *gin.Engine, token, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func TestAddressHTTP_AuthRequired(t *testing.T) {
	repo := newFakeAddressUsecaseRepo()
	router, _ := newAddressTestRouter(repo)

	routes := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/v1/addresses"},
		{http.MethodPost, "/api/v1/addresses"},
		{http.MethodPut, "/api/v1/addresses/addr-1"},
		{http.MethodPatch, "/api/v1/addresses/addr-1/default"},
		{http.MethodDelete, "/api/v1/addresses/addr-1"},
	}

	for _, rt := range routes {
		w := execAddressRequest(router, "", rt.method, rt.path, "{}")
		if w.Code != http.StatusUnauthorized {
			t.Errorf("%s %s without token: expected 401, got %d", rt.method, rt.path, w.Code)
		}
	}
}

func TestAddressHTTP_CRUD_Flow(t *testing.T) {
	repo := newFakeAddressUsecaseRepo()
	router, token := newAddressTestRouter(repo)

	// 1. List addresses when empty
	w := execAddressRequest(router, token, http.MethodGet, "/api/v1/addresses", "")
	if w.Code != http.StatusOK {
		t.Fatalf("GET /addresses: expected 200, got %d, body: %s", w.Code, w.Body.String())
	}
	var listResp struct {
		Success bool              `json:"success"`
		Data    []addressResponse `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &listResp); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}
	if len(listResp.Data) != 0 {
		t.Fatalf("expected 0 addresses, got %d", len(listResp.Data))
	}

	// 2. Create address with invalid body -> 400 validation_error
	w = execAddressRequest(router, token, http.MethodPost, "/api/v1/addresses", `{"recipientName":"","phone":"invalid"}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("POST /addresses invalid: expected 400, got %d, body: %s", w.Code, w.Body.String())
	}
	var errResp ResponseEnvelope
	if err := json.Unmarshal(w.Body.Bytes(), &errResp); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}
	if errResp.Error == nil || errResp.Error.Code != "validation_error" {
		t.Errorf("expected error code validation_error, got %+v", errResp.Error)
	}
	if _, ok := errResp.Error.Fields["recipient_name"]; !ok {
		t.Errorf("expected recipient_name in error fields, got %+v", errResp.Error.Fields)
	}
	if _, ok := errResp.Error.Fields["phone"]; !ok {
		t.Errorf("expected phone in error fields, got %+v", errResp.Error.Fields)
	}

	// 3. Create first address with valid data -> 201 Created, auto-default is true
	createBody := `{
		"recipientName": "Nguyen Van A",
		"phone": "0987654321",
		"provinceCode": 1,
		"wardCode": 4,
		"detailAddress": "Số 1 Tràng Tiền",
		"isDefault": false
	}`
	w = execAddressRequest(router, token, http.MethodPost, "/api/v1/addresses", createBody)
	if w.Code != http.StatusCreated {
		t.Fatalf("POST /addresses valid: expected 201, got %d, body: %s", w.Code, w.Body.String())
	}
	var createResp struct {
		Success bool            `json:"success"`
		Message string          `json:"message"`
		Data    addressResponse `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &createResp); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}
	if !createResp.Success {
		t.Errorf("expected success to be true")
	}
	if createResp.Data.RecipientName != "Nguyen Van A" || createResp.Data.Phone != "0987654321" {
		t.Errorf("unexpected created address: %+v", createResp.Data)
	}
	if !createResp.Data.IsDefault {
		t.Errorf("expected first created address to be auto-default")
	}
	addrID := createResp.Data.ID

	// 4. Update address -> 200 OK
	updateBody := `{
		"recipientName": "Nguyen Van A Updated",
		"phone": "0912345678",
		"provinceCode": 1,
		"wardCode": 4,
		"detailAddress": "Số 2 Tràng Tiền",
		"isDefault": true
	}`
	w = execAddressRequest(router, token, http.MethodPut, "/api/v1/addresses/"+addrID, updateBody)
	if w.Code != http.StatusOK {
		t.Fatalf("PUT /addresses/:id: expected 200, got %d, body: %s", w.Code, w.Body.String())
	}
	var updateResp struct {
		Success bool            `json:"success"`
		Data    addressResponse `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &updateResp); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}
	if updateResp.Data.RecipientName != "Nguyen Van A Updated" || updateResp.Data.DetailAddress != "Số 2 Tràng Tiền" {
		t.Errorf("unexpected updated data: %+v", updateResp.Data)
	}

	// 5. Update non-existent address -> 404 address_not_found
	w = execAddressRequest(router, token, http.MethodPut, "/api/v1/addresses/non-existent", updateBody)
	if w.Code != http.StatusNotFound {
		t.Fatalf("PUT /addresses/non-existent: expected 404, got %d, body: %s", w.Code, w.Body.String())
	}

	// 6. Set Default -> 200 OK
	w = execAddressRequest(router, token, http.MethodPatch, "/api/v1/addresses/"+addrID+"/default", "")
	if w.Code != http.StatusOK {
		t.Fatalf("PATCH /addresses/:id/default: expected 200, got %d, body: %s", w.Code, w.Body.String())
	}

	// 7. Set Default on non-existent address -> 404 address_not_found
	w = execAddressRequest(router, token, http.MethodPatch, "/api/v1/addresses/non-existent/default", "")
	if w.Code != http.StatusNotFound {
		t.Fatalf("PATCH /addresses/non-existent/default: expected 404, got %d, body: %s", w.Code, w.Body.String())
	}

	// 8. Delete address -> 200 OK with data: null
	w = execAddressRequest(router, token, http.MethodDelete, "/api/v1/addresses/"+addrID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("DELETE /addresses/:id: expected 200, got %d, body: %s", w.Code, w.Body.String())
	}
	var delResp ResponseEnvelope
	if err := json.Unmarshal(w.Body.Bytes(), &delResp); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}
	if !delResp.Success || delResp.Data != nil {
		t.Errorf("expected success true and data null, got %+v", delResp)
	}

	// 9. Delete non-existent address -> 404 address_not_found
	w = execAddressRequest(router, token, http.MethodDelete, "/api/v1/addresses/non-existent", "")
	if w.Code != http.StatusNotFound {
		t.Fatalf("DELETE /addresses/non-existent: expected 404, got %d, body: %s", w.Code, w.Body.String())
	}
}
