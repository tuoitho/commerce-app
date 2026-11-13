import { useCallback, useEffect, useRef, useState } from 'react'
import { getLiveWebSocketUrl, type LiveRoomEvent } from '@/api/live'

const PING_INTERVAL_MS = 30_000
const MAX_BACKOFF_MS = 30_000
const CLOSE_UNAUTHORIZED = 4001
const CLOSE_SESSION_NOT_FOUND = 4004
const CLOSE_NORMAL = 1000

export interface UseLiveSocketOptions {
  sessionId: string | null
  token: string | null
  onEvent: (event: LiveRoomEvent) => void
  /** Called after the connection was re-established, to resync state. */
  onReconnect?: () => void
}

export interface UseLiveSocketReturn {
  connected: boolean
  sendHearts: (count: number) => void
}

/**
 * Connects to a live session room and reconnects with exponential backoff.
 * It stops for good on an auth failure, an unknown session, or a normal close
 * (the session ended).
 */
export function useLiveSocket({ sessionId, token, onEvent, onReconnect }: UseLiveSocketOptions): UseLiveSocketReturn {
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)
  const callbacks = useRef({ onEvent, onReconnect })

  useEffect(() => {
    callbacks.current = { onEvent, onReconnect }
  })

  useEffect(() => {
    if (!sessionId || !token) return
    let disposed = false
    let attempts = 0
    let hasConnected = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let pingTimer: ReturnType<typeof setInterval> | null = null

    const connect = () => {
      const ws = new WebSocket(getLiveWebSocketUrl(sessionId, token))
      socketRef.current = ws

      ws.onopen = () => {
        if (disposed) return
        setConnected(true)
        if (hasConnected) callbacks.current.onReconnect?.()
        hasConnected = true
        attempts = 0
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
        }, PING_INTERVAL_MS)
      }
      ws.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data as string) as LiveRoomEvent | { type: 'pong' }
          if (event.type !== 'pong') callbacks.current.onEvent(event)
        } catch {
          // Ignore malformed frames.
        }
      }
      ws.onclose = (event) => {
        if (pingTimer) clearInterval(pingTimer)
        pingTimer = null
        // A socket replaced after a token change may close after its successor opened.
        if (disposed || socketRef.current !== ws) return
        socketRef.current = null
        setConnected(false)
        if (event.code === CLOSE_UNAUTHORIZED || event.code === CLOSE_SESSION_NOT_FOUND || event.code === CLOSE_NORMAL) return
        const delay = Math.min(1000 * 2 ** attempts, MAX_BACKOFF_MS)
        attempts++
        reconnectTimer = setTimeout(connect, delay)
      }
    }

    connect()
    return () => {
      disposed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (pingTimer) clearInterval(pingTimer)
      const ws = socketRef.current
      socketRef.current = null
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close(CLOSE_NORMAL, 'leave')
      }
    }
  }, [sessionId, token])

  const sendHearts = useCallback((count: number) => {
    const ws = socketRef.current
    if (ws && ws.readyState === WebSocket.OPEN && count > 0) {
      ws.send(JSON.stringify({ type: 'live:heart', payload: { count } }))
    }
  }, [])

  return { connected, sendHearts }
}
