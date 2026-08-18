import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { CategoriesPage } from './CategoriesPage'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { ApiError } from '@/api/types'
import * as api from '@/api/categories'

vi.mock('@/api/categories', () => ({
  getAdminCategories: vi.fn(), createCategory: vi.fn(), updateCategory: vi.fn(), deleteCategory: vi.fn(),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'admin@auraphone.vn' }, logout: vi.fn() }),
}))

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

const categories = [{ id: 'cat-1', name: 'Điện thoại' }, { id: 'cat-2', name: 'Máy tính bảng' }]
function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/categories']}><Routes><Route path="/categories" element={<CategoriesPage />} /></Routes></MemoryRouter></QueryClientProvider>)
}

describe('CategoriesPage', () => {
  beforeEach(() => vi.clearAllMocks())
  it('shows loading and then category list', async () => {
    vi.mocked(api.getAdminCategories).mockResolvedValue(categories)
    renderPage()
    expect(screen.getByText('Đang tải danh mục...')).toBeInTheDocument()
    expect(await screen.findByText('Điện thoại')).toBeInTheDocument()
    expect(screen.getByText('cat-1')).toBeInTheDocument()
  })
  it('shows empty guide', async () => {
    vi.mocked(api.getAdminCategories).mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('Chưa có danh mục nào')).toBeInTheDocument()
    expect(screen.getByText(/tạo danh mục đầu tiên/i)).toBeInTheDocument()
  })
  it('invalidates admin and shared category/product caches after create', async () => {
    vi.mocked(api.getAdminCategories).mockResolvedValue([])
    vi.mocked(api.createCategory).mockResolvedValue(categories[0])
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/categories']}><Routes><Route path="/categories" element={<CategoriesPage />} /></Routes></MemoryRouter></QueryClientProvider>)
    await screen.findByText('Chưa có danh mục nào')
    fireEvent.change(screen.getByLabelText(/Tên danh mục/), { target: { value: 'Điện thoại' } })
    fireEvent.click(screen.getByRole('button', { name: /Thêm danh mục/i }))
    await waitFor(() => expect(api.createCategory).toHaveBeenCalled())
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'categories'] })
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['categories'] })
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'products'] })
    })
  })

  it('trims and creates a category, invalidating list', async () => {
    vi.mocked(api.getAdminCategories).mockResolvedValue([])
    vi.mocked(api.createCategory).mockResolvedValue(categories[0])
    renderPage()
    await screen.findByText('Chưa có danh mục nào')
    fireEvent.change(screen.getByLabelText(/Tên danh mục/), { target: { value: '  Điện thoại  ' } })
    fireEvent.click(screen.getByRole('button', { name: /Thêm danh mục/i }))
    await waitFor(() => expect(api.createCategory).toHaveBeenCalledWith({ name: 'Điện thoại' }, expect.anything()))
    expect(await screen.findByText(/Đã tạo danh mục/i)).toBeInTheDocument()
  })
  it('binds validation error and blocks blank create', async () => {
    vi.mocked(api.getAdminCategories).mockResolvedValue([])
    renderPage()
    await screen.findByText('Chưa có danh mục nào')
    fireEvent.click(screen.getByRole('button', { name: /Thêm danh mục/i }))
    expect(await screen.findByText(/Vui lòng nhập tên danh mục/i)).toBeInTheDocument()
    expect(api.createCategory).not.toHaveBeenCalled()
  })
  it('shows a Vietnamese list error and retries while retaining cached rows', async () => {
    vi.mocked(api.getAdminCategories).mockRejectedValueOnce(new Error('server unavailable')).mockResolvedValueOnce(categories)
    renderPage()
    expect(await screen.findByText(/Không thể tải danh sách danh mục\. Vui lòng thử lại sau\./i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByText('Điện thoại')).toBeInTheDocument()
  })
  it('handles duplicate create errors in Vietnamese', async () => {
    vi.mocked(api.getAdminCategories).mockResolvedValue([])
    vi.mocked(api.createCategory).mockRejectedValue(new ApiError(409, { code: 'category_name_in_use', message: 'duplicate' }))
    renderPage()
    await screen.findByText('Chưa có danh mục nào')
    fireEvent.change(screen.getByLabelText(/Tên danh mục/), { target: { value: 'Điện thoại' } })
    fireEvent.click(screen.getByRole('button', { name: /Thêm danh mục/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Tên danh mục đã tồn tại trên hệ thống.')
  })
  it('binds rename validation errors accessibly and permits retry', async () => {
    vi.mocked(api.getAdminCategories).mockResolvedValue(categories)
    vi.mocked(api.updateCategory).mockRejectedValueOnce(new ApiError(400, { code: 'validation_error', message: 'invalid', fields: { name: 'Tên không hợp lệ' } })).mockResolvedValueOnce(categories[1])
    renderPage()
    await screen.findByText('Điện thoại')
    fireEvent.click(screen.getByRole('button', { name: /Đổi tên Điện thoại/i }))
    const input = screen.getByRole('textbox', { name: /Tên danh mục Điện thoại/i })
    fireEvent.change(input, { target: { value: 'Tên mới' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(await screen.findByText('Tên không hợp lệ')).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-describedby', 'category-edit-name-error')
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    await waitFor(() => expect(api.updateCategory).toHaveBeenCalledTimes(2))
  })
  it('handles duplicate and not-found rename errors', async () => {
    vi.mocked(api.getAdminCategories).mockResolvedValue(categories)
    vi.mocked(api.updateCategory).mockRejectedValueOnce(new ApiError(409, { code: 'category_name_in_use', message: 'duplicate' })).mockRejectedValueOnce(new ApiError(404, { code: 'category_not_found', message: 'missing' }))
    renderPage()
    await screen.findByText('Điện thoại')
    fireEvent.click(screen.getByRole('button', { name: /Đổi tên Điện thoại/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /Tên danh mục Điện thoại/i }), { target: { value: 'Máy tính bảng' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(await screen.findByText('Tên danh mục đã tồn tại trên hệ thống.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(await screen.findByText('Không tìm thấy danh mục.')).toBeInTheDocument()
  })
  it('navigates from the sidebar to categories and renders the category page', async () => {
    vi.mocked(api.getAdminCategories).mockResolvedValue(categories)
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={['/']}><Routes><Route path="/" element={<AdminLayout />}><Route index element={<div>Trang chủ</div>} /><Route path="categories" element={<CategoriesPage />} /></Route></Routes><LocationProbe /></MemoryRouter></QueryClientProvider>)
    fireEvent.click(screen.getByRole('link', { name: 'Danh mục' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/categories')
    expect(await screen.findByRole('heading', { name: 'Quản lý danh mục' })).toBeInTheDocument()
    expect(await screen.findByText('Điện thoại')).toBeInTheDocument()
  })

  it('supports keyboard dismissal of the delete confirmation and keyboard form submission', async () => {
    vi.mocked(api.getAdminCategories).mockResolvedValue(categories)
    vi.mocked(api.createCategory).mockResolvedValue(categories[0])
    renderPage()
    await screen.findByText('Điện thoại')
    fireEvent.click(screen.getByRole('button', { name: /Xóa Điện thoại/i }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    const input = screen.getByLabelText(/Tên danh mục/)
    const user = userEvent.setup()
    await user.clear(input)
    await user.type(input, 'Điện thoại mới')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(api.createCategory).toHaveBeenCalledWith({ name: 'Điện thoại mới' }, expect.anything()))
  })

  it('keeps existing rows and permits retry after create mutation failure', async () => {
    vi.mocked(api.getAdminCategories).mockResolvedValue(categories)
    vi.mocked(api.createCategory).mockRejectedValueOnce(new ApiError(500, { code: 'internal', message: 'server' })).mockResolvedValueOnce(categories[0])
    renderPage()
    await screen.findByText('Điện thoại')
    fireEvent.change(screen.getByLabelText(/Tên danh mục/), { target: { value: 'Máy ảnh' } })
    fireEvent.click(screen.getByRole('button', { name: /Thêm danh mục/i }))
    expect(await screen.findByText(/Không thể tạo danh mục/i)).toBeInTheDocument()
    expect(screen.getByText('Điện thoại')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Thêm danh mục/i }))
    await waitFor(() => expect(api.createCategory).toHaveBeenCalledTimes(2))
  })

  it('keeps existing rows and permits retry after rename mutation failure', async () => {
    vi.mocked(api.getAdminCategories).mockResolvedValue(categories)
    vi.mocked(api.updateCategory).mockRejectedValueOnce(new ApiError(500, { code: 'internal', message: 'server' })).mockResolvedValueOnce(categories[0])
    renderPage()
    await screen.findByText('Điện thoại')
    fireEvent.click(screen.getByRole('button', { name: /Đổi tên Điện thoại/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /Tên danh mục Điện thoại/i }), { target: { value: 'Điện thoại mới' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(await screen.findByText(/Không thể đổi tên danh mục/i)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Tên danh mục Điện thoại/i })).toHaveValue('Điện thoại mới')
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    await waitFor(() => expect(api.updateCategory).toHaveBeenCalledTimes(2))
  })

  it('keeps existing rows and permits retry after delete mutation failure', async () => {
    vi.mocked(api.getAdminCategories).mockResolvedValue(categories)
    vi.mocked(api.deleteCategory).mockRejectedValueOnce(new ApiError(500, { code: 'internal', message: 'server' })).mockResolvedValueOnce(categories[0])
    renderPage()
    await screen.findByText('Điện thoại')
    fireEvent.click(screen.getByRole('button', { name: /Xóa Điện thoại/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Xóa$/ }))
    expect(await screen.findByText(/Không thể xóa danh mục/i)).toBeInTheDocument()
    expect(screen.getAllByText('Điện thoại').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /^Xóa Điện thoại/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Xóa$/ }))
    await waitFor(() => expect(api.deleteCategory).toHaveBeenCalledTimes(2))
  })

  it('handles not-found delete while keeping the category visible', async () => {
    vi.mocked(api.getAdminCategories).mockResolvedValue(categories)
    vi.mocked(api.deleteCategory).mockRejectedValue(new ApiError(404, { code: 'category_not_found', message: 'missing' }))
    renderPage()
    await screen.findByText('Điện thoại')
    fireEvent.click(screen.getByRole('button', { name: /Xóa Điện thoại/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Xóa$/ }))
    expect(await screen.findByText('Không tìm thấy danh mục.')).toBeInTheDocument()
    expect(screen.getAllByText('Điện thoại').length).toBeGreaterThan(0)
  })
  it('requires confirmation before deleting and handles in-use error', async () => {
    vi.mocked(api.getAdminCategories).mockResolvedValue(categories)
    vi.mocked(api.deleteCategory).mockRejectedValue(new ApiError(409, { code: 'category_in_use', message: 'in use' }))
    renderPage()
    await screen.findByText('Điện thoại')
    fireEvent.click(screen.getByRole('button', { name: /Xóa Điện thoại/i }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(api.deleteCategory).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /^Xóa$/ }))
    await waitFor(() => expect(api.deleteCategory).toHaveBeenCalledWith('cat-1', expect.anything()))
    expect(await screen.findByText(/Danh mục đang có sản phẩm sử dụng, không thể xoá/i)).toBeInTheDocument()
  })

  it('successfully deletes category, shows success message, and removes row (Req 4.1, 5.1)', async () => {
    vi.mocked(api.getAdminCategories)
      .mockResolvedValueOnce(categories)
      .mockResolvedValueOnce([categories[1]])
    vi.mocked(api.deleteCategory).mockResolvedValue(categories[0])
    renderPage()

    await screen.findByText('Điện thoại')
    fireEvent.click(screen.getByRole('button', { name: /Xóa Điện thoại/i }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Xóa$/ }))

    expect(await screen.findByText(/Xoá danh mục thành công/i)).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('Điện thoại')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Máy tính bảng')).toBeInTheDocument()
  })

  it('keeps previously cached categories visible if background refetch fails (Req 5.2)', async () => {
    vi.mocked(api.getAdminCategories)
      .mockResolvedValueOnce(categories)
      .mockRejectedValueOnce(new Error('Network error'))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/categories']}>
          <Routes>
            <Route path="/categories" element={<CategoriesPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    await screen.findByText('Điện thoại')
    expect(screen.getByText('Máy tính bảng')).toBeInTheDocument()

    // Trigger refetch failure
    await queryClient.refetchQueries({ queryKey: ['admin', 'categories'] })

    // Rows remain visible despite refetch failure
    expect(screen.getByText('Điện thoại')).toBeInTheDocument()
    expect(screen.getByText('Máy tính bảng')).toBeInTheDocument()
  })
})
