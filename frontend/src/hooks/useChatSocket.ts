import { useState, useEffect, useRef, useCallback } from 'react'
import { tokenStore } from '@/api/tokenStore'
import {
  getChatWebSocketUrl,
  type ChatMessage,
  type WSEventMessagesRead,
  type WSEventPresence,
  type WSEvent,
} from '@/api/chat'

export interface UseChatSocketOptions {
  token?: string | null
  enabled?: boolean
  initialSupportOnline?: boolean
  initialSupportLastActiveAt?: string | null
  onNewMessage?: (msg: ChatMessage) => void
  onMessagesRead?: (payload: WSEventMessagesRead['payload']) => void
  onPresenceChange?: (payload: WSEventPresence['payload']) => void
  onAuthError?: () => void
}

export interface UseChatSocketReturn {
  isConnected: boolean
  isSupportOnline: boolean
  supportLastActiveAt: string | null
  setSupportOnline: (online: boolean) => void
  setSupportLastActiveAt: (timestamp: string | null) => void
  sendPing: () => void
  reconnect: () => void
  disconnect: () => void
}

function closeSocketSafely(ws: WebSocket | null, reason: string): void {
  if (!ws) return
  try {
    const connectingState =
      typeof WebSocket !== 'undefined' && WebSocket.CONNECTING !== undefined
        ? WebSocket.CONNECTING
        : 0
    const openState =
      typeof WebSocket !== 'undefined' && WebSocket.OPEN !== undefined
        ? WebSocket.OPEN
        : 1

    if (ws.readyState === connectingState) {
      // Detach listeners and defer closing until handshake is completed
      // to avoid "WebSocket is closed before the connection is established" warning
      ws.onmessage = null
      ws.onerror = null
      ws.onclose = null
      ws.onopen = () => {
        try {
          ws.close(1000, reason)
        } catch {
          // Ignore close error
        }
      }
    } else if (ws.readyState === openState) {
      ws.close(1000, reason)
    }
  } catch {
    // Ignore close error
  }
}

export function useChatSocket(options: UseChatSocketOptions = {}): UseChatSocketReturn {
  const {
    token,
    enabled = true,
    initialSupportOnline = false,
    initialSupportLastActiveAt = null,
    onNewMessage,
    onMessagesRead,
    onPresenceChange,
    onAuthError,
  } = options

  // Subscribe to tokenStore if explicit token is not provided
  const [storeToken, setStoreToken] = useState<string | null>(() => tokenStore.getToken())

  useEffect(() => {
    if (token !== undefined) return
    const unsubscribe = tokenStore.subscribe((newToken) => {
      setStoreToken(newToken)
    })
    return unsubscribe
  }, [token])

  const effectiveToken = token !== undefined ? token : storeToken

  const [isConnected, setIsConnected] = useState(false)
  const [isSupportOnline, setIsSupportOnline] = useState(initialSupportOnline)
  const [supportLastActiveAt, setSupportLastActiveAt] = useState<string | null>(
    initialSupportLastActiveAt
  )

  const socketRef = useRef<WebSocket | null>(null)
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const manualCloseRef = useRef(false)
  const isAuthErrorRef = useRef(false)
  const prevTokenRef = useRef<string | null>(effectiveToken)

  // When effectiveToken changes to a different non-null value (e.g. refreshed token),
  // reset lockout and reconnect attempts
  useEffect(() => {
    if (prevTokenRef.current !== effectiveToken) {
      prevTokenRef.current = effectiveToken
      if (effectiveToken) {
        isAuthErrorRef.current = false
        reconnectAttemptsRef.current = 0
      }
    }
  }, [effectiveToken])

  // Store callbacks in refs to avoid recreating connections when callback identities change
  const callbacksRef = useRef({
    onNewMessage,
    onMessagesRead,
    onPresenceChange,
    onAuthError,
  })

  useEffect(() => {
    callbacksRef.current = {
      onNewMessage,
      onMessagesRead,
      onPresenceChange,
      onAuthError,
    }
  })

  // Synchronize initial state if provided
  useEffect(() => {
    if (initialSupportOnline !== undefined) {
      setIsSupportOnline(initialSupportOnline)
    }
  }, [initialSupportOnline])

  useEffect(() => {
    if (initialSupportLastActiveAt !== undefined) {
      setSupportLastActiveAt(initialSupportLastActiveAt)
    }
  }, [initialSupportLastActiveAt])

  const clearTimers = useCallback(() => {
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current)
      pingTimerRef.current = null
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }, [])

  const sendPing = useCallback(() => {
    if (
      typeof WebSocket !== 'undefined' &&
      socketRef.current &&
      socketRef.current.readyState === WebSocket.OPEN
    ) {
      try {
        socketRef.current.send(JSON.stringify({ type: 'ping' }))
      } catch {
        // Socket send error will trigger onclose
      }
    }
  }, [])

  const connect = useCallback(() => {
    clearTimers()

    // Defensive cleanup of any existing connection before opening a new one
    if (socketRef.current) {
      closeSocketSafely(socketRef.current, 'Reconnecting with fresh socket')
      socketRef.current = null
    }

    if (
      typeof WebSocket === 'undefined' ||
      !effectiveToken ||
      !enabled ||
      isAuthErrorRef.current
    ) {
      setIsConnected(false)
      return
    }

    try {
      const url = getChatWebSocketUrl(effectiveToken)
      manualCloseRef.current = false
      const ws = new WebSocket(url)
      socketRef.current = ws

      ws.onopen = () => {
        setIsConnected(true)
        reconnectAttemptsRef.current = 0

        // Start heartbeat ping every 30 seconds
        pingTimerRef.current = setInterval(() => {
          if (
            typeof WebSocket !== 'undefined' &&
            ws.readyState === WebSocket.OPEN
          ) {
            try {
              ws.send(JSON.stringify({ type: 'ping' }))
            } catch {
              // Ignore ping error, onclose handles reconnect
            }
          }
        }, 30000)
      }

      ws.onmessage = (event) => {
        try {
          const data: WSEvent = JSON.parse(event.data)
          switch (data.type) {
            case 'chat:new_message':
              callbacksRef.current.onNewMessage?.(data.payload)
              break

            case 'chat:messages_read':
              callbacksRef.current.onMessagesRead?.(data.payload)
              break

            case 'chat:presence':
              callbacksRef.current.onPresenceChange?.(data.payload)
              if (data.payload.role === 'admin') {
                setIsSupportOnline(data.payload.isOnline)
                setSupportLastActiveAt(data.payload.lastActiveAt)
              }
              break

            case 'pong':
              // Heartbeat acknowledged
              break

            default:
              break
          }
        } catch {
          // Ignore unparseable frames
        }
      }

      ws.onclose = (event) => {
        setIsConnected(false)
        if (pingTimerRef.current) {
          clearInterval(pingTimerRef.current)
          pingTimerRef.current = null
        }

        // Close code 4001 indicates unauthorized / invalid token: halt reconnect
        if (event.code === 4001) {
          isAuthErrorRef.current = true
          callbacksRef.current.onAuthError?.()
          return
        }

        // If closed cleanly by user/unmount, do not auto-reconnect
        if (event.code === 1000 || manualCloseRef.current) {
          return
        }

        // Unexpected disconnect: auto-reconnect with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000)
        reconnectAttemptsRef.current += 1
        reconnectTimerRef.current = setTimeout(() => {
          connect()
        }, delay)
      }

      ws.onerror = () => {
        // ws.onclose handles state reset and reconnect
      }
    } catch {
      setIsConnected(false)
    }
  }, [effectiveToken, enabled, clearTimers])

  const disconnect = useCallback(() => {
    manualCloseRef.current = true
    clearTimers()
    if (socketRef.current) {
      closeSocketSafely(socketRef.current, 'Manual disconnect')
      socketRef.current = null
    }
    setIsConnected(false)
  }, [clearTimers])

  const reconnect = useCallback(() => {
    manualCloseRef.current = false
    isAuthErrorRef.current = false
    reconnectAttemptsRef.current = 0
    disconnect()
    connect()
  }, [connect, disconnect])

  useEffect(() => {
    connect()
    return () => {
      manualCloseRef.current = true
      clearTimers()
      if (socketRef.current) {
        closeSocketSafely(socketRef.current, 'Component unmounted')
        socketRef.current = null
      }
      setIsConnected(false)
    }
  }, [connect, clearTimers])

  return {
    isConnected,
    isSupportOnline,
    supportLastActiveAt,
    setSupportOnline: setIsSupportOnline,
    setSupportLastActiveAt,
    sendPing,
    reconnect,
    disconnect,
  }
}
