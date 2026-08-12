import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { fetchProduct, type ProductDetail } from '../api/catalog'
import { ApiError } from '../api/client'
import { formatPrice } from '../catalog/format'
import ProductImage from '../components/ProductImage'

export default function ProductDetailPage() {
  const { id } = useParams()
  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!id) {
      setLoading(false)
      setFailed(true)
      return
    }
    let cancelled = false
    setLoading(true)
    setFailed(false)
    setNotFound(false)
    fetchProduct(id).then((value) => {
      if (!cancelled) {
        setProduct(value)
        setLoading(false)
      }
    }).catch((error: unknown) => {
      if (cancelled) return
      setNotFound(error instanceof ApiError && (error.status === 404 || error.detail.code === 'product_not_found'))
      setFailed(true)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [id])

  if (loading) return <main className="catalog-page"><p className="catalog-status">Loading product...</p></main>
  if (failed) {
    return <main className="catalog-page"><h1>{notFound ? 'Product not found' : 'Something went wrong'}</h1><p>{notFound ? 'The product you are looking for does not exist.' : 'Could not load this product.'}</p><Link to="/products">Back to catalog</Link></main>
  }
  if (!product) return null

  return (
    <main className="catalog-page product-detail">
      <Link to="/products" className="back-link">Back to catalog</Link>
      <div className="detail-layout">
        <div className="detail-images">
          <ProductImage src={product.imageUrls[0] ?? ''} alt={product.name} className="detail-image" />
        </div>
        <div className="detail-info">
          <p className="product-category">{product.category.name}</p>
          <h1>{product.name}</h1>
          <p className="product-price">{formatPrice(product.price, product.currency)}</p>
          <p className={product.inStock ? 'stock-in' : 'stock-out'}>{product.inStock ? `In stock (${product.stockQuantity})` : 'Out of stock'}</p>
          <p className="product-description">{product.description}</p>
        </div>
      </div>
    </main>
  )
}
