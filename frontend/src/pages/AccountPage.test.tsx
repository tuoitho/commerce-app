import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AccountPage } from './AccountPage'
import { useAuth } from '@/context/AuthContext'
import { ToastProvider } from '@/context/ToastContext'
import { accountApi } from '@/api/account'
import { addressesApi } from '@/api/addresses'
import { areasApi } from '@/api/areas'
import { ApiError } from '@/api/types'

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/api/account', () => ({
  accountApi: {
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    uploadAvatar: vi.fn(),
    deleteAvatar: vi.fn(),
    changePassword: vi.fn(),
  },
}))

vi.mock('@/api/addresses', () => ({
  addressesApi: {
    listAddresses: vi.fn(),
    createAddress: vi.fn(),
    updateAddress: vi.fn(),
    setDefaultAddress: vi.fn(),
    deleteAddress: vi.fn(),
  },
}))

vi.mock('@/api/areas', () => ({
  areasApi: {
    listProvinces: vi.fn(),
    listWards: vi.fn(),
  },
}))

const mockUser = {
  id: 'u-1',
  email: 'khach@example.com',
  role: 'customer',
  displayName: 'Nguyễn Minh Anh',
  phone: '0912345678',
  avatarUrl: null as string | null,
}

function renderAccount(initialEntry = '/account') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/account" element={<AccountPage />} />
          <Route path="/login" element={<div data-testid="login-redirect">Login Page</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  )
}

describe('AccountPage', () => {
  const updateUser = vi.fn()
  const applySession = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      user: { ...mockUser },
      accessToken: 'jwt-1',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      updateUser,
      applySession,
    })
    vi.mocked(accountApi.getProfile).mockResolvedValue({ ...mockUser })
    vi.mocked(areasApi.listProvinces).mockResolvedValue([
      { code: 1, name: 'Thành phố Hà Nội' },
    ])
    vi.mocked(areasApi.listWards).mockResolvedValue([
      { code: 4, provinceCode: 1, name: 'Phường Ba Đình' },
    ])
    vi.mocked(addressesApi.listAddresses).mockResolvedValue([])
  })

  it('redirects unauthenticated visitors to /login with encoded redirect URL', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    renderAccount('/account?tab=addresses')
    expect(screen.getByTestId('login-redirect')).toBeInTheDocument()
  })

  it('saves profile updates, updates AuthContext immediately, disables button while saving, and renders field errors', async () => {
    let resolveSave!: (v: typeof mockUser) => void
    vi.mocked(accountApi.updateProfile).mockImplementationOnce(
      () => new Promise((res) => { resolveSave = res })
    )

    renderAccount('/account')

    await waitFor(() => {
      expect(screen.getByLabelText(/Tên hiển thị/i)).toHaveValue('Nguyễn Minh Anh')
    })
    expect(screen.getByLabelText(/^Email/i)).toHaveAttribute('readonly')

    fireEvent.change(screen.getByLabelText(/Tên hiển thị/i), { target: { value: 'Trần Bảo Ngọc' } })
    fireEvent.change(screen.getByLabelText(/Số điện thoại/i), { target: { value: '0987654321' } })

    const saveBtn = screen.getByRole('button', { name: /Lưu thay đổi/i })
    fireEvent.click(saveBtn)
    expect(saveBtn).toBeDisabled()

    const updated = { ...mockUser, displayName: 'Trần Bảo Ngọc', phone: '0987654321' }
    resolveSave(updated)

    await waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith(updated)
    })

    // Validation error from server mapped to fields
    vi.mocked(accountApi.updateProfile).mockRejectedValueOnce(
      new ApiError(400, {
        code: 'validation_error',
        message: 'Dữ liệu không hợp lệ',
        fields: { phone: 'Số điện thoại không hợp lệ' },
      })
    )
    fireEvent.click(saveBtn)
    await waitFor(() => {
      expect(screen.getByText('Số điện thoại không hợp lệ')).toBeInTheDocument()
    })
  })

  it('uploads and deletes avatar and calls updateUser', async () => {
    const withAvatar = { ...mockUser, avatarUrl: '/media/avatars/550e8400-e29b-41d4-a716-446655440000.png' }
    vi.mocked(accountApi.uploadAvatar).mockResolvedValueOnce(withAvatar)
    vi.mocked(accountApi.deleteAvatar).mockResolvedValueOnce({ ...mockUser, avatarUrl: null })

    renderAccount('/account')
    await waitFor(() => expect(screen.getByTestId('avatar-file-input')).toBeInTheDocument())

    const file = new File([new Uint8Array([0x89, 0x50])], 'me.png', { type: 'image/png' })
    fireEvent.change(screen.getByTestId('avatar-file-input'), { target: { files: [file] } })

    await waitFor(() => {
      expect(accountApi.uploadAvatar).toHaveBeenCalledWith(file)
      expect(updateUser).toHaveBeenCalledWith(withAvatar)
    })

    fireEvent.click(screen.getByRole('button', { name: /Xóa ảnh/i }))
    await waitFor(() => {
      expect(accountApi.deleteAvatar).toHaveBeenCalled()
      expect(updateUser).toHaveBeenCalledWith({ ...mockUser, avatarUrl: null })
    })
  })

  it('handles password mismatch, server field error, and session rotation with form clear', async () => {
    renderAccount('/account?tab=password')

    fireEvent.change(screen.getByLabelText(/Mật khẩu hiện tại/i), { target: { value: 'oldpassword1' } })
    fireEvent.change(screen.getByLabelText(/^Mật khẩu mới\*?$/i), { target: { value: 'newpassword123' } })
    fireEvent.change(screen.getByLabelText(/Xác nhận mật khẩu mới/i), { target: { value: 'different123' } })

    fireEvent.click(screen.getByRole('button', { name: /Đổi mật khẩu/i }))
    expect(screen.getByText(/Mật khẩu xác nhận không khớp/i)).toBeInTheDocument()
    expect(accountApi.changePassword).not.toHaveBeenCalled()

    // Fix confirm password, server returns currentPassword error
    fireEvent.change(screen.getByLabelText(/Xác nhận mật khẩu mới/i), { target: { value: 'newpassword123' } })
    vi.mocked(accountApi.changePassword).mockRejectedValueOnce(
      new ApiError(400, {
        code: 'validation_error',
        message: 'Dữ liệu không hợp lệ',
        fields: { currentPassword: 'Mật khẩu hiện tại không chính xác' },
      })
    )
    fireEvent.click(screen.getByRole('button', { name: /Đổi mật khẩu/i }))
    await waitFor(() => {
      expect(screen.getByText('Mật khẩu hiện tại không chính xác')).toBeInTheDocument()
    })

    // Succeed -> applySession + clear inputs
    const newSession = { user: mockUser, accessToken: 'rotated-jwt' }
    vi.mocked(accountApi.changePassword).mockResolvedValueOnce(newSession)
    fireEvent.click(screen.getByRole('button', { name: /Đổi mật khẩu/i }))

    await waitFor(() => {
      expect(applySession).toHaveBeenCalledWith(newSession)
      expect(screen.getByLabelText(/Mật khẩu hiện tại/i)).toHaveValue('')
      expect(screen.getByLabelText(/^Mật khẩu mới\*?$/i)).toHaveValue('')
      expect(screen.getByLabelText(/Xác nhận mật khẩu mới/i)).toHaveValue('')
    })
  })

  it('switches tabs via role="tablist" & keyboard arrows and manages addresses with delete confirmation', async () => {
    const sampleAddress = {
      id: 'addr-1',
      userId: 'u-1',
      recipientName: 'Nguyễn Minh Anh',
      phone: '0912345678',
      provinceCode: 1,
      provinceName: 'Thành phố Hà Nội',
      wardCode: 4,
      wardName: 'Phường Ba Đình',
      detailAddress: 'Số 1 Tràng Tiền',
      isDefault: false,
      createdAt: '2026-11-16T00:00:00Z',
      updatedAt: '2026-11-16T00:00:00Z',
    }
    vi.mocked(addressesApi.listAddresses).mockResolvedValueOnce([sampleAddress]).mockResolvedValue([sampleAddress])
    vi.mocked(addressesApi.setDefaultAddress).mockResolvedValue({ ...sampleAddress, isDefault: true })
    vi.mocked(addressesApi.deleteAddress).mockResolvedValue(undefined)

    renderAccount('/account')

    const tablist = screen.getByRole('tablist')
    expect(tablist).toBeInTheDocument()
    const profileTab = screen.getByRole('tab', { name: /Hồ sơ cá nhân/i })
    fireEvent.keyDown(profileTab, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: /Đổi mật khẩu/i })).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(screen.getByRole('tab', { name: /Sổ địa chỉ/i }))
    await waitFor(() => {
      expect(screen.getByTestId('address-card-addr-1')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Đặt mặc định/i }))
    await waitFor(() => {
      expect(addressesApi.setDefaultAddress).toHaveBeenCalledWith('addr-1')
    })

    fireEvent.click(screen.getByLabelText('Xóa địa chỉ Nguyễn Minh Anh'))
    expect(screen.getByText('Xác nhận xóa địa chỉ')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận xóa/i }))
    await waitFor(() => {
      expect(addressesApi.deleteAddress).toHaveBeenCalledWith('addr-1')
    })

    fireEvent.click(screen.getByRole('button', { name: /Thêm địa chỉ mới/i }))
    expect(screen.getByText('Thêm địa chỉ nhận hàng mới')).toBeInTheDocument()
  })

  it('shows empty and retry states on addresses tab', async () => {
    vi.mocked(addressesApi.listAddresses)
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce([])

    renderAccount('/account?tab=addresses')
    await waitFor(() => {
      expect(screen.getByText(/Không thể tải danh sách địa chỉ/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Thử lại/i }))
    await waitFor(() => {
      expect(screen.getByText(/Bạn chưa có địa chỉ nhận hàng/i)).toBeInTheDocument()
    })
  })
})
