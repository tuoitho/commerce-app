import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { fetchCategories, type Brand } from '../api/catalog'
import { useCatalogProducts } from '../catalog/useCatalogProducts'
import ProductCard from '../components/ProductCard'

export default function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [categories, setCategories] = useState<Brand[]>([])
  const filters = useMemo(() => ({
    q: searchParams.get('q')?.trim() || undefined,
    categoryIds: searchParams.getAll('category_id'),
    minPrice: searchParams.get('min_price') || undefined,
    maxPrice: searchParams.get('max_price') || undefined,
    inStock: searchParams.get('in_stock') === 'true' ? true : searchParams.get('in_stock') === 'false' ? false : undefined,
  }), [searchParams])
  const { products, loading, error, retry } = useCatalogProducts(filters)

  useEffect(() => {
    let cancelled = false
    fetchCategories().then((items) => {
      if (!cancelled) setCategories(items)
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  function toggleCategory(categoryId: string, checked: boolean) {
    const next = new URLSearchParams(searchParams)
    const selected = next.getAll('category_id').filter((id) => id !== categoryId)
    if (checked) selected.push(categoryId)
    next.delete('category_id')
    for (const id of selected) next.append('category_id', id)
    setSearchParams(next, { replace: true })
  }

  const hasFilters = Boolean(filters.q || filters.categoryIds?.length || filters.minPrice || filters.maxPrice || filters.inStock !== undefined)

  return (
    <main className="catalog-page">
      <h1>Catalog</h1>
      <div className="catalog-filters">
        <label>Search
          <input type="search" placeholder="Search products..." value={searchParams.get('q') ?? ''} onChange={(event) => updateParam('q', event.target.value)} />
        </label>
        <fieldset>
          <legend>Brands</legend>
          {categories.map((category) => (
            <label key={category.id}>
              <input
                type="checkbox"
                checked={filters.categoryIds?.includes(category.id) ?? false}
                onChange={(event) => toggleCategory(category.id, event.target.checked)}
              />
              {category.name}
            </label>
          ))}
        </fieldset>
        <label>Min price
          <input inputMode="decimal" value={searchParams.get('min_price') ?? ''} onChange={(event) => updateParam('min_price', event.target.value)} />
        </label>
        <label>Max price
          <input inputMode="decimal" value={searchParams.get('max_price') ?? ''} onChange={(event) => updateParam('max_price', event.target.value)} />
        </label>
        <fieldset>
          <legend>Stock status</legend>
          <label>
            <input
              type="radio"
              name="stock-status"
              checked={filters.inStock === undefined}
              onChange={() => updateParam('in_stock', '')}
            />
            Any stock status
          </label>
          <label>
            <input
              type="radio"
              name="stock-status"
              checked={filters.inStock === true}
              onChange={() => updateParam('in_stock', 'true')}
            />
            In stock
          </label>
          <label>
            <input
              type="radio"
              name="stock-status"
              checked={filters.inStock === false}
              onChange={() => updateParam('in_stock', 'false')}
            />
            Out of stock
          </label>
        </fieldset>
        <button type="button" onClick={() => setSearchParams(new URLSearchParams(), { replace: true })} disabled={!hasFilters}>Reset filters</button>
      </div>

      {error && <div className="catalog-status error" role="alert"><p>{error}</p><button type="button" onClick={retry}>Try again</button></div>}
      {loading && !error && <p className="catalog-status" role="status" aria-live="polite">Loading products...</p>}
      {!loading && !error && <p className="catalog-result-count" role="status">{products.length} results</p>}
      {!loading && !error && products.length === 0 && <p className="catalog-status">No products match your criteria.</p>}
      {!loading && !error && products.length > 0 && (
        <ul className="product-grid">
          {products.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
