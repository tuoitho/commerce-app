package http

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security/jwt"
)

const (
	contextUserKey = "userID"
	contextRoleKey = "userRole"
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
	userID, role, err := g.manager.ParseAccessToken(tokenStr)
	if err != nil {
		respondError(c, http.StatusUnauthorized, "invalid_token", "invalid or expired token", nil)
		c.Abort()
		return
	}
	c.Set(contextUserKey, userID)
	c.Set(contextRoleKey, role)
	c.Next()
}

func (g *guard) OptionalAuth(c *gin.Context) {
	authHeader := c.GetHeader("Authorization")
	if authHeader == "" {
		c.Next()
		return
	}
	tokenStr, ok := strings.CutPrefix(authHeader, bearerPrefix)
	if !ok || tokenStr == "" {
		respondError(c, http.StatusUnauthorized, "invalid_token", "invalid or expired token", nil)
		c.Abort()
		return
	}
	userID, role, err := g.manager.ParseAccessToken(tokenStr)
	if err != nil {
		respondError(c, http.StatusUnauthorized, "invalid_token", "invalid or expired token", nil)
		c.Abort()
		return
	}
	c.Set(contextUserKey, userID)
	c.Set(contextRoleKey, role)
	c.Next()
}

func (g *guard) RequireRole(role string) gin.HandlerFunc {
	return func(c *gin.Context) {
		currentRole := callerRole(c)
		if currentRole != role {
			respondError(c, http.StatusForbidden, "forbidden", "Bạn không có quyền thực hiện thao tác này", nil)
			c.Abort()
			return
		}
		c.Next()
	}
}

func (g *guard) RequireAdmin() gin.HandlerFunc {
	return g.RequireRole(domain.RoleAdmin)
}

func callerUserID(c *gin.Context) string {
	id, _ := c.Get(contextUserKey)
	str, _ := id.(string)
	return str
}

func callerRole(c *gin.Context) string {
	r, _ := c.Get(contextRoleKey)
	str, _ := r.(string)
	return str
}
