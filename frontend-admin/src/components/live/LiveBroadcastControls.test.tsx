import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LiveBroadcastPanel } from './LiveBroadcastPanel'
import { LiveCommentsPanel } from './LiveCommentsPanel'
import { LiveProductsManager } from './LiveProductsManager'
import { LiveSummaryCard } from './LiveSummaryCard'
import { startWhipPublish } from '@/lib/whip'
import { getAdminProductById, getAdminProducts } from '@/api/products'
import { ApiError } from '@/api/types'
import type { AdminLiveSession, LiveProduct } from '@/api/live'

vi.mock('@/lib/whip', () => ({ startWhipPublish: vi.fn(() => ({ stop: vi.fn(), replaceTrack: vi.fn() })) }))
vi.mock('@/api/products', () => ({ getAdminProductById: vi.fn(), getAdminProducts: vi.fn() }))

const audio = { kind: 'audio', enabled: true, stop: vi.fn() }
const video = { kind: 'video', enabled: true, stop: vi.fn() }
const stream = { getTracks: () => [video, audio] } as unknown as MediaStream

const product: LiveProduct = {
  productId: 'p-1', position: 0, name: 'iPhone 16 Pro', brand: 'Apple', imageUrl: '',
  minPriceVnd: '25990000', maxPriceVnd: '32990000', regularMinPriceVnd: '28990000', regularMaxPriceVnd: '32990000',
  hasLivePrice: true, inStock: true,
  livePrices: [{ variantId: 'v-128', optionLabel: '128GB', regularPriceVnd: '28990000', livePriceVnd: '25990000', quota: 10, sold: 3, remaining: 7, active: true }],
}

function session(overrides: Partial<AdminLiveSession> = {}): AdminLiveSession {
  return {
    id: 's-1', title: 'Flash sale iPhone', status: 'live', startedAt: new Date(Date.now() - 65_000).toISOString(), endedAt: null,
    viewerCount: 12, heartCount: 340, signalOnline: true, pinnedProductId: null, products: [product], comments: [],
    media: { whipUrl: 'http://media/whip', whepUrl: '', hlsUrl: '' },
    summary: { durationSeconds: 0, peakViewers: 0, commentCount: 0, heartCount: 0, endReason: null },
    ...overrides,
  }
}

const detail = {
  id: 'p-1', name: 'iPhone 16 Pro', model: '', brand: 'Apple', category: { id: 'c', name: 'Apple' },
  minPriceVnd: '28990000', maxPriceVnd: '32990000', price: '', currency: 'VND', primaryImageUrl: '', inStock: true,
  description: '', imageUrls: [], stockQuantity: 9, featured: false, active: true, createdAt: '', updatedAt: '',
  optionGroups: [{ id: 'g', label: 'Dung lượng', position: 1, values: [{ id: 'o128', label: '128GB' }, { id: 'o256', label: '256GB' }] }],
  variants: [
    { id: 'v-128', optionValueIds: { g: 'o128' }, priceVnd: '28990000', stockQuantity: 5, active: true },
    { id: 'v-256', optionValueIds: { g: 'o256' }, priceVnd: '32990000', stockQuantity: 4, active: true },
  ],
}

describe('LiveBroadcastPanel controls', () => {
  beforeEach(() => {
    audio.enabled = true
    video.enabled = true
    vi.mocked(startWhipPublish).mockClear()
  })

  it('shows duration, viewers and hearts', () => {
    render(<LiveBroadcastPanel session={session()} stream={stream} onStreamChange={vi.fn()} onPublishFailed={vi.fn()} cancelOnFirstFailure heartBurst={null} viewerCount={12} heartCount={340} onEnd={vi.fn()} />)
    expect(screen.getByTestId('live-viewers')).toHaveTextContent('12')
    expect(screen.getByTestId('live-hearts')).toHaveTextContent('340')
    expect(screen.getByTestId('live-duration')).toHaveTextContent('01:0')
  })

  it('mutes the microphone and camera without ending the session', () => {
    const onEnd = vi.fn()
    render(<LiveBroadcastPanel session={session()} stream={stream} onStreamChange={vi.fn()} onPublishFailed={vi.fn()} cancelOnFirstFailure heartBurst={null} viewerCount={0} heartCount={0} onEnd={onEnd} />)
    fireEvent.click(screen.getByRole('button', { name: /Tắt micro/ }))
    fireEvent.click(screen.getByRole('button', { name: /Tắt camera/ }))
    expect(audio.enabled).toBe(false)
    expect(video.enabled).toBe(false)
    expect(onEnd).not.toHaveBeenCalled()
    expect(startWhipPublish).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /Bật micro/ }))
    expect(audio.enabled).toBe(true)
  })

  it('asks for confirmation before ending', async () => {
    const onEnd = vi.fn(async () => {})
    render(<LiveBroadcastPanel session={session()} stream={stream} onStreamChange={vi.fn()} onPublishFailed={vi.fn()} cancelOnFirstFailure heartBurst={null} viewerCount={0} heartCount={0} onEnd={onEnd} />)
    fireEvent.click(screen.getByRole('button', { name: 'Kết thúc live' }))
    expect(screen.getByText('Kết thúc phiên live?')).toBeInTheDocument()
    expect(onEnd).not.toHaveBeenCalled()

    const dialog = screen.getByText('Kết thúc phiên live?').closest('div')?.parentElement as HTMLElement
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kết thúc live' }))
    await waitFor(() => expect(onEnd).toHaveBeenCalled())
  })
})

describe('LiveCommentsPanel', () => {
  const comments = [
    { id: 'c1', sessionId: 's-1', authorName: 'Lan', authorRole: 'customer' as const, content: 'Còn hàng không?', hidden: false, createdAt: '' },
    { id: 'c2', sessionId: 's-1', authorName: 'Chủ shop', authorRole: 'admin' as const, content: 'Còn nhé', hidden: false, createdAt: '' },
    { id: 'c3', sessionId: 's-1', authorName: 'Spam', authorRole: 'customer' as const, content: 'quảng cáo', hidden: true, createdAt: '' },
  ]

  it('sends a reply as the shop and hides a customer comment', async () => {
    const onSend = vi.fn(async () => {})
    const onHide = vi.fn(async () => {})
    render(<LiveCommentsPanel comments={comments} onSend={onSend} onHide={onHide} />)

    expect(screen.getByText('Chủ shop')).toBeInTheDocument()
    expect(within(screen.getByTestId('admin-comment-c3')).getByText('(đã ẩn)')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Bình luận của chủ shop'), { target: { value: 'Chốt đơn ngay nhé' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi bình luận' }))
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('Chốt đơn ngay nhé'))

    fireEvent.click(screen.getByRole('button', { name: 'Ẩn bình luận của Lan' }))
    expect(onHide).toHaveBeenCalledWith('c1')
    expect(screen.queryByRole('button', { name: /Ẩn bình luận của Chủ shop/ })).not.toBeInTheDocument()
  })
})

describe('LiveProductsManager', () => {
  beforeEach(() => {
    vi.mocked(getAdminProductById).mockResolvedValue(detail)
    vi.mocked(getAdminProducts).mockResolvedValue({ data: [], meta: { timestamp: '' }, message: '' })
  })

  function renderManager(props: Partial<React.ComponentProps<typeof LiveProductsManager>> = {}) {
    const client = new QueryClient()
    const onSave = props.onSave ?? vi.fn(async () => {})
    const onTogglePin = props.onTogglePin ?? vi.fn(async () => {})
    const utils = render(
      <QueryClientProvider client={client}>
        <LiveProductsManager products={props.products ?? [product]} pinnedProductId={props.pinnedProductId ?? null} onSave={onSave} onTogglePin={onTogglePin} />
      </QueryClientProvider>,
    )
    return { ...utils, onSave, onTogglePin, client }
  }

  it('loads the live cart with its prices and sold counts and saves edits', async () => {
    const { onSave } = renderManager()
    const price = await screen.findByLabelText('Giá live iPhone 16 Pro 128GB')
    expect(price).toHaveValue('25990000')
    expect(screen.getByText('Đã bán 3/10 suất')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Giá live iPhone 16 Pro 256GB'), { target: { value: '30990000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith([
        { productId: 'p-1', variants: [{ variantId: 'v-128', livePriceVnd: '25990000', quota: 10 }, { variantId: 'v-256', livePriceVnd: '30990000', quota: null }] },
      ]),
    )
  })

  it('shows a quota below the sold count next to its row', async () => {
    const onSave = vi.fn(async () => {
      throw new ApiError(400, { code: 'validation_error', message: 'Dữ liệu không hợp lệ', fields: { 'products[0].variants[0].quota': 'Số suất không được nhỏ hơn số đã bán (3)' } })
    })
    renderManager({ onSave })
    fireEvent.change(await screen.findByLabelText('Số suất iPhone 16 Pro 128GB'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await screen.findByText('Số suất không được nhỏ hơn số đã bán (3)')).toBeInTheDocument()
  })

  it('pins and unpins a product', async () => {
    const onTogglePin = vi.fn(async () => {})
    const { rerender, client } = renderManager({ onTogglePin })
    fireEvent.click(await screen.findByRole('button', { name: 'Ghim iPhone 16 Pro' }))
    expect(onTogglePin).toHaveBeenCalledWith('p-1')

    rerender(
      <QueryClientProvider client={client}>
        <LiveProductsManager products={[product]} pinnedProductId="p-1" onSave={vi.fn()} onTogglePin={onTogglePin} />
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ ghim iPhone 16 Pro' }))
    expect(onTogglePin).toHaveBeenLastCalledWith(null)
  })

  it('updates sold counts from realtime events without losing unsaved edits', async () => {
    const { rerender, client } = renderManager()
    fireEvent.change(await screen.findByLabelText('Giá live iPhone 16 Pro 256GB'), { target: { value: '30990000' } })

    const sold = { ...product, livePrices: [{ ...product.livePrices[0], sold: 5, remaining: 5 }] }
    rerender(
      <QueryClientProvider client={client}>
        <LiveProductsManager products={[sold]} pinnedProductId={null} onSave={vi.fn()} onTogglePin={vi.fn()} />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Đã bán 5/10 suất')).toBeInTheDocument()
    expect(screen.getByLabelText('Giá live iPhone 16 Pro 256GB')).toHaveValue('30990000')
  })
})

describe('LiveSummaryCard', () => {
  it('summarises the ended session including live units sold per variant', () => {
    render(
      <LiveSummaryCard
        session={session({
          status: 'ended',
          endedAt: '2026-11-13T04:00:00Z',
          products: [{ ...product, hasLivePrice: false, livePrices: [{ ...product.livePrices[0], active: false, sold: 8, remaining: 2 }] }],
          summary: { durationSeconds: 3725, peakViewers: 87, commentCount: 54, heartCount: 1200, endReason: 'signal_lost' },
        })}
        onNewSession={vi.fn()}
      />,
    )
    expect(screen.getByText('1:02:05')).toBeInTheDocument()
    expect(screen.getByText('87')).toBeInTheDocument()
    expect(screen.getByText('54')).toBeInTheDocument()
    expect(screen.getByText(/mất tín hiệu/)).toBeInTheDocument()
    expect(screen.getByText('8/10 suất')).toBeInTheDocument()
  })
})
