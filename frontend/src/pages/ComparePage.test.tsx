import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { ComparePage } from './ComparePage'
import { catalogApi } from '@/api/catalog'
import type { ProductDetail } from '@/api/types'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { ToastProvider } from '@/context/ToastContext'
import { CompareProvider, COMPARE_STORAGE_KEY } from '@/context/CompareContext'

vi.mock('@/api/catalog', () => ({
  catalogApi: {
    getProduct: vi.fn(),
  },
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/context/CartContext', () => ({
  useCart: vi.fn(),
}))

const productOne: ProductDetail = {
  id: 'p-1',
  name: 'iPhone 16 Pro',
  model: 'A3294',
  description: 'Apple flagship',
  brand: 'Apple',
  category: { id: 'cat-1', name: 'Điện thoại' },
  minPriceVnd: '28990000',
  maxPriceVnd: '31990000',
  price: '28990000',
  currency: 'VND',
  imageUrls: ['https://example.com/p1.jpg'],
  stockQuantity: 10,
  inStock: true,
  featured: true,
  averageRating: 4.9,
  reviewCount: 24,
  soldCount: 80,
  optionGroups: [
    {
      id: 'g-storage',
      label: 'Dung lượng',
      position: 1,
      values: [
        { id: 'v-128', label: '128GB' },
        { id: 'v-256', label: '256GB' },
      ],
    },
  ],
  variants: [
    {
      id: 'var-p1-128',
      optionValueIds: { 'g-storage': 'v-128' },
      priceVnd: '28990000',
      stockQuantity: 5,
      active: true,
      flashSale: {
        flashSaleId: 'fs-1',
        campaignName: 'Flash Sale Trưa',
        flashPriceVnd: '25990000',
        quota: 20,
        soldQuantity: 5,
        endsAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      },
    },
    {
      id: 'var-p1-256',
      optionValueIds: { 'g-storage': 'v-256' },
      priceVnd: '31990000',
      stockQuantity: 0,
      active: true,
    },
  ],
  specs: [
    {
      group: 'Màn hình',
      items: [
        { label: 'Kích thước', value: '6.3 inch OLED' },
        { label: 'Tần số quét', value: '120Hz' },
      ],
    },
    {
      group: 'Thiết kế & Độ bền',
      items: [
        { label: 'Kháng nước', value: '  IP68 ' },
        { label: 'Trọng lượng', value: '199 g' },
      ],
    },
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const productTwo: ProductDetail = {
  id: 'p-2',
  name: 'Xiaomi 15',
  model: 'X15',
  description: 'Xiaomi flagship',
  brand: 'Xiaomi',
  category: { id: 'cat-1', name: 'Điện thoại' },
  minPriceVnd: '21990000',
  maxPriceVnd: '24990000',
  price: '21990000',
  currency: 'VND',
  imageUrls: ['https://example.com/p2.jpg'],
  stockQuantity: 12,
  inStock: true,
  featured: false,
  averageRating: 4.7,
  reviewCount: 15,
  soldCount: 40,
  optionGroups: [
    {
      id: 'g-storage',
      label: 'Dung lượng',
      position: 1,
      values: [
        { id: 'v-256', label: '256GB' },
        { id: 'v-512', label: '512GB' },
      ],
    },
  ],
  variants: [
    {
      id: 'var-p2-256',
      optionValueIds: { 'g-storage': 'v-256' },
      priceVnd: '21990000',
      stockQuantity: 7,
      active: true,
    },
    {
      id: 'var-p2-512',
      optionValueIds: { 'g-storage': 'v-512' },
      priceVnd: '24990000',
      stockQuantity: 5,
      active: true,
    },
  ],
  specs: [
    {
      group: 'Màn hình',
      items: [
        { label: 'Kích thước', value: '6.36 inch AMOLED' },
        { label: 'Tần số quét', value: '120Hz' },
      ],
    },
    {
      group: 'Thiết kế & Độ bền',
      items: [{ label: 'Kháng nước', value: 'ip68' }],
    },
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

describe('ComparePage (Req 5.5, 5.6)', () => {
  const mockAddItem = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com' },
      accessToken: 'token-123',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })
    vi.mocked(useCart).mockReturnValue({
      cart: null,
      isLoading: false,
      badgeCount: 0,
      refreshCart: vi.fn(),
      addItem: mockAddItem.mockResolvedValue(undefined),
      updateQuantity: vi.fn(),
      toggleSelect: vi.fn(),
      toggleSelectAll: vi.fn(),
      removeItem: vi.fn(),
    })
  })

  it('shows clear Vietnamese empty state when fewer than 2 product IDs are provided', async () => {
    render(
      <ToastProvider>
        <CompareProvider>
          <MemoryRouter initialEntries={['/compare?ids=p-1']}>
            <Routes>
              <Route path="/compare" element={<ComparePage />} />
            </Routes>
          </MemoryRouter>
        </CompareProvider>
      </ToastProvider>
    )

    expect(await screen.findByText(/Chưa đủ sản phẩm để so sánh/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Chọn điện thoại/i })).toHaveAttribute('href', '/products')
    expect(catalogApi.getProduct).not.toHaveBeenCalled()
  })

  it('loads products from URL ?ids=..., switches per-column variant updating effective price/stock & Thêm vào giỏ', async () => {
    vi.mocked(catalogApi.getProduct).mockImplementation(async (id) => {
      if (id === 'p-1') return productOne
      if (id === 'p-2') return productTwo
      throw new Error('Not found')
    })

    render(
      <ToastProvider>
        <CompareProvider>
          <MemoryRouter initialEntries={['/compare?ids=p-1,p-2']}>
            <Routes>
              <Route path="/compare" element={<ComparePage />} />
            </Routes>
          </MemoryRouter>
        </CompareProvider>
      </ToastProvider>
    )

    expect(await screen.findByRole('heading', { name: 'iPhone 16 Pro' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Xiaomi 15' })).toBeInTheDocument()

    // Initial variant of p-1 is var-p1-128 with active flashSale 25.990.000
    expect(screen.getByText(/25\.990\.000\s*₫/)).toBeInTheDocument()

    // Switch p-1 variant to var-p1-256 (31.990.000, stock 0 -> Hết hàng)
    const p1Select = screen.getByLabelText(/Phiên bản iPhone 16 Pro/i)
    fireEvent.change(p1Select, { target: { value: 'var-p1-256' } })

    await waitFor(() => {
      expect(screen.getByText(/31\.990\.000\s*₫/)).toBeInTheDocument()
      expect(screen.getByText('Hết hàng')).toBeInTheDocument()
    })

    // Switch p-2 variant to var-p2-512 (24.990.000) and click Thêm vào giỏ
    const p2Select = screen.getByLabelText(/Phiên bản Xiaomi 15/i)
    fireEvent.change(p2Select, { target: { value: 'var-p2-512' } })

    await waitFor(() => {
      expect(screen.getByText(/24\.990\.000\s*₫/)).toBeInTheDocument()
    })

    const addButtons = screen.getAllByRole('button', { name: /Thêm vào giỏ/i })
    expect(addButtons[0]).toBeDisabled() // p-1 var-p1-256 is out of stock
    expect(addButtons[1]).not.toBeDisabled()

    fireEvent.click(addButtons[1])
    await waitFor(() => {
      expect(mockAddItem).toHaveBeenCalledWith('var-p2-512')
    })
  })

  it('aligns structured specs with "—" fallback and filters identical normalized values when "Chỉ hiện điểm khác biệt" is toggled', async () => {
    vi.mocked(catalogApi.getProduct).mockImplementation(async (id) => {
      if (id === 'p-1') return productOne
      if (id === 'p-2') return productTwo
      throw new Error('Not found')
    })

    // Also verify fallback to CompareContext when ?ids is omitted
    window.sessionStorage.setItem(
      COMPARE_STORAGE_KEY,
      JSON.stringify([
        { id: 'p-1', name: 'iPhone 16 Pro', brand: 'Apple', primaryImageUrl: '', minPriceVnd: '28990000' },
        { id: 'p-2', name: 'Xiaomi 15', brand: 'Xiaomi', primaryImageUrl: '', minPriceVnd: '21990000' },
      ])
    )

    render(
      <ToastProvider>
        <CompareProvider>
          <MemoryRouter initialEntries={['/compare']}>
            <Routes>
              <Route path="/compare" element={<ComparePage />} />
            </Routes>
          </MemoryRouter>
        </CompareProvider>
      </ToastProvider>
    )

    expect(await screen.findByText('6.3 inch OLED')).toBeInTheDocument()
    expect(screen.getByText('6.36 inch AMOLED')).toBeInTheDocument()
    expect(screen.getByText('Tần số quét')).toBeInTheDocument()
    expect(screen.getByText('Kháng nước')).toBeInTheDocument()
    // Xiaomi 15 lacks "Trọng lượng" -> shows "—"
    expect(screen.getByText('Trọng lượng')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()

    // Toggle "Chỉ hiện điểm khác biệt" ON
    const diffToggle = screen.getByRole('checkbox', { name: /Chỉ hiện điểm khác biệt/i })
    fireEvent.click(diffToggle)

    // Identical rows ("Tần số quét": 120Hz vs 120Hz, "Kháng nước": "  IP68 " vs "ip68") are hidden
    expect(screen.queryByText('Tần số quét')).not.toBeInTheDocument()
    expect(screen.queryByText('Kháng nước')).not.toBeInTheDocument()

    // Different rows ("Kích thước", "Trọng lượng") remain visible
    expect(screen.getByText('Kích thước')).toBeInTheDocument()
    expect(screen.getByText('Trọng lượng')).toBeInTheDocument()

    // Toggle OFF restores identical rows
    fireEvent.click(diffToggle)
    expect(screen.getByText('Tần số quét')).toBeInTheDocument()
    expect(screen.getByText('Kháng nước')).toBeInTheDocument()
  })

  it('shows error state and retries loading when catalogApi.getProduct fails', async () => {
    vi.mocked(catalogApi.getProduct)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockImplementation(async (id) => (id === 'p-1' ? productOne : productTwo))

    render(
      <ToastProvider>
        <CompareProvider>
          <MemoryRouter initialEntries={['/compare?ids=p-1,p-2']}>
            <Routes>
              <Route path="/compare" element={<ComparePage />} />
            </Routes>
          </MemoryRouter>
        </CompareProvider>
      </ToastProvider>
    )

    expect(await screen.findByText(/Không thể tải bảng so sánh/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Thử lại/i }))

    expect(await screen.findByRole('heading', { name: 'iPhone 16 Pro' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Xiaomi 15' })).toBeInTheDocument()
  })

  it('applies PD-4 effective price rule (lower of live vs flash sale, tie to live) and removes columns', async () => {
    const pd4Product: ProductDetail = {
      ...productOne,
      variants: [
        {
          id: 'var-p1-128',
          optionValueIds: { 'g-storage': 'v-128' },
          priceVnd: '28990000',
          stockQuantity: 5,
          active: true,
          livePriceVnd: '24990000',
          liveRemaining: 2,
          flashSale: {
            flashSaleId: 'fs-1',
            campaignName: 'Flash Sale',
            flashPriceVnd: '24990000',
            quota: 10,
            soldQuantity: 1,
            endsAt: new Date(Date.now() + 3600 * 1000).toISOString(),
          },
        },
      ],
      specs: [{ group: 'Màn hình', items: [{ label: 'Tần số quét', value: '120Hz' }] }],
    }
    const sameSpecProductTwo: ProductDetail = {
      ...productTwo,
      specs: [{ group: 'Màn hình', items: [{ label: 'Tần số quét', value: '120Hz' }] }],
    }

    vi.mocked(catalogApi.getProduct).mockImplementation(async (id) => {
      if (id === 'p-1') return pd4Product
      return sameSpecProductTwo
    })

    render(
      <ToastProvider>
        <CompareProvider>
          <MemoryRouter initialEntries={['/compare?ids=p-1,p-2']}>
            <Routes>
              <Route path="/compare" element={<ComparePage />} />
            </Routes>
          </MemoryRouter>
        </CompareProvider>
      </ToastProvider>
    )

    // Tie at 24.990.000 goes to Giá live
    expect(await screen.findByText('Giá live')).toBeInTheDocument()
    expect(screen.getByText(/24\.990\.000\s*₫/)).toBeInTheDocument()

    // All specs identical -> toggling "Chỉ hiện điểm khác biệt" shows clear empty-diff message
    fireEvent.click(screen.getByRole('checkbox', { name: /Chỉ hiện điểm khác biệt/i }))
    expect(
      screen.getByText(/Tất cả thông số kỹ thuật của các sản phẩm đang so sánh đều giống nhau/i)
    ).toBeInTheDocument()

    // Removing one product leaves < 2 -> switches to empty state
    fireEvent.click(screen.getByRole('button', { name: /Bỏ iPhone 16 Pro khỏi so sánh/i }))
    expect(await screen.findByText(/Chưa đủ sản phẩm để so sánh/i)).toBeInTheDocument()
  })

  it('ignores stale async fetch responses when ids change while previous request is in flight', async () => {
    let resolveSlowOne!: (val: ProductDetail) => void
    const slowOnePromise = new Promise<ProductDetail>((resolve) => {
      resolveSlowOne = resolve
    })

    const productThree: ProductDetail = {
      ...productTwo,
      id: 'p-3',
      name: 'Galaxy S25 Ultra',
      brand: 'Samsung',
    }

    vi.mocked(catalogApi.getProduct).mockImplementation((id) => {
      if (id === 'p-1') return slowOnePromise
      if (id === 'p-2') return Promise.resolve(productTwo)
      return Promise.resolve(productThree)
    })

    function CompareNavHarness() {
      const navigate = useNavigate()
      return (
        <>
          <button
            type="button"
            onClick={() => navigate('/compare?ids=p-2,p-3')}
          >
            Switch Compare
          </button>
          <ComparePage />
        </>
      )
    }

    render(
      <ToastProvider>
        <CompareProvider>
          <MemoryRouter initialEntries={['/compare?ids=p-1,p-2']}>
            <Routes>
              <Route path="/compare" element={<CompareNavHarness />} />
            </Routes>
          </MemoryRouter>
        </CompareProvider>
      </ToastProvider>
    )

    // Initial request for p-1, p-2 is waiting on p-1
    await waitFor(() => {
      expect(catalogApi.getProduct).toHaveBeenCalledWith('p-1')
    })

    // While p-1 is still pending, change ids to p-2,p-3
    fireEvent.click(screen.getByRole('button', { name: 'Switch Compare' }))

    // New request for p-2, p-3 resolves and renders Xiaomi 15 and Galaxy S25 Ultra
    expect(await screen.findByRole('heading', { name: 'Galaxy S25 Ultra' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Xiaomi 15' })).toBeInTheDocument()

    // Now the stale p-1 request resolves — it must be ignored and not replace Galaxy S25 Ultra with iPhone 16 Pro
    resolveSlowOne(productOne)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Galaxy S25 Ultra' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('heading', { name: 'iPhone 16 Pro' })).not.toBeInTheDocument()
  })
})
