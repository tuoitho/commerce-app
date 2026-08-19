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
import { ApiError, type Address, type Province, type Ward, type Order } from '@/api/types'

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
})
