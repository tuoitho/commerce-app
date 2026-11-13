import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LiveCartSheet } from './LiveCartSheet'
import { PinnedProductCard } from './PinnedProductCard'
import { catalogApi } from '@/api/catalog'
import { useCart } from '@/context/CartContext'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/api/client'
import type { LiveProduct } from '@/api/live'
import type { ProductDetail } from '@/api/types'

vi.mock('@/api/catalog', () => ({ catalogApi: { getProduct: vi.fn() } }))
vi.mock('@/context/CartContext', () => ({ useCart: vi.fn() }))
vi.mock('@/context/ToastContext', () => ({ useToast: vi.fn() }))

const PRODUCT = 'p-1'
const V128 = 'v-128'
const V256 = 'v-256'

function liveProduct(overrides: Partial<LiveProduct> = {}): LiveProduct {
  return {
    productId: PRODUCT,
    position: 0,
    name: 'iPhone 16 Pro',
    brand: 'Apple',
    imageUrl: 'https://example.com/a.jpg',
    minPriceVnd: '25990000',
    maxPriceVnd: '32990000',
    regularMinPriceVnd: '28990000',
    regularMaxPriceVnd: '32990000',
    hasLivePrice: true,
    inStock: true,
    livePrices: [{ variantId: V128, optionLabel: '128GB', regularPriceVnd: '28990000', livePriceVnd: '25990000', quota: 10, sold: 3, remaining: 7, active: true }],
    ...overrides,
  }
}

const detail: ProductDetail = {
  id: PRODUCT,
  name: 'iPhone 16 Pro',
  model: 'A3083',
  description: '',
  brand: 'Apple',
  category: { id: 'c', name: 'Apple' },
  minPriceVnd: '28990000',
  maxPriceVnd: '32990000',
  price: '',
  currency: 'VND',
  imageUrls: [],
  stockQuantity: 9,
  inStock: true,
  featured: false,
  optionGroups: [{ id: 'g', label: 'Dung lượng', position: 1, values: [{ id: 'o128', label: '128GB' }, { id: 'o256', label: '256GB' }] }],
  variants: [
    { id: V128, optionValueIds: { g: 'o128' }, priceVnd: '28990000', stockQuantity: 5, active: true, livePriceVnd: '25990000', liveRemaining: 7 },
    { id: V256, optionValueIds: { g: 'o256' }, priceVnd: '32990000', stockQuantity: 4, active: true, livePriceVnd: null, liveRemaining: null },
  ],
  createdAt: '',
  updatedAt: '',
}

const addItem = vi.fn()
const success = vi.fn()

function renderSheet(products: LiveProduct[], focusProductId: string | null = null) {
  return render(
    <MemoryRouter>
      <LiveCartSheet open products={products} focusProductId={focusProductId} onClose={vi.fn()} />
    </MemoryRouter>,
  )
}

describe('LiveCartSheet', () => {
  beforeEach(() => {
    addItem.mockReset()
    success.mockReset()
    vi.mocked(useCart).mockReturnValue({ addItem } as unknown as ReturnType<typeof useCart>)
    vi.mocked(useToast).mockReturnValue({ success, error: vi.fn(), info: vi.fn(), toast: vi.fn() } as unknown as ReturnType<typeof useToast>)
    vi.mocked(catalogApi.getProduct).mockResolvedValue(detail)
  })

  it('lists products with the effective price, the struck regular price and stock state', () => {
    renderSheet([liveProduct(), liveProduct({ productId: 'p-2', name: 'Galaxy S25', hasLivePrice: false, inStock: false, minPriceVnd: '20990000', maxPriceVnd: '20990000', regularMinPriceVnd: '20990000', regularMaxPriceVnd: '20990000', livePrices: [] })])

    const iphone = screen.getByTestId('live-cart-item-p-1')
    expect(within(iphone).getByText('Giá live')).toBeInTheDocument()
    expect(within(iphone).getByText(/25\.990\.000/)).toBeInTheDocument()
    expect(within(iphone).getByText(/28\.990\.000/)).toHaveClass('line-through')
    const name = within(iphone).getByRole('link', { name: 'iPhone 16 Pro' })
    expect(name).toHaveAttribute('href', '/products/p-1')
    expect(name).toHaveAttribute('target', '_blank')

    const galaxy = screen.getByTestId('live-cart-item-p-2')
    expect(within(galaxy).getByText('Hết hàng')).toBeInTheDocument()
    expect(within(galaxy).queryByText('Giá live')).not.toBeInTheDocument()
  })

  it('picks a variant, shows its live price and remaining quota, and adds it to the cart', async () => {
    addItem.mockResolvedValue({})
    renderSheet([liveProduct()])
    fireEvent.click(within(screen.getByTestId('live-cart-item-p-1')).getByRole('button', { name: 'Chọn' }))

    expect(await screen.findByText('Còn 7 suất giá live')).toBeInTheDocument()
    expect(screen.getByTestId('live-variant-price')).toHaveTextContent('25.990.000')

    fireEvent.click(screen.getByRole('button', { name: '256GB' }))
    expect(screen.getByTestId('live-variant-price')).toHaveTextContent('32.990.000')
    expect(screen.queryByText(/suất giá live/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào giỏ' }))
    await waitFor(() => expect(addItem).toHaveBeenCalledWith(V256))
    expect(success).toHaveBeenCalledWith('Đã thêm sản phẩm vào giỏ hàng')
  })

  it.each([
    ['out_of_stock', 'Phân loại sản phẩm đã hết hàng'],
    ['stock_limit', 'Số lượng vượt quá tồn kho'],
    ['cart_item_unavailable', 'Sản phẩm trong giỏ hàng không khả dụng'],
  ])('shows the cart error %s inside the sheet', async (code, message) => {
    addItem.mockRejectedValue(new ApiError(409, { code, message }))
    renderSheet([liveProduct()], PRODUCT)
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm vào giỏ' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })

  it('follows realtime live price changes while open', async () => {
    const { rerender } = renderSheet([liveProduct()], PRODUCT)
    expect(await screen.findByText('Còn 7 suất giá live')).toBeInTheDocument()

    rerender(
      <MemoryRouter>
        <LiveCartSheet
          open
          focusProductId={PRODUCT}
          onClose={vi.fn()}
          products={[liveProduct({ hasLivePrice: false, minPriceVnd: '28990000', livePrices: [{ variantId: V128, optionLabel: '128GB', regularPriceVnd: '28990000', livePriceVnd: '25990000', quota: 10, sold: 10, remaining: 0, active: false }] })]}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('Hết suất giá live')).toBeInTheDocument()
    expect(screen.getByTestId('live-variant-price')).toHaveTextContent('28.990.000')
  })

  it('drops products that disappear from the live cart', () => {
    const { rerender } = renderSheet([liveProduct()])
    rerender(
      <MemoryRouter>
        <LiveCartSheet open products={[]} focusProductId={null} onClose={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.queryByTestId('live-cart-item-p-1')).not.toBeInTheDocument()
    expect(screen.getByText('Chưa có sản phẩm nào trong giỏ hàng live')).toBeInTheDocument()
  })
})

describe('PinnedProductCard', () => {
  it('shows the pinned product and opens it for purchase', () => {
    const onBuy = vi.fn()
    render(<PinnedProductCard product={liveProduct()} onBuy={onBuy} />)
    expect(screen.getByText('iPhone 16 Pro')).toBeInTheDocument()
    expect(screen.getByText('Giá live')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mua ngay' }))
    expect(onBuy).toHaveBeenCalledWith(PRODUCT)
  })

  it('reports an exhausted live quota', () => {
    render(<PinnedProductCard product={liveProduct({ hasLivePrice: false, livePrices: [{ variantId: V128, optionLabel: '128GB', regularPriceVnd: '28990000', livePriceVnd: '25990000', quota: 10, sold: 10, remaining: 0, active: false }] })} onBuy={vi.fn()} />)
    expect(screen.getByText('Hết suất giá live')).toBeInTheDocument()
  })
})
