import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LiveSetupForm } from './LiveSetupForm'
import { mapFieldErrors, toLiveProductInputs, variantErrorKey, type DraftProduct } from './liveDraft'
import { adminLiveApi, type AdminLiveSession } from '@/api/live'
import { getAdminProductById, getAdminProducts } from '@/api/products'
import { ApiError } from '@/api/types'

vi.mock('@/api/live', () => ({ adminLiveApi: { create: vi.fn() } }))
vi.mock('@/api/products', () => ({ getAdminProducts: vi.fn(), getAdminProductById: vi.fn() }))

const stopTrack = vi.fn()
const fakeStream = { getTracks: () => [{ kind: 'video', stop: stopTrack }, { kind: 'audio', stop: stopTrack }] } as unknown as MediaStream

function mockMedia(granted: boolean) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => {
        if (!granted) throw Object.assign(new Error('denied'), { name: 'NotAllowedError' })
        return fakeStream
      }),
      enumerateDevices: vi.fn(async () => [
        { kind: 'videoinput', deviceId: 'cam-1', label: 'FaceTime HD' },
        { kind: 'audioinput', deviceId: 'mic-1', label: 'Built-in Mic' },
      ]),
    },
  })
}

const iphone = {
  id: 'p-1', name: 'iPhone 16 Pro', model: 'A3083', brand: 'Apple', category: { id: 'c', name: 'Apple' },
  minPriceVnd: '28990000', maxPriceVnd: '32990000', price: '', currency: 'VND', primaryImageUrl: '', inStock: true,
  description: '', imageUrls: [], stockQuantity: 9, featured: false, active: true, createdAt: '', updatedAt: '',
  optionGroups: [{ id: 'g', label: 'Dung lượng', position: 1, values: [{ id: 'o128', label: '128GB' }, { id: 'o256', label: '256GB' }] }],
  variants: [
    { id: 'v-128', optionValueIds: { g: 'o128' }, priceVnd: '28990000', stockQuantity: 5, active: true },
    { id: 'v-256', optionValueIds: { g: 'o256' }, priceVnd: '32990000', stockQuantity: 4, active: true },
  ],
}

function renderForm(onStarted = vi.fn(), onConflict = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <LiveSetupForm onStarted={onStarted} onConflict={onConflict} />
    </QueryClientProvider>,
  )
  return { onStarted, onConflict }
}

async function addIphone() {
  fireEvent.change(screen.getByLabelText('Tìm sản phẩm'), { target: { value: 'iphone' } })
  fireEvent.click(await screen.findByRole('button', { name: 'Thêm iPhone 16 Pro' }))
  await screen.findByTestId('live-product-p-1')
}

describe('liveDraft', () => {
  const drafts: DraftProduct[] = [{
    productId: 'p-1', name: 'iPhone', imageUrl: '',
    variants: [
      { variantId: 'v-128', label: '128GB', regularPriceVnd: '28990000', livePriceVnd: '', quota: '', sold: 0 },
      { variantId: 'v-256', label: '256GB', regularPriceVnd: '32990000', livePriceVnd: '30990000', quota: '5', sold: 0 },
    ],
  }]

  it('sends only variants with a live price', () => {
    expect(toLiveProductInputs(drafts)).toEqual([{ productId: 'p-1', variants: [{ variantId: 'v-256', livePriceVnd: '30990000', quota: 5 }] }])
  })

  it('maps API field paths back to the edited rows', () => {
    const errors = mapFieldErrors({ 'products[0].variants[0].quota': 'Số suất phải từ 1 đến 100000', title: 'Tiêu đề phải từ 1 đến 120 ký tự' }, drafts)
    expect(errors[variantErrorKey('p-1', 'v-256', 'quota')]).toBe('Số suất phải từ 1 đến 100000')
    expect(errors.title).toBe('Tiêu đề phải từ 1 đến 120 ký tự')
  })
})

describe('LiveSetupForm', () => {
  beforeEach(() => {
    vi.mocked(adminLiveApi.create).mockReset()
    vi.mocked(getAdminProducts).mockResolvedValue({ data: [iphone], meta: { timestamp: '' }, message: '' })
    vi.mocked(getAdminProductById).mockResolvedValue(iphone)
  })

  it('explains how to grant camera access and keeps start disabled when denied', async () => {
    mockMedia(false)
    renderForm()
    expect(await screen.findByRole('alert')).toHaveTextContent('chưa được cấp quyền dùng camera và micro')
    expect(screen.getByRole('button', { name: 'Bắt đầu phát' })).toBeDisabled()
  })

  it('previews the camera, lists devices and starts the session with live prices', async () => {
    mockMedia(true)
    const session = { id: 's-1', status: 'live' } as AdminLiveSession
    vi.mocked(adminLiveApi.create).mockResolvedValue(session)
    const { onStarted } = renderForm()

    expect(await screen.findByTestId('live-preview')).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'FaceTime HD' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Tiêu đề phiên live'), { target: { value: 'Săn deal iPhone' } })
    await addIphone()
    fireEvent.change(screen.getByLabelText('Giá live iPhone 16 Pro 128GB'), { target: { value: '25.990.000' } })
    fireEvent.change(screen.getByLabelText('Số suất iPhone 16 Pro 128GB'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu phát' }))

    await waitFor(() => expect(onStarted).toHaveBeenCalledWith(session, fakeStream))
    expect(adminLiveApi.create).toHaveBeenCalledWith('Săn deal iPhone', [
      { productId: 'p-1', variants: [{ variantId: 'v-128', livePriceVnd: '25990000', quota: 20 }] },
    ])
  })

  it('shows field errors next to the right inputs', async () => {
    mockMedia(true)
    vi.mocked(adminLiveApi.create).mockRejectedValue(
      new ApiError(400, {
        code: 'validation_error',
        message: 'Dữ liệu không hợp lệ',
        fields: { title: 'Tiêu đề phải từ 1 đến 120 ký tự', 'products[0].variants[0].livePriceVnd': 'Giá live phải nhỏ hơn giá thường' },
      }),
    )
    renderForm()
    await screen.findByTestId('live-preview')
    await addIphone()
    fireEvent.change(screen.getByLabelText('Giá live iPhone 16 Pro 256GB'), { target: { value: '40000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu phát' }))

    expect(await screen.findByText('Tiêu đề phải từ 1 đến 120 ký tự')).toBeInTheDocument()
    const row = screen.getByLabelText('Giá live iPhone 16 Pro 256GB').closest('tr') as HTMLElement
    expect(within(row).getByText('Giá live phải nhỏ hơn giá thường')).toBeInTheDocument()
  })

  it('reports a media server outage and a session already live', async () => {
    mockMedia(true)
    vi.mocked(adminLiveApi.create).mockRejectedValueOnce(
      new ApiError(503, { code: 'media_server_unavailable', message: 'Không kết nối được máy chủ phát video' }),
    )
    const { onConflict } = renderForm()
    await screen.findByTestId('live-preview')
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu phát' }))
    expect(await screen.findByText('Không kết nối được máy chủ phát video')).toBeInTheDocument()

    vi.mocked(adminLiveApi.create).mockRejectedValueOnce(
      new ApiError(409, { code: 'livestream_already_active', message: 'Đang có một phiên live khác diễn ra' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu phát' }))
    await waitFor(() => expect(onConflict).toHaveBeenCalled())
  })
})
