import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UsersPage } from './UsersPage'
import * as usersApi from '@/api/users'
import type { AdminUserSummary } from '@/api/users'

vi.mock('@/api/users', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/users')>()
  return {
    ...actual,
    listAdminUsers: vi.fn(),
  }
})

function LocationProbe() {
  const location = useLocation()
  return (
    <>
      <output data-testid="location">{location.pathname}{location.search}</output>
      <output data-testid="location-state">{JSON.stringify(location.state)}</output>
    </>
  )
}

const users: AdminUserSummary[] = [
  {
    id: 'u-1',
    email: 'khach@example.com',
    role: 'customer',
    status: 'locked',
    orderCount: 3,
    createdAt: '2026-11-01T17:30:00Z',
  },
  {
    id: 'u-2',
    email: 'quan.tri@example.com',
    role: 'admin',
    status: 'active',
    orderCount: 0,
    createdAt: '2026-10-01T00:00:00Z',
  },
]

function pageResponse(data: AdminUserSummary[], page = 1, total = data.length, totalPages = 1) {
  return {
    data,
    message: 'Users retrieved successfully',
    meta: {
      timestamp: '2026-11-13T00:00:00Z',
      pagination: { page, limit: 20, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    },
  }
}

function renderPage(initialRoute = '/users') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/users" element={<UsersPage />} />
          <Route path="/users/:id" element={<div>Trang chi tiết</div>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(usersApi.listAdminUsers).mockResolvedValue(pageResponse(users))
  })

  it('renders the user table with Vietnamese labels and Vietnam-time dates', async () => {
    renderPage()

    expect(await screen.findByText('khach@example.com')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Email' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Vai trò' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Trạng thái' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Số đơn hàng' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Ngày tạo' })).toBeInTheDocument()

    const rows = screen.getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Khách hàng')
    expect(rows[1]).toHaveTextContent('Đã khóa')
    expect(rows[1]).toHaveTextContent('3')
    expect(rows[1]).toHaveTextContent('02/11/2026')
    expect(rows[2]).toHaveTextContent('Quản trị viên')
    expect(rows[2]).toHaveTextContent('Hoạt động')
    expect(screen.getByText(/Tổng cộng 2 người dùng/)).toBeInTheDocument()
    expect(usersApi.listAdminUsers).toHaveBeenCalledWith({ page: 1, limit: 20 })
  })

  it('restores search, filters and page from the URL', async () => {
    renderPage('/users?search=khach&role=customer&status=locked&page=2')

    await screen.findByText('khach@example.com')
    expect(usersApi.listAdminUsers).toHaveBeenCalledWith({
      search: 'khach',
      role: 'customer',
      status: 'locked',
      page: 2,
      limit: 20,
    })
    expect(screen.getByLabelText('Tìm theo email')).toHaveValue('khach')
    expect(screen.getByLabelText('Lọc theo vai trò')).toHaveValue('customer')
    expect(screen.getByLabelText('Lọc theo trạng thái')).toHaveValue('locked')
  })

  it('falls back to defaults for invalid URL values', async () => {
    renderPage('/users?role=owner&status=banned&page=-3')

    await screen.findByText('khach@example.com')
    expect(usersApi.listAdminUsers).toHaveBeenCalledWith({ page: 1, limit: 20 })
    expect(screen.getByLabelText('Lọc theo vai trò')).toHaveValue('')
    expect(screen.getByLabelText('Lọc theo trạng thái')).toHaveValue('')
  })

  it('searches on Enter and on the search button, resetting to page 1', async () => {
    renderPage('/users?page=3')
    await screen.findByText('khach@example.com')

    const input = screen.getByLabelText('Tìm theo email')
    expect(input).toHaveAttribute('maxLength', '100')
    fireEvent.change(input, { target: { value: '  khach  ' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/users?search=khach'))

    fireEvent.change(input, { target: { value: 'quan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tìm' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/users?search=quan'))
    await waitFor(() =>
      expect(usersApi.listAdminUsers).toHaveBeenLastCalledWith({ search: 'quan', page: 1, limit: 20 })
    )
  })

  it('applies role and status filters together and returns to page 1', async () => {
    renderPage('/users?page=2')
    await screen.findByText('khach@example.com')

    fireEvent.change(screen.getByLabelText('Lọc theo vai trò'), { target: { value: 'customer' } })
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/users?role=customer'))
    fireEvent.change(screen.getByLabelText('Lọc theo trạng thái'), { target: { value: 'active' } })
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/users?role=customer&status=active')
    )
    await waitFor(() =>
      expect(usersApi.listAdminUsers).toHaveBeenLastCalledWith({
        role: 'customer',
        status: 'active',
        page: 1,
        limit: 20,
      })
    )
  })

  it('paginates with disabled buttons at the edges', async () => {
    vi.mocked(usersApi.listAdminUsers).mockResolvedValue(pageResponse(users, 1, 41, 3))
    renderPage()
    await screen.findByText('khach@example.com')

    expect(screen.getByText('Trang 1 / 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trước' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Sau' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/users?page=2'))

    vi.mocked(usersApi.listAdminUsers).mockResolvedValue(pageResponse(users, 3, 41, 3))
    renderPage('/users?page=3')
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Sau' }).at(-1)).toBeDisabled())
  })

  it('shows the empty state when nothing matches', async () => {
    vi.mocked(usersApi.listAdminUsers).mockResolvedValue(pageResponse([], 1, 0, 0))
    renderPage('/users?search=zzz')

    expect(await screen.findByText('Không tìm thấy người dùng phù hợp')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows an error with a retry button instead of an empty list', async () => {
    vi.mocked(usersApi.listAdminUsers).mockRejectedValueOnce(new Error('boom'))
    renderPage()

    expect(await screen.findByText('Không thể tải danh sách người dùng')).toBeInTheDocument()
    expect(screen.queryByText('Không tìm thấy người dùng phù hợp')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByText('khach@example.com')).toBeInTheDocument()
  })

  it('links each email to the detail page carrying the current query', async () => {
    renderPage('/users?status=locked&page=2')
    fireEvent.click(await screen.findByRole('link', { name: 'khach@example.com' }))

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/users/u-1'))
    expect(screen.getByTestId('location-state')).toHaveTextContent('"from":"?status=locked&page=2"')
  })
})
