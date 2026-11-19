import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { CheckoutPage } from './CheckoutPage'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { ToastProvider } from '@/context/ToastContext'
import { addressesApi } from '@/api/addresses'
import { areasApi } from '@/api/areas'
import { ordersApi } from '@/api/orders'
import { vouchersApi } from '@/api/vouchers'
import {
  ApiError,
  type Address,
  type Province,
  type Ward,
  type Order,
  type AvailableVoucher,
  type CheckoutQuote,
} from '@/api/types'

// Mock context hooks
vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/context/CartContext', () => ({
  useCart: vi.fn(),
}))

// Mock API modules
vi.mock('@/api/addresses', () => ({
  addressesApi: {
    listAddresses: vi.fn(),
    createAddress: vi.fn(),
    updateAddress: vi.fn(),
    deleteAddress: vi.fn(),
    setDefaultAddress: vi.fn(),
  },
}))

vi.mock('@/api/areas', () => ({
  areasApi: {
    listProvinces: vi.fn(),
    listWards: vi.fn(),
  },
}))

vi.mock('@/api/orders', () => ({
  ordersApi: {
    createOrder: vi.fn(),
  },
}))

vi.mock('@/api/vouchers', () => ({
  vouchersApi: {
    listAvailable: vi.fn(),
    quoteCheckout: vi.fn(),
  },
}))

const mockProvinces: Province[] = [
  { code: 1, name: 'Thành phố Hà Nội' },
  { code: 79, name: 'Thành phố Hồ Chí Minh' },
]

const mockWards: Ward[] = [
  { code: 101, provinceCode: 1, name: 'Phường Phúc Xá' },
  { code: 102, provinceCode: 1, name: 'Phường Trúc Bạch' },
]

const mockAddresses: Address[] = [
  {
    id: 'addr-1',
    userId: 'user-1',
    recipientName: 'Nguyễn Văn A',
    phone: '0912345678',
    provinceCode: 1,
    provinceName: 'Thành phố Hà Nội',
    wardCode: 101,
    wardName: 'Phường Phúc Xá',
    detailAddress: '123 Đường Cầu Giấy',
    isDefault: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'addr-2',
    userId: 'user-1',
    recipientName: 'Trần Thị B',
    phone: '0987654321',
    provinceCode: 79,
    provinceName: 'Thành phố Hồ Chí Minh',
    wardCode: 201,
    wardName: 'Phường Bến Nghé',
    detailAddress: '456 Lê Lợi',
    isDefault: false,
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
]

const mockCart = {
  items: [
    {
      id: 'item-1',
      variantId: 'v-1',
      productId: 'p-1',
      brandName: 'Apple',
      productName: 'iPhone 15 Pro Max',
      model: 'A3106',
      imageUrl: 'https://example.com/iphone.png',
      options: [{ groupLabel: 'Màu sắc', valueLabel: 'Titan Tự Nhiên' }],
      unitPriceVnd: '30000000',
      lineTotalVnd: '60000000',
      stockQuantity: 10,
      quantity: 2,
      selected: true,
      availability: 'available' as const,
    },
    {
      id: 'item-2',
      variantId: 'v-2',
      productId: 'p-2',
      brandName: 'Samsung',
      productName: 'Galaxy S24 Ultra',
      model: 'SM-S928B',
      imageUrl: '',
      options: [{ groupLabel: 'Màu sắc', valueLabel: 'Xám Titan' }],
      unitPriceVnd: '28000000',
      lineTotalVnd: '28000000',
      stockQuantity: 5,
      quantity: 1,
      selected: false,
      availability: 'available' as const,
    },
  ],
  totalUnits: 3,
  selectedLineCount: 1,
  selectedTotalVnd: '60000000',
  shippingFeeVnd: '30000',
}

describe('CheckoutPage', () => {
  const mockRefreshCart = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

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
      cart: mockCart,
      isLoading: false,
      badgeCount: 3,
      refreshCart: mockRefreshCart,
      addItem: vi.fn(),
      updateQuantity: vi.fn(),
      toggleSelect: vi.fn(),
      toggleSelectAll: vi.fn(),
      removeItem: vi.fn(),
    })

    vi.mocked(areasApi.listProvinces).mockResolvedValue(mockProvinces)
    vi.mocked(areasApi.listWards).mockResolvedValue(mockWards)
    vi.mocked(addressesApi.listAddresses).mockResolvedValue(mockAddresses)
    vi.mocked(vouchersApi.listAvailable).mockRejectedValue(new Error('not mocked'))
    vi.mocked(vouchersApi.quoteCheckout).mockRejectedValue(new Error('not mocked'))
  })

  it('redirects to login when unauthenticated', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/checkout']}>
          <Routes>
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/login" element={<div>Login Page Redirect Target</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Login Page Redirect Target')).toBeInTheDocument()
    })
  })

  it('renders preview with selected items, addresses, summary and fixed COD', async () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/checkout']}>
          <CheckoutPage />
        </MemoryRouter>
      </ToastProvider>
    )

    // Check title and item details
    await waitFor(() => {
      expect(screen.getByText('Thanh Toán Đơn Hàng')).toBeInTheDocument()
      expect(screen.getByText('iPhone 15 Pro Max')).toBeInTheDocument()
      expect(screen.getByText('Titan Tự Nhiên')).toBeInTheDocument()
    })

    // Unselected items should not be in checkout preview
    expect(screen.queryByText('Galaxy S24 Ultra')).not.toBeInTheDocument()

    // Check addresses rendered and default address badge
    expect(screen.getAllByText('Nguyễn Văn A').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Mặc định')).toBeInTheDocument()
    expect(screen.getByText('Trần Thị B')).toBeInTheDocument()

    // Check summary calculation: Subtotal 60.000.000 + Shipping 30.000 = 60.030.000
    expect(screen.getAllByText('60.000.000 ₫').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('30.000 ₫')).toBeInTheDocument()
    expect(screen.getByText('60.030.000 ₫')).toBeInTheDocument()

    // Check payment method
    expect(screen.getByText('Thanh toán khi nhận hàng (COD)')).toBeInTheDocument()
  })

  it('renders free shipping fee when shippingFeeVnd is 0', async () => {
    vi.mocked(useCart).mockReturnValue({
      cart: {
        ...mockCart,
        shippingFeeVnd: '0',
      },
      isLoading: false,
      badgeCount: 3,
      refreshCart: mockRefreshCart,
      addItem: vi.fn(),
      updateQuantity: vi.fn(),
      toggleSelect: vi.fn(),
      toggleSelectAll: vi.fn(),
      removeItem: vi.fn(),
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/checkout']}>
          <CheckoutPage />
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Miễn phí')).toBeInTheDocument()
    })
  })

  it('renders empty state when no items in cart are selected', async () => {
    vi.mocked(useCart).mockReturnValue({
      cart: {
        ...mockCart,
        items: [
          {
            ...mockCart.items[0],
            selected: false,
          },
        ],
        selectedLineCount: 0,
        selectedTotalVnd: '0',
      },
      isLoading: false,
      badgeCount: 1,
      refreshCart: mockRefreshCart,
      addItem: vi.fn(),
      updateQuantity: vi.fn(),
      toggleSelect: vi.fn(),
      toggleSelectAll: vi.fn(),
      removeItem: vi.fn(),
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/checkout']}>
          <CheckoutPage />
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Không có sản phẩm nào để thanh toán')).toBeInTheDocument()
      expect(screen.getByText('Quay lại giỏ hàng')).toBeInTheDocument()
    })
  })

  it('allows creating a new address with cascading province/ward select', async () => {
    const newAddress: Address = {
      id: 'addr-3',
      userId: 'user-1',
      recipientName: 'Lê Văn C',
      phone: '0901234567',
      provinceCode: 1,
      provinceName: 'Thành phố Hà Nội',
      wardCode: 101,
      wardName: 'Phường Phúc Xá',
      detailAddress: '789 Hoàng Hoa Thám',
      isDefault: false,
      createdAt: '2026-01-03T00:00:00Z',
      updatedAt: '2026-01-03T00:00:00Z',
    }
    vi.mocked(addressesApi.createAddress).mockResolvedValue(newAddress)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/checkout']}>
          <CheckoutPage />
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Thêm địa chỉ mới')).toBeInTheDocument()
    })

    // Click "+ Thêm địa chỉ mới"
    fireEvent.click(screen.getByText('Thêm địa chỉ mới'))

    // Dialog should open
    expect(screen.getByText('Thêm địa chỉ nhận hàng mới')).toBeInTheDocument()

    // Fill form
    fireEvent.change(screen.getByLabelText(/Họ và tên người nhận/i), {
      target: { value: 'Lê Văn C' },
    })
    fireEvent.change(screen.getByLabelText(/Số điện thoại/i), {
      target: { value: '0901234567' },
    })

    // Select province
    const provinceSelect = screen.getByLabelText(/Tỉnh \/ Thành phố/i)
    fireEvent.change(provinceSelect, { target: { value: '1' } })

    await waitFor(() => {
      expect(areasApi.listWards).toHaveBeenCalledWith(1)
    })

    // Select ward
    const wardSelect = screen.getByLabelText(/Phường \/ Xã/i)
    fireEvent.change(wardSelect, { target: { value: '101' } })

    // Fill detail address
    fireEvent.change(screen.getByLabelText(/Địa chỉ chi tiết/i), {
      target: { value: '789 Hoàng Hoa Thám' },
    })

    // Submit dialog form
    fireEvent.click(screen.getByRole('button', { name: 'Lưu địa chỉ' }))

    await waitFor(() => {
      expect(addressesApi.createAddress).toHaveBeenCalledWith({
        recipientName: 'Lê Văn C',
        phone: '0901234567',
        provinceCode: 1,
        wardCode: 101,
        detailAddress: '789 Hoàng Hoa Thám',
        isDefault: false,
      })
      expect(addressesApi.listAddresses).toHaveBeenCalledTimes(2)
    })
  })

  it('validates required fields before creating address', async () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/checkout']}>
          <CheckoutPage />
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Thêm địa chỉ mới')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Thêm địa chỉ mới'))

    // Click submit immediately without filling
    fireEvent.click(screen.getByRole('button', { name: 'Lưu địa chỉ' }))

    expect(screen.getByText('Vui lòng nhập họ và tên người nhận')).toBeInTheDocument()
    expect(screen.getByText('Vui lòng nhập số điện thoại')).toBeInTheDocument()
    expect(screen.getByText('Vui lòng chọn Tỉnh/Thành phố')).toBeInTheDocument()
    expect(screen.getByText('Vui lòng chọn Phường/Xã')).toBeInTheDocument()
    expect(screen.getByText('Vui lòng nhập địa chỉ chi tiết')).toBeInTheDocument()

    expect(addressesApi.createAddress).not.toHaveBeenCalled()
  })

  it('allows editing an existing address', async () => {
    vi.mocked(addressesApi.updateAddress).mockResolvedValue({
      ...mockAddresses[1],
      recipientName: 'Trần Thị B - Cập nhật',
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/checkout']}>
          <CheckoutPage />
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Trần Thị B')).toBeInTheDocument()
    })

    // Click edit button for second address
    const editButtons = screen.getAllByTitle('Sửa địa chỉ')
    fireEvent.click(editButtons[1])

    expect(screen.getByText('Chỉnh sửa địa chỉ nhận hàng')).toBeInTheDocument()

    // Change recipient name
    const nameInput = screen.getByLabelText(/Họ và tên người nhận/i)
    fireEvent.change(nameInput, { target: { value: 'Trần Thị B - Cập nhật' } })

    // Submit
    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật địa chỉ' }))

    await waitFor(() => {
      expect(addressesApi.updateAddress).toHaveBeenCalledWith('addr-2', expect.objectContaining({
        recipientName: 'Trần Thị B - Cập nhật',
      }))
    })
  })

  it('allows setting an address as default', async () => {
    vi.mocked(addressesApi.setDefaultAddress).mockResolvedValue({
      ...mockAddresses[1],
      isDefault: true,
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/checkout']}>
          <CheckoutPage />
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Thiết lập mặc định')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Thiết lập mặc định'))

    await waitFor(() => {
      expect(addressesApi.setDefaultAddress).toHaveBeenCalledWith('addr-2')
    })
  })

  it('allows deleting an address', async () => {
    vi.mocked(addressesApi.deleteAddress).mockResolvedValue(undefined)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/checkout']}>
          <CheckoutPage />
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Trần Thị B')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByTitle('Xóa địa chỉ')
    fireEvent.click(deleteButtons[1])

    await waitFor(() => {
      expect(addressesApi.deleteAddress).toHaveBeenCalledWith('addr-2')
    })
  })

  it('blocks placing order when no address exists or is selected', async () => {
    vi.mocked(addressesApi.listAddresses).mockResolvedValue([])

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/checkout']}>
          <CheckoutPage />
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Bạn chưa có địa chỉ nhận hàng nào.')).toBeInTheDocument()
    })

    const submitBtn = screen.getByRole('button', { name: /Đặt hàng/i })
    expect(submitBtn).toBeDisabled()
    expect(ordersApi.createOrder).not.toHaveBeenCalled()
  })

  it('successfully creates order and navigates to order detail page', async () => {
    const mockCreatedOrder: Order = {
      id: 'order-123',
      userId: 'user-1',
      status: 'pending_confirmation',
      paymentMethod: 'cod',
      recipientName: 'Nguyễn Văn A',
      phone: '0912345678',
      provinceName: 'Thành phố Hà Nội',
      wardName: 'Phường Phúc Xá',
      detailAddress: '123 Đường Cầu Giấy',
      subtotalVnd: '60000000',
      shippingFeeVnd: '30000',
      totalVnd: '60030000',
      items: [
        {
          id: 'oi-1',
          variantId: 'v-1',
          productId: 'p-1',
          brandName: 'Apple',
          productName: 'iPhone 15 Pro Max',
          model: 'A3106',
          imageUrl: '',
          options: [{ groupLabel: 'Màu sắc', valueLabel: 'Titan Tự Nhiên' }],
          unitPriceVnd: '30000000',
          quantity: 2,
          lineTotalVnd: '60000000',
        },
      ],
      createdAt: '2026-08-19T10:00:00Z',
      updatedAt: '2026-08-19T10:00:00Z',
    }
    vi.mocked(ordersApi.createOrder).mockResolvedValue(mockCreatedOrder)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/checkout']}>
          <Routes>
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/orders/:id" element={<div>Order Detail Page order-123</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Đặt hàng/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Đặt hàng/i }))

    await waitFor(() => {
      expect(ordersApi.createOrder).toHaveBeenCalledWith({
        addressId: 'addr-1',
        lines: [
          {
            variantId: 'v-1',
            quantity: 2,
            productName: 'iPhone 15 Pro Max',
            unitPriceVnd: '30000000',
          },
        ],
      })
      expect(mockRefreshCart).toHaveBeenCalled()
      expect(screen.getByText('Order Detail Page order-123')).toBeInTheDocument()
    })
  })

  it('handles product_changed error by opening dialog with reload and exit options', async () => {
    const errorDetail = {
      code: 'product_changed',
      message: 'Sản phẩm iPhone 15 Pro Max vừa được cập nhật giá. Vui lòng tải lại để xem thông tin mới nhất.',
    }
    const productChangedErr = new ApiError(409, errorDetail)
    vi.mocked(ordersApi.createOrder).mockRejectedValue(productChangedErr)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/checkout']}>
          <Routes>
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/cart" element={<div>Cart Page</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Đặt hàng/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Đặt hàng/i }))

    // Product changed dialog should appear
    await waitFor(() => {
      expect(screen.getByText('Sản phẩm vừa được cập nhật')).toBeInTheDocument()
      expect(screen.getByText(errorDetail.message)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Tải lại' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Thoát' })).toBeInTheDocument()
    })

    // Test Tải lại button
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại' }))
    expect(mockRefreshCart).toHaveBeenCalled()
  })

  it('shows the live quota message and reloads the cart when live quota is exceeded', async () => {
    const message = 'Chỉ còn 2 suất giá live cho iPhone 15 Pro Max. Vui lòng giảm số lượng.'
    vi.mocked(ordersApi.createOrder).mockRejectedValue(new ApiError(409, { code: 'live_quota_exceeded', message }))

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/checkout']}>
          <Routes>
            <Route path="/checkout" element={<CheckoutPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Đặt hàng/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Đặt hàng/i }))

    await waitFor(() => {
      expect(screen.getByText('Không đủ suất giá live')).toBeInTheDocument()
      expect(screen.getByText(message)).toBeInTheDocument()
      expect(mockRefreshCart).toHaveBeenCalled()
    })
  })

  it('handles product_changed dialog exit option by navigating back to /cart', async () => {
    const errorDetail = {
      code: 'product_changed',
      message: 'Sản phẩm iPhone 15 Pro Max vừa được cập nhật giá.',
    }
    const productChangedErr = new ApiError(409, errorDetail)
    vi.mocked(ordersApi.createOrder).mockRejectedValue(productChangedErr)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/checkout']}>
          <Routes>
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/cart" element={<div>Cart Page View</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Đặt hàng/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Đặt hàng/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Thoát' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Thoát' }))

    await waitFor(() => {
      expect(screen.getByText('Cart Page View')).toBeInTheDocument()
    })
  })

  it('handles out_of_stock / stock_limit error cleanly', async () => {
    const errorDetail = {
      code: 'out_of_stock',
      message: 'Sản phẩm tạm thời hết hàng.',
    }
    const oosErr = new ApiError(409, errorDetail)
    vi.mocked(ordersApi.createOrder).mockRejectedValue(oosErr)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/checkout']}>
          <CheckoutPage />
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Đặt hàng/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Đặt hàng/i }))

    await waitFor(() => {
      expect(mockRefreshCart).toHaveBeenCalled()
    })
  })

  it('disables MoMo option with Vietnamese explanation when total exceeds 50.000.000 ₫ or is below 1.000 ₫', async () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/checkout']}>
          <CheckoutPage />
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByLabelText(/Thanh toán khi nhận hàng \(COD\)/i)).toBeChecked()
    })

    const momoRadioOverLimit = screen.getByLabelText(/Ví điện tử MoMo/i)
    expect(momoRadioOverLimit).toBeDisabled()
    expect(screen.getByText(/1\.000 ₫ đến 50\.000\.000 ₫/i)).toBeInTheDocument()

    vi.mocked(useCart).mockReturnValue({
      cart: {
        ...mockCart,
        items: [
          {
            ...mockCart.items[0],
            unitPriceVnd: '500',
            lineTotalVnd: '500',
            quantity: 1,
          },
        ],
        totalUnits: 1,
        selectedLineCount: 1,
        selectedTotalVnd: '500',
        shippingFeeVnd: '0',
      },
      isLoading: false,
      badgeCount: 1,
      refreshCart: mockRefreshCart,
      addItem: vi.fn(),
      updateQuantity: vi.fn(),
      toggleSelect: vi.fn(),
      toggleSelectAll: vi.fn(),
      removeItem: vi.fn(),
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/checkout']}>
          <CheckoutPage />
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      const radios = screen.getAllByLabelText(/Ví điện tử MoMo/i)
      expect(radios[radios.length - 1]).toBeDisabled()
    })
  })

  it('allows selecting MoMo for eligible total, sends paymentMethod momo, and redirects browser to payUrl', async () => {
    const eligibleCart = {
      ...mockCart,
      items: [
        {
          ...mockCart.items[0],
          unitPriceVnd: '3190000',
          lineTotalVnd: '3190000',
          quantity: 1,
        },
      ],
      totalUnits: 1,
      selectedLineCount: 1,
      selectedTotalVnd: '3190000',
      shippingFeeVnd: '0',
    }
    vi.mocked(useCart).mockReturnValue({
      cart: eligibleCart,
      isLoading: false,
      badgeCount: 1,
      refreshCart: mockRefreshCart,
      addItem: vi.fn(),
      updateQuantity: vi.fn(),
      toggleSelect: vi.fn(),
      toggleSelectAll: vi.fn(),
      removeItem: vi.fn(),
    })

    const momoCreatedOrder: Order = {
      id: 'momo-order-123',
      userId: 'user-1',
      status: 'pending_confirmation',
      paymentMethod: 'momo',
      paymentStatus: 'pending',
      payUrl: 'https://test-payment.momo.vn/v2/gateway/pay?t=123',
      recipientName: 'Nguyễn Văn A',
      phone: '0912345678',
      provinceName: 'Thành phố Hà Nội',
      wardName: 'Phường Phúc Xá',
      detailAddress: '123 Đường Cầu Giấy',
      subtotalVnd: '3190000',
      shippingFeeVnd: '0',
      totalVnd: '3190000',
      items: [],
      createdAt: '2026-11-16T10:00:00Z',
      updatedAt: '2026-11-16T10:00:00Z',
    }
    vi.mocked(ordersApi.createOrder).mockResolvedValue(momoCreatedOrder)

    const originalLocation = window.location
    const assignMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, assign: assignMock },
      writable: true,
      configurable: true,
    })

    try {
      render(
        <ToastProvider>
          <MemoryRouter initialEntries={['/checkout']}>
            <Routes>
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route path="/orders/:id" element={<div>Order Detail Page momo-order-123</div>} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      )

      await waitFor(() => {
        expect(screen.getByLabelText(/Ví điện tử MoMo/i)).toBeEnabled()
      })

      fireEvent.click(screen.getByLabelText(/Ví điện tử MoMo/i))
      fireEvent.click(screen.getByRole('button', { name: /Đặt hàng/i }))

      await waitFor(() => {
        expect(ordersApi.createOrder).toHaveBeenCalledWith({
          addressId: 'addr-1',
          paymentMethod: 'momo',
          lines: [
            {
              variantId: 'v-1',
              quantity: 1,
              productName: 'iPhone 15 Pro Max',
              unitPriceVnd: '3190000',
            },
          ],
        })
      })
      await waitFor(() => {
        expect(assignMock).toHaveBeenCalledWith('https://test-payment.momo.vn/v2/gateway/pay?t=123')
      })
      expect(mockRefreshCart).toHaveBeenCalled()
      expect(screen.queryByText('Order Detail Page momo-order-123')).not.toBeInTheDocument()
    } finally {
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true,
      })
    }
  })

  it('navigates to order detail with warning when MoMo order has empty payUrl', async () => {
    const eligibleCart = {
      ...mockCart,
      items: [
        {
          ...mockCart.items[0],
          unitPriceVnd: '3190000',
          lineTotalVnd: '3190000',
          quantity: 1,
        },
      ],
      totalUnits: 1,
      selectedLineCount: 1,
      selectedTotalVnd: '3190000',
      shippingFeeVnd: '0',
    }
    vi.mocked(useCart).mockReturnValue({
      cart: eligibleCart,
      isLoading: false,
      badgeCount: 1,
      refreshCart: mockRefreshCart,
      addItem: vi.fn(),
      updateQuantity: vi.fn(),
      toggleSelect: vi.fn(),
      toggleSelectAll: vi.fn(),
      removeItem: vi.fn(),
    })

    const fallbackOrder: Order = {
      id: 'momo-fallback-123',
      userId: 'user-1',
      status: 'pending_confirmation',
      paymentMethod: 'momo',
      paymentStatus: 'failed',
      recipientName: 'Nguyễn Văn A',
      phone: '0912345678',
      provinceName: 'Thành phố Hà Nội',
      wardName: 'Phường Phúc Xá',
      detailAddress: '123 Đường Cầu Giấy',
      subtotalVnd: '3190000',
      shippingFeeVnd: '0',
      totalVnd: '3190000',
      items: [],
      createdAt: '2026-11-16T10:00:00Z',
      updatedAt: '2026-11-16T10:00:00Z',
    }
    vi.mocked(ordersApi.createOrder).mockResolvedValue(fallbackOrder)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/checkout']}>
          <Routes>
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/orders/:id" element={<div>Order Detail Fallback momo-fallback-123</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByLabelText(/Ví điện tử MoMo/i)).toBeEnabled()
    })

    fireEvent.click(screen.getByLabelText(/Ví điện tử MoMo/i))
    fireEvent.click(screen.getByRole('button', { name: /Đặt hàng/i }))

    await waitFor(() => {
      expect(screen.getByText('Order Detail Fallback momo-fallback-123')).toBeInTheDocument()
      expect(screen.getByText(/Chưa thể chuyển đến cổng MoMo/i)).toBeInTheDocument()
    })
  })

  describe('Regional shipping, Express 2h, Vouchers & MoMo quote threshold (Req 1.3, 1.4, 7.1, PD-2)', () => {
    const danangAddress: Address = {
      id: 'addr-dn',
      userId: 'user-1',
      recipientName: 'Lê Đà Nẵng',
      phone: '0909888777',
      provinceCode: 48,
      provinceName: 'Thành phố Đà Nẵng',
      wardCode: 4801,
      wardName: 'Phường Hải Châu',
      detailAddress: '10 Bạch Đằng',
      isDefault: false,
      createdAt: '2026-01-03T00:00:00Z',
      updatedAt: '2026-01-03T00:00:00Z',
    }

    const availableVouchers: AvailableVoucher[] = [
      {
        id: 'vch-1',
        code: 'AURA10',
        title: 'Giảm 10% tối đa 1 triệu',
        description: 'Áp dụng toàn bộ điện thoại',
        voucherType: 'percent',
        discountValue: '10',
        maxDiscountVnd: '1000000',
        minOrderVnd: '5000000',
        usageLimit: 100,
        usedCount: 0,
        perUserLimit: 2,
        userRemainingUses: 2,
        startsAt: '2026-11-01T00:00:00Z',
        endsAt: '2026-12-31T23:59:59Z',
      },
      {
        id: 'vch-2',
        code: 'FREESHIP60',
        title: 'Miễn phí giao hỏa tốc 60K',
        description: 'Giảm tối đa 60.000đ phí vận chuyển',
        voucherType: 'freeship',
        discountValue: '0',
        maxDiscountVnd: '60000',
        minOrderVnd: '0',
        usageLimit: null,
        usedCount: 0,
        perUserLimit: 1,
        userRemainingUses: 1,
        startsAt: '2026-11-01T00:00:00Z',
        endsAt: '2026-12-31T23:59:59Z',
      },
    ]

    it('enables express_2h for HN/HCM, locks express_2h for other provinces, and resets deliveryMethod to standard on address switch', async () => {
      vi.mocked(addressesApi.listAddresses).mockResolvedValue([mockAddresses[0], danangAddress])
      vi.mocked(vouchersApi.listAvailable).mockResolvedValue([])
      vi.mocked(vouchersApi.quoteCheckout).mockImplementation(async ({ addressId, deliveryMethod }) => {
        if (addressId === 'addr-dn') {
          return {
            subtotalVnd: '3000000',
            deliveryMethod: 'standard',
            expressAvailable: false,
            standardShippingFeeVnd: '30000',
            expressShippingFeeVnd: '60000',
            freeShippingThresholdVnd: '5000000',
            shippingFeeVnd: '30000',
            voucherCode: null,
            voucherType: null,
            discountVnd: '0',
            totalVnd: '3030000',
          }
        }
        const isExpress = deliveryMethod === 'express_2h'
        return {
          subtotalVnd: '3000000',
          deliveryMethod: isExpress ? 'express_2h' : 'standard',
          expressAvailable: true,
          standardShippingFeeVnd: '25000',
          expressShippingFeeVnd: '60000',
          freeShippingThresholdVnd: '5000000',
          shippingFeeVnd: isExpress ? '60000' : '25000',
          voucherCode: null,
          voucherType: null,
          discountVnd: '0',
          totalVnd: isExpress ? '3060000' : '3025000',
        }
      })

      vi.mocked(useCart).mockReturnValue({
        cart: {
          ...mockCart,
          items: [
            {
              ...mockCart.items[0],
              unitPriceVnd: '3000000',
              lineTotalVnd: '3000000',
              quantity: 1,
            },
          ],
          totalUnits: 1,
          selectedLineCount: 1,
          selectedTotalVnd: '3000000',
          shippingFeeVnd: '0',
        },
        isLoading: false,
        badgeCount: 1,
        refreshCart: mockRefreshCart,
        addItem: vi.fn(),
        updateQuantity: vi.fn(),
        toggleSelect: vi.fn(),
        toggleSelectAll: vi.fn(),
        removeItem: vi.fn(),
      })

      render(
        <ToastProvider>
          <MemoryRouter initialEntries={['/checkout']}>
            <CheckoutPage />
          </MemoryRouter>
        </ToastProvider>
      )

      const expressRadio = await screen.findByLabelText(/Giao hỏa tốc 2 giờ/i)
      const standardRadio = screen.getByLabelText(/Giao tiêu chuẩn/i)

      await waitFor(() => {
        expect(standardRadio).toBeChecked()
        expect(expressRadio).toBeEnabled()
        expect(screen.getByText('3.025.000 ₫')).toBeInTheDocument()
      })

      // Switch to express_2h on Hanoi address
      fireEvent.click(expressRadio)
      await waitFor(() => {
        expect(expressRadio).toBeChecked()
        expect(screen.getByText('3.060.000 ₫')).toBeInTheDocument()
      })

      // Switch to Da Nang address -> auto reverts to standard and disables express_2h
      fireEvent.click(screen.getByText('Lê Đà Nẵng'))

      await waitFor(() => {
        expect(standardRadio).toBeChecked()
        expect(expressRadio).toBeDisabled()
        expect(screen.getByText(/Chỉ áp dụng tại Hà Nội & TP\. Hồ Chí Minh/i)).toBeInTheDocument()
        expect(screen.getByText('3.030.000 ₫')).toBeInTheDocument()
      })
    })

    it('ignores stale out-of-order quote responses when switching addresses', async () => {
      vi.mocked(addressesApi.listAddresses).mockResolvedValue([mockAddresses[0], danangAddress])
      vi.mocked(vouchersApi.listAvailable).mockResolvedValue([])

      let resolveFirstQuote!: (q: CheckoutQuote) => void
      let resolveSecondQuote!: (q: CheckoutQuote) => void
      let callCount = 0

      vi.mocked(vouchersApi.quoteCheckout).mockImplementation(() => {
        callCount += 1
        if (callCount === 1) {
          return new Promise<CheckoutQuote>((resolve) => {
            resolveFirstQuote = resolve
          })
        }
        return new Promise<CheckoutQuote>((resolve) => {
          resolveSecondQuote = resolve
        })
      })

      render(
        <ToastProvider>
          <MemoryRouter initialEntries={['/checkout']}>
            <CheckoutPage />
          </MemoryRouter>
        </ToastProvider>
      )

      await waitFor(() => {
        expect(screen.getByText('Lê Đà Nẵng')).toBeInTheDocument()
      })

      // Switch to second address before first quote settles
      fireEvent.click(screen.getByText('Lê Đà Nẵng'))

      await waitFor(() => {
        expect(vouchersApi.quoteCheckout).toHaveBeenCalledTimes(2)
      })

      // Fast response for second address resolves first
      resolveSecondQuote({
        subtotalVnd: '60000000',
        deliveryMethod: 'standard',
        expressAvailable: false,
        standardShippingFeeVnd: '40000',
        expressShippingFeeVnd: '60000',
        freeShippingThresholdVnd: '5000000',
        shippingFeeVnd: '40000',
        voucherCode: null,
        voucherType: null,
        discountVnd: '0',
        totalVnd: '60040000',
      })

      await waitFor(() => {
        expect(screen.getByText('60.040.000 ₫')).toBeInTheDocument()
      })

      // Now stale response for first address arrives late -> must be ignored
      resolveFirstQuote({
        subtotalVnd: '60000000',
        deliveryMethod: 'standard',
        expressAvailable: true,
        standardShippingFeeVnd: '99000',
        expressShippingFeeVnd: '60000',
        freeShippingThresholdVnd: '5000000',
        shippingFeeVnd: '99000',
        voucherCode: null,
        voucherType: null,
        discountVnd: '0',
        totalVnd: '60099000',
      })

      await waitFor(() => {
        expect(screen.getByText('60.040.000 ₫')).toBeInTheDocument()
        expect(screen.queryByText('60.099.000 ₫')).not.toBeInTheDocument()
      })
    })

    it('supports available voucher picker, manual code apply/remove, Vietnamese ApiError display, and order creation payload', async () => {
      vi.mocked(vouchersApi.listAvailable).mockResolvedValue(availableVouchers)
      vi.mocked(vouchersApi.quoteCheckout).mockImplementation(async ({ deliveryMethod, voucherCode }) => {
        if (voucherCode === 'EXPIRED') {
          throw new ApiError(409, {
            code: 'voucher_expired',
            message: 'Mã giảm giá đã hết hạn sử dụng',
          })
        }
        const shipping = deliveryMethod === 'express_2h' ? '60000' : '0'
        if (voucherCode === 'AURA10') {
          return {
            subtotalVnd: '60000000',
            deliveryMethod: deliveryMethod ?? 'standard',
            expressAvailable: true,
            standardShippingFeeVnd: '0',
            expressShippingFeeVnd: '60000',
            freeShippingThresholdVnd: '5000000',
            shippingFeeVnd: shipping,
            voucherCode: 'AURA10',
            voucherType: 'percent',
            discountVnd: '1000000',
            totalVnd: deliveryMethod === 'express_2h' ? '59060000' : '59000000',
          }
        }
        return {
          subtotalVnd: '60000000',
          deliveryMethod: deliveryMethod ?? 'standard',
          expressAvailable: true,
          standardShippingFeeVnd: '0',
          expressShippingFeeVnd: '60000',
          freeShippingThresholdVnd: '5000000',
          shippingFeeVnd: shipping,
          voucherCode: null,
          voucherType: null,
          discountVnd: '0',
          totalVnd: deliveryMethod === 'express_2h' ? '60060000' : '60000000',
        }
      })

      vi.mocked(ordersApi.createOrder).mockResolvedValue({
        id: 'order-vch-1',
        userId: 'user-1',
        status: 'pending_confirmation',
        paymentMethod: 'cod',
        recipientName: 'Nguyễn Văn A',
        phone: '0912345678',
        provinceName: 'Thành phố Hà Nội',
        wardName: 'Phường Phúc Xá',
        detailAddress: '123 Đường Cầu Giấy',
        subtotalVnd: '60000000',
        shippingFeeVnd: '60000',
        discountVnd: '1000000',
        voucherCode: 'AURA10',
        voucherType: 'percent',
        deliveryMethod: 'express_2h',
        totalVnd: '59060000',
        items: [],
        createdAt: '2026-11-18T10:00:00Z',
        updatedAt: '2026-11-18T10:00:00Z',
      })

      render(
        <ToastProvider>
          <MemoryRouter initialEntries={['/checkout']}>
            <Routes>
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route path="/orders/:id" element={<div>Order Created With Voucher</div>} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      )

      // Available vouchers rendered
      expect(await screen.findByText('Giảm 10% tối đa 1 triệu')).toBeInTheDocument()
      expect(screen.getByText('FREESHIP60')).toBeInTheDocument()

      // Try invalid manual code
      const input = screen.getByPlaceholderText(/Nhập mã giảm giá/i)
      fireEvent.change(input, { target: { value: 'expired' } })
      fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }))

      await waitFor(() => {
        expect(screen.getByText('Mã giảm giá đã hết hạn sử dụng')).toBeInTheDocument()
      })

      // Apply valid voucher from picker
      fireEvent.click(screen.getByTestId('apply-voucher-AURA10'))

      await waitFor(() => {
        expect(screen.getByText(/-1\.000\.000 ₫/)).toBeInTheDocument()
        expect(screen.getByText('59.000.000 ₫')).toBeInTheDocument()
      })

      // Remove voucher then re-apply manually
      fireEvent.click(screen.getByRole('button', { name: /Gỡ mã/i }))

      await waitFor(() => {
        expect(screen.queryByText(/-1\.000\.000 ₫/)).not.toBeInTheDocument()
      })

      fireEvent.change(input, { target: { value: 'aura10' } })
      fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }))
      fireEvent.click(screen.getByLabelText(/Giao hỏa tốc 2 giờ/i))

      await waitFor(() => {
        expect(screen.getByText('59.060.000 ₫')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /Đặt hàng/i }))

      await waitFor(() => {
        expect(ordersApi.createOrder).toHaveBeenCalledWith(
          expect.objectContaining({
            addressId: 'addr-1',
            deliveryMethod: 'express_2h',
            voucherCode: 'AURA10',
          })
        )
        expect(screen.getByText('Order Created With Voucher')).toBeInTheDocument()
      })
    })

    it('switches paymentMethod back to COD and disables MoMo when applied voucher drops totalVnd below 1.000 ₫', async () => {
      vi.mocked(useCart).mockReturnValue({
        cart: {
          ...mockCart,
          items: [
            {
              ...mockCart.items[0],
              unitPriceVnd: '1500000',
              lineTotalVnd: '1500000',
              quantity: 1,
            },
          ],
          totalUnits: 1,
          selectedLineCount: 1,
          selectedTotalVnd: '1500000',
          shippingFeeVnd: '0',
        },
        isLoading: false,
        badgeCount: 1,
        refreshCart: mockRefreshCart,
        addItem: vi.fn(),
        updateQuantity: vi.fn(),
        toggleSelect: vi.fn(),
        toggleSelectAll: vi.fn(),
        removeItem: vi.fn(),
      })

      vi.mocked(vouchersApi.listAvailable).mockResolvedValue([])
      vi.mocked(vouchersApi.quoteCheckout).mockImplementation(async ({ voucherCode }) => {
        if (voucherCode === 'ZERO') {
          return {
            subtotalVnd: '1500000',
            deliveryMethod: 'standard',
            expressAvailable: true,
            standardShippingFeeVnd: '0',
            expressShippingFeeVnd: '60000',
            freeShippingThresholdVnd: '5000000',
            shippingFeeVnd: '0',
            voucherCode: 'ZERO',
            voucherType: 'fixed_amount',
            discountVnd: '1499500',
            totalVnd: '500',
          }
        }
        return {
          subtotalVnd: '1500000',
          deliveryMethod: 'standard',
          expressAvailable: true,
          standardShippingFeeVnd: '0',
          expressShippingFeeVnd: '60000',
          freeShippingThresholdVnd: '5000000',
          shippingFeeVnd: '0',
          voucherCode: null,
          voucherType: null,
          discountVnd: '0',
          totalVnd: '1500000',
        }
      })

      render(
        <ToastProvider>
          <MemoryRouter initialEntries={['/checkout']}>
            <CheckoutPage />
          </MemoryRouter>
        </ToastProvider>
      )

      const momoRadio = await screen.findByLabelText(/Ví điện tử MoMo/i)
      const codRadio = screen.getByLabelText(/Thanh toán khi nhận hàng \(COD\)/i)

      await waitFor(() => {
        expect(momoRadio).toBeEnabled()
      })

      fireEvent.click(momoRadio)
      expect(momoRadio).toBeChecked()

      // Apply voucher dropping total to 500 VND
      const input = screen.getByPlaceholderText(/Nhập mã giảm giá/i)
      fireEvent.change(input, { target: { value: 'ZERO' } })
      fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }))

      await waitFor(() => {
        expect(screen.getByText('500 ₫')).toBeInTheDocument()
        expect(momoRadio).toBeDisabled()
        expect(codRadio).toBeChecked()
      })
    })

    it('keeps applied voucher banner visible alongside error alert when replacement voucher fails', async () => {
      vi.mocked(vouchersApi.listAvailable).mockResolvedValue([])
      vi.mocked(vouchersApi.quoteCheckout).mockImplementation(async ({ voucherCode }) => {
        if (voucherCode === 'EXPIRED') {
          throw new ApiError(409, {
            code: 'voucher_expired',
            message: 'Mã giảm giá đã hết hạn sử dụng',
          })
        }
        if (voucherCode === 'AURA10') {
          return {
            subtotalVnd: '60000000',
            deliveryMethod: 'standard',
            expressAvailable: true,
            standardShippingFeeVnd: '0',
            expressShippingFeeVnd: '60000',
            freeShippingThresholdVnd: '5000000',
            shippingFeeVnd: '0',
            voucherCode: 'AURA10',
            voucherType: 'percent',
            discountVnd: '1000000',
            totalVnd: '59000000',
          }
        }
        return {
          subtotalVnd: '60000000',
          deliveryMethod: 'standard',
          expressAvailable: true,
          standardShippingFeeVnd: '0',
          expressShippingFeeVnd: '60000',
          freeShippingThresholdVnd: '5000000',
          shippingFeeVnd: '0',
          voucherCode: null,
          voucherType: null,
          discountVnd: '0',
          totalVnd: '60000000',
        }
      })

      render(
        <ToastProvider>
          <MemoryRouter initialEntries={['/checkout']}>
            <CheckoutPage />
          </MemoryRouter>
        </ToastProvider>
      )

      const input = await screen.findByPlaceholderText(/Nhập mã giảm giá/i)
      fireEvent.change(input, { target: { value: 'AURA10' } })
      fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }))

      await waitFor(() => {
        expect(screen.getByText(/Đang áp dụng mã/i)).toBeInTheDocument()
        expect(screen.getByText(/-1\.000\.000 ₫/)).toBeInTheDocument()
      })

      // Attempt invalid replacement voucher while AURA10 is active
      fireEvent.change(input, { target: { value: 'EXPIRED' } })
      fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Mã giảm giá đã hết hạn sử dụng')
      })

      // Previously applied AURA10 banner, Gỡ mã button, and discount remain visible
      expect(screen.getByText(/Đang áp dụng mã/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Gỡ mã/i })).toBeInTheDocument()
      expect(screen.getByText(/-1\.000\.000 ₫/)).toBeInTheDocument()
    })
  })
})
