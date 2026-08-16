package http

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/security/jwt"
)

const (
	contextUserKey = "userID"
	bearerPrefix   = "Bearer "
)

type guard struct {
	manager *jwt.Manager
}

func newGuard(manager *jwt.Manager) *guard {
	return &guard{manager: manager}
}

func (g *guard) AuthRequired(c *gin.Context) {
	tokenStr, ok := strings.CutPrefix(c.GetHeader("Authorization"), bearerPrefix)
	if !ok || tokenStr == "" {
		respondError(c, http.StatusUnauthorized, "unauthorized", "missing or malformed authorization header", nil)
		c.Abort()
		return
	}
	userID, err := g.manager.ParseAccessToken(tokenStr)
	if err != nil {
		respondError(c, http.StatusUnauthorized, "invalid_token", "invalid or expired token", nil)
		c.Abort()
		return
	}
	c.Set(contextUserKey, userID)
	c.Next()
}

func callerUserID(c *gin.Context) string {
	id, _ := c.Get(contextUserKey)
	str, _ := id.(string)
	return str
}
