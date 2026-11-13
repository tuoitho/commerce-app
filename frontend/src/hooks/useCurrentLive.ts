import { useEffect, useState } from 'react'
import { liveApi, type LiveSummary } from '@/api/live'

export const CURRENT_LIVE_POLL_MS = 30_000

/**
 * Returns the session currently being broadcast, or null. The value is polled
 * and refreshed whenever the window regains focus; failures read as "not live".
 */
export function useCurrentLive(): LiveSummary | null {
  const [current, setCurrent] = useState<LiveSummary | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const summary = await liveApi.getCurrent()
        if (!cancelled) setCurrent(summary)
      } catch {
        if (!cancelled) setCurrent(null)
      }
    }

    void load()
    const timer = window.setInterval(load, CURRENT_LIVE_POLL_MS)
    window.addEventListener('focus', load)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('focus', load)
    }
  }, [])

  return current
}
