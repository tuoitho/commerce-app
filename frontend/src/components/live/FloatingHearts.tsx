import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react'
import { Heart } from 'lucide-react'

const HEART_LIFETIME_MS = 1600
const MAX_VISIBLE_HEARTS = 40
const COLORS = ['text-rose-500', 'text-pink-400', 'text-red-500', 'text-fuchsia-400', 'text-amber-400']

export interface FloatingHeartsHandle {
  spawn: (count?: number) => void
}

interface FloatingHeart {
  id: number
  drift: number
  color: string
  delay: number
}

/** A layer of hearts that drift upward; call spawn() through the ref. */
export const FloatingHearts = forwardRef<FloatingHeartsHandle>(function FloatingHearts(_, ref) {
  const [hearts, setHearts] = useState<FloatingHeart[]>([])
  const nextId = useRef(0)

  const spawn = useCallback((count = 1) => {
    const added: FloatingHeart[] = []
    for (let i = 0; i < count; i++) {
      added.push({
        id: nextId.current++,
        drift: Math.round(Math.random() * 60 - 30),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        delay: i * 90,
      })
    }
    setHearts((current) => [...current, ...added].slice(-MAX_VISIBLE_HEARTS))
    const ids = new Set(added.map((h) => h.id))
    setTimeout(() => setHearts((current) => current.filter((h) => !ids.has(h.id))), HEART_LIFETIME_MS + count * 90)
  }, [])

  useImperativeHandle(ref, () => ({ spawn }), [spawn])

  return (
    <div aria-hidden="true" className="pointer-events-none absolute bottom-24 right-4 h-64 w-14">
      {hearts.map((heart) => (
        <Heart
          key={heart.id}
          data-testid="floating-heart"
          className={`live-heart absolute bottom-0 left-1/2 h-7 w-7 -ml-3.5 fill-current ${heart.color}`}
          style={{ ['--live-heart-drift' as string]: `${heart.drift}px`, animationDelay: `${heart.delay}ms` }}
        />
      ))}
    </div>
  )
})
