package ws

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"commerce-backend/internal/domain"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 64 * 1024
	sendBufferSize = 256
)

// Client represents a single WebSocket client connection.
type Client struct {
	hub      *Hub
	conn     *websocket.Conn
	userID   string
	role     domain.ChatSenderRole
	send     chan []byte
	sendMu   sync.RWMutex
	isClosed bool
}

// NewClient creates a new Client instance.
func NewClient(hub *Hub, conn *websocket.Conn, userID string, role domain.ChatSenderRole) *Client {
	return &Client{
		hub:    hub,
		conn:   conn,
		userID: userID,
		role:   role,
		send:   make(chan []byte, sendBufferSize),
	}
}

// SendMessage enqueues data to be sent to the client. Returns false if buffer is full or client is closed.
func (c *Client) SendMessage(data []byte) bool {
	c.sendMu.RLock()
	defer c.sendMu.RUnlock()
	if c.isClosed {
		return false
	}

	select {
	case c.send <- data:
		return true
	default:
		return false
	}
}

// Close safely closes the send channel once under write lock.
func (c *Client) Close() {
	c.sendMu.Lock()
	defer c.sendMu.Unlock()
	if !c.isClosed {
		c.isClosed = true
		close(c.send)
	}
}

// readPump pumps messages from the websocket connection to the hub.
func (c *Client) readPump() {
	defer func() {
		c.hub.Unregister(c)
		if c.conn != nil {
			_ = c.conn.Close()
		}
	}()

	if c.conn == nil {
		return
	}

	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
		c.hub.touchUserActive(c.userID)
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			break
		}

		var incoming struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal(message, &incoming); err == nil {
			if incoming.Type == "ping" {
				_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
				c.hub.touchUserActive(c.userID)
				pongData, _ := json.Marshal(map[string]string{"type": "pong"})
				c.SendMessage(pongData)
			}
		}
	}
}

// writePump pumps messages from the hub to the websocket connection.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		if c.conn != nil {
			_ = c.conn.Close()
		}
	}()

	if c.conn == nil {
		return
	}

	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			if _, err := w.Write(message); err != nil {
				return
			}
			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
