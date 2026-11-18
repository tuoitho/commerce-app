package momo

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"commerce-backend/internal/config"
	"commerce-backend/internal/domain"
)

func testMomoConfig(endpoint string) *config.Config {
	return &config.Config{
		MomoPartnerCode: "MOMO",
		MomoAccessKey:   "F8BBA842ECF85",
		MomoSecretKey:   "K951B6PE1waDMi640xX08PD3vg6EkVlz",
		MomoEndpoint:    endpoint,
		MomoRedirectURL: "http://localhost:15173/momo-return",
		MomoIPNURL:      "http://localhost:18080/api/v1/payments/momo/ipn",
		MomoRequestType: "payWithMethod",
		MomoPartnerName: "Test",
		MomoStoreID:     "MomoTestStore",
	}
}

func signTest(secret, raw string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(raw))
	return hex.EncodeToString(mac.Sum(nil))
}

func TestClient_CreatePaymentURL_SuccessAndSignature(t *testing.T) {
	const orderUUID = "11111111-2222-3333-4444-555555555555"
	fixedNow := time.UnixMilli(1763281800123)

	var captured map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("expected POST, got %s", r.Method)
		}
		if ct := r.Header.Get("Content-Type"); !strings.Contains(ct, "application/json") {
			t.Fatalf("expected application/json content-type, got %q", ct)
		}
		if err := json.NewDecoder(r.Body).Decode(&captured); err != nil {
			t.Fatalf("decode body: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"resultCode":0,"message":"Successful.","payUrl":"https://test-payment.momo.vn/v2/gateway/pay?t=abc"}`))
	}))
	defer srv.Close()

	cfg := testMomoConfig(srv.URL)
	var logBuf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logBuf, &slog.HandlerOptions{Level: slog.LevelDebug}))

	client := NewClient(cfg, logger)
	client.now = func() time.Time { return fixedNow }

	payURL, err := client.CreatePaymentURL(context.Background(), domain.MomoCreateInput{
		OrderID:   orderUUID,
		AmountVND: 3190000,
		OrderInfo: "Thanh toan don hang AuraPhone",
	})
	if err != nil {
		t.Fatalf("CreatePaymentURL unexpected error: %v", err)
	}
	if payURL != "https://test-payment.momo.vn/v2/gateway/pay?t=abc" {
		t.Fatalf("unexpected payURL %q", payURL)
	}

	wantMomoOrderID := fmt.Sprintf("%s_%d", orderUUID, fixedNow.UnixMilli())
	if captured["orderId"] != wantMomoOrderID || captured["requestId"] != wantMomoOrderID {
		t.Fatalf("orderId=%v requestId=%v, want %s", captured["orderId"], captured["requestId"], wantMomoOrderID)
	}
	if captured["partnerCode"] != "MOMO" || captured["partnerName"] != "Test" || captured["storeId"] != "MomoTestStore" {
		t.Fatalf("unexpected partner fields: %+v", captured)
	}
	if captured["lang"] != "vi" || captured["requestType"] != "payWithMethod" || captured["autoCapture"] != true {
		t.Fatalf("unexpected request options: %+v", captured)
	}
	if captured["amount"] != float64(3190000) {
		t.Fatalf("unexpected amount %v", captured["amount"])
	}

	wantRaw := fmt.Sprintf(
		"accessKey=%s&amount=%d&extraData=%s&ipnUrl=%s&orderId=%s&orderInfo=%s&partnerCode=%s&redirectUrl=%s&requestId=%s&requestType=%s",
		cfg.MomoAccessKey,
		3190000,
		"",
		cfg.MomoIPNURL,
		wantMomoOrderID,
		"Thanh toan don hang AuraPhone",
		cfg.MomoPartnerCode,
		cfg.MomoRedirectURL,
		wantMomoOrderID,
		cfg.MomoRequestType,
	)
	wantSig := signTest(cfg.MomoSecretKey, wantRaw)
	if captured["signature"] != wantSig {
		t.Fatalf("signature = %v, want %s", captured["signature"], wantSig)
	}

	if strings.Contains(logBuf.String(), cfg.MomoSecretKey) {
		t.Fatalf("log leaked MomoSecretKey: %s", logBuf.String())
	}
}

func TestClient_CreatePaymentURL_FailuresDoNotLeakSecret(t *testing.T) {
	const orderUUID = "11111111-2222-3333-4444-555555555555"

	t.Run("non-zero resultCode", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"resultCode":1006,"message":"Transaction rejected","payUrl":""}`))
		}))
		defer srv.Close()

		cfg := testMomoConfig(srv.URL)
		var logBuf bytes.Buffer
		logger := slog.New(slog.NewJSONHandler(&logBuf, &slog.HandlerOptions{Level: slog.LevelDebug}))
		client := NewClient(cfg, logger)

		_, err := client.CreatePaymentURL(context.Background(), domain.MomoCreateInput{
			OrderID:   orderUUID,
			AmountVND: 150000,
		})
		if !errors.Is(err, domain.ErrMomoGateway) {
			t.Fatalf("expected ErrMomoGateway, got %v", err)
		}
		if strings.Contains(logBuf.String(), cfg.MomoSecretKey) || strings.Contains(err.Error(), cfg.MomoSecretKey) {
			t.Fatalf("secret leaked in logs or error")
		}
		if strings.Contains(logBuf.String(), cfg.MomoAccessKey) {
			t.Fatalf("accessKey leaked in logs: %s", logBuf.String())
		}
	})

	t.Run("non-200 HTTP status", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusBadGateway)
			_, _ = w.Write([]byte(`gateway unavailable`))
		}))
		defer srv.Close()

		cfg := testMomoConfig(srv.URL)
		var logBuf bytes.Buffer
		logger := slog.New(slog.NewJSONHandler(&logBuf, &slog.HandlerOptions{Level: slog.LevelDebug}))
		client := NewClient(cfg, logger)

		_, err := client.CreatePaymentURL(context.Background(), domain.MomoCreateInput{
			OrderID:   orderUUID,
			AmountVND: 150000,
		})
		if !errors.Is(err, domain.ErrMomoGateway) {
			t.Fatalf("expected ErrMomoGateway, got %v", err)
		}
		if strings.Contains(logBuf.String(), cfg.MomoSecretKey) || strings.Contains(err.Error(), cfg.MomoSecretKey) {
			t.Fatalf("secret leaked in logs or error")
		}
	})

	t.Run("missing credentials", func(t *testing.T) {
		cfg := testMomoConfig("http://127.0.0.1:1")
		cfg.MomoSecretKey = ""
		var logBuf bytes.Buffer
		logger := slog.New(slog.NewJSONHandler(&logBuf, &slog.HandlerOptions{Level: slog.LevelDebug}))
		client := NewClient(cfg, logger)

		_, err := client.CreatePaymentURL(context.Background(), domain.MomoCreateInput{
			OrderID:   orderUUID,
			AmountVND: 150000,
		})
		if !errors.Is(err, domain.ErrMomoGateway) {
			t.Fatalf("expected ErrMomoGateway, got %v", err)
		}
	})

	t.Run("timeout is configured to 15s", func(t *testing.T) {
		client := NewClient(testMomoConfig("https://example.com"), nil)
		if client.httpClient == nil || client.httpClient.Timeout != 15*time.Second {
			t.Fatalf("expected 15s timeout, got %+v", client.httpClient)
		}
	})
}

func TestClient_VerifyCallbackSignature(t *testing.T) {
	cfg := testMomoConfig("https://test-payment.momo.vn/v2/gateway/api/create")
	client := NewClient(cfg, nil)

	payload := domain.MomoCallbackPayload{
		PartnerCode:  "MOMO",
		OrderID:      "11111111-2222-3333-4444-555555555555_1763281800000",
		RequestID:    "11111111-2222-3333-4444-555555555555_1763281800000",
		Amount:       "3190000",
		OrderInfo:    "Thanh toan don hang",
		OrderType:    "momo_wallet",
		TransID:      "4088812345",
		ResultCode:   0,
		Message:      "Thành công.",
		PayType:      "qr",
		ResponseTime: "1763281800000",
		ExtraData:    "",
	}

	raw := fmt.Sprintf(
		"accessKey=%s&amount=%s&extraData=%s&message=%s&orderId=%s&orderInfo=%s&orderType=%s&partnerCode=%s&payType=%s&requestId=%s&responseTime=%s&resultCode=%d&transId=%s",
		cfg.MomoAccessKey,
		payload.Amount,
		payload.ExtraData,
		payload.Message,
		payload.OrderID,
		payload.OrderInfo,
		payload.OrderType,
		payload.PartnerCode,
		payload.PayType,
		payload.RequestID,
		payload.ResponseTime,
		payload.ResultCode,
		payload.TransID,
	)
	payload.Signature = signTest(cfg.MomoSecretKey, raw)

	if !client.VerifyCallbackSignature(payload) {
		t.Fatal("expected valid signature to verify")
	}

	upper := payload
	upper.Signature = strings.ToUpper(payload.Signature)
	if !client.VerifyCallbackSignature(upper) {
		t.Fatal("expected uppercase hex signature to verify")
	}

	tamperedAmount := payload
	tamperedAmount.Amount = "1000"
	if client.VerifyCallbackSignature(tamperedAmount) {
		t.Fatal("expected tampered amount to fail verification")
	}

	tamperedCode := payload
	tamperedCode.ResultCode = 1006
	if client.VerifyCallbackSignature(tamperedCode) {
		t.Fatal("expected tampered resultCode to fail verification")
	}

	wrongPartner := payload
	wrongPartner.PartnerCode = "OTHER"
	if client.VerifyCallbackSignature(wrongPartner) {
		t.Fatal("expected mismatched partnerCode to fail verification")
	}

	emptySig := payload
	emptySig.Signature = ""
	if client.VerifyCallbackSignature(emptySig) {
		t.Fatal("expected empty signature to fail verification")
	}
}

func TestParseMomoOrderID(t *testing.T) {
	validUUID := "11111111-2222-3333-4444-555555555555"
	if got, ok := domain.ParseMomoOrderID(validUUID + "_1763281800000"); !ok || got != validUUID {
		t.Fatalf("got (%q, %v), want (%q, true)", got, ok, validUUID)
	}

	invalid := []string{
		"",
		validUUID,
		validUUID + "_",
		"_1763281800000",
		"not-a-uuid_1763281800000",
	}
	for _, tc := range invalid {
		if got, ok := domain.ParseMomoOrderID(tc); ok {
			t.Fatalf("ParseMomoOrderID(%q) = (%q, true), want false", tc, got)
		}
	}
}
