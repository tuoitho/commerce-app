import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { fetchFeaturedProducts, type ProductSummary } from '../api/catalog'
import ProductCard from '../components/ProductCard'

export default function HomePage() {
  const [products, setProducts] = useState<ProductSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    fetchFeaturedProducts().then((items) => {
      if (!cancelled) {
        setProducts(items)
        setLoading(false)
      }
    }).catch(() => {
      if (!cancelled) {
        setError(true)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [attempt])

  return (
    <main className="home-page">
      <section className="home-hero" aria-labelledby="home-heading">
        <p className="eyebrow">Your next phone starts here</p>
        <h1 id="home-heading">Home</h1>
        <p className="hero-title">Phone store, made simple</p>
        <p>Find a phone that fits your everyday life, with clear prices and flexible options.</p>
        <Link to="/products" className="hero-cta">Explore phones</Link>
      </section>

      <section className="featured-section" aria-labelledby="featured-heading">
        <div className="section-heading">
          <p className="eyebrow">Curated for you</p>
          <h2 id="featured-heading">Featured phones</h2>
        </div>

        {loading && <p className="catalog-status" role="status" aria-live="polite">Loading featured phones...</p>}
        {error && !loading && (
          <div className="catalog-status error" role="alert" aria-live="assertive">
            <p>Could not load featured phones.</p>
            <button type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
          </div>
        )}
        {!loading && !error && products.length === 0 && (
          <div className="catalog-status">
            <p>No featured phones are available right now.</p>
            <Link to="/products">Browse all phones</Link>
          </div>
        )}
        {!loading && !error && products.length > 0 && (
          <ul className="product-grid">
            {products.map((product) => <li key={product.id}><ProductCard product={product} /></li>)}
          </ul>
        )}
      </section>
    </main>
  )
}
