import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProductFormPage } from './ProductFormPage'
import * as productsApi from '@/api/products'
import * as categoriesApi from '@/api/categories'
import { ApiError } from '@/api/types'
import type { Category, ProductDetail, ProductImageUploadResult } from '@/api/types'

vi.mock('@/api/products', () => ({
  createAdminProduct: vi.fn(),
  updateAdminProduct: vi.fn(),
  getAdminProductById: vi.fn(),
  uploadProductImage: vi.fn(),
}))

vi.mock('@/api/categories', () => ({
  getCategories: vi.fn(),
  getAdminCategories: vi.fn(),
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
    vi.mocked(categoriesApi.getAdminCategories).mockResolvedValue(mockCategories)
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

    it('submits valid simple product with uploaded Object Storage images and redirects', async () => {
      vi.mocked(productsApi.uploadProductImage)
        .mockResolvedValueOnce({
          key: '11111111-1111-1111-1111-111111111111.webp',
          url: '/media/products/11111111-1111-1111-1111-111111111111.webp',
          mimeType: 'image/webp',
          sizeBytes: 1200,
        })
        .mockResolvedValueOnce({
          key: '22222222-2222-2222-2222-222222222222.jpg',
          url: '/media/products/22222222-2222-2222-2222-222222222222.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 2400,
        })
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

      const file1 = new File(['img1'], 'xiaomi1.webp', { type: 'image/webp' })
      const file2 = new File(['img2'], 'xiaomi2.jpg', { type: 'image/jpeg' })
      const fileInput = screen.getByLabelText(/tải lên hình ảnh sản phẩm/i)
      fireEvent.change(fileInput, { target: { files: [file1, file2] } })

      await waitFor(() => {
        expect(productsApi.uploadProductImage).toHaveBeenCalledTimes(2)
      })
      expect(await screen.findByText('Ảnh đại diện')).toBeInTheDocument()

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
          imageUrls: [
            '/media/products/11111111-1111-1111-1111-111111111111.webp',
            '/media/products/22222222-2222-2222-2222-222222222222.jpg',
          ],
          hasVariants: false,
          optionGroups: [],
          variants: [],
          specs: [],
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

  describe('Object Storage Image Uploader & Gallery Controls (Req 4.3)', () => {
    it('supports drag-and-drop upload, rejects invalid file types/sizes, reorders, sets primary, deletes, and adds external URL', async () => {
      vi.mocked(productsApi.uploadProductImage)
        .mockResolvedValueOnce({
          key: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1.webp',
          url: '/media/products/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1.webp',
          mimeType: 'image/webp',
          sizeBytes: 500,
        })
        .mockResolvedValueOnce({
          key: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2.png',
          url: '/media/products/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2.png',
          mimeType: 'image/png',
          sizeBytes: 800,
        })
      vi.mocked(productsApi.createAdminProduct).mockResolvedValueOnce(mockProductDetail)

      renderComponent('/products/new')

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Điện thoại' })).toBeInTheDocument()
      })

      const dropzone = screen.getByTestId('product-image-dropzone')

      // Invalid MIME type rejected client-side without calling API
      const invalidFile = new File(['gif'], 'bad.gif', { type: 'image/gif' })
      fireEvent.drop(dropzone, { dataTransfer: { files: [invalidFile] } })
      expect(await screen.findByText(/bad\.gif: Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP/i)).toBeInTheDocument()
      expect(productsApi.uploadProductImage).not.toHaveBeenCalled()

      // Oversized file rejected client-side
      const hugeFile = new File(['x'], 'huge.jpg', { type: 'image/jpeg' })
      Object.defineProperty(hugeFile, 'size', { value: 10 * 1024 * 1024 + 5 })
      fireEvent.drop(dropzone, { dataTransfer: { files: [hugeFile] } })
      expect(await screen.findByText(/từ 1 byte đến tối đa 10 MB/i)).toBeInTheDocument()
      expect(productsApi.uploadProductImage).not.toHaveBeenCalled()

      // Valid multi-file drop
      const valid1 = new File(['1'], 'first.webp', { type: 'image/webp' })
      const valid2 = new File(['2'], 'second.png', { type: 'image/png' })
      fireEvent.drop(dropzone, { dataTransfer: { files: [valid1, valid2] } })

      await waitFor(() => {
        expect(productsApi.uploadProductImage).toHaveBeenCalledTimes(2)
      })
      expect(await screen.findByAltText('Ảnh sản phẩm 1')).toHaveAttribute(
        'src',
        '/media/products/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1.webp'
      )
      expect(screen.getByAltText('Ảnh sản phẩm 2')).toHaveAttribute(
        'src',
        '/media/products/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2.png'
      )
      expect(screen.getByText('Ảnh đại diện')).toBeInTheDocument()

      // Set second image as primary
      fireEvent.click(screen.getByRole('button', { name: /đặt ảnh 2 làm ảnh đại diện/i }))
      expect(screen.getByAltText('Ảnh sản phẩm 1')).toHaveAttribute(
        'src',
        '/media/products/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2.png'
      )

      // Delete first image
      fireEvent.click(screen.getByRole('button', { name: /xóa ảnh 1/i }))
      expect(screen.queryByAltText('Ảnh sản phẩm 2')).not.toBeInTheDocument()
      expect(screen.getByAltText('Ảnh sản phẩm 1')).toHaveAttribute(
        'src',
        '/media/products/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1.webp'
      )

      // Add optional external URL for legacy compatibility
      fireEvent.click(screen.getByRole('button', { name: /thêm url ảnh ngoài/i }))
      fireEvent.change(screen.getByLabelText(/đường dẫn url ảnh ngoài/i), {
        target: { value: 'https://example.com/legacy-phone.jpg' },
      })
      fireEvent.click(screen.getByRole('button', { name: /^thêm url$/i }))

      expect(screen.getByAltText('Ảnh sản phẩm 2')).toHaveAttribute(
        'src',
        'https://example.com/legacy-phone.jpg'
      )

      // Submit product and verify imageUrls order
      fireEvent.change(screen.getByLabelText(/tên sản phẩm/i), { target: { value: 'iPhone 16 Pro' } })
      fireEvent.change(screen.getByLabelText(/thương hiệu/i), { target: { value: 'Apple' } })
      fireEvent.change(screen.getByLabelText(/danh mục/i), { target: { value: 'cat-phones' } })
      fireEvent.change(screen.getByLabelText(/giá/i), { target: { value: '28990000' } })
      fireEvent.click(screen.getByRole('button', { name: /^tạo sản phẩm$/i }))

      await waitFor(() => {
        expect(productsApi.createAdminProduct).toHaveBeenCalledWith(
          expect.objectContaining({
            imageUrls: [
              '/media/products/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1.webp',
              'https://example.com/legacy-phone.jpg',
            ],
          })
        )
      })
    })

    it('preserves concurrent gallery edits made while an image upload is in flight', async () => {
      let resolveUpload!: (val: ProductImageUploadResult) => void
      const pendingUpload = new Promise<ProductImageUploadResult>((resolve) => {
        resolveUpload = resolve
      })

      vi.mocked(productsApi.getAdminProductById).mockResolvedValueOnce(mockProductDetail)
      vi.mocked(productsApi.uploadProductImage).mockReturnValueOnce(pendingUpload)
      vi.mocked(productsApi.updateAdminProduct).mockResolvedValueOnce(mockProductDetail)

      renderComponent('/products/prod-123')

      // Wait for existing 2 images to load
      expect(await screen.findByAltText('Ảnh sản phẩm 1')).toHaveAttribute(
        'src',
        'https://example.com/iphone1.jpg'
      )
      expect(screen.getByAltText('Ảnh sản phẩm 2')).toHaveAttribute(
        'src',
        'https://example.com/iphone2.jpg'
      )

      // Start an image upload
      const file = new File(['img3'], 'iphone3.webp', { type: 'image/webp' })
      fireEvent.change(screen.getByLabelText(/tải lên hình ảnh sản phẩm/i), {
        target: { files: [file] },
      })
      expect(await screen.findByText('Đang tải ảnh lên...')).toBeInTheDocument()

      // While upload is in flight, delete image 1 and add an external URL
      fireEvent.click(screen.getByRole('button', { name: /xóa ảnh 1/i }))
      expect(screen.queryByAltText('Ảnh sản phẩm 2')).not.toBeInTheDocument()
      expect(screen.getByAltText('Ảnh sản phẩm 1')).toHaveAttribute(
        'src',
        'https://example.com/iphone2.jpg'
      )

      fireEvent.click(screen.getByRole('button', { name: /thêm url ảnh ngoài/i }))
      fireEvent.change(screen.getByLabelText(/đường dẫn url ảnh ngoài/i), {
        target: { value: 'https://example.com/iphone3-ext.jpg' },
      })
      fireEvent.click(screen.getByRole('button', { name: /^thêm url$/i }))
      expect(screen.getByAltText('Ảnh sản phẩm 2')).toHaveAttribute(
        'src',
        'https://example.com/iphone3-ext.jpg'
      )

      // Complete the in-flight upload
      resolveUpload({
        key: '33333333-3333-3333-3333-333333333333.webp',
        url: '/media/products/33333333-3333-3333-3333-333333333333.webp',
        mimeType: 'image/webp',
        sizeBytes: 1500,
      })

      // Gallery must retain iphone2, iphone3-ext, AND append uploaded image without resurrecting iphone1
      expect(await screen.findByAltText('Ảnh sản phẩm 3')).toHaveAttribute(
        'src',
        '/media/products/33333333-3333-3333-3333-333333333333.webp'
      )
      expect(screen.getByAltText('Ảnh sản phẩm 1')).toHaveAttribute(
        'src',
        'https://example.com/iphone2.jpg'
      )
      expect(screen.getByAltText('Ảnh sản phẩm 2')).toHaveAttribute(
        'src',
        'https://example.com/iphone3-ext.jpg'
      )
    })
  })

  describe('Structured Specs Editor & Phone Preset (Req 5.2)', () => {
    it('applies 6-group phone preset without overwriting existing groups/labels/values and submits structured specs', async () => {
      vi.mocked(productsApi.createAdminProduct).mockResolvedValueOnce(mockProductDetail)

      renderComponent('/products/new')

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Điện thoại' })).toBeInTheDocument()
      })

      // Add a custom group first and fill in an existing label + value in Màn hình
      fireEvent.click(screen.getByRole('button', { name: /thêm nhóm thông số/i }))
      fireEvent.change(screen.getByLabelText('Tên nhóm thông số 1'), {
        target: { value: 'Màn hình' },
      })
      fireEvent.change(screen.getByLabelText('Nhãn thông số 1.1'), {
        target: { value: 'Kích thước & Tấm nền' },
      })
      fireEvent.change(screen.getByLabelText('Giá trị thông số 1.1'), {
        target: { value: '6.9 inch Super Retina XDR' },
      })

      // Apply Phone Preset
      fireEvent.click(screen.getByRole('button', { name: /áp dụng mẫu điện thoại/i }))

      // Existing value must be preserved verbatim
      expect(screen.getByLabelText('Giá trị thông số 1.1')).toHaveValue(
        '6.9 inch Super Retina XDR'
      )

      // All 6 standard groups must now be present
      for (const expectedGroup of [
        'Màn hình',
        'Hiệu năng & Chipset',
        'Camera',
        'Pin & Sạc',
        'Kết nối',
        'Thiết kế & Độ bền',
      ]) {
        expect(screen.getByDisplayValue(expectedGroup)).toBeInTheDocument()
      }

      // Remove groups 2..6 and unfilled preset rows in group 1 so only filled row remains, then add a new row
      for (let idx = 6; idx >= 2; idx--) {
        fireEvent.click(screen.getByRole('button', { name: `Xóa nhóm ${idx}` }))
      }
      fireEvent.click(screen.getByRole('button', { name: 'Xóa dòng 1.3' }))
      fireEvent.click(screen.getByRole('button', { name: 'Xóa dòng 1.2' }))

      fireEvent.change(screen.getByLabelText(/tên sản phẩm/i), { target: { value: 'iPhone 16 Pro Max' } })
      fireEvent.change(screen.getByLabelText(/thương hiệu/i), { target: { value: 'Apple' } })
      fireEvent.change(screen.getByLabelText(/danh mục/i), { target: { value: 'cat-phones' } })
      fireEvent.change(screen.getByLabelText(/giá bán \(vnd\)/i), { target: { value: '34990000' } })
      fireEvent.click(screen.getByRole('button', { name: /^tạo sản phẩm$/i }))

      await waitFor(() => {
        expect(productsApi.createAdminProduct).toHaveBeenCalledWith(
          expect.objectContaining({
            specs: [
              {
                group: 'Màn hình',
                items: [
                  {
                    label: 'Kích thước & Tấm nền',
                    value: '6.9 inch Super Retina XDR',
                  },
                ],
              },
            ],
          })
        )
      })
    })

    it('populates existing specs and images in edit mode and maps server validation errors', async () => {
      vi.mocked(productsApi.getAdminProductById).mockResolvedValueOnce({
        ...mockProductDetail,
        imageUrls: ['/media/products/550e8400-e29b-41d4-a716-446655440000.webp'],
        specs: [
          {
            group: 'Hiệu năng & Chipset',
            items: [{ label: 'Chipset', value: 'Apple A18 Pro' }],
          },
        ],
      })
      vi.mocked(productsApi.updateAdminProduct).mockRejectedValueOnce(
        new ApiError(400, {
          code: 'validation_error',
          message: 'Dữ liệu không hợp lệ',
          fields: {
            'specs[0].items[0].value': 'Giá trị thông số không hợp lệ từ server',
          },
        })
      )

      renderComponent('/products/prod-123')

      expect(await screen.findByDisplayValue('Hiệu năng & Chipset')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Chipset')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Apple A18 Pro')).toBeInTheDocument()
      expect(screen.getByAltText('Ảnh sản phẩm 1')).toHaveAttribute(
        'src',
        '/media/products/550e8400-e29b-41d4-a716-446655440000.webp'
      )

      fireEvent.click(screen.getByRole('button', { name: /^cập nhật sản phẩm$/i }))
      expect(await screen.findByText('Giá trị thông số không hợp lệ từ server')).toBeInTheDocument()
    })
  })
})
