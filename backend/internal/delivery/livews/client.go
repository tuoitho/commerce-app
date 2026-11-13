package livews

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 4 * 1024
	sendBufferSize = 256

	closeNormal = websocket.CloseNormalClosure
	// closeRestart tells clients the server is going away, not that the session
	// ended, so they reconnect.
	closeRestart = websocket.CloseServiceRestart
)

// Client is one WebSocket connection to a live session room.
type Client struct {
	hub       *Hub
	conn      *websocket.Conn
	sessionID string
	userID    string
	role      string
	send      chan []byte

	mu        sync.Mutex
	closed    bool
	closeCode int
}

func newClient(hub *Hub, conn *websocket.Conn, sessionID, userID, role string) *Client {
	return &Client{
		hub:       hub,
		conn:      conn,
		sessionID: sessionID,
		userID:    userID,
		role:      role,
		send:      make(chan []byte, sendBufferSize),
		closeCode: closeNormal,
	}
}

// SendMessage queues data for the client; it is dropped when the buffer is full.
func (c *Client) SendMessage(data []byte) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return false
	}
	select {
	case c.send <- data:
		return true
	default:
		return false
	}
}

// closeWith stops the client; the write pump then sends a close frame with code.
func (c *Client) closeWith(code int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return
	}
	c.closed = true
	c.closeCode = code
	close(c.send)
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister(c)
		_ = c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})
	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		var incoming struct {
			Type    string `json:"type"`
			Payload struct {
				Count int `json:"count"`
			} `json:"payload"`
		}
		if json.Unmarshal(message, &incoming) != nil {
			continue
		}
		switch incoming.Type {
		case "ping":
			_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
			c.SendMessage([]byte(`{"type":"pong"}`))
		case "live:heart":
			c.hub.acceptHearts(c, incoming.Payload.Count)
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.mu.Lock()
				code := c.closeCode
				c.mu.Unlock()
				_ = c.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(code, ""))
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
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
