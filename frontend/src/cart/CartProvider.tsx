import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

import { ApiError } from '../api/client'
import { createCartApi, type Cart, type CartApi } from '../api/cart'
import { useAuth } from '../auth/AuthProvider'

interface CartContextValue {
  cart: Cart | null
  loading: boolean
  pending: boolean
  error: string | null
  reload(): Promise<void>
  addVariant(variantId: string): Promise<boolean>
  setQuantity(itemId: string, quantity: bigint): Promise<boolean>
  setSelected(itemId: string, selected: boolean): Promise<boolean>
  setAllSelected(selected: boolean): Promise<boolean>
  remove(itemId: string): Promise<boolean>
}

interface CartSession {
  generation: number
  api: CartApi
  queue: Promise<void>
  pending: number
  loadSequence: number
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children, api }: { children: ReactNode; api?: CartApi }) {
  const { user, loading: authLoading } = useAuth()
  const defaultApi = useRef<CartApi | null>(null)
  if (!defaultApi.current) defaultApi.current = createCartApi()
  const activeApi = api ?? defaultApi.current
  const [cart, setCart] = useState<Cart | null>(null)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const session = useRef<CartSession | null>(null)

  const isCurrent = useCallback((active: CartSession) => session.current === active && generation.current === active.generation, [])

  const load = useCallback(async (active: CartSession) => {
    const sequence = ++active.loadSequence
    if (isCurrent(active)) setLoading(true)
    try {
      const next = await active.api.fetchCart()
      if (isCurrent(active) && sequence === active.loadSequence) {
        setCart(next)
        setError(null)
      }
    } catch (cause) {
      if (isCurrent(active) && sequence === active.loadSequence) {
        setError(cause instanceof Error ? cause.message : 'Unable to load cart')
      }
    } finally {
      if (isCurrent(active) && sequence === active.loadSequence) setLoading(false)
    }
  }, [isCurrent])

  useEffect(() => {
    const active: CartSession = { generation: ++generation.current, api: activeApi, queue: Promise.resolve(), pending: 0, loadSequence: 0 }
    session.current = active
    setLoading(false)
    setPending(false)
    setError(null)
    setCart(null)
    if (!authLoading && user) {
      void load(active)
    }
  }, [activeApi, authLoading, load, user])

  const reload = useCallback(async () => {
    const active = session.current
    if (authLoading || !user || !active || !isCurrent(active)) return
    await load(active)
  }, [authLoading, isCurrent, load, user])

    const mutate = useCallback((operation: (active: CartSession) => Promise<Cart>): Promise<boolean> => {
    const active = session.current
    if (!active || authLoading || !user) return Promise.resolve(false)
    active.loadSequence += 1
    active.pending += 1
    if (isCurrent(active)) setPending(true)
    const run = active.queue.then(async () => {
      try {
        const next = await operation(active)
        if (isCurrent(active)) {
          setCart(next)
          setError(null)
          return true
        }
        return false
      } catch (cause) {
        if (!isCurrent(active)) return false
        setError(cause instanceof Error ? cause.message : 'Unable to update cart')
        if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500 && cause.status !== 401) {
          const rejectionMessage = cause instanceof Error ? cause.message : 'Unable to update cart'
          await load(active)
          if (isCurrent(active)) setError(rejectionMessage)
        }
        return false
      } finally {
        active.pending -= 1
        if (isCurrent(active) && active.pending === 0) setPending(false)
      }
    })
    active.queue = run.then(() => undefined, () => undefined)
    return run
  }, [authLoading, isCurrent, load, user])

  const addVariant = useCallback((variantId: string) => mutate((active) => active.api.addVariant(variantId)), [mutate])
  const setQuantity = useCallback((itemId: string, quantity: bigint) => mutate((active) => active.api.setQuantity(itemId, quantity)), [mutate])
  const setSelected = useCallback((itemId: string, selected: boolean) => mutate((active) => active.api.setSelected(itemId, selected)), [mutate])
  const setAllSelected = useCallback((selected: boolean) => mutate((active) => active.api.setAllSelected(selected)), [mutate])
  const remove = useCallback((itemId: string) => mutate((active) => active.api.remove(itemId)), [mutate])

  return <CartContext.Provider value={{ cart, loading, pending, error, reload, addVariant, setQuantity, setSelected, setAllSelected, remove }}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used within CartProvider')
  return context
}
