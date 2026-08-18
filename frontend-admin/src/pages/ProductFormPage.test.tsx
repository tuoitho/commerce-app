import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProductFormPage } from './ProductFormPage'
import * as productsApi from '@/api/products'
import * as categoriesApi from '@/api/categories'
import { ApiError } from '@/api/types'
import type { Category, ProductDetail } from '@/api/types'

vi.mock('@/api/products', () => ({
  createAdminProduct: vi.fn(),
  updateAdminProduct: vi.fn(),
  getAdminProductById: vi.fn(),
}))

vi.mock('@/api/categories', () => ({
  getCategories: vi.fn(),
}))

const mockCategories: Category[] = [
  { id: 'cat-phones', name: 'Điện thoại' },
  { id: 'cat-tablets', name: 'Máy tính bảng' },
  { id: 'cat-laptops', name: 'Laptop' },
]

const mockProductDetail: ProductDetail = {
  id: 'prod-123',
  name: 'iPhone 15 Pro Max',
  model: 'A3106',
  brand: 'Apple',
  category: { id: 'cat-phones', name: 'Điện thoại' },
  minPriceVnd: '29990000',
  maxPriceVnd: '29990000',
  price: '29990000',
  currency: 'VND',
  primaryImageUrl: 'https://example.com/iphone.jpg',
  inStock: true,
  description: 'Flagship iPhone',
  imageUrls: ['https://example.com/iphone1.jpg', 'https://example.com/iphone2.jpg'],
  stockQuantity: 25,
  featured: true,
  createdAt: '2026-08-16T00:00:00Z',
  updatedAt: '2026-08-16T00:00:00Z',
}

const mockVariantProductDetail: ProductDetail = {
  id: 'prod-var-456',
  name: 'iPhone 15 Pro Max Multi',
  model: 'A3106',
  brand: 'Apple',
  category: { id: 'cat-phones', name: 'Điện thoại' },
  minPriceVnd: '28000000',
  maxPriceVnd: '32000000',
  price: '28000000',
  currency: 'VND',
  primaryImageUrl: 'https://example.com/iphone.jpg',
  inStock: true,
  description: 'Flagship with storage options',
  imageUrls: ['https://example.com/iphone1.jpg'],
  stockQuantity: 15,
  featured: true,
  optionGroups: [
    {
      id: 'grp-storage',
      label: 'Dung lượng',
      position: 0,
      values: [
        { id: 'val-128', label: '128GB' },
        { id: 'val-256', label: '256GB' },
      ],
    },
  ],
  variants: [
    {
      id: 'var-1',
      optionValueIds: { 'grp-storage': 'val-128' },
      priceVND: '28000000',
      stockQuantity: 10,
      active: true,
    },
    {
      id: 'var-2',
      optionValueIds: { 'grp-storage': 'val-256' },
      priceVND: '32000000',
      stockQuantity: 5,
      active: true,
    },
  ],
  createdAt: '2026-08-16T00:00:00Z',
  updatedAt: '2026-08-16T00:00:00Z',
}

function renderComponent(initialRoute = '/products/new') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/products" element={<div data-testid="products-list-page">Danh sách sản phẩm</div>} />
          <Route path="/products/new" element={<ProductFormPage mode="create" />} />
          <Route path="/products/:id" element={<ProductFormPage mode="edit" />} />
          <Route path="/products/:id/edit" element={<ProductFormPage mode="edit" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ProductFormPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(categoriesApi.getCategories).mockResolvedValue(mockCategories)
  })

  describe('Create Mode (Simple Product)', () => {
    it('renders the create product form with mode switcher and basic fields', async () => {
      renderComponent('/products/new')

      expect(screen.getByRole('heading', { name: /thêm sản phẩm/i })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: /sản phẩm đơn giản/i })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: /sản phẩm có biến thể/i })).toBeInTheDocument()
      expect(screen.getByLabelText(/tên sản phẩm/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/model|mã kiểu máy/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/thương hiệu/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/danh mục/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/giá/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/tồn kho|số lượng/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/mô tả/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/nổi bật/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/hình ảnh/i)).toBeInTheDocument()

      // Verify category options are loaded
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Điện thoại' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Máy tính bảng' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Laptop' })).toBeInTheDocument()
      })
    })

    it('displays client-side Vietnamese validation errors when submitting empty form', async () => {
      renderComponent('/products/new')

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Điện thoại' })).toBeInTheDocument()
      })

      const submitButton = screen.getByRole('button', { name: /^tạo sản phẩm$/i })
      fireEvent.click(submitButton)

      expect(await screen.findByText('Tên sản phẩm không được để trống')).toBeInTheDocument()
      expect(await screen.findByText('Thương hiệu không được để trống')).toBeInTheDocument()
      expect(await screen.findByText('Vui lòng chọn danh mục')).toBeInTheDocument()
      expect(await screen.findByText(/giá sản phẩm không được để trống|giá phải lớn hơn/i)).toBeInTheDocument()
      expect(productsApi.createAdminProduct).not.toHaveBeenCalled()
    })

    it('displays validation error for negative price and stock', async () => {
      renderComponent('/products/new')

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Điện thoại' })).toBeInTheDocument()
      })

      fireEvent.change(screen.getByLabelText(/tên sản phẩm/i), { target: { value: 'Galaxy S24 Ultra' } })
      fireEvent.change(screen.getByLabelText(/thương hiệu/i), { target: { value: 'Samsung' } })
      fireEvent.change(screen.getByLabelText(/danh mục/i), { target: { value: 'cat-phones' } })
      fireEvent.change(screen.getByLabelText(/giá/i), { target: { value: '-1000' } })
      fireEvent.change(screen.getByLabelText(/tồn kho|số lượng/i), { target: { value: '-5' } })

      const submitButton = screen.getByRole('button', { name: /^tạo sản phẩm$/i })
      fireEvent.click(submitButton)

      expect(await screen.findByText('Giá phải lớn hơn hoặc bằng 0')).toBeInTheDocument()
      expect(await screen.findByText('Số lượng tồn kho không được âm')).toBeInTheDocument()
      expect(productsApi.createAdminProduct).not.toHaveBeenCalled()
    })

    it('submits valid simple product, calls createAdminProduct with SaveProductRequest, and redirects', async () => {
      vi.mocked(productsApi.createAdminProduct).mockResolvedValueOnce(mockProductDetail)

      renderComponent('/products/new')

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Điện thoại' })).toBeInTheDocument()
      })

      fireEvent.change(screen.getByLabelText(/tên sản phẩm/i), { target: { value: 'Xiaomi 14 Ultra' } })
      fireEvent.change(screen.getByLabelText(/model|mã kiểu máy/i), { target: { value: '24030PN60G' } })
      fireEvent.change(screen.getByLabelText(/thương hiệu/i), { target: { value: 'Xiaomi' } })
      fireEvent.change(screen.getByLabelText(/danh mục/i), { target: { value: 'cat-phones' } })
      fireEvent.change(screen.getByLabelText(/giá/i), { target: { value: '24990000' } })
      fireEvent.change(screen.getByLabelText(/tồn kho|số lượng/i), { target: { value: '15' } })
      fireEvent.change(screen.getByLabelText(/mô tả/i), { target: { value: 'Điện thoại chụp ảnh đỉnh cao' } })
      fireEvent.click(screen.getByLabelText(/nổi bật/i))
      fireEvent.change(screen.getByLabelText(/hình ảnh/i), {
        target: { value: 'https://example.com/xiaomi1.jpg\nhttps://example.com/xiaomi2.jpg' },
      })

      const submitButton = screen.getByRole('button', { name: /^tạo sản phẩm$/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(productsApi.createAdminProduct).toHaveBeenCalledWith({
          name: 'Xiaomi 14 Ultra',
          model: '24030PN60G',
          brand: 'Xiaomi',
          categoryId: 'cat-phones',
          price: '24990000',
          currency: 'VND',
          stockQuantity: 15,
          description: 'Điện thoại chụp ảnh đỉnh cao',
          featured: true,
          imageUrls: ['https://example.com/xiaomi1.jpg', 'https://example.com/xiaomi2.jpg'],
          hasVariants: false,
          optionGroups: [],
          variants: [],
        })
      })

      expect(await screen.findByTestId('products-list-page')).toBeInTheDocument()
    })
  })

  describe('Create Mode (Multi-Variant Product)', () => {
    it('switches to variant mode and configures option groups and variant matrix', async () => {
      vi.mocked(productsApi.createAdminProduct).mockResolvedValueOnce(mockVariantProductDetail)

      renderComponent('/products/new')

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Điện thoại' })).toBeInTheDocument()
      })

      // Toggle to Variant Mode
      const variantModeToggle = screen.getByText(/sản phẩm có biến thể/i)
      fireEvent.click(variantModeToggle)

      // Direct price and stock should no longer be rendered
      expect(screen.queryByLabelText(/^Giá bán \(VND\)/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/^Số lượng tồn kho/i)).not.toBeInTheDocument()

      // Option groups builder should be visible
      expect(screen.getByText(/nhóm phân loại hàng/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /thêm nhóm phân loại/i })).toBeInTheDocument()

      // Add Option Group 1: Màu sắc
      fireEvent.click(screen.getByRole('button', { name: /thêm nhóm phân loại/i }))
      const groupLabelInput = screen.getByPlaceholderText(/Ví dụ: Màu sắc, Dung lượng/i)
      fireEvent.change(groupLabelInput, { target: { value: 'Màu sắc' } })

      // Add values: Đen, Trắng
      const valueInput = screen.getByPlaceholderText(/Nhập giá trị/i)
      fireEvent.change(valueInput, { target: { value: 'Đen' } })
      fireEvent.keyDown(valueInput, { key: 'Enter', code: 'Enter' })

      fireEvent.change(valueInput, { target: { value: 'Trắng' } })
      fireEvent.keyDown(valueInput, { key: 'Enter', code: 'Enter' })

      // Variant table and chips should show combinations
      const denElements = await screen.findAllByText('Đen')
      expect(denElements.length).toBeGreaterThanOrEqual(1)
      const trangElements = await screen.findAllByText('Trắng')
      expect(trangElements.length).toBeGreaterThanOrEqual(1)

      // Fill common product info
      fireEvent.change(screen.getByLabelText(/tên sản phẩm/i), { target: { value: 'iPhone 15 Pro' } })
      fireEvent.change(screen.getByLabelText(/thương hiệu/i), { target: { value: 'Apple' } })
      fireEvent.change(screen.getByLabelText(/danh mục/i), { target: { value: 'cat-phones' } })

      // Use Bulk Apply for variants
      const bulkPriceInput = screen.getByPlaceholderText(/giá chung \(vnd\)/i)
      const bulkStockInput = screen.getByPlaceholderText(/kho chung/i)
      fireEvent.change(bulkPriceInput, { target: { value: '25000000' } })
      fireEvent.change(bulkStockInput, { target: { value: '20' } })

      const bulkApplyBtn = screen.getByRole('button', { name: /áp dụng cho tất cả phân loại/i })
      fireEvent.click(bulkApplyBtn)

      // Submit form
      const submitButton = screen.getByRole('button', { name: /^tạo sản phẩm$/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(productsApi.createAdminProduct).toHaveBeenCalled()
      })

      const callArg = vi.mocked(productsApi.createAdminProduct).mock.calls[0][0]
      expect(callArg.hasVariants).toBe(true)
      expect(callArg.name).toBe('iPhone 15 Pro')
      expect(callArg.price).toBe('25000000')
      expect(callArg.stockQuantity).toBe(40) // 2 variants * 20
      expect(callArg.optionGroups).toHaveLength(1)
      expect(callArg.optionGroups?.[0].label).toBe('Màu sắc')
      expect(callArg.optionGroups?.[0].values).toHaveLength(2)
      expect(callArg.variants).toHaveLength(2)
      expect(callArg.variants?.[0].priceVND).toBe('25000000')
      expect(callArg.variants?.[0].stockQuantity).toBe(20)

      expect(await screen.findByTestId('products-list-page')).toBeInTheDocument()
    })

    it('shows validation errors when variant mode is selected with empty groups or invalid variant entries', async () => {
      renderComponent('/products/new')

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Điện thoại' })).toBeInTheDocument()
      })

      // Switch to variant mode
      fireEvent.click(screen.getByText(/sản phẩm có biến thể/i))

      fireEvent.change(screen.getByLabelText(/tên sản phẩm/i), { target: { value: 'iPhone 15' } })
      fireEvent.change(screen.getByLabelText(/thương hiệu/i), { target: { value: 'Apple' } })
      fireEvent.change(screen.getByLabelText(/danh mục/i), { target: { value: 'cat-phones' } })

      // Submit without adding any option group
      const submitButton = screen.getByRole('button', { name: /^tạo sản phẩm$/i })
      fireEvent.click(submitButton)

      expect(await screen.findByText('Vui lòng thêm ít nhất một nhóm phân loại')).toBeInTheDocument()
      expect(productsApi.createAdminProduct).not.toHaveBeenCalled()
    })
  })

  describe('Edit Mode', () => {
    it('fetches existing simple product and populates all form fields in simple mode', async () => {
      vi.mocked(productsApi.getAdminProductById).mockResolvedValueOnce(mockProductDetail)

      renderComponent('/products/prod-123')

      await waitFor(() => {
        expect(productsApi.getAdminProductById).toHaveBeenCalledWith('prod-123')
      })

      expect(await screen.findByRole('heading', { name: /chỉnh sửa sản phẩm/i })).toBeInTheDocument()

      await waitFor(() => {
        expect(screen.getByLabelText(/tên sản phẩm/i)).toHaveValue('iPhone 15 Pro Max')
        expect(screen.getByLabelText(/model|mã kiểu máy/i)).toHaveValue('A3106')
        expect(screen.getByLabelText(/thương hiệu/i)).toHaveValue('Apple')
        expect(screen.getByLabelText(/danh mục/i)).toHaveValue('cat-phones')
        expect(screen.getByLabelText(/giá/i)).toHaveValue(29990000)
        expect(screen.getByLabelText(/tồn kho|số lượng/i)).toHaveValue(25)
        expect(screen.getByLabelText(/mô tả/i)).toHaveValue('Flagship iPhone')
        expect(screen.getByLabelText(/nổi bật/i)).toBeChecked()
      })
    })

    it('fetches existing product with variants, pre-selects variant mode, and populates option groups and matrix', async () => {
      vi.mocked(productsApi.getAdminProductById).mockResolvedValueOnce(mockVariantProductDetail)
      vi.mocked(productsApi.updateAdminProduct).mockResolvedValueOnce(mockVariantProductDetail)

      renderComponent('/products/prod-var-456')

      await waitFor(() => {
        expect(productsApi.getAdminProductById).toHaveBeenCalledWith('prod-var-456')
      })

      expect(await screen.findByRole('heading', { name: /chỉnh sửa sản phẩm/i })).toBeInTheDocument()

      // Option group label and values should be populated
      expect(await screen.findByDisplayValue('Dung lượng')).toBeInTheDocument()
      const val128Elements = await screen.findAllByText('128GB')
      expect(val128Elements.length).toBeGreaterThanOrEqual(1)
      const val256Elements = await screen.findAllByText('256GB')
      expect(val256Elements.length).toBeGreaterThanOrEqual(1)

      // Submit updated product
      const submitButton = screen.getByRole('button', { name: /^cập nhật sản phẩm$/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(productsApi.updateAdminProduct).toHaveBeenCalled()
      })

      const callArg = vi.mocked(productsApi.updateAdminProduct).mock.calls[0][1]
      expect(callArg.hasVariants).toBe(true)
      expect(callArg.optionGroups).toHaveLength(1)
      expect(callArg.variants).toHaveLength(2)
      expect(callArg.price).toBe('28000000')

      expect(await screen.findByTestId('products-list-page')).toBeInTheDocument()
    })

    it('displays error state when product is not found (404)', async () => {
      const notFoundError = new ApiError(404, {
        code: 'not_found',
        message: 'Không tìm thấy sản phẩm',
      })
      vi.mocked(productsApi.getAdminProductById).mockRejectedValueOnce(notFoundError)

      renderComponent('/products/invalid-id')

      expect(await screen.findByRole('heading', { name: /không tìm thấy sản phẩm/i })).toBeInTheDocument()
    })

    it('maps backend 400 validation errors for variant fields', async () => {
      const validationError = new ApiError(400, {
        code: 'validation_error',
        message: 'Dữ liệu không hợp lệ',
        fields: {
          'optionGroups[0].label': 'Tên nhóm thuộc tính không hợp lệ',
          'variants[0].priceVND': 'Giá biến thể không hợp lệ',
        },
      })
      vi.mocked(productsApi.createAdminProduct).mockRejectedValueOnce(validationError)

      renderComponent('/products/new')

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Điện thoại' })).toBeInTheDocument()
      })

      // Toggle to variant mode
      fireEvent.click(screen.getByText(/sản phẩm có biến thể/i))

      // Add group and value
      fireEvent.click(screen.getByRole('button', { name: /thêm nhóm phân loại/i }))
      fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Màu sắc, Dung lượng/i), { target: { value: 'Màu sắc' } })
      const valInput = screen.getByPlaceholderText(/Nhập giá trị/i)
      fireEvent.change(valInput, { target: { value: 'Đen' } })
      fireEvent.keyDown(valInput, { key: 'Enter', code: 'Enter' })

      fireEvent.change(screen.getByLabelText(/tên sản phẩm/i), { target: { value: 'iPhone 15' } })
      fireEvent.change(screen.getByLabelText(/thương hiệu/i), { target: { value: 'Apple' } })
      fireEvent.change(screen.getByLabelText(/danh mục/i), { target: { value: 'cat-phones' } })

      // Apply bulk price
      fireEvent.change(screen.getByPlaceholderText(/giá chung \(vnd\)/i), { target: { value: '25000000' } })
      fireEvent.click(screen.getByRole('button', { name: /áp dụng cho tất cả phân loại/i }))

      const submitButton = screen.getByRole('button', { name: /^tạo sản phẩm$/i })
      fireEvent.click(submitButton)

      expect(await screen.findByText('Tên nhóm thuộc tính không hợp lệ')).toBeInTheDocument()
      expect(await screen.findByText('Giá biến thể không hợp lệ')).toBeInTheDocument()
    })
  })
})
