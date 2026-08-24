package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"commerce-backend/internal/domain"
)

func TestOrderHTTP_DeliveredAtPresentInGetByID(t *testing.T) {
	deliveredAt := time.Date(2026, 8, 15, 9, 0, 0, 0, time.UTC)
	order := sampleAdminOrder("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1", domain.OrderStatusDelivered, "buyer@example.com")
	order.UserID = orderTestUser
	order.DeliveredAt = &deliveredAt

	repo := &fakeOrderUsecaseRepo{getByIDOrder: &order}
	router, token := newOrderTestRouter(repo)

	w := execOrderRequest(router, token, http.MethodGet, "/api/v1/orders/"+order.ID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	var env struct {
		Data struct {
			DeliveredAt *time.Time `json:"deliveredAt"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if env.Data.DeliveredAt == nil {
		t.Fatalf("expected deliveredAt present in customer order response")
	}
	if !env.Data.DeliveredAt.Equal(deliveredAt) {
		t.Errorf("expected deliveredAt %v, got %v", deliveredAt, *env.Data.DeliveredAt)
	}
}

func TestOrderHTTP_DeliveredAtOmittedWhenNotDelivered(t *testing.T) {
	order := sampleAdminOrder("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2", domain.OrderStatusConfirmed, "buyer@example.com")
	order.UserID = orderTestUser

	repo := &fakeOrderUsecaseRepo{getByIDOrder: &order}
	router, token := newOrderTestRouter(repo)

	w := execOrderRequest(router, token, http.MethodGet, "/api/v1/orders/"+order.ID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	if len(w.Body.String()) == 0 {
		t.Fatal("empty body")
	}
	var raw map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &raw); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	data, ok := raw["data"].(map[string]any)
	if !ok {
		t.Fatalf("expected data object, got %v", raw["data"])
	}
	if _, present := data["deliveredAt"]; present {
		t.Errorf("expected deliveredAt omitted for non-delivered order")
	}
}

func TestAdminOrder_DeliverReturnsDeliveredAt(t *testing.T) {
	validOrderID := "22222222-2222-2222-2222-222222222222"
	resOrder := sampleAdminOrder(validOrderID, domain.OrderStatusDelivered, "buyer@example.com")
	deliveredAt := time.Date(2026, 8, 20, 10, 0, 0, 0, time.UTC)
	resOrder.DeliveredAt = &deliveredAt

	repo := &fakeAdminOrderRepo{transitionOrder: &resOrder}
	router, manager, _ := setupAdminOrderTestRouter(repo)
	token := adminBearerToken(t, manager)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/orders/"+validOrderID+"/deliver", nil)
	req.Header.Set("Authorization", token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	var env struct {
		Data struct {
			Status      string     `json:"status"`
			DeliveredAt *time.Time `json:"deliveredAt"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if repo.lastTransAction != domain.OrderAdminActionDeliver {
		t.Errorf("expected deliver action forwarded to repository, got %s", repo.lastTransAction)
	}
	if env.Data.Status != string(domain.OrderStatusDelivered) {
		t.Errorf("expected status delivered, got %s", env.Data.Status)
	}
	if env.Data.DeliveredAt == nil || !env.Data.DeliveredAt.Equal(deliveredAt) {
		t.Errorf("expected deliveredAt %v in admin deliver response, got %v", deliveredAt, env.Data.DeliveredAt)
	}
}
