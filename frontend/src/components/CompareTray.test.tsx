import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CompareProvider, COMPARE_STORAGE_KEY } from '@/context/CompareContext'
import { ToastProvider } from '@/context/ToastContext'
import { CompareTray } from './CompareTray'
import { ProductCard } from './ProductCard'
import type { ProductSummary } from '@/api/types'
import { useAuth } from '@/context/AuthContext'
import { useFavorites } from '@/context/FavoritesContext'

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/context/FavoritesContext', () => ({
  useFavorites: vi.fn(),
}))

function makeProduct(index: number): ProductSummary {
  return {
    id: `prod-${index}`,
    name: `Smartphone ${index}`,
    model: `M${index}`,
    brand: 'Apple',
    category: { id: 'cat-phone', name: 'Điện thoại' },
    minPriceVnd: `${20000000 + index * 1000000}`,
    maxPriceVnd: `${20000000 + index * 1000000}`,
    price: `${20000000 + index * 1000000}`,
    currency: 'VND',
    primaryImageUrl: `https://example.com/p${index}.jpg`,
    inStock: true,
    averageRating: 4.8,
    reviewCount: 10,
    soldCount: 5,
  }
}

describe('CompareTray & ProductCard compare toggle (Req 5.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })
    vi.mocked(useFavorites).mockReturnValue({
      items: [],
      favoriteIds: new Set<string>(),
      isLoading: false,
      loadError: null,
      isPending: () => false,
      refresh: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
      toggle: vi.fn(),
    })
  })

  it('does not render CompareTray when no products are selected', () => {
    render(
      <ToastProvider>
        <CompareProvider>
          <MemoryRouter>
            <CompareTray />
          </MemoryRouter>
        </CompareProvider>
      </ToastProvider>
    )

    expect(screen.queryByRole('region', { name: /so sánh sản phẩm/i })).not.toBeInTheDocument()
  })

  it('adds products via ProductCard So sánh button, disables CTA with 1 item, enables link with 2-3 items, and blocks 4th item with Vietnamese warning', () => {
    const products = [makeProduct(1), makeProduct(2), makeProduct(3), makeProduct(4)]

    render(
      <ToastProvider>
        <CompareProvider>
          <MemoryRouter>
            <div>
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
            <CompareTray />
          </MemoryRouter>
        </CompareProvider>
      </ToastProvider>
    )

    // Add 1st item
    fireEvent.click(screen.getByRole('button', { name: /Thêm Smartphone 1 vào so sánh/i }))
    const tray = screen.getByRole('region', { name: /so sánh sản phẩm/i })
    expect(tray).toBeInTheDocument()

    // With 1 item, "So sánh ngay" is disabled
    const disabledCompareBtn = screen.getByRole('button', { name: /So sánh ngay/i })
    expect(disabledCompareBtn).toBeDisabled()

    // Add 2nd item -> "So sánh ngay" becomes an active link to /compare?ids=prod-1,prod-2
    fireEvent.click(screen.getByRole('button', { name: /Thêm Smartphone 2 vào so sánh/i }))
    const compareLink2 = screen.getByRole('link', { name: /So sánh ngay/i })
    expect(compareLink2).toHaveAttribute('href', '/compare?ids=prod-1,prod-2')

    // Add 3rd item
    fireEvent.click(screen.getByRole('button', { name: /Thêm Smartphone 3 vào so sánh/i }))
    const compareLink3 = screen.getByRole('link', { name: /So sánh ngay/i })
    expect(compareLink3).toHaveAttribute('href', '/compare?ids=prod-1,prod-2,prod-3')

    // Attempt to add 4th distinct product -> kept at 3, warning displayed
    fireEvent.click(screen.getByRole('button', { name: /Thêm Smartphone 4 vào so sánh/i }))
    expect(screen.getAllByText(/tối đa 3/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('link', { name: /So sánh ngay/i })).toHaveAttribute(
      'href',
      '/compare?ids=prod-1,prod-2,prod-3'
    )
    expect(JSON.parse(window.sessionStorage.getItem(COMPARE_STORAGE_KEY) || '[]')).toHaveLength(3)
  })

  it('removes a single product or clears all products from CompareTray', () => {
    const p1 = makeProduct(1)
    const p2 = makeProduct(2)
    window.sessionStorage.setItem(
      COMPARE_STORAGE_KEY,
      JSON.stringify([
        {
          id: p1.id,
          name: p1.name,
          brand: p1.brand,
          primaryImageUrl: p1.primaryImageUrl,
          minPriceVnd: p1.minPriceVnd,
        },
        {
          id: p2.id,
          name: p2.name,
          brand: p2.brand,
          primaryImageUrl: p2.primaryImageUrl,
          minPriceVnd: p2.minPriceVnd,
        },
      ])
    )

    render(
      <ToastProvider>
        <CompareProvider>
          <MemoryRouter>
            <CompareTray />
          </MemoryRouter>
        </CompareProvider>
      </ToastProvider>
    )

    expect(screen.getByText('Smartphone 1')).toBeInTheDocument()
    expect(screen.getByText('Smartphone 2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Xóa Smartphone 1 khỏi so sánh/i }))
    expect(screen.queryByText('Smartphone 1')).not.toBeInTheDocument()
    expect(screen.getByText('Smartphone 2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Xóa tất cả/i }))
    expect(screen.queryByRole('region', { name: /so sánh sản phẩm/i })).not.toBeInTheDocument()
  })

  it('uses solid bg-white surface without glassmorphism blur', () => {
    window.sessionStorage.setItem(
      COMPARE_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'prod-1',
          name: 'Smartphone 1',
          brand: 'Apple',
          primaryImageUrl: '',
          minPriceVnd: '20000000',
        },
      ])
    )

    render(
      <ToastProvider>
        <CompareProvider>
          <MemoryRouter>
            <CompareTray />
          </MemoryRouter>
        </CompareProvider>
      </ToastProvider>
    )

    const tray = screen.getByRole('region', { name: /so sánh sản phẩm/i })
    expect(tray.className).toContain('bg-white')
    expect(tray.className).not.toContain('bg-white/95')
    expect(tray.className).not.toContain('backdrop-blur-md')
  })
})
