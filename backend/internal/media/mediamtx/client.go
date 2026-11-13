// Package mediamtx talks to the MediaMTX Control API (v3) to learn whether the
// media server is reachable and whether a live path currently has a publisher.
package mediamtx

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"commerce-backend/internal/domain"
)

const defaultTimeout = 3 * time.Second

// Client implements domain.MediaServer against the MediaMTX Control API.
type Client struct {
	baseURL string
	http    *http.Client
	timeout time.Duration
}

var _ domain.MediaServer = (*Client)(nil)

// New creates a Control API client for the given base URL, e.g. http://127.0.0.1:9997.
func New(baseURL string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		http:    &http.Client{},
		timeout: defaultTimeout,
	}
}

// Ping reports whether the Control API answers within the client timeout.
func (c *Client) Ping(ctx context.Context) error {
	resp, err := c.get(ctx, "/v3/paths/list?itemsPerPage=1")
	if err != nil {
		return err
	}
	defer drain(resp)
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return fmt.Errorf("mediamtx: ping status %d", resp.StatusCode)
	}
	return nil
}

// PathOnline reports whether a publisher is currently streaming to path.
// An unknown path is reported as offline rather than as an error.
func (c *Client) PathOnline(ctx context.Context, path string) (bool, error) {
	resp, err := c.get(ctx, "/v3/paths/get/"+path)
	if err != nil {
		return false, err
	}
	defer drain(resp)
	switch {
	case resp.StatusCode == http.StatusNotFound:
		return false, nil
	case resp.StatusCode < 200 || resp.StatusCode > 299:
		return false, fmt.Errorf("mediamtx: path status %d", resp.StatusCode)
	}
	var body struct {
		Online bool `json:"online"`
		// Ready is the pre-1.21 name of Online; MediaMTX still reports both.
		Ready bool `json:"ready"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return false, fmt.Errorf("mediamtx: decode path: %w", err)
	}
	return body.Online || body.Ready, nil
}

func (c *Client) get(ctx context.Context, path string) (*http.Response, error) {
	ctx, cancel := context.WithTimeout(ctx, c.timeout)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		cancel()
		return nil, fmt.Errorf("mediamtx: build request: %w", err)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		cancel()
		return nil, fmt.Errorf("mediamtx: request %s: %w", path, err)
	}
	resp.Body = cancelOnClose{ReadCloser: resp.Body, cancel: cancel}
	return resp, nil
}

func drain(resp *http.Response) {
	_, _ = io.Copy(io.Discard, resp.Body)
	_ = resp.Body.Close()
}

// cancelOnClose releases the per-request timeout once the body is consumed.
type cancelOnClose struct {
	io.ReadCloser
	cancel context.CancelFunc
}

func (c cancelOnClose) Close() error {
	err := c.ReadCloser.Close()
	c.cancel()
	return err
}
