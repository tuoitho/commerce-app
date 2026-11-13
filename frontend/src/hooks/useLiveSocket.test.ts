import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLiveSocket } from './useLiveSocket'

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: MockWebSocket[] = []
  readyState = MockWebSocket.CONNECTING
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: ((e: { code: number }) => void) | null = null
  url: string
  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }
  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.readyState = MockWebSocket.CLOSED
  }
  open() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }
  emit(event: unknown) {
    this.onmessage?.({ data: JSON.stringify(event) })
  }
  drop(code: number) {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ code })
  }
}

describe('useLiveSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('connects to the session room with the token and forwards events', () => {
    const onEvent = vi.fn()
    const { result } = renderHook(() => useLiveSocket({ sessionId: 's-1', token: 'tok', onEvent }))
    const ws = MockWebSocket.instances[0]
    expect(ws.url).toContain('/live/sessions/s-1/ws?token=tok')

    act(() => ws.open())
    expect(result.current.connected).toBe(true)
    act(() => ws.emit({ type: 'live:viewers', payload: { count: 3 } }))
    act(() => ws.emit({ type: 'pong' }))
    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenCalledWith({ type: 'live:viewers', payload: { count: 3 } })
  })

  it('sends batched hearts', () => {
    const { result } = renderHook(() => useLiveSocket({ sessionId: 's-1', token: 'tok', onEvent: vi.fn() }))
    const ws = MockWebSocket.instances[0]
    act(() => ws.open())
    act(() => result.current.sendHearts(4))
    expect(JSON.parse(ws.sent[0])).toEqual({ type: 'live:heart', payload: { count: 4 } })
  })

  it('reconnects with backoff and asks to resync', () => {
    const onReconnect = vi.fn()
    renderHook(() => useLiveSocket({ sessionId: 's-1', token: 'tok', onEvent: vi.fn(), onReconnect }))
    act(() => MockWebSocket.instances[0].open())
    act(() => MockWebSocket.instances[0].drop(1006))

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(MockWebSocket.instances).toHaveLength(2)
    act(() => MockWebSocket.instances[1].open())
    expect(onReconnect).toHaveBeenCalledTimes(1)
  })

  it.each([4001, 4004, 1000])('stops reconnecting after close code %i', (code) => {
    renderHook(() => useLiveSocket({ sessionId: 's-1', token: 'tok', onEvent: vi.fn() }))
    act(() => MockWebSocket.instances[0].open())
    act(() => MockWebSocket.instances[0].drop(code))
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(MockWebSocket.instances).toHaveLength(1)
  })

  it('keeps the new connection when the old one closes after a token change', () => {
    const { result, rerender } = renderHook(({ token }) => useLiveSocket({ sessionId: 's-1', token, onEvent: vi.fn() }), {
      initialProps: { token: 'old' },
    })
    const first = MockWebSocket.instances[0]
    act(() => first.open())
    rerender({ token: 'new' })
    const second = MockWebSocket.instances[1]
    act(() => second.open())
    // The browser delivers the old socket's close event after the new one opened.
    act(() => first.drop(1000))
    expect(result.current.connected).toBe(true)
    act(() => result.current.sendHearts(2))
    expect(second.sent).toHaveLength(1)
  })

  it('reconnects after a server restart (close code 1012)', () => {
    renderHook(() => useLiveSocket({ sessionId: 's-1', token: 'tok', onEvent: vi.fn() }))
    act(() => MockWebSocket.instances[0].open())
    act(() => MockWebSocket.instances[0].drop(1012))
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(MockWebSocket.instances).toHaveLength(2)
  })

  it('does not connect without a session or token', () => {
    renderHook(() => useLiveSocket({ sessionId: 's-1', token: null, onEvent: vi.fn() }))
    renderHook(() => useLiveSocket({ sessionId: null, token: 'tok', onEvent: vi.fn() }))
    expect(MockWebSocket.instances).toHaveLength(0)
  })
})
