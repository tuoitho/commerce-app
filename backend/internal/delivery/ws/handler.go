package ws

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security/jwt"
)

// Handler handles HTTP to WebSocket upgrades and client authentication.
type Handler struct {
	hub      *Hub
	jwtMgr   *jwt.Manager
	upgrader websocket.Upgrader
}

// NewHandler initializes a new WebSocket Handler.
func NewHandler(hub *Hub, jwtMgr *jwt.Manager) *Handler {
	return &Handler{
		hub:    hub,
		jwtMgr: jwtMgr,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
		},
	}
}

func (h *Handler) closeUnauthorized(conn *websocket.Conn) {
	closeMsg := websocket.FormatCloseMessage(4001, "Unauthorized")
	_ = conn.WriteControl(websocket.CloseMessage, closeMsg, time.Now().Add(time.Second))
	_ = conn.SetReadDeadline(time.Now().Add(100 * time.Millisecond))
	_, _, _ = conn.ReadMessage()
	_ = conn.Close()
}

// ServeWS handles incoming WebSocket connections on GET /api/v1/chat/ws.
func (h *Handler) ServeWS(c *gin.Context) {
	if !websocket.IsWebSocketUpgrade(c.Request) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "websocket upgrade required"})
		return
	}

	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	tokenStr := c.Query("token")
	if tokenStr == "" {
		h.closeUnauthorized(conn)
		return
	}

	userID, roleStr, err := h.jwtMgr.ValidateToken(tokenStr)
	if err != nil || userID == "" {
		h.closeUnauthorized(conn)
		return
	}

	role := domain.ChatSenderRole(roleStr)
	if role != domain.ChatSenderAdmin {
		role = domain.ChatSenderCustomer
	}

	client := NewClient(h.hub, conn, userID, role)
	h.hub.Register(client)

	go client.writePump()
	go client.readPump()
}
