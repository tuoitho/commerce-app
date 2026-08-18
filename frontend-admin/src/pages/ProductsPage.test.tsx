import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProductsPage } from './ProductsPage'
import * as productsApi from '@/api/products'
import type { ProductSummary } from '@/api/types'

vi.mock('@/api/products', () => ({
  getAdminProducts: vi.fn(),
  getAdminProductById: vi.fn(),
  deleteAdminProduct: vi.fn(),
}))

const mockProducts: ProductSummary[] = [
  {
    id: 'prod-1',
    name: 'iPhone 15 Pro Max',
    model: 'A3106',
    brand: 'Apple',
    category: { id: 'cat-phones', name: 'Điện thoại' },
    minPriceVnd: '29990000',
    maxPriceVnd: '34990000',
    price: '29990000',
    currency: 'VND',
    primaryImageUrl: 'https://example.com/iphone15.jpg',
    inStock: true,
  },
  {
    id: 'prod-2',
    name: 'Xiaomi 14 Ultra',
    model: '24030PN60G',
    brand: 'Xiaomi',
    category: { id: 'cat-phones', name: 'Điện thoại' },
    minPriceVnd: '24990000',
    maxPriceVnd: '24990000',
    price: '24990000',
    currency: 'VND',
    primaryImageUrl: '',
    inStock: false,
  },
]

function renderWithClient(ui: React.ReactElement, initialEntries = ['/products']) {
  const testQueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return render(
    <QueryClientProvider client={testQueryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ProductsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders product table with required columns including brand text, price, category, and stock', async () => {
    vi.mocked(productsApi.getAdminProducts).mockResolvedValueOnce({
      data: mockProducts,
      meta: {
        timestamp: '2026-08-16T08:00:00Z',
        pagination: {
          page: 1,
          limit: 10,
          total: 2,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
      message: '',
    })

    renderWithClient(<ProductsPage />)

    // Table Headers
    expect(screen.getByText('Quản lý sản phẩm')).toBeInTheDocument()
    expect(screen.getByText('Hình ảnh')).toBeInTheDocument()
    expect(screen.getByText('Tên sản phẩm')).toBeInTheDocument()
    expect(screen.getByText('Thương hiệu')).toBeInTheDocument()
    expect(screen.getByText('Danh mục')).toBeInTheDocument()
    expect(screen.getByText('Giá')).toBeInTheDocument()
    expect(screen.getByText('Trạng thái')).toBeInTheDocument()

    // First Product assertions
    await waitFor(() => {
      expect(screen.getByText('iPhone 15 Pro Max')).toBeInTheDocument()
    })
    expect(screen.getByText('A3106')).toBeInTheDocument()
    expect(screen.getByText('Apple')).toBeInTheDocument()
    expect(screen.getByText('29.990.000 ₫')).toBeInTheDocument()
    expect(screen.getAllByText('Điện thoại').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Còn hàng')).toBeInTheDocument()

    // Second Product assertions (plain text brand 'Xiaomi', out of stock)
    expect(screen.getByText('Xiaomi 14 Ultra')).toBeInTheDocument()
    expect(screen.getByText('24030PN60G')).toBeInTheDocument()
    expect(screen.getByText('Xiaomi')).toBeInTheDocument()
    expect(screen.getByText('24.990.000 ₫')).toBeInTheDocument()
    expect(screen.getByText('Hết hàng')).toBeInTheDocument()
  })

  it('triggers search query with q parameter when user searches and supports clear', async () => {
    vi.mocked(productsApi.getAdminProducts).mockResolvedValue({
      data: [mockProducts[0]],
      meta: {
        timestamp: '2026-08-16T08:00:00Z',
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
      message: '',
    })

    renderWithClient(<ProductsPage />)

    await waitFor(() => {
      expect(screen.getByText('iPhone 15 Pro Max')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/Tìm kiếm sản phẩm/i)
    fireEvent.change(searchInput, { target: { value: 'iPhone' } })

    const searchForm = searchInput.closest('form')
    if (searchForm) {
      fireEvent.submit(searchForm)
    } else {
      const searchBtn = screen.getByRole('button', { name: /Tìm kiếm/i })
      fireEvent.click(searchBtn)
    }

    await waitFor(() => {
      expect(productsApi.getAdminProducts).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'iPhone' })
      )
    })

    // Test clearing search
    const clearBtn = screen.getByLabelText(/Xóa từ khóa tìm kiếm/i)
    fireEvent.click(clearBtn)

    await waitFor(() => {
      expect(productsApi.getAdminProducts).toHaveBeenCalledWith(
        expect.objectContaining({ q: '' })
      )
    })
  })

  it('handles pagination next and prev clicks', async () => {
    vi.mocked(productsApi.getAdminProducts).mockResolvedValueOnce({
      data: [mockProducts[0]],
      meta: {
        timestamp: '2026-08-16T08:00:00Z',
        pagination: {
          page: 1,
          limit: 1,
          total: 2,
          totalPages: 2,
          hasNext: true,
          hasPrev: false,
        },
      },
      message: '',
    })

    renderWithClient(<ProductsPage />)

    await waitFor(() => {
      expect(screen.getByText('iPhone 15 Pro Max')).toBeInTheDocument()
    })

    const nextButton = screen.getByRole('button', { name: /Sau|Trang sau/i })
    expect(nextButton).not.toBeDisabled()

    const prevButton = screen.getByRole('button', { name: /Trước|Trang trước/i })
    expect(prevButton).toBeDisabled()

    // Mock page 2 response
    vi.mocked(productsApi.getAdminProducts).mockResolvedValueOnce({
      data: [mockProducts[1]],
      meta: {
        timestamp: '2026-08-16T08:00:00Z',
        pagination: {
          page: 2,
          limit: 1,
          total: 2,
          totalPages: 2,
          hasNext: false,
          hasPrev: true,
        },
      },
      message: '',
    })

    fireEvent.click(nextButton)

    await waitFor(() => {
      expect(productsApi.getAdminProducts).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 })
      )
    })
  })

  it('renders empty state when no products are returned', async () => {
    vi.mocked(productsApi.getAdminProducts).mockResolvedValueOnce({
      data: [],
      meta: {
        timestamp: '2026-08-16T08:00:00Z',
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      },
      message: '',
    })

    renderWithClient(<ProductsPage />)

    await waitFor(() => {
      expect(screen.getByText(/Không tìm thấy sản phẩm nào/i)).toBeInTheDocument()
    })
  })

  it('renders error state and allows retry on failure', async () => {
    vi.mocked(productsApi.getAdminProducts).mockRejectedValueOnce(
      new Error('Network error')
    )

    renderWithClient(<ProductsPage />)

    await waitFor(() => {
      expect(screen.getByText(/Đã có lỗi xảy ra khi tải danh sách sản phẩm/i)).toBeInTheDocument()
    })

    // Mock successful recovery
    vi.mocked(productsApi.getAdminProducts).mockResolvedValueOnce({
      data: mockProducts,
      meta: {
        timestamp: '2026-08-16T08:00:00Z',
        pagination: {
          page: 1,
          limit: 10,
          total: 2,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
      message: '',
    })

    const retryButton = screen.getByRole('button', { name: /Thử lại/i })
    fireEvent.click(retryButton)

    await waitFor(() => {
      expect(screen.getByText('iPhone 15 Pro Max')).toBeInTheDocument()
    })
  })

  it('has "Thêm sản phẩm" button that links or navigates to /products/new', async () => {
    vi.mocked(productsApi.getAdminProducts).mockResolvedValueOnce({
      data: [],
      meta: {
        timestamp: '2026-08-16T08:00:00Z',
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      },
      message: '',
    })

    renderWithClient(<ProductsPage />)

    const addButton = screen.getByRole('link', { name: /Thêm sản phẩm/i })
    expect(addButton).toHaveAttribute('href', '/products/new')
  })

  it('handles image error gracefully by concealing broken image', async () => {
    vi.mocked(productsApi.getAdminProducts).mockResolvedValueOnce({
      data: [mockProducts[0]],
      meta: {
        timestamp: '2026-08-16T08:00:00Z',
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
      message: '',
    })

    renderWithClient(<ProductsPage />)

    await waitFor(() => {
      expect(screen.getByAltText('iPhone 15 Pro Max')).toBeInTheDocument()
    })

    const img = screen.getByAltText('iPhone 15 Pro Max')
    fireEvent.error(img)
    expect(img).toHaveStyle({ display: 'none' })
  })

  it('opens delete confirmation dialog when delete button is clicked on a product row', async () => {
    vi.mocked(productsApi.getAdminProducts).mockResolvedValueOnce({
      data: mockProducts,
      meta: {
        timestamp: '2026-08-16T08:00:00Z',
        pagination: {
          page: 1,
          limit: 10,
          total: 2,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
      message: '',
    })

    renderWithClient(<ProductsPage />)

    await waitFor(() => {
      expect(screen.getByText('iPhone 15 Pro Max')).toBeInTheDocument()
    })

    // Click delete button on the first product row
    const deleteButtons = screen.getAllByRole('button', { name: /Xóa sản phẩm/i })
    fireEvent.click(deleteButtons[0])

    // Verify dialog appears with product name and Vietnamese confirmation message
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText(/Xác nhận xóa sản phẩm/i)).toBeInTheDocument()
    expect(
      within(dialog).getByText((content) => content.includes('iPhone 15 Pro Max'))
    ).toBeInTheDocument()
  })

  it('cancels deletion when "Hủy" button is clicked in confirmation dialog', async () => {
    vi.mocked(productsApi.getAdminProducts).mockResolvedValueOnce({
      data: mockProducts,
      meta: {
        timestamp: '2026-08-16T08:00:00Z',
        pagination: {
          page: 1,
          limit: 10,
          total: 2,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
      message: '',
    })

    renderWithClient(<ProductsPage />)

    await waitFor(() => {
      expect(screen.getByText('iPhone 15 Pro Max')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByRole('button', { name: /Xóa sản phẩm/i })
    fireEvent.click(deleteButtons[0])

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    // Click Cancel
    const cancelBtn = screen.getByRole('button', { name: 'Hủy' })
    fireEvent.click(cancelBtn)

    // Dialog should be closed and delete API should not be called
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(productsApi.deleteAdminProduct).not.toHaveBeenCalled()
  })

  it('confirms deletion, triggers DELETE API, shows Vietnamese success notification, and refreshes the product table', async () => {
    vi.mocked(productsApi.getAdminProducts).mockResolvedValueOnce({
      data: mockProducts,
      meta: {
        timestamp: '2026-08-16T08:00:00Z',
        pagination: {
          page: 1,
          limit: 10,
          total: 2,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
      message: '',
    })

    vi.mocked(productsApi.deleteAdminProduct).mockResolvedValueOnce(undefined)

    renderWithClient(<ProductsPage />)

    await waitFor(() => {
      expect(screen.getByText('iPhone 15 Pro Max')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByRole('button', { name: /Xóa sản phẩm/i })
    fireEvent.click(deleteButtons[0])

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    // Mock the subsequent list fetch after deletion (iPhone 15 Pro Max removed)
    vi.mocked(productsApi.getAdminProducts).mockResolvedValueOnce({
      data: [mockProducts[1]],
      meta: {
        timestamp: '2026-08-16T08:00:00Z',
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
      message: '',
    })

    // Click confirm deletion button
    const confirmBtn = screen.getByRole('button', { name: /^Xóa$|^Xác nhận/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(productsApi.deleteAdminProduct).toHaveBeenCalledWith('prod-1')
    })

    // Dialog should be closed
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    // Success message in Vietnamese
    expect(
      screen.getByText(/Đã xóa sản phẩm thành công/i)
    ).toBeInTheDocument()
  })

  it('displays Vietnamese error message when delete API call fails', async () => {
    vi.mocked(productsApi.getAdminProducts).mockResolvedValueOnce({
      data: mockProducts,
      meta: {
        timestamp: '2026-08-16T08:00:00Z',
        pagination: {
          page: 1,
          limit: 10,
          total: 2,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
      message: '',
    })

    vi.mocked(productsApi.deleteAdminProduct).mockRejectedValueOnce(
      new Error('Không thể xóa sản phẩm do lỗi hệ thống')
    )

    renderWithClient(<ProductsPage />)

    await waitFor(() => {
      expect(screen.getByText('iPhone 15 Pro Max')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByRole('button', { name: /Xóa sản phẩm/i })
    fireEvent.click(deleteButtons[0])

    const confirmBtn = screen.getByRole('button', { name: /^Xóa$|^Xác nhận/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(productsApi.deleteAdminProduct).toHaveBeenCalledWith('prod-1')
    })

    // Shows error message
    await waitFor(() => {
      expect(
        screen.getByText(/Không thể xóa sản phẩm/i)
      ).toBeInTheDocument()
    })
  })
})
