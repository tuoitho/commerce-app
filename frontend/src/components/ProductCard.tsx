import { Link } from 'react-router-dom'

import type { ProductSummary } from '../api/catalog'
import { formatPrice } from '../catalog/format'
import ProductImage from './ProductImage'

interface ProductCardProps {
  product: ProductSummary
}

export default function ProductCard({ product }: ProductCardProps) {
  const price = product.minPriceVnd === product.maxPriceVnd
    ? formatPrice(product.minPriceVnd)
    : `${formatPrice(product.minPriceVnd)} - ${formatPrice(product.maxPriceVnd)}`

  return (
    <article className="product-card">
      <div className="product-card-media">
        <ProductImage src={product.primaryImageUrl} alt={product.name} className="product-image" />
      </div>
      <div className="product-info">
        <p className="product-category technical-label">{product.brand.name}</p>
        <h2><Link to={`/products/${product.id}`}>{product.name}</Link></h2>
        <p className="product-model technical-label">{product.model}</p>
        <p className="product-price">{price}</p>
        <p className={`product-stock ${product.inStock ? 'stock-in' : 'stock-out'}`}>
          {product.inStock ? 'In stock' : 'Out of stock'}
        </p>
        <Link to={`/products/${product.id}`} className="product-card-action secondary-action">
          View options for {product.name}
        </Link>
      </div>
    </article>
  )
}
