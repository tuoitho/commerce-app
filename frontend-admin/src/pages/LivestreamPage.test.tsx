import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LivestreamPage } from './LivestreamPage'
import { adminLiveApi, type AdminLiveSession, type LiveRoomEvent } from '@/api/live'
import { startWhipPublish, type PublishCallbacks } from '@/lib/whip'

vi.mock('@/api/live', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/live')>()),
  adminLiveApi: { getCurrent: vi.fn(), end: vi.fn(), create: vi.fn(), getSession: vi.fn(), replaceProducts: vi.fn(), pin: vi.fn(), comment: vi.fn(), hideComment: vi.fn() },
}))
vi.mock('@/lib/whip', () => ({ startWhipPublish: vi.fn() }))
let socketOptions: { onEvent: (e: LiveRoomEvent) => void } | null = null
vi.mock('@/hooks/useAdminLiveSocket', () => ({
  useAdminLiveSocket: (options: { onEvent: (e: LiveRoomEvent) => void }) => {
    socketOptions = options
    return { connected: true }
  },
}))

const fakeStream = { getTracks: () => [{ kind: 'video', stop: vi.fn(), enabled: true }, { kind: 'audio', stop: vi.fn(), enabled: true }] } as unknown as MediaStream

vi.mock('@/components/live/LiveSetupForm', () => ({
  LiveSetupForm: ({ onStarted }: { onStarted: (s: AdminLiveSession, stream: MediaStream) => void }) => (
    <button type="button" onClick={() => onStarted(liveSession(), fakeStream)}>fake start</button>
  ),
}))

function liveSession(overrides: Partial<AdminLiveSession> = {}): AdminLiveSession {
  return {
    id: 's-1', title: 'Flash sale', status: 'live', startedAt: '2026-11-13T03:00:00Z', endedAt: null,
    viewerCount: 0, heartCount: 0, signalOnline: false, pinnedProductId: null, products: [], comments: [],
    media: { whipUrl: 'http://media/live/s-1/whip', whepUrl: 'http://media/live/s-1/whep', hlsUrl: 'http://media/live/s-1/index.m3u8' },
    summary: { durationSeconds: 0, peakViewers: 0, commentCount: 0, heartCount: 0, endReason: null },
    ...overrides,
  }
}

let whipCallbacks: PublishCallbacks
const stopPublish = vi.fn()

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LivestreamPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('LivestreamPage', () => {
  beforeEach(() => {
    vi.mocked(adminLiveApi.getCurrent).mockReset()
    vi.mocked(adminLiveApi.end).mockReset()
    vi.mocked(startWhipPublish).mockImplementation((_stream, _url, _token, callbacks) => {
      whipCallbacks = callbacks
      return { stop: stopPublish, replaceTrack: vi.fn() }
    })
  })

  it('starts publishing to the session WHIP URL once the setup form starts a session', async () => {
    vi.mocked(adminLiveApi.getCurrent).mockResolvedValue(null)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'fake start' }))

    await waitFor(() => expect(startWhipPublish).toHaveBeenCalledWith(fakeStream, 'http://media/live/s-1/whip', expect.any(Function), expect.any(Object)))
    expect(whipCallbacks.onFirstAttemptFailed).toEqual(expect.any(Function))
    act(() => whipCallbacks.onState('live'))
    expect(screen.getByTestId('publish-state')).toHaveTextContent('Đang phát')
    act(() => whipCallbacks.onState('reconnecting'))
    expect(screen.getByTestId('publish-state')).toHaveTextContent('Mất kết nối – đang thử lại')
  })

  it('cancels the session when the first publish cannot reach the media server', async () => {
    vi.mocked(adminLiveApi.getCurrent).mockResolvedValue(null)
    vi.mocked(adminLiveApi.end).mockResolvedValue(liveSession({ status: 'ended' }))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'fake start' }))
    await waitFor(() => expect(startWhipPublish).toHaveBeenCalled())

    act(() => whipCallbacks.onFirstAttemptFailed?.())
    expect(adminLiveApi.end).toHaveBeenCalledWith('s-1')
    expect(await screen.findByText(/Không kết nối được máy chủ phát video/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'fake start' })).toBeInTheDocument()
  })

  it('goes straight to the live session after a reload and offers to resume broadcasting', async () => {
    vi.mocked(adminLiveApi.getCurrent).mockResolvedValue(liveSession())
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => fakeStream) } })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Tiếp tục phát/ }))
    await waitFor(() => expect(startWhipPublish).toHaveBeenCalledWith(fakeStream, 'http://media/live/s-1/whip', expect.any(Function), expect.any(Object)))
    // A resumed broadcast retries on failure instead of cancelling the running session.
    expect(whipCallbacks.onFirstAttemptFailed).toBeUndefined()
    expect(adminLiveApi.end).not.toHaveBeenCalled()
  })

  it('applies realtime viewers, hearts and comments', async () => {
    vi.mocked(adminLiveApi.getCurrent).mockResolvedValue(liveSession())
    renderPage()
    await screen.findByTestId('live-viewers')

    act(() => socketOptions?.onEvent({ type: 'live:viewers', payload: { count: 42 } }))
    act(() => socketOptions?.onEvent({ type: 'live:hearts', payload: { total: 999, bursts: [] } }))
    act(() => socketOptions?.onEvent({ type: 'live:comment', payload: { id: 'c1', sessionId: 's-1', authorName: 'Lan', authorRole: 'customer', content: 'Còn size M?', hidden: false, createdAt: '' } }))
    expect(screen.getByTestId('live-viewers')).toHaveTextContent('42')
    expect(screen.getByTestId('live-hearts')).toHaveTextContent('999')
    expect(screen.getByText('Còn size M?')).toBeInTheDocument()
  })

  it('shows the summary after ending, and after the server ends the session', async () => {
    vi.mocked(adminLiveApi.getCurrent).mockResolvedValue(liveSession())
    const ended = liveSession({ status: 'ended', endedAt: '2026-11-13T04:00:00Z', media: null, summary: { durationSeconds: 120, peakViewers: 9, commentCount: 3, heartCount: 50, endReason: 'admin' } })
    vi.mocked(adminLiveApi.end).mockResolvedValue(ended)
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Kết thúc live' }))
    const confirm = screen.getAllByRole('button', { name: 'Kết thúc live' }).at(-1) as HTMLElement
    fireEvent.click(confirm)
    expect(await screen.findByText('Phiên live đã kết thúc')).toBeInTheDocument()
    expect(adminLiveApi.end).toHaveBeenCalledWith('s-1')
  })

  it('fetches the final summary when the room reports the session ended', async () => {
    vi.mocked(adminLiveApi.getCurrent).mockResolvedValue(liveSession())
    vi.mocked(adminLiveApi.getSession).mockResolvedValue(liveSession({ status: 'ended', media: null, summary: { durationSeconds: 700, peakViewers: 3, commentCount: 0, heartCount: 0, endReason: 'signal_lost' } }))
    renderPage()
    await screen.findByTestId('live-viewers')

    act(() => socketOptions?.onEvent({ type: 'live:ended', payload: { endedAt: '2026-11-13T04:00:00Z', reason: 'signal_lost' } }))
    expect(await screen.findByText(/mất tín hiệu/)).toBeInTheDocument()
  })

  it('animates the hearts viewers send on the broadcast preview', async () => {
    vi.mocked(adminLiveApi.getCurrent).mockResolvedValue(liveSession())
    renderPage()
    await screen.findByTestId('live-viewers')
    expect(screen.queryAllByTestId('floating-heart')).toHaveLength(0)

    act(() => socketOptions?.onEvent({ type: 'live:hearts', payload: { total: 5, bursts: [{ userId: 'u1', count: 3 }, { userId: 'u2', count: 2 }] } }))
    expect(screen.getByTestId('live-hearts')).toHaveTextContent('5')
    expect(screen.getAllByTestId('floating-heart')).toHaveLength(5)
  })
})
