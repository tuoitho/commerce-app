import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCurrentLive, CURRENT_LIVE_POLL_MS } from './useCurrentLive'
import { liveApi } from '@/api/live'

vi.mock('@/api/live', () => ({
  liveApi: { getCurrent: vi.fn() },
}))

const live = { id: '11111111-1111-1111-1111-111111111111', title: 'Flash sale', startedAt: '2026-11-13T03:00:00Z' }

describe('useCurrentLive', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(liveApi.getCurrent).mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads the live session and polls periodically', async () => {
    vi.mocked(liveApi.getCurrent).mockResolvedValueOnce(null).mockResolvedValueOnce(live)
    const { result } = renderHook(() => useCurrentLive())

    await act(async () => {})
    expect(result.current).toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CURRENT_LIVE_POLL_MS)
    })
    expect(result.current).toEqual(live)
    expect(liveApi.getCurrent).toHaveBeenCalledTimes(2)
  })

  it('refreshes when the window regains focus', async () => {
    vi.mocked(liveApi.getCurrent).mockResolvedValueOnce(live).mockResolvedValueOnce(null)
    const { result } = renderHook(() => useCurrentLive())
    await act(async () => {})
    expect(result.current).toEqual(live)

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(result.current).toBeNull()
  })

  it('treats request failures as no live session', async () => {
    vi.mocked(liveApi.getCurrent).mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useCurrentLive())
    await act(async () => {})
    expect(result.current).toBeNull()
  })

  it('stops polling after unmount', async () => {
    vi.mocked(liveApi.getCurrent).mockResolvedValue(null)
    const { unmount } = renderHook(() => useCurrentLive())
    await act(async () => {})
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CURRENT_LIVE_POLL_MS * 3)
    })
    expect(liveApi.getCurrent).toHaveBeenCalledTimes(1)
  })
})
