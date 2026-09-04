import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAdminChatSocket } from './useAdminChatSocket'
import { tokenStore } from '@/api/tokenStore'
import type { AdminChatMessage, WSEventPresence, WSEventMessagesRead } from '@/api/chat'

// Mock WebSocket class
class MockWebSocket {
  static instances: MockWebSocket[] = []
  static OPEN = 1
  static CLOSED = 3

  readyState = MockWebSocket.OPEN
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
      if (this.onopen && this.readyState === MockWebSocket.OPEN) {
        this.onopen()
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

  receive(data: object) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) })
    }
  }
}

describe('useAdminChatSocket', () => {
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
    const { result } = renderHook(() => useAdminChatSocket({ enabled: true }))
    expect(MockWebSocket.instances.length).toBe(0)
    expect(result.current.isConnected).toBe(false)
  })

  it('connects when token is provided in options or tokenStore', async () => {
    const { result } = renderHook(() =>
      useAdminChatSocket({ token: 'admin-token-123', enabled: true })
    )

    expect(MockWebSocket.instances.length).toBe(1)
    expect(MockWebSocket.instances[0].url).toContain('token=admin-token-123')

    await act(async () => {
      vi.advanceTimersByTime(10)
    })

    expect(result.current.isConnected).toBe(true)
  })

  it('sends heartbeat ping every 30 seconds', async () => {
    renderHook(() =>
      useAdminChatSocket({ token: 'admin-token-123', enabled: true })
    )

    await act(async () => {
      vi.advanceTimersByTime(10)
    })

    const ws = MockWebSocket.instances[0]
    expect(ws.sent).toEqual([])

    await act(async () => {
      vi.advanceTimersByTime(30000)
    })

    expect(ws.sent).toContain(JSON.stringify({ type: 'ping' }))

    await act(async () => {
      vi.advanceTimersByTime(30000)
    })

    expect(ws.sent.length).toBe(2)
  })

  it('handles chat:new_message event and calls onNewMessage callback', async () => {
    const onNewMessage = vi.fn()
    renderHook(() =>
      useAdminChatSocket({
        token: 'admin-token-123',
        enabled: true,
        onNewMessage,
      })
    )

    await act(async () => {
      vi.advanceTimersByTime(10)
    })

    const ws = MockWebSocket.instances[0]
    const mockMsg: AdminChatMessage = {
      id: 'msg-1',
      conversationId: 'conv-1',
      senderId: 'user-1',
      senderRole: 'customer',
      senderName: 'Khách hàng A',
      content: 'Chào shop, đơn hàng của mình đến đâu rồi?',
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

  it('handles chat:presence event and triggers onPresenceChange', async () => {
    const onPresenceChange = vi.fn()
    renderHook(() =>
      useAdminChatSocket({
        token: 'admin-token-123',
        enabled: true,
        onPresenceChange,
      })
    )

    await act(async () => {
      vi.advanceTimersByTime(10)
    })

    const ws = MockWebSocket.instances[0]
    const presenceEvent: WSEventPresence = {
      type: 'chat:presence',
      payload: {
        userId: 'user-1',
        role: 'customer',
        isOnline: true,
        lastActiveAt: '2026-09-04T10:10:00.000Z',
      },
    }

    act(() => {
      ws.receive(presenceEvent)
    })

    expect(onPresenceChange).toHaveBeenCalledWith(presenceEvent.payload)
  })

  it('handles chat:messages_read event and triggers onMessagesRead', async () => {
    const onMessagesRead = vi.fn()
    renderHook(() =>
      useAdminChatSocket({
        token: 'admin-token-123',
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
      readerRole: 'customer',
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

  it('auto-reconnects with exponential backoff on unexpected disconnect', async () => {
    const { result } = renderHook(() =>
      useAdminChatSocket({ token: 'admin-token-123', enabled: true })
    )

    await act(async () => {
      vi.advanceTimersByTime(10)
    })
    expect(result.current.isConnected).toBe(true)
    expect(MockWebSocket.instances.length).toBe(1)

    act(() => {
      MockWebSocket.instances[0].close(1006, 'Abnormal closure')
    })
    expect(result.current.isConnected).toBe(false)

    // Reconnect scheduled after 1s
    await act(async () => {
      vi.advanceTimersByTime(999)
    })
    expect(MockWebSocket.instances.length).toBe(1)

    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(MockWebSocket.instances.length).toBe(2)
  })

  it('halts reconnect on code 4001 and fires onAuthError', async () => {
    const onAuthError = vi.fn()
    const { result } = renderHook(() =>
      useAdminChatSocket({
        token: 'admin-token-123',
        enabled: true,
        onAuthError,
      })
    )

    await act(async () => {
      vi.advanceTimersByTime(10)
    })
    expect(result.current.isConnected).toBe(true)

    act(() => {
      MockWebSocket.instances[0].close(4001, 'Unauthorized')
    })

    expect(result.current.isConnected).toBe(false)
    expect(onAuthError).toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(60000)
    })
    expect(MockWebSocket.instances.length).toBe(1)
  })

  it('closes connection cleanly on unmount', async () => {
    const { unmount } = renderHook(() =>
      useAdminChatSocket({ token: 'admin-token-123', enabled: true })
    )

    await act(async () => {
      vi.advanceTimersByTime(10)
    })

    const ws = MockWebSocket.instances[0]
    expect(ws.readyState).toBe(MockWebSocket.OPEN)

    unmount()

    expect(ws.readyState).toBe(MockWebSocket.CLOSED)
  })
})
