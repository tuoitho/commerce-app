package http

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"

	"commerce-backend/internal/security/jwt"
	chatuc "commerce-backend/internal/usecase/chat"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow cross-origin for frontend dev / clients
	},
}

type wsHandler struct {
	hub *WSHub
	uc  *chatuc.UseCase
	jwt *jwt.Manager
	log *slog.Logger
}

func newWSHandler(hub *WSHub, uc *chatuc.UseCase, jwtMgr *jwt.Manager, log *slog.Logger) *wsHandler {
	return &wsHandler{
		hub: hub,
		uc:  uc,
		jwt: jwtMgr,
		log: log,
	}
}

type ClientAction struct {
	Action         string  `json:"action"`
	ConversationID string  `json:"conversationId"`
	Content        string  `json:"content"`
	OrderID        *string `json:"orderId,omitempty"`
}

func (h *wsHandler) HandleWS(c *gin.Context) {
	tokenStr := c.Query("token")
	if tokenStr == "" {
		authHeader := c.GetHeader("Authorization")
		tokenStr, _ = strings.CutPrefix(authHeader, "Bearer ")
	}

	if strings.TrimSpace(tokenStr) == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
		return
	}

	userID, role, err := h.jwt.ParseAccessToken(strings.TrimSpace(tokenStr))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	client := &WSClient{
		hub:    h.hub,
		conn:   conn,
		send:   make(chan []byte, 256),
		userID: userID,
		role:   role,
	}

	h.hub.Register(client)
	h.hub.BroadcastPresence(client.userID, client.role, "online", time.Now())

	go client.writePump()
	go client.readPump(h.uc, h.hub)
}

func (c *WSClient) readPump(uc *chatuc.UseCase, hub *WSHub) {
	defer func() {
		hub.Unregister(c)
		c.conn.Close()
		hub.BroadcastPresence(c.userID, c.role, "offline", time.Now())
	}()

	c.conn.SetReadLimit(65536)
	_ = c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			break
		}

		var action ClientAction
		if err := json.Unmarshal(message, &action); err != nil {
			continue
		}

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)

		switch action.Action {
		case "ping":
			pong, _ := json.Marshal(WSEvent{Event: "pong"})
			select {
			case c.send <- pong:
			default:
			}

		case "join_conversation":
			c.currentConvID = action.ConversationID
			if uc != nil && action.ConversationID != "" {
				_ = uc.UpdateActive(ctx, action.ConversationID, c.userID, c.role)
			}

		case "send_message":
			hasContent := strings.TrimSpace(action.Content) != ""
			hasOrder := action.OrderID != nil && *action.OrderID != ""
			if uc != nil && action.ConversationID != "" && (hasContent || hasOrder) {
				msg, err := uc.SendMessage(ctx, chatuc.SendMessageInput{
					ConversationID: action.ConversationID,
					SenderID:       c.userID,
					SenderRole:     c.role,
					OrderID:        action.OrderID,
					Content:        action.Content,
					Files:          nil,
				})
				if err == nil {
					hub.BroadcastNewMessage(msg)
				} else {
					errEvt, _ := json.Marshal(WSEvent{
						Event: "error",
						Code:  "send_failed",
						Msg:   err.Error(),
					})
					select {
					case c.send <- errEvt:
					default:
					}
				}
			}

		case "mark_read":
			c.currentConvID = action.ConversationID
			if uc != nil && action.ConversationID != "" {
				err := uc.MarkAsRead(ctx, action.ConversationID, c.userID, c.role)
				if err == nil {
					hub.BroadcastReadReceipt(action.ConversationID, c.role)
				}
			}

		case "heartbeat":
			if uc != nil && action.ConversationID != "" {
				_ = uc.UpdateActive(ctx, action.ConversationID, c.userID, c.role)
				hub.BroadcastPresence(c.userID, c.role, "online", time.Now())
			}
		}

		cancel()
	}
}

func (c *WSClient) writePump() {
	ticker := time.NewTicker(25 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			_, _ = w.Write(message)

			// Add queued messages to the current websocket message.
			n := len(c.send)
			for i := 0; i < n; i++ {
				_, _ = w.Write([]byte{'\n'})
				_, _ = w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
