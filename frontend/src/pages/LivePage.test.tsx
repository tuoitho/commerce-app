import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LivePage, HEART_BATCH_MS } from './LivePage'
import { useAuth } from '@/context/AuthContext'
import { liveApi, type LiveSessionView, type LiveRoomEvent } from '@/api/live'
import { ApiError } from '@/api/client'
import { useLiveSocket } from '@/hooks/useLiveSocket'

vi.mock('@/context/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/api/live', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/live')>()),
  liveApi: { getSession: vi.fn(), postComment: vi.fn(), getCurrent: vi.fn() },
}))
vi.mock('@/hooks/useLiveSocket', () => ({ useLiveSocket: vi.fn() }))
vi.mock('@/components/live/LivePlayer', () => ({
  LivePlayer: ({ signalOnline }: { signalOnline: boolean }) => <div data-testid="player">{signalOnline ? 'online' : 'Đang chờ tín hiệu'}</div>,
}))

const SESSION_ID = '11111111-1111-1111-1111-111111111111'
const ME = 'user-me'

function session(overrides: Partial<LiveSessionView> = {}): LiveSessionView {
  return {
    id: SESSION_ID,
    title: 'Flash sale iPhone',
    status: 'live',
    startedAt: '2026-11-13T03:00:00Z',
    endedAt: null,
    viewerCount: 12,
    heartCount: 128,
    signalOnline: true,
    pinnedProductId: null,
    products: [],
    comments: [{ id: 'c1', sessionId: SESSION_ID, authorName: 'Lan', authorRole: 'customer', content: 'Còn màu titan không?', hidden: false, createdAt: '2026-11-13T03:01:00Z' }],
    media: { whepUrl: 'http://media/whep', hlsUrl: 'http://media/hls' },
    ...overrides,
  }
}

let socketOptions: { onEvent: (e: LiveRoomEvent) => void } | null
const sendHearts = vi.fn()

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/live/${SESSION_ID}`]}>
      <Routes>
        <Route path="/live/:sessionId" element={<LivePage />} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

function authAs(authenticated: boolean) {
  vi.mocked(useAuth).mockReturnValue({
    user: authenticated ? { id: ME, email: 'me@x.vn' } : null,
    accessToken: authenticated ? 'tok' : null,
    isAuthenticated: authenticated,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>)
}

const emit = (event: LiveRoomEvent) => act(() => socketOptions?.onEvent(event))

describe('LivePage', () => {
  beforeEach(() => {
    socketOptions = null
    sendHearts.mockReset()
    vi.mocked(useLiveSocket).mockImplementation((options) => {
      socketOptions = options
      return { connected: true, sendHearts }
    })
    vi.mocked(liveApi.getSession).mockReset()
    vi.mocked(liveApi.postComment).mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends visitors to login and back to this live', async () => {
    authAs(false)
    renderPage()
    expect(await screen.findByText('login page')).toBeInTheDocument()
    expect(liveApi.getSession).not.toHaveBeenCalled()
  })

  it('shows the live session with viewers, hearts and comments', async () => {
    authAs(true)
    vi.mocked(liveApi.getSession).mockResolvedValue(session())
    renderPage()

    expect((await screen.findAllByText('Flash sale iPhone')).length).toBeGreaterThan(0)
    expect(screen.getByTestId('live-viewers')).toHaveTextContent('12')
    expect(screen.getByTestId('live-hearts')).toHaveTextContent('128')
    expect(screen.getAllByText('Còn màu titan không?').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Giỏ hàng live' })).toBeInTheDocument()
  })

  it('applies realtime events', async () => {
    authAs(true)
    vi.mocked(liveApi.getSession).mockResolvedValue(session({ signalOnline: false }))
    renderPage()
    await screen.findByTestId('live-viewers')
    expect(screen.getByTestId('player')).toHaveTextContent('Đang chờ tín hiệu')

    emit({ type: 'live:comment', payload: { id: 'c2', sessionId: SESSION_ID, authorName: 'Chủ shop', authorRole: 'admin', content: 'Còn đủ màu nhé', hidden: false, createdAt: '2026-11-13T03:02:00Z' } })
    expect(screen.getAllByText('Còn đủ màu nhé').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Chủ shop').length).toBeGreaterThan(0)

    emit({ type: 'live:comment_hidden', payload: { commentId: 'c1' } })
    expect(screen.queryByText('Còn màu titan không?')).not.toBeInTheDocument()

    emit({ type: 'live:viewers', payload: { count: 30 } })
    expect(screen.getByTestId('live-viewers')).toHaveTextContent('30')

    emit({ type: 'live:signal', payload: { online: true } })
    expect(screen.getByTestId('player')).toHaveTextContent('online')

    emit({ type: 'live:ended', payload: { endedAt: '2026-11-13T04:00:00Z', reason: 'admin' } })
    expect(screen.getByText('Phiên live đã kết thúc')).toBeInTheDocument()
  })

  it('animates my taps at once and sends them in batches; others hearts come from the room', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    authAs(true)
    vi.mocked(liveApi.getSession).mockResolvedValue(session())
    renderPage()
    await screen.findByTestId('live-hearts')

    const heart = screen.getByRole('button', { name: 'Thả tim' })
    fireEvent.click(heart)
    fireEvent.click(heart)
    fireEvent.click(heart)
    expect(screen.getAllByTestId('floating-heart')).toHaveLength(3)
    expect(sendHearts).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(HEART_BATCH_MS)
    })
    expect(sendHearts).toHaveBeenCalledWith(3)

    emit({ type: 'live:hearts', payload: { total: 140, bursts: [{ userId: ME, count: 3 }, { userId: 'other', count: 2 }] } })
    expect(screen.getByTestId('live-hearts')).toHaveTextContent('140')
    expect(screen.getAllByTestId('floating-heart')).toHaveLength(5)
  })

  it('keeps the text and shows the reason when commenting too fast', async () => {
    authAs(true)
    vi.mocked(liveApi.getSession).mockResolvedValue(session())
    vi.mocked(liveApi.postComment).mockRejectedValue(
      new ApiError(429, { code: 'rate_limited', message: 'Bạn bình luận quá nhanh, vui lòng thử lại sau giây lát' }),
    )
    renderPage()
    const input = (await screen.findAllByLabelText('Bình luận'))[0]
    fireEvent.change(input, { target: { value: 'Giá bao nhiêu?' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Gửi bình luận' })[0])

    expect(await screen.findByText('Bạn bình luận quá nhanh, vui lòng thử lại sau giây lát')).toBeInTheDocument()
    expect(input).toHaveValue('Giá bao nhiêu?')
  })

  it('clears the input after a comment is posted', async () => {
    authAs(true)
    vi.mocked(liveApi.getSession).mockResolvedValue(session())
    vi.mocked(liveApi.postComment).mockResolvedValue({ id: 'c9', sessionId: SESSION_ID, authorName: 'Tôi', authorRole: 'customer', content: 'Chốt 1 cái', hidden: false, createdAt: '2026-11-13T03:03:00Z' })
    renderPage()
    const input = (await screen.findAllByLabelText('Bình luận'))[0]
    fireEvent.change(input, { target: { value: 'Chốt 1 cái' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Gửi bình luận' })[0])

    await waitFor(() => expect(input).toHaveValue(''))
    expect(liveApi.postComment).toHaveBeenCalledWith(SESSION_ID, 'Chốt 1 cái')
    expect(screen.getAllByText('Chốt 1 cái').length).toBeGreaterThan(0)
  })

  it('shows ended and not-found states', async () => {
    authAs(true)
    vi.mocked(liveApi.getSession).mockResolvedValueOnce(session({ status: 'ended', media: null, products: [], comments: [] }))
    const { unmount } = renderPage()
    expect(await screen.findByText('Phiên live đã kết thúc')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Xem sản phẩm' })).toHaveAttribute('href', '/products')
    unmount()

    vi.mocked(liveApi.getSession).mockRejectedValueOnce(new ApiError(404, { code: 'livestream_not_found', message: 'Không tìm thấy phiên live' }))
    renderPage()
    expect(await screen.findByText('Không tìm thấy phiên live')).toBeInTheDocument()
  })
})

describe('LivePage live cart', () => {
  beforeEach(() => {
    vi.mocked(useLiveSocket).mockImplementation((options) => {
      socketOptions = options
      return { connected: true, sendHearts }
    })
  })

  const product = {
    productId: 'p-1', position: 0, name: 'iPhone 16 Pro', brand: 'Apple', imageUrl: '',
    minPriceVnd: '25990000', maxPriceVnd: '25990000', regularMinPriceVnd: '28990000', regularMaxPriceVnd: '28990000',
    hasLivePrice: true, inStock: true, livePrices: [],
  }

  it('shows the pinned product and follows pin changes', async () => {
    authAs(true)
    vi.mocked(liveApi.getSession).mockResolvedValue(session({ products: [product], pinnedProductId: 'p-1' }))
    renderPage()
    expect(await screen.findByRole('button', { name: 'Mua ngay' })).toBeInTheDocument()

    emit({ type: 'live:products', payload: { products: [product], pinnedProductId: null } })
    expect(screen.queryByRole('button', { name: 'Mua ngay' })).not.toBeInTheDocument()
  })

  it('opens the live cart without leaving the live', async () => {
    authAs(true)
    vi.mocked(liveApi.getSession).mockResolvedValue(session({ products: [product] }))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Giỏ hàng live' }))
    expect(screen.getByRole('dialog', { name: 'Giỏ hàng live' })).toBeInTheDocument()
    expect(screen.getByTestId('player')).toBeInTheDocument()
  })
})
