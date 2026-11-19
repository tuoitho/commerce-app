import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'
import type { ProductDetail, ProductSummary } from '@/api/types'

export const COMPARE_STORAGE_KEY = 'auraphone_compare_items_v1'
export const MAX_COMPARE_ITEMS = 3

export interface CompareItem {
  id: string
  name: string
  brand: string
  model?: string
  primaryImageUrl: string
  minPriceVnd: string
  maxPriceVnd?: string
  price?: string
}

export type CompareInput = ProductSummary | ProductDetail | CompareItem

export interface CompareActionResult {
  ok: boolean
  action: 'added' | 'removed' | 'limit_reached' | 'noop'
  reason?: 'limit_reached'
}

export interface CompareContextValue {
  items: CompareItem[]
  limitWarning: string | null
  maxItems: number
  isComparing: (productId: string) => boolean
  addProduct: (product: CompareInput) => CompareActionResult
  removeProduct: (productId: string) => void
  toggleProduct: (product: CompareInput) => CompareActionResult
  clearAll: () => void
  dismissWarning: () => void
}

function toCompareItem(input: CompareInput): CompareItem {
  const primaryImageUrl =
    'primaryImageUrl' in input && input.primaryImageUrl
      ? input.primaryImageUrl
      : 'imageUrls' in input && Array.isArray(input.imageUrls) && input.imageUrls.length > 0
      ? input.imageUrls[0]
      : ''

  return {
    id: input.id,
    name: input.name,
    brand: input.brand,
    model: input.model,
    primaryImageUrl,
    minPriceVnd: input.minPriceVnd || input.price || '0',
    maxPriceVnd: input.maxPriceVnd,
    price: input.price,
  }
}

function readStoredItems(): CompareItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.sessionStorage.getItem(COMPARE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item): item is CompareItem =>
          Boolean(item && typeof item.id === 'string' && typeof item.name === 'string')
      )
      .slice(0, MAX_COMPARE_ITEMS)
  } catch {
    return []
  }
}

function writeStoredItems(items: CompareItem[]) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Ignore storage quota or restricted-mode errors
  }
}

const DEFAULT_COMPARE_CONTEXT: CompareContextValue = {
  items: [],
  limitWarning: null,
  maxItems: MAX_COMPARE_ITEMS,
  isComparing: () => false,
  addProduct: () => ({ ok: false, action: 'noop' }),
  removeProduct: () => {},
  toggleProduct: () => ({ ok: false, action: 'noop' }),
  clearAll: () => {},
  dismissWarning: () => {},
}

const CompareContext = createContext<CompareContextValue | undefined>(undefined)

export function CompareProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CompareItem[]>(() => readStoredItems())
  const [limitWarning, setLimitWarning] = useState<string | null>(null)

  useEffect(() => {
    writeStoredItems(items)
  }, [items])

  const isComparing = useCallback(
    (productId: string) => items.some((item) => item.id === productId),
    [items]
  )

  const addProduct = useCallback(
    (product: CompareInput): CompareActionResult => {
      if (items.some((item) => item.id === product.id)) {
        return { ok: true, action: 'noop' }
      }
      if (items.length >= MAX_COMPARE_ITEMS) {
        setLimitWarning(
          `Chỉ có thể so sánh tối đa ${MAX_COMPARE_ITEMS} sản phẩm cùng lúc. Vui lòng bỏ bớt sản phẩm trước khi thêm mới.`
        )
        return { ok: false, action: 'limit_reached', reason: 'limit_reached' }
      }

      const nextItem = toCompareItem(product)
      setItems((prev) => {
        if (prev.some((item) => item.id === nextItem.id) || prev.length >= MAX_COMPARE_ITEMS) {
          return prev
        }
        return [...prev, nextItem]
      })
      setLimitWarning(null)
      return { ok: true, action: 'added' }
    },
    [items]
  )

  const removeProduct = useCallback((productId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== productId))
    setLimitWarning(null)
  }, [])

  const toggleProduct = useCallback(
    (product: CompareInput): CompareActionResult => {
      if (items.some((item) => item.id === product.id)) {
        removeProduct(product.id)
        return { ok: true, action: 'removed' }
      }
      return addProduct(product)
    },
    [items, addProduct, removeProduct]
  )

  const clearAll = useCallback(() => {
    setItems([])
    setLimitWarning(null)
  }, [])

  const dismissWarning = useCallback(() => {
    setLimitWarning(null)
  }, [])

  return (
    <CompareContext.Provider
      value={{
        items,
        limitWarning,
        maxItems: MAX_COMPARE_ITEMS,
        isComparing,
        addProduct,
        removeProduct,
        toggleProduct,
        clearAll,
        dismissWarning,
      }}
    >
      {children}
    </CompareContext.Provider>
  )
}

export function useCompare(): CompareContextValue {
  return useContext(CompareContext) ?? DEFAULT_COMPARE_CONTEXT
}
