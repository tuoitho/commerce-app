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
		c.AbortWithStatusJSON(http.StatusUnauthorized, errorBody{Error: errorBodyDetail{Code: "unauthorized", Message: "missing or malformed authorization header"}})
		return
	}
	userID, err := g.manager.ParseAccessToken(tokenStr)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusUnauthorized, errorBody{Error: errorBodyDetail{Code: "invalid_token", Message: "invalid or expired token"}})
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