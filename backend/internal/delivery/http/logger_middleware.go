package http

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

const contextLoggerKey = "slog_logger"

// LoggingMiddleware logs incoming HTTP requests using slog.
func LoggingMiddleware(logger *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		if logger != nil {
			c.Set(contextLoggerKey, logger)
		}

		start := time.Now()
		c.Next()

		if logger == nil {
			return
		}

		latency := time.Since(start)
		status := c.Writer.Status()
		method := ""
		path := ""
		if c.Request != nil {
			method = c.Request.Method
			if c.Request.URL != nil {
				path = c.Request.URL.Path
			}
		}
		clientIP := c.ClientIP()

		attrs := []slog.Attr{
			slog.String("method", method),
			slog.String("path", path),
			slog.Int("status", status),
			slog.Duration("latency", latency),
			slog.String("ip", clientIP),
		}

		if userID := callerUserID(c); userID != "" {
			attrs = append(attrs, slog.String("user_id", userID))
		}

		ctx := context.Background()
		if c.Request != nil {
			ctx = c.Request.Context()
		}

		if status >= http.StatusInternalServerError {
			logger.LogAttrs(ctx, slog.LevelError, "http request", attrs...)
		} else {
			logger.LogAttrs(ctx, slog.LevelInfo, "http request", attrs...)
		}
	}
}

// RecoveryMiddleware recovers from panics and logs them using slog.
func RecoveryMiddleware(logger *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				if logger != nil {
					method := ""
					path := ""
					if c.Request != nil {
						method = c.Request.Method
						if c.Request.URL != nil {
							path = c.Request.URL.Path
						}
					}
					logger.Error("panic recovered",
						"error", fmt.Sprintf("%v", r),
						"method", method,
						"path", path,
					)
				}
				respondError(c, http.StatusInternalServerError, "internal", "Lỗi máy chủ nội bộ", nil)
				c.Abort()
			}
		}()
		c.Next()
	}
}
