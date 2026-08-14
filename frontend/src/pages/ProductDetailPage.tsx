import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'

import { fetchProduct, type ProductDetail } from '../api/catalog'
import { ApiError } from '../api/client'
import { formatPrice } from '../catalog/format'
import ProductImage from '../components/ProductImage'
import VariantSelector from '../components/VariantSelector'
import { findMatchingVariant, parseVariantSelection, serializeVariantSelection, type VariantSelection } from '../components/variantSelection'
import { useAuth } from '../auth/AuthProvider'
import { useCart } from '../cart/CartProvider'

export default function ProductDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { addVariant } = useCart()
  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [selection, setSelection] = useState<VariantSelection>({})
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [failed, setFailed] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

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

  useEffect(() => {
    if (product) setSelection(parseVariantSelection(location.search, product.optionGroups))
  }, [location.search, product])

  if (loading) return <main className="catalog-page"><p className="catalog-status">Loading product...</p></main>
  if (failed) {
    return <main className="catalog-page"><h1>{notFound ? 'Product not found' : 'Something went wrong'}</h1><p>{notFound ? 'The product you are looking for does not exist.' : 'Could not load this product.'}</p><Link to="/products">Back to catalog</Link></main>
  }
  if (!product) return null

  const selectedVariant = findMatchingVariant(product.variants, selection)
  const missingGroupLabels = product.optionGroups.filter((group) => !selection[group.id]).map((group) => group.label)
  const hasMissingGroups = missingGroupLabels.length > 0
  const hasInvalidCombination = product.optionGroups.length > 0 && !hasMissingGroups && !selectedVariant
  const productInStock = product.variants.some((variant) => variant.stockQuantity > 0n)
  const price = selectedVariant?.priceVnd ?? product.minPriceVnd
  const priceLabel = selectedVariant ? formatPrice(price) : `${formatPrice(price)}${price !== product.maxPriceVnd ? ` - ${formatPrice(product.maxPriceVnd)}` : ''}`

  function handleSelectionChange(groupId: string, valueId: string) {
    const next = { ...selection }
    if (valueId) next[groupId] = valueId
    else delete next[groupId]
    setSelection(next)
    const query = serializeVariantSelection(next, product!.optionGroups).toString()
    navigate({ search: query ? `?${query}` : '' }, { replace: true })
    setFeedback(null)
  }

  async function handleAdd() {
    if (!selectedVariant || selectedVariant.stockQuantity <= 0n) return
    if (authLoading || !user) {
      navigate('/login', { state: { from: location } })
      return
    }
    setFeedback(null)
    try {
      const confirmed = await addVariant(selectedVariant.id)
      setFeedback(confirmed ? { type: 'success', message: 'Added to cart.' } : { type: 'error', message: 'Could not add this variant to cart.' })
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof ApiError ? error.detail.message : 'Could not add this variant to cart.' })
    }
  }

  return (
    <main className="catalog-page product-detail">
      <Link to="/products" className="back-link">Back to catalog</Link>
      <div className="detail-layout">
        <div className="detail-images">
          <ProductImage src={product.imageUrls[0] ?? ''} alt={product.name} className="detail-image" />
        </div>
        <div className="detail-info">
           <p className="product-category">{product.brand.name} {product.model}</p>
          <h1>{product.name}</h1>
           <p className="product-price">{priceLabel}</p>
            <p className={selectedVariant && selectedVariant.stockQuantity > 0n || productInStock ? 'stock-in' : 'stock-out'}>{selectedVariant ? (selectedVariant.stockQuantity > 0n ? `${selectedVariant.stockQuantity} in stock` : 'Out of stock') : (productInStock ? 'In stock' : 'Out of stock')}</p>
           <p className="product-description">{product.description}</p>
           {product.optionGroups.length > 0 && <VariantSelector optionGroups={product.optionGroups} variants={product.variants} selection={selection} onChange={handleSelectionChange} />}
           {hasMissingGroups && <p role="status">Select {missingGroupLabels.join(' and ')}.</p>}
           {hasInvalidCombination && <p role="alert">This combination is not available.</p>}
            {selectedVariant && selectedVariant.stockQuantity <= 0n && <p role="alert">This variant is out of stock.</p>}
           {feedback && <p role={feedback.type === 'error' ? 'alert' : 'status'} aria-live="polite">{feedback.message}</p>}
            {selectedVariant && <button type="button" onClick={() => void handleAdd()} disabled={authLoading || selectedVariant.stockQuantity <= 0n}>Add to cart</button>}
         </div>
      </div>
    </main>
  )
}
