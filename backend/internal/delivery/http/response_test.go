package http

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
)

func TestResponseEnvelope_SuccessFormat(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	data := map[string]string{"foo": "bar"}
	writeSuccess(c, http.StatusOK, "Thao tác thành công", data)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var envelope struct {
		Success bool              `json:"success"`
		Message string            `json:"message"`
		Data    map[string]string `json:"data"`
		Error   *errorBodyDetail  `json:"error"`
		Meta    ResponseMeta      `json:"meta"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &envelope); err != nil {
		t.Fatalf("failed to unmarshal JSON: %v", err)
	}

	if !envelope.Success {
		t.Errorf("expected success: true, got %v", envelope.Success)
	}
	if envelope.Message != "Thao tác thành công" {
		t.Errorf("expected message 'Thao tác thành công', got %q", envelope.Message)
	}
	if envelope.Data["foo"] != "bar" {
		t.Errorf("expected data['foo'] = 'bar', got %q", envelope.Data["foo"])
	}
	if envelope.Error != nil {
		t.Errorf("expected error: nil, got %+v", envelope.Error)
	}
	if envelope.Meta.Timestamp.IsZero() {
		t.Error("expected non-zero timestamp in meta")
	}
	if envelope.Meta.Pagination != nil {
		t.Errorf("expected nil pagination, got %+v", envelope.Meta.Pagination)
	}
}

func TestResponseEnvelope_PaginatedSuccessFormat(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	data := []string{"item1", "item2"}
	pagination := PaginationMeta{
		Page:       1,
		Limit:      10,
		Total:      2,
		TotalPages: 1,
		HasNext:    false,
		HasPrev:    false,
	}
	writePaginatedSuccess(c, http.StatusOK, "", data, pagination)

	var envelope struct {
		Success bool             `json:"success"`
		Message string           `json:"message"`
		Data    []string         `json:"data"`
		Error   *errorBodyDetail `json:"error"`
		Meta    ResponseMeta     `json:"meta"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &envelope); err != nil {
		t.Fatalf("failed to unmarshal JSON: %v", err)
	}

	if !envelope.Success {
		t.Errorf("expected success: true, got %v", envelope.Success)
	}
	if envelope.Meta.Pagination == nil {
		t.Fatal("expected pagination meta, got nil")
	}
	if envelope.Meta.Pagination.Total != 2 || envelope.Meta.Pagination.Limit != 10 {
		t.Errorf("unexpected pagination meta: %+v", envelope.Meta.Pagination)
	}
}

func TestResponseEnvelope_ValidationError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	valErr := domain.NewValidationError(map[string]string{"email": "invalid email"})
	writeError(c, valErr)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", w.Code)
	}

	var envelope struct {
		Success bool             `json:"success"`
		Message string           `json:"message"`
		Data    any              `json:"data"`
		Error   *errorBodyDetail `json:"error"`
		Meta    ResponseMeta     `json:"meta"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &envelope); err != nil {
		t.Fatalf("failed to unmarshal JSON: %v", err)
	}

	if envelope.Success {
		t.Error("expected success: false")
	}
	if envelope.Data != nil {
		t.Errorf("expected data: nil, got %v", envelope.Data)
	}
	if envelope.Error == nil {
		t.Fatal("expected error detail, got nil")
	}
	if envelope.Error.Code != "validation_error" {
		t.Errorf("expected code validation_error, got %q", envelope.Error.Code)
	}
	if envelope.Error.Fields["email"] != "invalid email" {
		t.Errorf("expected email field error, got %+v", envelope.Error.Fields)
	}
}

func TestResponseEnvelope_BusinessError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	writeError(c, domain.ErrOutOfStock)

	if w.Code != http.StatusConflict {
		t.Fatalf("expected status 409, got %d", w.Code)
	}

	var envelope struct {
		Success bool             `json:"success"`
		Message string           `json:"message"`
		Data    any              `json:"data"`
		Error   *errorBodyDetail `json:"error"`
		Meta    ResponseMeta     `json:"meta"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &envelope); err != nil {
		t.Fatalf("failed to unmarshal JSON: %v", err)
	}

	if envelope.Success {
		t.Error("expected success: false")
	}
	if envelope.Error == nil || envelope.Error.Code != "out_of_stock" {
		t.Fatalf("expected out_of_stock code, got %+v", envelope.Error)
	}
	if len(envelope.Error.Fields) > 0 {
		t.Errorf("expected no fields in business error, got %+v", envelope.Error.Fields)
	}
}

func TestResponseEnvelope_SystemError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	writeError(c, errors.New("unexpected database disconnect"))

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected status 500, got %d", w.Code)
	}

	var envelope struct {
		Success bool             `json:"success"`
		Message string           `json:"message"`
		Data    any              `json:"data"`
		Error   *errorBodyDetail `json:"error"`
		Meta    ResponseMeta     `json:"meta"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &envelope); err != nil {
		t.Fatalf("failed to unmarshal JSON: %v", err)
	}

	if envelope.Success {
		t.Error("expected success: false")
	}
	if envelope.Error == nil || envelope.Error.Code != "internal" {
		t.Fatalf("expected internal code, got %+v", envelope.Error)
	}
}
