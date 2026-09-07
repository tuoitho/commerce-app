import { useEffect, useRef, useState, useCallback } from 'react'
import { tokenStore } from '@/api/tokenStore'
import type { ChatMessage } from '@/api/chat'

export interface WSEventMessage {
  event: 'new_message' | 'read_receipt' | 'presence_update' | 'pong' | 'error'
  data?: any
  code?: string
  message?: string
}

export interface UseAdminChatSocketOptions {
  onNewMessage?: (message: ChatMessage) => void
  onReadReceipt?: (data: { conversationId: string; readerRole: string; readAt: string }) => void
  onPresenceUpdate?: (data: { userId: string; role: string; status: 'online' | 'active' | 'offline'; displayText: string; lastActiveAt: string }) => void
}

function safelyCloseWebSocket(ws: WebSocket | null) {
  if (!ws) return
  ws.onmessage = null
  ws.onerror = () => {}
  ws.onclose = () => {}

  if (ws.readyState === WebSocket.CONNECTING) {
    ws.onopen = () => {
      try {
        ws.close(1000, 'Clean close after connecting')
      } catch {}
    }
  } else if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.close(1000, 'Clean close')
    } catch {}
  }
}

export function useAdminChatSocket(options: UseAdminChatSocketOptions = {}) {
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const backoffRef = useRef(1000)
  const isDestroyedRef = useRef(false)

  const connect = useCallback(() => {
    const token = tokenStore.getToken()
    if (!token) {
      setIsConnected(false)
      safelyCloseWebSocket(wsRef.current)
      wsRef.current = null
      return
    }

    safelyCloseWebSocket(wsRef.current)
    wsRef.current = null

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const wsUrl = `${protocol}//${host}/api/v1/chat/ws?token=${encodeURIComponent(token)}`

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        if (isDestroyedRef.current) {
          safelyCloseWebSocket(ws)
          return
        }
        setIsConnected(true)
        backoffRef.current = 1000

        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current)
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'ping' }))
          }
        }, 25000)
      }

      ws.onmessage = (event) => {
        try {
          const payload: WSEventMessage = JSON.parse(event.data)
          if (payload.event === 'new_message' && payload.data) {
            optionsRef.current.onNewMessage?.(payload.data as ChatMessage)
          } else if (payload.event === 'read_receipt' && payload.data) {
            optionsRef.current.onReadReceipt?.(payload.data)
          } else if (payload.event === 'presence_update' && payload.data) {
            optionsRef.current.onPresenceUpdate?.(payload.data)
          }
        } catch {}
      }

      ws.onclose = () => {
        setIsConnected(false)
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current)
          pingIntervalRef.current = null
        }

        if (!isDestroyedRef.current && tokenStore.getToken()) {
          const timeout = Math.min(backoffRef.current, 10000)
          backoffRef.current *= 1.5
          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, timeout)
        }
      }

      ws.onerror = () => {
        safelyCloseWebSocket(ws)
      }
    } catch {
      setIsConnected(false)
    }
  }, [])

  useEffect(() => {
    isDestroyedRef.current = false
    connect()

    return () => {
      isDestroyedRef.current = true
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current)
      safelyCloseWebSocket(wsRef.current)
      wsRef.current = null
    }
  }, [connect])

  const joinConversation = useCallback((conversationId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'join_conversation', conversationId }))
    }
  }, [])

  const sendMessage = useCallback((conversationId: string, content: string, orderId?: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const payload: { action: string; conversationId: string; content: string; orderId?: string } = {
        action: 'send_message',
        conversationId,
        content,
      }
      if (orderId) {
        payload.orderId = orderId
      }
      wsRef.current.send(JSON.stringify(payload))
    }
  }, [])

  const markRead = useCallback((conversationId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'mark_read', conversationId }))
    }
  }, [])

  return {
    isConnected,
    joinConversation,
    sendMessage,
    markRead,
    reconnect: connect,
  }
}
