import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type { ProductSummary } from '../api/catalog'
import ProductCard from './ProductCard'

const product: ProductSummary = {
  id: 'p1',
  name: 'iPhone 16 Pro',
  model: 'A3294',
  brand: { id: 'apple', name: 'Apple' },
  minPriceVnd: '28990000',
  maxPriceVnd: '40990000',
  primaryImageUrl: 'https://example.com/phone.jpg',
  inStock: true,
}

function renderCard(value = product) {
  return render(
    <MemoryRouter>
      <ProductCard product={value} />
    </MemoryRouter>,
  )
}

describe('ProductCard', () => {
  it('shows product identity, image, VND range, stock and detail action', () => {
    renderCard()

    expect(screen.getByText('Apple')).toBeInTheDocument()
    expect(screen.getByText('iPhone 16 Pro')).toBeInTheDocument()
    expect(screen.getByText('A3294')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'iPhone 16 Pro' })).toHaveAttribute('src', product.primaryImageUrl)
    expect(screen.getByText(/28\.990\.000/)).toBeInTheDocument()
    expect(screen.getByText(/40\.990\.000/)).toBeInTheDocument()
    expect(screen.getByText('In stock')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view options for iphone 16 pro/i })).toHaveAttribute('href', '/products/p1')
  })

  it('shows an accessible fallback when the product image fails', () => {
    renderCard()

    fireEvent.error(screen.getByRole('img', { name: 'iPhone 16 Pro' }))

    expect(screen.getByRole('img', { name: 'iPhone 16 Pro' })).toHaveTextContent('No image')
  })

  it('shows a single price and out-of-stock status when applicable', () => {
    renderCard({ ...product, maxPriceVnd: product.minPriceVnd, inStock: false })

    expect(screen.getByText(/28\.990\.000/)).toBeInTheDocument()
    expect(screen.queryByText(/40\.990\.000/)).not.toBeInTheDocument()
    expect(screen.getByText('Out of stock')).toBeInTheDocument()
  })
})
