package livews

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security/jwt"
)

const (
	closeUnauthorized    = 4001
	closeSessionNotFound = 4004
)

// Handler upgrades GET /api/v1/live/sessions/:id/ws?token=... into a room connection.
type Handler struct {
	hub      *Hub
	jwt      *jwt.Manager
	upgrader websocket.Upgrader
}

func NewHandler(hub *Hub, jwtMgr *jwt.Manager) *Handler {
	return &Handler{
		hub: hub,
		jwt: jwtMgr,
		upgrader: websocket.Upgrader{
			CheckOrigin:     func(*http.Request) bool { return true },
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
		},
	}
}

func (h *Handler) ServeWS(c *gin.Context) {
	if !websocket.IsWebSocketUpgrade(c.Request) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "websocket upgrade required"})
		return
	}
	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	userID, role, err := h.jwt.ParseAccessToken(c.Query("token"))
	if err != nil || userID == "" {
		closeConn(conn, closeUnauthorized, "Unauthorized")
		return
	}

	sessionID := c.Param("id")
	if _, err := uuid.Parse(sessionID); err != nil {
		closeConn(conn, closeSessionNotFound, "Session not found")
		return
	}
	session, err := h.hub.store.GetSession(c.Request.Context(), sessionID)
	if err != nil {
		closeConn(conn, closeSessionNotFound, "Session not found")
		return
	}
	if !session.IsLive() {
		endedAt := time.Now().UTC()
		if session.EndedAt != nil {
			endedAt = session.EndedAt.UTC()
		}
		reason := domain.LiveEndReasonAdmin
		if session.EndReason != nil {
			reason = *session.EndReason
		}
		if data, err := encode(domain.LiveEventEnded, domain.LiveEndedEvent{EndedAt: endedAt, Reason: reason}); err == nil {
			_ = conn.WriteMessage(websocket.TextMessage, data)
		}
		closeConn(conn, closeNormal, "")
		return
	}

	client := newClient(h.hub, conn, sessionID, userID, role)
	go client.writePump()
	if !h.hub.register(c.Request.Context(), client) {
		client.closeWith(closeNormal)
		return
	}
	go client.readPump()
}

func closeConn(conn *websocket.Conn, code int, text string) {
	_ = conn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(code, text), time.Now().Add(time.Second))
	_ = conn.SetReadDeadline(time.Now().Add(100 * time.Millisecond))
	_, _, _ = conn.ReadMessage()
	_ = conn.Close()
}
