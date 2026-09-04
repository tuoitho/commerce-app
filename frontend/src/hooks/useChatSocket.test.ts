import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChatSocket } from './useChatSocket'
import { tokenStore } from '@/api/tokenStore'
import type { ChatMessage, WSEventPresence, WSEventMessagesRead } from '@/api/chat'

// Mock WebSocket class
class MockWebSocket {
  static instances: MockWebSocket[] = []
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  url: string
  onopen: (() => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: ((error: unknown) => void) | null = null

  sent: string[] = []

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
    setTimeout(() => {
      if (this.readyState === MockWebSocket.CONNECTING) {
        this.readyState = MockWebSocket.OPEN
        if (this.onopen) {
          this.onopen()
        }
      }
    }, 0)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) {
      this.onclose({ code, reason })
    }
  }

  // Helper to simulate incoming event
  receive(data: object) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) })
    }
  }
}

describe('useChatSocket', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useFakeTimers()
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
    tokenStore.clearToken()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('does not connect when unauthenticated and no token provided', () => {
    const { result } = renderHook(() => useChatSocket({ enabled: true }))
    expect(MockWebSocket.instances.length).toBe(0)
    expect(result.current.isConnected).toBe(false)
  })

  it('connects when token is provided in options or tokenStore', async () => {
    const { result } = renderHook(() =>
      useChatSocket({ token: 'test-token-123', enabled: true })
    )

    expect(MockWebSocket.instances.length).toBe(1)
    expect(MockWebSocket.instances[0].url).toContain('token=test-token-123')

    // Fast-forward initial onopen setTimeout
    await act(async () => {
      vi.advanceTimersByTime(10)
    })

    expect(result.current.isConnected).toBe(true)
  })

  it('sends heartbeat ping every 30 seconds', async () => {
    renderHook(() =>
      useChatSocket({ token: 'test-token-123', enabled: true })
    )

    await act(async () => {
      vi.advanceTimersByTime(10)
    })

    const ws = MockWebSocket.instances[0]
    expect(ws.sent).toEqual([])

    // Advance 30 seconds
    await act(async () => {
      vi.advanceTimersByTime(30000)
    })

    expect(ws.sent).toContain(JSON.stringify({ type: 'ping' }))

    // Advance another 30 seconds
    await act(async () => {
      vi.advanceTimersByTime(30000)
    })

    expect(ws.sent.length).toBe(2)
  })

  it('handles chat:new_message event and calls onNewMessage callback', async () => {
    const onNewMessage = vi.fn()
    renderHook(() =>
      useChatSocket({
        token: 'test-token-123',
        enabled: true,
        onNewMessage,
      })
    )

    await act(async () => {
      vi.advanceTimersByTime(10)
    })

    const ws = MockWebSocket.instances[0]
    const mockMsg: ChatMessage = {
      id: 'msg-1',
      conversationId: 'conv-1',
      senderId: 'admin-1',
      senderRole: 'admin',
      senderName: 'Hỗ trợ viên',
      content: 'Chào bạn, mình có thể giúp gì?',
      attachments: [],
      createdAt: '2026-09-04T10:00:00.000Z',
      isRead: false,
    }

    act(() => {
      ws.receive({
        type: 'chat:new_message',
        payload: mockMsg,
      })
    })

    expect(onNewMessage).toHaveBeenCalledWith(mockMsg)
  })

  it('handles chat:presence event and updates support online state', async () => {
    const onPresenceChange = vi.fn()
    const { result } = renderHook(() =>
      useChatSocket({
        token: 'test-token-123',
        enabled: true,
        onPresenceChange,
      })
    )

    await act(async () => {
      vi.advanceTimersByTime(10)
    })

    const ws = MockWebSocket.instances[0]

    // Admin goes online
    act(() => {
      const presenceEvent: WSEventPresence = {
        type: 'chat:presence',
        payload: {
          userId: 'admin-1',
          role: 'admin',
          isOnline: true,
          lastActiveAt: '2026-09-04T10:10:00.000Z',
        },
      }
      ws.receive(presenceEvent)
    })

    expect(onPresenceChange).toHaveBeenCalled()
    expect(result.current.isSupportOnline).toBe(true)
    expect(result.current.supportLastActiveAt).toBe('2026-09-04T10:10:00.000Z')

    // Admin goes offline
    act(() => {
      ws.receive({
        type: 'chat:presence',
        payload: {
          userId: 'admin-1',
          role: 'admin',
          isOnline: false,
          lastActiveAt: '2026-09-04T10:15:00.000Z',
        },
      })
    })

    expect(result.current.isSupportOnline).toBe(false)
    expect(result.current.supportLastActiveAt).toBe('2026-09-04T10:15:00.000Z')
  })

  it('handles chat:messages_read event and calls onMessagesRead callback', async () => {
    const onMessagesRead = vi.fn()
    renderHook(() =>
      useChatSocket({
        token: 'test-token-123',
        enabled: true,
        onMessagesRead,
      })
    )

    await act(async () => {
      vi.advanceTimersByTime(10)
    })

    const ws = MockWebSocket.instances[0]
    const readPayload: WSEventMessagesRead['payload'] = {
      conversationId: 'conv-1',
      readerRole: 'admin',
      readAt: '2026-09-04T10:15:00.000Z',
    }

    act(() => {
      ws.receive({
        type: 'chat:messages_read',
        payload: readPayload,
      })
    })

    expect(onMessagesRead).toHaveBeenCalledWith(readPayload)
  })

  it('auto-reconnects with exponential backoff on unexpected disconnect (code !== 1000 and !== 4001)', async () => {
    const { result } = renderHook(() =>
      useChatSocket({ token: 'test-token-123', enabled: true })
    )

    await act(async () => {
      vi.advanceTimersByTime(10)
    })
    expect(result.current.isConnected).toBe(true)
    expect(MockWebSocket.instances.length).toBe(1)

    // First unexpected disconnect (e.g. code 1006 abnormal closure)
    act(() => {
      MockWebSocket.instances[0].close(1006, 'Connection lost')
    })
    expect(result.current.isConnected).toBe(false)

    // Should schedule reconnect after 1000ms (1s)
    await act(async () => {
      vi.advanceTimersByTime(999)
    })
    expect(MockWebSocket.instances.length).toBe(1)

    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(MockWebSocket.instances.length).toBe(2)

    // Trigger onopen for second instance
    await act(async () => {
      vi.advanceTimersByTime(10)
    })
    expect(result.current.isConnected).toBe(true)
  })

  it('halts reconnect on code 4001 (Unauthorized/token expired)', async () => {
    const onAuthError = vi.fn()
    const { result } = renderHook(() =>
      useChatSocket({
        token: 'test-token-123',
        enabled: true,
        onAuthError,
      })
    )

    await act(async () => {
      vi.advanceTimersByTime(10)
    })
    expect(result.current.isConnected).toBe(true)

    // Close with code 4001
    act(() => {
      MockWebSocket.instances[0].close(4001, 'Unauthorized')
    })

    expect(result.current.isConnected).toBe(false)
    expect(onAuthError).toHaveBeenCalled()

    // Fast forward 60 seconds, no new WebSocket instance should be created
    await act(async () => {
      vi.advanceTimersByTime(60000)
    })
    expect(MockWebSocket.instances.length).toBe(1)
  })

  it('recovers and connects when a new/refreshed token is provided after code 4001 auth error', async () => {
    let token = 'expired-token'
    const { result, rerender } = renderHook(
      ({ currentToken }) => useChatSocket({ token: currentToken, enabled: true }),
      { initialProps: { currentToken: token } }
    )

    await act(async () => {
      vi.advanceTimersByTime(10)
    })
    expect(result.current.isConnected).toBe(true)

    // Simulate 4001 error
    act(() => {
      MockWebSocket.instances[0].close(4001, 'Unauthorized')
    })
    expect(result.current.isConnected).toBe(false)

    // Fast forward to verify it stays locked out while token is same
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(MockWebSocket.instances.length).toBe(1)

    // Token refreshed
    rerender({ currentToken: 'refreshed-token-456' })

    await act(async () => {
      vi.advanceTimersByTime(10)
    })

    expect(MockWebSocket.instances.length).toBe(2)
    expect(MockWebSocket.instances[1].url).toContain('token=refreshed-token-456')
    expect(result.current.isConnected).toBe(true)
  })

  it('closes connection cleanly on unmount without reconnecting', async () => {
    const { unmount } = renderHook(() =>
      useChatSocket({ token: 'test-token-123', enabled: true })
    )

    await act(async () => {
      vi.advanceTimersByTime(10)
    })

    const ws = MockWebSocket.instances[0]
    expect(ws.readyState).toBe(MockWebSocket.OPEN)

    unmount()

    expect(ws.readyState).toBe(MockWebSocket.CLOSED)

    // Wait some time to ensure no reconnect happened
    await act(async () => {
      vi.advanceTimersByTime(10000)
    })
    expect(MockWebSocket.instances.length).toBe(1)
  })

  it('defers closing safely when unmounted while still in CONNECTING state', async () => {
    const { unmount } = renderHook(() =>
      useChatSocket({ token: 'test-token-123', enabled: true })
    )

    const ws = MockWebSocket.instances[0]
    expect(ws.readyState).toBe(MockWebSocket.CONNECTING)

    // Unmount immediately without advancing timer (simulates immediate unmount / StrictMode cleanup)
    unmount()

    // Socket should not be closed immediately while connecting to avoid browser warning
    expect(ws.readyState).toBe(MockWebSocket.CONNECTING)

    // Once connection completes, the deferred close is triggered
    await act(async () => {
      vi.advanceTimersByTime(10)
    })

    expect(ws.readyState).toBe(MockWebSocket.CLOSED)
  })
})
