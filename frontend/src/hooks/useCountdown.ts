import { useEffect, useState } from 'react'

export interface CountdownState {
  remainingMs: number
  hours: number
  minutes: number
  seconds: number
  formatted: string
  isExpired: boolean
}

function computeCountdown(endsAt: string | null | undefined, nowMs: number): CountdownState {
  if (!endsAt) {
    return { remainingMs: 0, hours: 0, minutes: 0, seconds: 0, formatted: '00:00:00', isExpired: true }
  }
  const endMs = new Date(endsAt).getTime()
  if (Number.isNaN(endMs)) {
    return { remainingMs: 0, hours: 0, minutes: 0, seconds: 0, formatted: '00:00:00', isExpired: true }
  }
  const remainingMs = Math.max(0, endMs - nowMs)
  const isExpired = remainingMs <= 0
  const totalSeconds = Math.floor(remainingMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const formatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return { remainingMs, hours, minutes, seconds, formatted, isExpired }
}

export function useCountdown(endsAt: string | null | undefined): CountdownState {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    setNowMs(Date.now())
    if (!endsAt) return
    const endMs = new Date(endsAt).getTime()
    if (Number.isNaN(endMs) || endMs <= Date.now()) return

    const timer = window.setInterval(() => {
      setNowMs(Date.now())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [endsAt])

  return computeCountdown(endsAt, nowMs)
}
