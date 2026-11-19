import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { VouchersPage } from './VouchersPage'
import * as vouchersApi from '@/api/vouchers'
import type { DiscoverVoucher, UserVoucher } from '@/api/types'

const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
let mockIsAuthenticated = true

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: mockIsAuthenticated,
    isLoading: false,
    user: mockIsAuthenticated ? { id: 'u-1', email: 'user@test.com', role: 'customer' } : null,
  }),
}))

vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({
    toast: vi.fn(),
    success: mockToastSuccess,
    error: mockToastError,
    info: vi.fn(),
  }),
}))

vi.mock('@/api/vouchers', () => ({
  listDiscoverVouchers: vi.fn(),
  claimVoucher: vi.fn(),
  listWalletVouchers: vi.fn(),
}))

const sampleDiscover: DiscoverVoucher[] = [
  {
    id: 'v-1',
    code: 'PHONE10',
    title: 'Giảm 10% Điện thoại',
    description: 'Áp dụng cho danh mục điện thoại',
    voucherType: 'percent',
    scopeType: 'categories',
    scopeCategories: [{ id: 'cat-1', name: 'Điện thoại' }],
    scopeProducts: [],
    discountValue: '10',
    maxDiscountVnd: '500000',
    minOrderVnd: '1000000',
    usageLimit: 100,
    usedCount: 5,
    perUserLimit: 1,
    userRemainingUses: 1,
    startsAt: '2026-11-01T00:00:00Z',
    endsAt: '2026-12-31T23:59:59Z',
    claimed: false,
    claimedAt: null,
  },
]

const sampleWallet: UserVoucher[] = [
  {
    ...sampleDiscover[0],
    claimedAt: '2026-11-18T10:00:00Z',
    walletStatus: 'available',
  },
]

describe('VouchersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsAuthenticated = true
    vi.mocked(vouchersApi.listDiscoverVouchers).mockResolvedValue(sampleDiscover)
    vi.mocked(vouchersApi.listWalletVouchers).mockResolvedValue(sampleWallet)
    vi.mocked(vouchersApi.claimVoucher).mockResolvedValue(sampleWallet[0])
  })

  it('displays discover vouchers with scope badge and claims into wallet', async () => {
    render(
      <MemoryRouter initialEntries={['/vouchers']}>
        <VouchersPage />
      </MemoryRouter>
    )

    expect(await screen.findByText('PHONE10')).toBeInTheDocument()
    expect(screen.getByText('Danh mục: Điện thoại')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Lưu vào ví/i }))

    await waitFor(() => {
      expect(vouchersApi.claimVoucher).toHaveBeenCalledWith('v-1')
    })
    expect(await screen.findByText('Đã lưu vào ví')).toBeInTheDocument()
    expect(mockToastSuccess).toHaveBeenCalled()
  })

  it('switches to wallet tab and filters by status', async () => {
    render(
      <MemoryRouter initialEntries={['/vouchers?tab=wallet']}>
        <VouchersPage />
      </MemoryRouter>
    )

    expect(await screen.findByText('PHONE10')).toBeInTheDocument()
    expect(screen.getByText('Dùng khi thanh toán')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Đã dùng hết lượt' }))
    await waitFor(() => {
      expect(vouchersApi.listWalletVouchers).toHaveBeenCalledWith('used_up')
    })
  })

  it('prompts login when unauthenticated', () => {
    mockIsAuthenticated = false
    render(
      <MemoryRouter initialEntries={['/vouchers']}>
        <VouchersPage />
      </MemoryRouter>
    )

    expect(screen.getByText('Đăng nhập ngay')).toBeInTheDocument()
  })
})
