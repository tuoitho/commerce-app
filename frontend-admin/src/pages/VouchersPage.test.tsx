import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { VouchersPage } from './VouchersPage'
import * as vouchersApi from '@/api/vouchers'
import { ApiError, type AdminVoucher } from '@/api/types'

vi.mock('@/api/vouchers', () => ({
  listAdminVouchers: vi.fn(),
  getAdminVoucher: vi.fn(),
  createAdminVoucher: vi.fn(),
  updateAdminVoucher: vi.fn(),
  deleteAdminVoucher: vi.fn(),
}))

const mockVouchers: AdminVoucher[] = [
  {
    id: 'v-1',
    code: 'AURA10',
    title: 'Giảm 10% tối đa 1 triệu',
    description: 'Áp dụng toàn bộ điện thoại',
    voucherType: 'percent',
    discountValue: '10',
    maxDiscountVnd: '1000000',
    minOrderVnd: '5000000',
    usageLimit: 100,
    usedCount: 0,
    perUserLimit: 2,
    startsAt: '2026-11-01T00:00:00Z',
    endsAt: '2026-12-31T23:59:59Z',
    active: true,
    effectiveStatus: 'active',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  },
  {
    id: 'v-2',
    code: 'AURA500K',
    title: 'Giảm 500K đơn từ 10 triệu',
    description: 'Giảm tiền mặt trực tiếp',
    voucherType: 'fixed_amount',
    discountValue: '500000',
    maxDiscountVnd: null,
    minOrderVnd: '10000000',
    usageLimit: 50,
    usedCount: 14,
    perUserLimit: 1,
    startsAt: '2026-11-01T00:00:00Z',
    endsAt: '2026-12-15T23:59:59Z',
    active: true,
    effectiveStatus: 'active',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  },
]

function renderPage(initialEntries = ['/vouchers']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <VouchersPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('VouchersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders paginated vouchers and supports search (q) and status filters', async () => {
    vi.mocked(vouchersApi.listAdminVouchers).mockResolvedValue({
      data: mockVouchers,
      meta: {
        timestamp: '2026-11-18T10:00:00Z',
        pagination: { page: 1, limit: 20, total: 2, totalPages: 1, hasNext: false, hasPrev: false },
      },
      message: '',
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('AURA10')).toBeInTheDocument()
    })
    expect(screen.getByText('AURA500K')).toBeInTheDocument()
    expect(screen.getByText('Giảm 10% tối đa 1 triệu')).toBeInTheDocument()
    expect(screen.getByText('14 / 50')).toBeInTheDocument()

    // Filter by status
    fireEvent.change(screen.getByLabelText('Lọc theo trạng thái'), { target: { value: 'scheduled' } })
    await waitFor(() => {
      expect(vouchersApi.listAdminVouchers).toHaveBeenCalledWith({
        q: '',
        status: 'scheduled',
        page: 1,
        limit: 20,
      })
    })

    // Search by q
    fireEvent.change(screen.getByPlaceholderText(/Tìm theo mã hoặc tiêu đề/i), {
      target: { value: 'AURA500K' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Tìm kiếm/i }))

    await waitFor(() => {
      expect(vouchersApi.listAdminVouchers).toHaveBeenCalledWith({
        q: 'AURA500K',
        status: 'scheduled',
        page: 1,
        limit: 20,
      })
    })
  })

  it('creates percent, fixed_amount (nulls maxDiscountVnd), and freeship (sets discountValue="0") vouchers with RFC3339 dates', async () => {
    vi.mocked(vouchersApi.listAdminVouchers).mockResolvedValue({
      data: [],
      meta: {
        timestamp: '2026-11-18T10:00:00Z',
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      },
      message: '',
    })
    vi.mocked(vouchersApi.createAdminVoucher).mockResolvedValue(mockVouchers[0])

    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Tạo mã giảm giá/i })).toBeInTheDocument()
    })

    // 1) Open modal, type maxDiscountVnd on percent, then switch to fixed_amount -> maxDiscountVnd must be null
    fireEvent.click(screen.getByRole('button', { name: /Tạo mã giảm giá/i }))
    const dialog = screen.getByRole('dialog', { name: /Tạo mã giảm giá/i })
    expect(dialog).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/^Mã giảm giá/i), { target: { value: 'aura500k' } })
    fireEvent.change(screen.getByLabelText(/^Tiêu đề/i), { target: { value: 'Giảm 500K' } })
    fireEvent.change(screen.getByLabelText(/Giảm tối đa/i), { target: { value: '999000' } })
    fireEvent.change(screen.getByLabelText(/Loại giảm giá/i), { target: { value: 'fixed_amount' } })

    expect(screen.queryByLabelText(/Giảm tối đa/i)).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Giá trị giảm/i), { target: { value: '500000' } })
    fireEvent.change(screen.getByLabelText(/Đơn tối thiểu/i), { target: { value: '10000000' } })
    fireEvent.change(screen.getByLabelText(/Thời gian bắt đầu/i), {
      target: { value: '2026-11-01T00:00' },
    })
    fireEvent.change(screen.getByLabelText(/Thời gian kết thúc/i), {
      target: { value: '2026-12-31T23:59' },
    })

    fireEvent.click(screen.getByRole('button', { name: /^Lưu mã giảm giá$/i }))

    await waitFor(() => {
      expect(vouchersApi.createAdminVoucher).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'AURA500K',
          title: 'Giảm 500K',
          voucherType: 'fixed_amount',
          discountValue: '500000',
          maxDiscountVnd: null,
          minOrderVnd: '10000000',
          startsAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/),
          endsAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/),
        })
      )
    })

    // 2) Create freeship voucher -> discountValue automatically "0"
    fireEvent.click(screen.getByRole('button', { name: /Tạo mã giảm giá/i }))
    fireEvent.change(screen.getByLabelText(/^Mã giảm giá/i), { target: { value: 'FREESHIP30' } })
    fireEvent.change(screen.getByLabelText(/^Tiêu đề/i), { target: { value: 'Miễn phí vận chuyển' } })
    fireEvent.change(screen.getByLabelText(/Loại giảm giá/i), { target: { value: 'freeship' } })
    fireEvent.change(screen.getByLabelText(/Giảm tối đa/i), { target: { value: '30000' } })
    fireEvent.change(screen.getByLabelText(/Thời gian bắt đầu/i), {
      target: { value: '2026-11-01T00:00' },
    })
    fireEvent.change(screen.getByLabelText(/Thời gian kết thúc/i), {
      target: { value: '2026-12-31T23:59' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Lưu mã giảm giá$/i }))

    await waitFor(() => {
      expect(vouchersApi.createAdminVoucher).toHaveBeenLastCalledWith(
        expect.objectContaining({
          code: 'FREESHIP30',
          voucherType: 'freeship',
          discountValue: '0',
          maxDiscountVnd: '30000',
        })
      )
    })
  })

  it('toggles active status and handles 409 conflicts (duplicate code, immutable fields, usage limit low, in use)', async () => {
    vi.mocked(vouchersApi.listAdminVouchers).mockResolvedValue({
      data: mockVouchers,
      meta: {
        timestamp: '2026-11-18T10:00:00Z',
        pagination: { page: 1, limit: 20, total: 2, totalPages: 1, hasNext: false, hasPrev: false },
      },
      message: '',
    })

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('AURA10')).toBeInTheDocument()
    })

    // Toggle active on AURA10
    vi.mocked(vouchersApi.updateAdminVoucher).mockResolvedValueOnce({
      ...mockVouchers[0],
      active: false,
      effectiveStatus: 'inactive',
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /Bật\/tắt mã AURA10/i }))
    await waitFor(() => {
      expect(vouchersApi.updateAdminVoucher).toHaveBeenCalledWith(
        'v-1',
        expect.objectContaining({ active: false })
      )
    })

    // 409 voucher_code_in_use on create
    vi.mocked(vouchersApi.createAdminVoucher).mockRejectedValueOnce(
      new ApiError(409, {
        code: 'voucher_code_in_use',
        message: 'Mã giảm giá này đã tồn tại',
      })
    )
    fireEvent.click(screen.getByRole('button', { name: /Tạo mã giảm giá/i }))
    fireEvent.change(screen.getByLabelText(/^Mã giảm giá/i), { target: { value: 'AURA10' } })
    fireEvent.change(screen.getByLabelText(/^Tiêu đề/i), { target: { value: 'Trùng mã' } })
    fireEvent.change(screen.getByLabelText(/Giá trị giảm/i), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(/Thời gian bắt đầu/i), {
      target: { value: '2026-11-01T00:00' },
    })
    fireEvent.change(screen.getByLabelText(/Thời gian kết thúc/i), {
      target: { value: '2026-12-31T23:59' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Lưu mã giảm giá$/i }))
    expect(await screen.findByText('Mã giảm giá này đã tồn tại')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Hủy$/i }))

    // 409 voucher_immutable_fields on edit AURA500K (usedCount = 14)
    vi.mocked(vouchersApi.updateAdminVoucher).mockRejectedValueOnce(
      new ApiError(409, {
        code: 'voucher_immutable_fields',
        message: 'Không thể thay đổi mã hoặc loại giảm giá sau khi đã có lượt sử dụng',
      })
    )
    fireEvent.click(screen.getByRole('button', { name: /Sửa AURA500K/i }))
    fireEvent.change(screen.getByLabelText(/^Mã giảm giá/i), { target: { value: 'NEWCODE' } })
    fireEvent.click(screen.getByRole('button', { name: /^Lưu mã giảm giá$/i }))
    expect(
      await screen.findByText('Không thể thay đổi mã hoặc loại giảm giá sau khi đã có lượt sử dụng')
    ).toBeInTheDocument()

    // 409 voucher_usage_limit_too_low on edit
    vi.mocked(vouchersApi.updateAdminVoucher).mockRejectedValueOnce(
      new ApiError(409, {
        code: 'voucher_usage_limit_too_low',
        message: 'Giới hạn tổng lượt dùng không được nhỏ hơn số lượt đã sử dụng',
      })
    )
    fireEvent.change(screen.getByLabelText(/^Mã giảm giá/i), { target: { value: 'AURA500K' } })
    fireEvent.change(screen.getByLabelText(/Giới hạn tổng lượt dùng/i), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /^Lưu mã giảm giá$/i }))
    expect(
      await screen.findByText('Giới hạn tổng lượt dùng không được nhỏ hơn số lượt đã sử dụng')
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Hủy$/i }))

    // 409 voucher_in_use on delete
    vi.mocked(vouchersApi.deleteAdminVoucher).mockRejectedValueOnce(
      new ApiError(409, {
        code: 'voucher_in_use',
        message: 'Không thể xóa mã giảm giá đã có đơn hàng sử dụng',
      })
    )
    fireEvent.click(screen.getByRole('button', { name: /Xóa AURA500K/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Xóa$/i }))
    expect(
      await screen.findByText('Không thể xóa mã giảm giá đã có đơn hàng sử dụng')
    ).toBeInTheDocument()
  })
})
