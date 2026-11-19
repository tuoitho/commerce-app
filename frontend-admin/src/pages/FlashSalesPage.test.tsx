import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FlashSalesPage } from './FlashSalesPage'
import * as flashSalesApi from '@/api/flashSales'
import * as productsApi from '@/api/products'
import {
  ApiError,
  type AdminFlashSaleDetail,
  type AdminFlashSaleSummary,
  type ProductDetail,
  type ProductSummary,
} from '@/api/types'

vi.mock('@/api/flashSales', () => ({
  listAdminFlashSales: vi.fn(),
  getAdminFlashSale: vi.fn(),
  createAdminFlashSale: vi.fn(),
  updateAdminFlashSale: vi.fn(),
  deleteAdminFlashSale: vi.fn(),
}))

vi.mock('@/api/products', () => ({
  getAdminProducts: vi.fn(),
  getAdminProductById: vi.fn(),
}))

const mockSummary: AdminFlashSaleSummary = {
  id: 'fs-1',
  name: 'Deal Chớp Nhoáng 12H',
  startsAt: '2026-11-18T05:00:00Z',
  endsAt: '2026-11-18T08:00:00Z',
  active: true,
  status: 'running',
  variantCount: 1,
  totalQuota: 20,
  totalSold: 12,
  createdAt: '2026-11-18T01:00:00Z',
  updatedAt: '2026-11-18T01:00:00Z',
}

const mockDetail: AdminFlashSaleDetail = {
  id: 'fs-1',
  name: 'Deal Chớp Nhoáng 12H',
  startsAt: '2026-11-18T05:00:00Z',
  endsAt: '2026-11-18T08:00:00Z',
  active: true,
  status: 'running',
  createdAt: '2026-11-18T01:00:00Z',
  updatedAt: '2026-11-18T01:00:00Z',
  items: [
    {
      productId: 'prod-1',
      variantId: 'var-1',
      productName: 'iPhone 16 Pro',
      brand: 'Apple',
      model: 'A3294',
      imageUrl: '/media/products/ip16.webp',
      optionLabel: '256GB / Titan Tự Nhiên',
      variantActive: true,
      regularPriceVnd: '28990000',
      flashPriceVnd: '25990000',
      quota: 20,
      soldQuantity: 12,
      position: 0,
    },
  ],
}

const mockProductSummary: ProductSummary = {
  id: 'prod-1',
  name: 'iPhone 16 Pro',
  model: 'A3294',
  brand: 'Apple',
  category: { id: 'cat-1', name: 'Điện thoại' },
  minPriceVnd: '28990000',
  maxPriceVnd: '34990000',
  price: '28990000',
  currency: 'VND',
  primaryImageUrl: '/media/products/ip16.webp',
  inStock: true,
}

const mockProductDetail: ProductDetail = {
  ...mockProductSummary,
  description: 'Flagship',
  imageUrls: ['/media/products/ip16.webp'],
  stockQuantity: 15,
  featured: true,
  active: true,
  optionGroups: [
    {
      id: 'grp-storage',
      label: 'Dung lượng',
      position: 0,
      values: [
        { id: 'val-256', label: '256GB' },
        { id: 'val-512', label: '512GB' },
      ],
    },
  ],
  variants: [
    {
      id: 'var-1',
      optionValueIds: { 'grp-storage': 'val-256' },
      priceVnd: '28990000',
      stockQuantity: 10,
      active: true,
    },
    {
      id: 'var-2',
      optionValueIds: { 'grp-storage': 'val-512' },
      priceVnd: '34990000',
      stockQuantity: 5,
      active: true,
    },
  ],
  createdAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-01T10:00:00Z',
}

function renderPage(initialEntries = ['/flash-sales']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <FlashSalesPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('FlashSalesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders paginated campaigns and filters by status', async () => {
    vi.mocked(flashSalesApi.listAdminFlashSales).mockResolvedValue({
      data: [mockSummary],
      meta: {
        timestamp: '2026-11-18T10:00:00Z',
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
      },
      message: '',
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Deal Chớp Nhoáng 12H')).toBeInTheDocument()
    })
    expect(screen.getByText('12 / 20 suất')).toBeInTheDocument()
    expect(screen.getByText('1 biến thể')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Lọc theo trạng thái'), {
      target: { value: 'scheduled' },
    })

    await waitFor(() => {
      expect(flashSalesApi.listAdminFlashSales).toHaveBeenCalledWith({
        status: 'scheduled',
        page: 1,
        limit: 20,
      })
    })
  })

  it('creates a flash sale campaign by searching/picking product variants and validating flashPriceVnd < regularPriceVnd', async () => {
    vi.mocked(flashSalesApi.listAdminFlashSales).mockResolvedValue({
      data: [],
      meta: {
        timestamp: '2026-11-18T10:00:00Z',
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      },
      message: '',
    })
    vi.mocked(productsApi.getAdminProducts).mockResolvedValue({
      data: [mockProductSummary],
      meta: {
        timestamp: '2026-11-18T10:00:00Z',
        pagination: { page: 1, limit: 8, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
      },
      message: '',
    })
    vi.mocked(productsApi.getAdminProductById).mockResolvedValue(mockProductDetail)
    vi.mocked(flashSalesApi.createAdminFlashSale).mockResolvedValue(mockDetail)

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Tạo chiến dịch/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Tạo chiến dịch/i }))
    expect(screen.getByRole('dialog', { name: /Tạo chiến dịch Flash Sale/i })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Tên chiến dịch/i), {
      target: { value: 'Deal Cuối Tuần' },
    })
    fireEvent.change(screen.getByLabelText(/Thời gian bắt đầu/i), {
      target: { value: '2026-11-20T09:00' },
    })
    fireEvent.change(screen.getByLabelText(/Thời gian kết thúc/i), {
      target: { value: '2026-11-20T12:00' },
    })

    // Search and load product variants
    fireEvent.change(screen.getByPlaceholderText(/Tìm sản phẩm để thêm biến thể/i), {
      target: { value: 'iPhone' },
    })

    await waitFor(() => {
      expect(screen.getByText('iPhone 16 Pro')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Chọn biến thể iPhone 16 Pro/i }))

    await waitFor(() => {
      expect(productsApi.getAdminProductById).toHaveBeenCalledWith('prod-1')
    })

    // Add 256GB variant (regular 28.990.000)
    fireEvent.click(screen.getByRole('button', { name: /Thêm biến thể 256GB/i }))

    // Enter invalid flashPrice >= regularPrice
    const priceInput = screen.getByLabelText(/Giá Flash Sale 256GB/i)
    const quotaInput = screen.getByLabelText(/Số suất 256GB/i)
    fireEvent.change(priceInput, { target: { value: '29000000' } })
    fireEvent.change(quotaInput, { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: /^Lưu chiến dịch$/i }))

    expect(
      await screen.findByText(/Giá Flash Sale phải nhỏ hơn giá bán thường/i)
    ).toBeInTheDocument()
    expect(flashSalesApi.createAdminFlashSale).not.toHaveBeenCalled()

    // Fix price < regularPrice -> submits
    fireEvent.change(priceInput, { target: { value: '25990000' } })
    fireEvent.click(screen.getByRole('button', { name: /^Lưu chiến dịch$/i }))

    await waitFor(() => {
      expect(flashSalesApi.createAdminFlashSale).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Deal Cuối Tuần',
          active: true,
          startsAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/),
          endsAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/),
          items: [{ variantId: 'var-1', flashPriceVnd: '25990000', quota: 20 }],
        })
      )
    })
  })

  it('edits campaign validating quota >= soldQuantity and displays 409 overlap & has_orders errors', async () => {
    vi.mocked(flashSalesApi.listAdminFlashSales).mockResolvedValue({
      data: [mockSummary],
      meta: {
        timestamp: '2026-11-18T10:00:00Z',
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
      },
      message: '',
    })
    vi.mocked(flashSalesApi.getAdminFlashSale).mockResolvedValue(mockDetail)

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Deal Chớp Nhoáng 12H')).toBeInTheDocument()
    })

    // Edit campaign
    fireEvent.click(screen.getByRole('button', { name: /Sửa Deal Chớp Nhoáng 12H/i }))
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Chỉnh sửa chiến dịch Flash Sale/i })).toBeInTheDocument()
    })

    // Try setting quota < soldQuantity (12)
    const quotaInput = screen.getByLabelText(/Số suất 256GB \/ Titan Tự Nhiên/i)
    fireEvent.change(quotaInput, { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /^Lưu chiến dịch$/i }))

    expect(
      await screen.findByText(/Số suất không được nhỏ hơn số đã bán \(12\)/i)
    ).toBeInTheDocument()
    expect(flashSalesApi.updateAdminFlashSale).not.toHaveBeenCalled()

    // Fix quota >= 12 and simulate 409 flash_sale_time_overlap
    vi.mocked(flashSalesApi.updateAdminFlashSale).mockRejectedValueOnce(
      new ApiError(409, {
        code: 'flash_sale_time_overlap',
        message: 'Khung giờ chiến dịch bị trùng với một chiến dịch Flash Sale đang bật khác',
      })
    )
    fireEvent.change(quotaInput, { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: /^Lưu chiến dịch$/i }))

    expect(
      await screen.findByText(
        'Khung giờ chiến dịch bị trùng với một chiến dịch Flash Sale đang bật khác'
      )
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Hủy$/i }))

    // Delete campaign -> 409 flash_sale_has_orders
    vi.mocked(flashSalesApi.deleteAdminFlashSale).mockRejectedValueOnce(
      new ApiError(409, {
        code: 'flash_sale_has_orders',
        message: 'Không thể xóa chiến dịch Flash Sale đã phát sinh lượt mua',
      })
    )
    fireEvent.click(screen.getByRole('button', { name: /Xóa Deal Chớp Nhoáng 12H/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Xóa$/i }))

    expect(
      await screen.findByText('Không thể xóa chiến dịch Flash Sale đã phát sinh lượt mua')
    ).toBeInTheDocument()
  })
})
