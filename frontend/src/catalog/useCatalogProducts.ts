import { useCallback, useEffect, useState } from 'react'

import { fetchProducts, type CatalogFilters, type ProductSummary } from '../api/catalog'

export function useCatalogProducts(filters: CatalogFilters, debounceMs = 300) {
  const [products, setProducts] = useState<ProductSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const load = () => {
      fetchProducts(filters)
        .then((list) => {
          if (!cancelled) {
            setProducts(list)
            setLoading(false)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setError('Could not load products.')
            setLoading(false)
          }
        })
    }
    const timer = debounceMs > 0 ? setTimeout(load, debounceMs) : undefined
    if (debounceMs <= 0) load()
    return () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [filters, attempt, debounceMs])

  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  return { products, loading, error, retry }
}
