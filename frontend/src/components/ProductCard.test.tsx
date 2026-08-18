import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProductCard } from './ProductCard'
import type { ProductSummary } from '@/api/types'

describe('ProductCard', () => {
  const dummyProduct: ProductSummary = {
    id: 'prod-apple-1',
    name: 'iPhone 16 Pro Max',
    model: 'A3297',
    brand: 'Apple',
    category: { id: 'cat-phone', name: 'Điện thoại' },
    minPriceVnd: '34990000',
    maxPriceVnd: '34990000',
    price: '34990000',
    currency: 'VND',
    primaryImageUrl: 'https://example.com/iphone-16.jpg',
    inStock: true,
  }

  it('renders brand text badge and product details', () => {
    render(
      <MemoryRouter>
        <ProductCard product={dummyProduct} />
      </MemoryRouter>
    )

    expect(screen.getByText('Apple')).toBeInTheDocument()
    expect(screen.getByText('iPhone 16 Pro Max')).toBeInTheDocument()
    expect(screen.getByText('A3297')).toBeInTheDocument()
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('alt', 'Apple iPhone 16 Pro Max A3297')
  })

  it('falls back to default label when brand is empty', () => {
    const productWithoutBrand: ProductSummary = {
      ...dummyProduct,
      brand: '',
    }

    render(
      <MemoryRouter>
        <ProductCard product={productWithoutBrand} />
      </MemoryRouter>
    )

    expect(screen.getByText('Smartphone')).toBeInTheDocument()
  })

  it('renders "Còn hàng" badge when inStock is true', () => {
    render(
      <MemoryRouter>
        <ProductCard product={{ ...dummyProduct, inStock: true }} />
      </MemoryRouter>
    )

    expect(screen.getByText('Còn hàng')).toBeInTheDocument()
  })

  it('renders "Hết hàng" badge when inStock is false', () => {
    render(
      <MemoryRouter>
        <ProductCard product={{ ...dummyProduct, inStock: false }} />
      </MemoryRouter>
    )

    expect(screen.getByText('Hết hàng')).toBeInTheDocument()
  })

  it('renders price range when minPriceVnd and maxPriceVnd differ', () => {
    const multiVariantProduct: ProductSummary = {
      ...dummyProduct,
      minPriceVnd: '25990000',
      maxPriceVnd: '32990000',
      price: '25990000',
    }

    render(
      <MemoryRouter>
        <ProductCard product={multiVariantProduct} />
      </MemoryRouter>
    )

    expect(screen.getByText(/25\.990\.000\s*₫\s*-\s*32\.990\.000\s*₫/)).toBeInTheDocument()
  })
})
