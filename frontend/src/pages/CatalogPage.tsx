import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { fetchCategories, type Category } from '../api/catalog'
import { useCatalogProducts } from '../catalog/useCatalogProducts'
import { formatPrice } from '../catalog/format'
import ProductImage from '../components/ProductImage'

export default function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [categories, setCategories] = useState<Category[]>([])
  const filters = useMemo(() => ({
    q: searchParams.get('q')?.trim() || undefined,
    categoryId: searchParams.get('category_id') || undefined,
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

  const hasFilters = Boolean(filters.q || filters.categoryId || filters.minPrice || filters.maxPrice || filters.inStock !== undefined)

  return (
    <main className="catalog-page">
      <h1>Catalog</h1>
      <div className="catalog-filters">
        <label>Search
          <input type="search" placeholder="Search products..." value={searchParams.get('q') ?? ''} onChange={(event) => updateParam('q', event.target.value)} />
        </label>
        <label>Category
          <select value={searchParams.get('category_id') ?? ''} onChange={(event) => updateParam('category_id', event.target.value)}>
            <option value="">All categories</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <label>Min price
          <input inputMode="decimal" value={searchParams.get('min_price') ?? ''} onChange={(event) => updateParam('min_price', event.target.value)} />
        </label>
        <label>Max price
          <input inputMode="decimal" value={searchParams.get('max_price') ?? ''} onChange={(event) => updateParam('max_price', event.target.value)} />
        </label>
        <label className="stock-check"><input type="checkbox" checked={filters.inStock === true} onChange={(event) => updateParam('in_stock', event.target.checked ? 'true' : '')} /> In stock only</label>
        <button type="button" onClick={() => setSearchParams(new URLSearchParams(), { replace: true })} disabled={!hasFilters}>Reset filters</button>
      </div>

      {error && <div className="catalog-status error" role="alert"><p>{error}</p><button type="button" onClick={retry}>Try again</button></div>}
      {loading && !error && <p className="catalog-status">Loading products...</p>}
      {!loading && !error && products.length === 0 && <p className="catalog-status">No products match your criteria.</p>}
      {!loading && !error && products.length > 0 && (
        <ul className="product-grid">
          {products.map((product) => (
            <li key={product.id}>
              <Link to={`/products/${product.id}`} className="product-card">
                <ProductImage src={product.primaryImageUrl} alt={product.name} className="product-image" />
                <div className="product-info">
                  <p className="product-category">{product.category.name}</p>
                  <h2>{product.name}</h2>
                  <p className="product-price">{formatPrice(product.price, product.currency)}</p>
                  <p className={product.inStock ? 'stock-in' : 'stock-out'}>{product.inStock ? 'In stock' : 'Out of stock'}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
