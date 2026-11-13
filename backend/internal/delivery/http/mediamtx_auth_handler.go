package http

import (
	"log/slog"
	"net/http"
	"net/url"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/security/jwt"
	liveuc "commerce-backend/internal/usecase/live"
)

// mediaMTXAuthRequest is the body MediaMTX posts for every publish/read
// request when authMethod is http.
type mediaMTXAuthRequest struct {
	Token  string `json:"token"`
	Query  string `json:"query"`
	Action string `json:"action"`
	Path   string `json:"path"`
}

type mediaMTXAuthHandler struct {
	uc     *liveuc.UseCase
	jwt    *jwt.Manager
	logger *slog.Logger
}

func newMediaMTXAuthHandler(uc *liveuc.UseCase, jwtMgr *jwt.Manager, logger *slog.Logger) *mediaMTXAuthHandler {
	if logger == nil {
		logger = slog.Default()
	}
	return &mediaMTXAuthHandler{uc: uc, jwt: jwtMgr, logger: logger}
}

// authorize answers MediaMTX with a bare status: any 2xx allows the request,
// anything else denies it.
func (h *mediaMTXAuthHandler) authorize(c *gin.Context) {
	var req mediaMTXAuthRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.Status(http.StatusUnauthorized)
		return
	}
	token := req.Token
	if token == "" {
		// Native HLS players cannot send headers, so they pass ?token=.
		if values, err := url.ParseQuery(req.Query); err == nil {
			token = values.Get("token")
		}
	}
	_, role, err := h.jwt.ParseAccessToken(token)
	if err != nil {
		h.logger.Debug("media auth denied", "action", req.Action, "path", req.Path, "reason", "invalid token")
		c.Status(http.StatusUnauthorized)
		return
	}
	allowed, err := h.uc.AuthorizeMedia(c.Request.Context(), req.Action, req.Path, role)
	if err != nil {
		h.logger.Error("media auth failed", "action", req.Action, "path", req.Path, "error", err)
		c.Status(http.StatusInternalServerError)
		return
	}
	if !allowed {
		h.logger.Debug("media auth denied", "action", req.Action, "path", req.Path, "role", role)
		c.Status(http.StatusUnauthorized)
		return
	}
	c.Status(http.StatusOK)
}
