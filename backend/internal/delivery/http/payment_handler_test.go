package http

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/config"
	"commerce-backend/internal/domain"
	"commerce-backend/internal/payment/momo"
	"commerce-backend/internal/security/jwt"
	orderuc "commerce-backend/internal/usecase/order"
)

func TestPaymentHandler_FlexDecodersAndMalformedJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)

	const (
		validOrderID = "44444444-4444-4444-4444-444444444444"
		accessKey    = "F8BBA842ECF85"
		secretKey    = "K951B6PE1waDMi640xX08PD3vg6EkVlz"
		partnerCode  = "MOMO"
	)

	momoOrderID := validOrderID + "_1763281800000"
	cfg := &config.Config{
		MomoPartnerCode: partnerCode,
		MomoAccessKey:   accessKey,
		MomoSecretKey:   secretKey,
		MomoEndpoint:    "https://test-payment.momo.vn/v2/gateway/api/create",
		MomoRedirectURL: "http://localhost:15173/momo-return",
		MomoIPNURL:      "http://localhost:18080/api/v1/payments/momo/ipn",
		MomoRequestType: "payWithMethod",
		MomoPartnerName: "Test",
		MomoStoreID:     "MomoTestStore",
	}
	client := momo.NewClient(cfg, nil)
	manager := jwt.NewManager(testSecret, "commerce-backend")
	token, _ := manager.GenerateAccessToken(orderTestUser, domain.RoleCustomer, 15*time.Minute)

	paidOrder := domain.Order{
		ID:            validOrderID,
		UserID:        orderTestUser,
		Status:        domain.OrderStatusConfirmed,
		PaymentMethod: domain.PaymentMethodMomo,
		PaymentStatus: domain.PaymentStatusPaid,
	}
	repo := &fakeHTTPMomoOrderRepo{
		fakeOrderUsecaseRepo: &fakeOrderUsecaseRepo{},
		callbackRes:          &paidOrder,
		callbackJustPaid:     true,
	}
	uc := orderuc.New(orderuc.Dependencies{
		Order:       repo,
		Return:      &fakeReturnUsecaseRepo{},
		Review:      &fakeReviewRepoForHandler{},
		MomoGateway: client,
	})
	r := gin.New()
	NewRouter(r, Dependencies{
		Order: uc,
		JWT:   manager,
	})

	t.Run("malformed JSON returns 400 invalid_momo_callback", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/payments/momo/return", bytes.NewBufferString("{bad json"))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
		}
		var env ResponseEnvelope
		_ = json.Unmarshal(w.Body.Bytes(), &env)
		if env.Error == nil || env.Error.Code != "invalid_momo_callback" {
			t.Fatalf("expected invalid_momo_callback error, got %+v", env.Error)
		}
	})

	t.Run("null or float callback tokens return 400 invalid_momo_callback on IPN", func(t *testing.T) {
		for _, body := range []string{
			`{"amount": 31900.5, "resultCode": 0}`,
			`{"amount": null, "resultCode": 0}`,
			`{"amount": 31900, "resultCode": 0.5}`,
		} {
			req := httptest.NewRequest(http.MethodPost, "/api/v1/payments/momo/ipn", bytes.NewBufferString(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			if w.Code != http.StatusBadRequest {
				t.Fatalf("body=%s: expected 400, got %d: %s", body, w.Code, w.Body.String())
			}
		}
	})

	t.Run("quoted string resultCode works for return callback", func(t *testing.T) {
		raw := fmt.Sprintf(
			"accessKey=%s&amount=%s&extraData=%s&message=%s&orderId=%s&orderInfo=%s&orderType=%s&partnerCode=%s&payType=%s&requestId=%s&responseTime=%s&resultCode=%d&transId=%s",
			accessKey, "3190000", "", "Successful.", momoOrderID, "Order", "momo_wallet", partnerCode, "qr", momoOrderID, "1763281800000", 0, "4088812345",
		)
		mac := hmac.New(sha256.New, []byte(secretKey))
		_, _ = mac.Write([]byte(raw))
		sig := hex.EncodeToString(mac.Sum(nil))

		body := fmt.Sprintf(`{
			"partnerCode": %q, "orderId": %q, "requestId": %q,
			"amount": "3190000", "orderInfo": "Order", "orderType": "momo_wallet",
			"transId": "4088812345", "resultCode": "0", "message": "Successful.",
			"payType": "qr", "responseTime": "1763281800000", "extraData": "", "signature": %q
		}`, partnerCode, momoOrderID, momoOrderID, sig)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/payments/momo/return", bytes.NewBufferString(body))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
	})
}
