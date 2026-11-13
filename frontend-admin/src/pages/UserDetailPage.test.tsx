import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UserDetailPage } from './UserDetailPage'
import * as usersApi from '@/api/users'
import type { AdminUserDetail } from '@/api/users'
import { ApiError } from '@/api/types'

vi.mock('@/api/users', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/users')>()
  return {
    ...actual,
    getAdminUser: vi.fn(),
    lockAdminUser: vi.fn(),
    unlockAdminUser: vi.fn(),
  }
})

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}{location.search}</div>
}

const lockedCustomer: AdminUserDetail = {
  id: 'u-1',
  email: 'khach@example.com',
  role: 'customer',
  status: 'locked',
  createdAt: '2026-11-01T02:03:04Z',
  lockedAt: '2026-11-12T08:00:00Z',
  lockReason: 'Spam đánh giá',
  orderSummary: {
    totalOrders: 3,
    deliveredOrders: 1,
    deliveredTotalVnd: '25990000',
    lastOrderAt: '2026-11-10T05:00:00Z',
  },
  recentOrders: [
    { id: 'ord-3', status: 'delivered', totalVnd: '25990000', createdAt: '2026-11-10T05:00:00Z' },
    { id: 'ord-2', status: 'cancelled', totalVnd: '990000', createdAt: '2026-11-05T05:00:00Z' },
  ],
}

const activeCustomer: AdminUserDetail = {
  id: 'u-2',
  email: 'moi@example.com',
  role: 'customer',
  status: 'active',
  createdAt: '2026-10-01T00:00:00Z',
  lockedAt: null,
  lockReason: null,
  orderSummary: { totalOrders: 0, deliveredOrders: 0, deliveredTotalVnd: '0', lastOrderAt: null },
  recentOrders: [],
}

const activeAdmin: AdminUserDetail = { ...activeCustomer, id: 'u-3', email: 'quan.tri@example.com', role: 'admin' }

function renderPage(id: string, state?: unknown) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: `/users/${id}`, state }]}>
        <Routes>
          <Route path="/users/:id" element={<UserDetailPage />} />
          <Route path="/users" element={<div>Danh sách</div>} />
          <Route path="/orders/:id" element={<div>Chi tiết đơn</div>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('UserDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows account, lock data, purchase summary and recent orders in Vietnam time', async () => {
    vi.mocked(usersApi.getAdminUser).mockResolvedValue(lockedCustomer)
    renderPage('u-1')

    expect(await screen.findByRole('heading', { name: 'khach@example.com' })).toBeInTheDocument()
    expect(usersApi.getAdminUser).toHaveBeenCalledWith('u-1')
    expect(screen.getByText('Khách hàng')).toBeInTheDocument()
    expect(screen.getAllByText('Đã khóa').length).toBeGreaterThan(0)
    expect(screen.getByText('09:03 01/11/2026')).toBeInTheDocument()
    expect(screen.getByText('15:00 12/11/2026')).toBeInTheDocument()
    expect(screen.getByText('Spam đánh giá')).toBeInTheDocument()

    const summary = screen.getByRole('region', { name: 'Tóm tắt mua hàng' })
    expect(within(summary).getByText('3')).toBeInTheDocument()
    expect(within(summary).getByText('1')).toBeInTheDocument()
    expect(within(summary).getByText(/25\.990\.000/)).toBeInTheDocument()
    expect(within(summary).getByText('12:00 10/11/2026')).toBeInTheDocument()

    const recent = screen.getByRole('region', { name: 'Đơn hàng gần nhất' })
    const orderLink = within(recent).getByRole('link', { name: /ord-3/ })
    expect(orderLink).toHaveAttribute('href', '/orders/ord-3')
    expect(within(recent).getByText('Đã giao')).toBeInTheDocument()
    expect(within(recent).getByText('Đã hủy')).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Mở khóa tài khoản' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Khóa tài khoản' })).not.toBeInTheDocument()
  })

  it('shows empty purchase states and the lock button for an active customer', async () => {
    vi.mocked(usersApi.getAdminUser).mockResolvedValue(activeCustomer)
    renderPage('u-2')

    await screen.findByRole('heading', { name: 'moi@example.com' })
    expect(screen.getByText('Chưa có đơn hàng')).toBeInTheDocument()
    expect(screen.getByText('Tài khoản chưa có đơn hàng')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Khóa tài khoản' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mở khóa tài khoản' })).not.toBeInTheDocument()
  })

  it('shows "Không có lý do" for a lock without reason', async () => {
    vi.mocked(usersApi.getAdminUser).mockResolvedValue({ ...lockedCustomer, lockReason: null })
    renderPage('u-1')
    expect(await screen.findByText('Không có lý do')).toBeInTheDocument()
  })

  it('offers no lock action for an admin account', async () => {
    vi.mocked(usersApi.getAdminUser).mockResolvedValue(activeAdmin)
    renderPage('u-3')

    await screen.findByRole('heading', { name: 'quan.tri@example.com' })
    expect(screen.getByText('Quản trị viên')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Khóa tài khoản' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mở khóa tài khoản' })).not.toBeInTheDocument()
  })

  it('shows not found with a link back to the list', async () => {
    vi.mocked(usersApi.getAdminUser).mockRejectedValue(
      new ApiError(404, { code: 'user_not_found', message: 'Không tìm thấy người dùng' })
    )
    renderPage('missing')

    expect(await screen.findByText('Không tìm thấy người dùng')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Quay lại danh sách' })).toHaveAttribute('href', '/users')
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument()
  })

  it('shows a retryable error for other failures', async () => {
    vi.mocked(usersApi.getAdminUser)
      .mockRejectedValueOnce(new ApiError(500, { code: 'internal', message: 'Lỗi máy chủ nội bộ' }))
      .mockResolvedValueOnce(activeCustomer)
    renderPage('u-2')

    expect(await screen.findByText('Không thể tải thông tin người dùng')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByRole('heading', { name: 'moi@example.com' })).toBeInTheDocument()
  })

  it('returns to the list with the previous filters when opened from the list', async () => {
    vi.mocked(usersApi.getAdminUser).mockResolvedValue(activeCustomer)
    renderPage('u-2', { from: '?status=locked&page=2' })

    const back = await screen.findByRole('link', { name: 'Quay lại danh sách' })
    expect(back).toHaveAttribute('href', '/users?status=locked&page=2')
    fireEvent.click(back)
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/users?status=locked&page=2'))
  })

  it('links back to /users when opened directly', async () => {
    vi.mocked(usersApi.getAdminUser).mockResolvedValue(activeCustomer)
    renderPage('u-2')
    expect(await screen.findByRole('link', { name: 'Quay lại danh sách' })).toHaveAttribute('href', '/users')
  })

  it('cancels the lock dialog without calling the API and restores focus', async () => {
    vi.mocked(usersApi.getAdminUser).mockResolvedValue(activeCustomer)
    renderPage('u-2')

    const lockButton = await screen.findByRole('button', { name: 'Khóa tài khoản' })
    lockButton.focus()
    fireEvent.click(lockButton)

    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText(/moi@example\.com/)).toBeInTheDocument()
    expect(dialog.contains(document.activeElement)).toBe(true)
    const reason = within(dialog).getByLabelText('Lý do khóa')
    expect(reason).toHaveAttribute('maxLength', '500')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(usersApi.lockAdminUser).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(lockButton)
  })

  it('locks with the entered reason, disables confirm while pending and announces success', async () => {
    vi.mocked(usersApi.getAdminUser).mockResolvedValue(activeCustomer)
    const pending = deferred<AdminUserDetail>()
    vi.mocked(usersApi.lockAdminUser).mockReturnValue(pending.promise)
    renderPage('u-2')

    fireEvent.click(await screen.findByRole('button', { name: 'Khóa tài khoản' }))
    const dialog = screen.getByRole('alertdialog')
    fireEvent.change(within(dialog).getByLabelText('Lý do khóa'), { target: { value: 'Spam' } })
    const confirm = within(dialog).getByRole('button', { name: 'Khóa tài khoản' })
    fireEvent.click(confirm)

    await waitFor(() => expect(confirm).toBeDisabled())
    expect(usersApi.lockAdminUser).toHaveBeenCalledWith('u-2', 'Spam')

    pending.resolve({ ...activeCustomer, status: 'locked', lockedAt: '2026-11-13T01:00:00Z', lockReason: 'Spam' })

    const notice = await screen.findByRole('status')
    expect(notice).toHaveTextContent('Đã khóa tài khoản')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mở khóa tài khoản' })).toBeInTheDocument()
    expect(screen.getByText('Spam')).toBeInTheDocument()
    expect(document.activeElement).toBe(notice)
  })

  it('shows reason validation errors at the field and keeps the dialog open', async () => {
    vi.mocked(usersApi.getAdminUser).mockResolvedValue(activeCustomer)
    vi.mocked(usersApi.lockAdminUser).mockRejectedValue(
      new ApiError(400, {
        code: 'validation_error',
        message: 'Dữ liệu không hợp lệ',
        fields: { reason: 'Lý do khóa tối đa 500 ký tự' },
      })
    )
    renderPage('u-2')

    fireEvent.click(await screen.findByRole('button', { name: 'Khóa tài khoản' }))
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Khóa tài khoản' }))

    expect(await within(dialog).findByText('Lý do khóa tối đa 500 ký tự')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Lý do khóa')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('shows conflict messages and reloads the account', async () => {
    vi.mocked(usersApi.getAdminUser)
      .mockResolvedValueOnce(activeCustomer)
      .mockResolvedValue(lockedCustomer)
    vi.mocked(usersApi.lockAdminUser).mockRejectedValue(
      new ApiError(409, { code: 'user_already_locked', message: 'Tài khoản đã bị khóa trước đó' })
    )
    renderPage('u-2')

    fireEvent.click(await screen.findByRole('button', { name: 'Khóa tài khoản' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Khóa tài khoản' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Tài khoản đã bị khóa trước đó')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => expect(usersApi.getAdminUser).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('button', { name: 'Mở khóa tài khoản' })).toBeInTheDocument()
  })

  it('unlocks after confirmation and announces success', async () => {
    vi.mocked(usersApi.getAdminUser).mockResolvedValue(lockedCustomer)
    vi.mocked(usersApi.unlockAdminUser).mockResolvedValue({
      ...lockedCustomer,
      status: 'active',
      lockedAt: null,
      lockReason: null,
    })
    renderPage('u-1')

    fireEvent.click(await screen.findByRole('button', { name: 'Mở khóa tài khoản' }))
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText(/khach@example\.com/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mở khóa' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Đã mở khóa tài khoản')
    expect(usersApi.unlockAdminUser).toHaveBeenCalledWith('u-1')
    expect(screen.getByRole('button', { name: 'Khóa tài khoản' })).toBeInTheDocument()
  })
})
