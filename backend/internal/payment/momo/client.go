package momo

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"commerce-backend/internal/config"
	"commerce-backend/internal/domain"
)

const defaultHTTPTimeout = 15 * time.Second

// Client implements domain.MomoGateway against the MoMo Payment Gateway v2 HTTP API.
type Client struct {
	partnerCode string
	accessKey   string
	secretKey   string
	endpoint    string
	redirectURL string
	ipnURL      string
	requestType string
	partnerName string
	storeID     string
	httpClient  *http.Client
	logger      *slog.Logger
	now         func() time.Time
}

var _ domain.MomoGateway = (*Client)(nil)

// NewClient constructs a MoMo v2 gateway client from centralized config.
func NewClient(cfg *config.Config, logger *slog.Logger) *Client {
	if logger == nil {
		logger = slog.Default()
	}
	var c Client
	if cfg != nil {
		c.partnerCode = cfg.MomoPartnerCode
		c.accessKey = cfg.MomoAccessKey
		c.secretKey = cfg.MomoSecretKey
		c.endpoint = cfg.MomoEndpoint
		c.redirectURL = cfg.MomoRedirectURL
		c.ipnURL = cfg.MomoIPNURL
		c.requestType = cfg.MomoRequestType
		c.partnerName = cfg.MomoPartnerName
		c.storeID = cfg.MomoStoreID
	}
	c.httpClient = &http.Client{Timeout: defaultHTTPTimeout}
	c.logger = logger
	c.now = time.Now
	return &c
}

// LogValue ensures credentials are never emitted if a Client is logged directly.
func (c *Client) LogValue() slog.Value {
	return slog.GroupValue(
		slog.String("partner_code", c.partnerCode),
		slog.String("endpoint", c.endpoint),
	)
}

type createPaymentRequest struct {
	PartnerCode  string `json:"partnerCode"`
	PartnerName  string `json:"partnerName"`
	StoreID      string `json:"storeId"`
	RequestID    string `json:"requestId"`
	Amount       int64  `json:"amount"`
	OrderID      string `json:"orderId"`
	OrderInfo    string `json:"orderInfo"`
	RedirectURL  string `json:"redirectUrl"`
	IPNURL       string `json:"ipnUrl"`
	Lang         string `json:"lang"`
	RequestType  string `json:"requestType"`
	AutoCapture  bool   `json:"autoCapture"`
	ExtraData    string `json:"extraData"`
	OrderGroupID string `json:"orderGroupId"`
	Signature    string `json:"signature"`
}

type createPaymentResponse struct {
	ResultCode int    `json:"resultCode"`
	Message    string `json:"message"`
	PayURL     string `json:"payUrl"`
}

func (c *Client) CreatePaymentURL(ctx context.Context, input domain.MomoCreateInput) (string, error) {
	if c.partnerCode == "" || c.accessKey == "" || c.secretKey == "" || c.endpoint == "" {
		c.logger.Warn("momo gateway configuration incomplete", "order_id", input.OrderID)
		return "", fmt.Errorf("%w: incomplete gateway configuration", domain.ErrMomoGateway)
	}
	if strings.TrimSpace(input.OrderID) == "" || input.AmountVND <= 0 {
		return "", fmt.Errorf("%w: invalid payment input", domain.ErrMomoGateway)
	}

	orderInfo := strings.TrimSpace(input.OrderInfo)
	if orderInfo == "" {
		orderInfo = fmt.Sprintf("Thanh toan don hang %s", input.OrderID)
	}

	momoOrderID := fmt.Sprintf("%s_%d", input.OrderID, c.now().UnixMilli())
	requestID := momoOrderID
	extraData := ""

	rawSignature := fmt.Sprintf(
		"accessKey=%s&amount=%d&extraData=%s&ipnUrl=%s&orderId=%s&orderInfo=%s&partnerCode=%s&redirectUrl=%s&requestId=%s&requestType=%s",
		c.accessKey,
		input.AmountVND,
		extraData,
		c.ipnURL,
		momoOrderID,
		orderInfo,
		c.partnerCode,
		c.redirectURL,
		requestID,
		c.requestType,
	)

	reqBody := createPaymentRequest{
		PartnerCode:  c.partnerCode,
		PartnerName:  c.partnerName,
		StoreID:      c.storeID,
		RequestID:    requestID,
		Amount:       input.AmountVND,
		OrderID:      momoOrderID,
		OrderInfo:    orderInfo,
		RedirectURL:  c.redirectURL,
		IPNURL:       c.ipnURL,
		Lang:         "vi",
		RequestType:  c.requestType,
		AutoCapture:  true,
		ExtraData:    extraData,
		OrderGroupID: "",
		Signature:    signHMACSHA256(c.secretKey, rawSignature),
	}

	payloadBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("%w: marshal request: %v", domain.ErrMomoGateway, err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(payloadBytes))
	if err != nil {
		c.logger.Warn("momo create request build failed", "order_id", input.OrderID, "momo_order_id", momoOrderID, "error", err.Error())
		return "", fmt.Errorf("%w: build request", domain.ErrMomoGateway)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		c.logger.Warn("momo create request transport failed", "order_id", input.OrderID, "momo_order_id", momoOrderID, "error", err.Error())
		return "", fmt.Errorf("%w: request failed", domain.ErrMomoGateway)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		c.logger.Warn("momo response read failed", "order_id", input.OrderID, "momo_order_id", momoOrderID, "http_status", resp.StatusCode, "error", err.Error())
		return "", fmt.Errorf("%w: read response", domain.ErrMomoGateway)
	}

	if resp.StatusCode != http.StatusOK {
		c.logger.Warn("momo returned non-200 status", "order_id", input.OrderID, "momo_order_id", momoOrderID, "http_status", resp.StatusCode)
		return "", fmt.Errorf("%w: http status %d", domain.ErrMomoGateway, resp.StatusCode)
	}

	var parsed createPaymentResponse
	if err := json.Unmarshal(respBytes, &parsed); err != nil {
		c.logger.Warn("momo response unmarshal failed", "order_id", input.OrderID, "momo_order_id", momoOrderID, "http_status", resp.StatusCode, "error", err.Error())
		return "", fmt.Errorf("%w: invalid response body", domain.ErrMomoGateway)
	}

	payURL := strings.TrimSpace(parsed.PayURL)
	if parsed.ResultCode != 0 || payURL == "" {
		c.logger.Warn("momo rejected payment creation", "order_id", input.OrderID, "momo_order_id", momoOrderID, "http_status", resp.StatusCode, "result_code", parsed.ResultCode)
		return "", fmt.Errorf("%w: resultCode=%d", domain.ErrMomoGateway, parsed.ResultCode)
	}

	return payURL, nil
}

func (c *Client) VerifyCallbackSignature(payload domain.MomoCallbackPayload) bool {
	if c.accessKey == "" || c.secretKey == "" || c.partnerCode == "" {
		return false
	}
	if payload.PartnerCode != c.partnerCode || strings.TrimSpace(payload.Signature) == "" {
		return false
	}

	rawSignature := fmt.Sprintf(
		"accessKey=%s&amount=%s&extraData=%s&message=%s&orderId=%s&orderInfo=%s&orderType=%s&partnerCode=%s&payType=%s&requestId=%s&responseTime=%s&resultCode=%d&transId=%s",
		c.accessKey,
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

	expectedHex := signHMACSHA256(c.secretKey, rawSignature)
	providedHex := strings.ToLower(strings.TrimSpace(payload.Signature))
	return hmac.Equal([]byte(providedHex), []byte(expectedHex))
}

func signHMACSHA256(secret, raw string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(raw))
	return hex.EncodeToString(mac.Sum(nil))
}
