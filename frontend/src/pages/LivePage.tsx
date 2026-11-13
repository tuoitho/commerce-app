import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Eye, Heart, Radio, ShoppingBag } from 'lucide-react'
import { ApiError } from '@/api/client'
import { liveApi, type LiveComment, type LiveProduct, type LiveRoomEvent, type LiveSessionView } from '@/api/live'
import { useAuth } from '@/context/AuthContext'
import { useLiveSocket } from '@/hooks/useLiveSocket'
import { LivePlayer } from '@/components/live/LivePlayer'
import { FloatingHearts, type FloatingHeartsHandle } from '@/components/live/FloatingHearts'
import { LiveCommentComposer, LiveCommentList } from '@/components/live/LiveComments'
import { LiveCartSheet } from '@/components/live/LiveCartSheet'
import { PinnedProductCard } from '@/components/live/PinnedProductCard'
import { Skeleton } from '@/components/ui/skeleton'

/** Hearts tapped locally are sent to the room in batches at this interval. */
export const HEART_BATCH_MS = 500
const MAX_COMMENTS = 200
const MAX_REMOTE_HEARTS_PER_EVENT = 15

type PageState = { kind: 'loading' } | { kind: 'not_found' } | { kind: 'ended' } | { kind: 'live'; session: LiveSessionView }

export function LivePage() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: authLoading, accessToken, user } = useAuth()

  const [page, setPage] = useState<PageState>({ kind: 'loading' })
  const [comments, setComments] = useState<LiveComment[]>([])
  const [products, setProducts] = useState<LiveProduct[]>([])
  const [pinnedProductId, setPinnedProductId] = useState<string | null>(null)
  const [viewerCount, setViewerCount] = useState(0)
  const [heartCount, setHeartCount] = useState(0)
  const [signalOnline, setSignalOnline] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [cartFocus, setCartFocus] = useState<string | null>(null)

  const heartsRef = useRef<FloatingHeartsHandle>(null)
  const pendingHearts = useRef(0)

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(`/live/${sessionId}`)}`, { replace: true })
    }
  }, [authLoading, isAuthenticated, navigate, sessionId])

  const applySnapshot = useCallback((session: LiveSessionView) => {
    if (session.status === 'ended') {
      setPage({ kind: 'ended' })
      return
    }
    setPage({ kind: 'live', session })
    setComments(session.comments)
    setProducts(session.products)
    setPinnedProductId(session.pinnedProductId)
    setViewerCount(session.viewerCount)
    setHeartCount(session.heartCount)
    setSignalOnline(session.signalOnline)
  }, [])

  const loadSession = useCallback(async () => {
    try {
      applySnapshot(await liveApi.getSession(sessionId))
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setPage({ kind: 'not_found' })
      }
    }
  }, [applySnapshot, sessionId])

  useEffect(() => {
    if (isAuthenticated) void loadSession()
  }, [isAuthenticated, loadSession])

  const handleEvent = useCallback(
    (event: LiveRoomEvent) => {
      switch (event.type) {
        case 'live:comment':
          setComments((current) =>
            current.some((c) => c.id === event.payload.id) ? current : [...current, event.payload].slice(-MAX_COMMENTS),
          )
          break
        case 'live:comment_hidden':
          setComments((current) => current.filter((c) => c.id !== event.payload.commentId))
          break
        case 'live:hearts': {
          setHeartCount(event.payload.total)
          const others = event.payload.bursts.filter((b) => b.userId !== user?.id).reduce((sum, b) => sum + b.count, 0)
          if (others > 0) heartsRef.current?.spawn(Math.min(others, MAX_REMOTE_HEARTS_PER_EVENT))
          break
        }
        case 'live:viewers':
          setViewerCount(event.payload.count)
          break
        case 'live:products':
          setProducts(event.payload.products)
          setPinnedProductId(event.payload.pinnedProductId)
          break
        case 'live:signal':
          setSignalOnline(event.payload.online)
          break
        case 'live:ended':
          setPage({ kind: 'ended' })
          break
      }
    },
    [user?.id],
  )

  const liveSessionId = page.kind === 'live' ? page.session.id : null
  const { sendHearts } = useLiveSocket({
    sessionId: liveSessionId,
    token: accessToken,
    onEvent: handleEvent,
    onReconnect: loadSession,
  })

  useEffect(() => {
    if (!liveSessionId) return
    const timer = setInterval(() => {
      if (pendingHearts.current > 0) {
        sendHearts(pendingHearts.current)
        pendingHearts.current = 0
      }
    }, HEART_BATCH_MS)
    return () => clearInterval(timer)
  }, [liveSessionId, sendHearts])

  const tapHeart = () => {
    heartsRef.current?.spawn(1)
    pendingHearts.current += 1
  }

  const postComment = async (content: string) => {
    const comment = await liveApi.postComment(sessionId, content)
    setComments((current) => (current.some((c) => c.id === comment.id) ? current : [...current, comment].slice(-MAX_COMMENTS)))
  }

  if (page.kind === 'loading' || !isAuthenticated) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Skeleton className="mx-auto aspect-[9/16] w-full max-w-sm rounded-2xl" />
      </div>
    )
  }
  if (page.kind === 'not_found' || page.kind === 'ended') {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500">
          <Radio className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-xl font-bold text-zinc-950">
          {page.kind === 'ended' ? 'Phiên live đã kết thúc' : 'Không tìm thấy phiên live'}
        </h1>
        <p className="mt-2 text-sm text-zinc-600">Cảm ơn bạn đã theo dõi. Các sản phẩm vẫn đang được bán với giá niêm yết.</p>
        <Link to="/products" className="mt-6 rounded-xl bg-zinc-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-zinc-800">
          Xem sản phẩm
        </Link>
      </div>
    )
  }

  const { session } = page
  const pinnedProduct = products.find((p) => p.productId === pinnedProductId) ?? null
  const openCart = (productId: string | null) => {
    setCartFocus(productId)
    setCartOpen(true)
  }
  return (
    <div className="md:mx-auto md:grid md:max-w-6xl md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] md:gap-6 md:px-6 md:py-8 lg:px-8">
      {/* Stage: full screen on phones, a 9:16 column from md up */}
      <section
        data-testid="live-stage"
        className="fixed inset-0 z-40 overflow-hidden bg-zinc-950 md:relative md:inset-auto md:z-auto md:aspect-[9/16] md:max-h-[calc(100vh-8rem)] md:w-full md:rounded-3xl"
      >
        {session.media && accessToken ? (
          <LivePlayer media={session.media} token={accessToken} signalOnline={signalOnline} />
        ) : null}

        <div className="absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/60 to-transparent p-3 text-white">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Quay lại"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm md:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-rose-600 px-2 py-1 text-[11px] font-bold tracking-wider">
            <span className="live-pulse-dot h-1.5 w-1.5 rounded-full bg-white" /> LIVE
          </span>
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{session.title}</h1>
          <span data-testid="live-viewers" className="inline-flex shrink-0 items-center gap-1 rounded-md bg-black/35 px-2 py-1 text-xs font-semibold tabular-nums backdrop-blur-sm">
            <Eye className="h-3.5 w-3.5" /> {viewerCount}
          </span>
        </div>

        <FloatingHearts ref={heartsRef} />

        <div className="absolute bottom-0 right-0 flex flex-col items-center gap-4 p-3 pb-6">
          <button
            type="button"
            onClick={() => openCart(null)}
            aria-label="Giỏ hàng live"
            className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white text-zinc-950 shadow-lg"
          >
            <ShoppingBag className="h-5 w-5" />
            {products.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                {products.length}
              </span>
            )}
          </button>
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={tapHeart}
              aria-label="Thả tim"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-black/35 text-rose-500 backdrop-blur-sm transition-transform active:scale-90"
            >
              <Heart className="h-6 w-6 fill-current" />
            </button>
            <span data-testid="live-hearts" className="text-xs font-bold tabular-nums text-white drop-shadow">
              {heartCount.toLocaleString('vi-VN')}
            </span>
          </div>
        </div>

        {/* Pinned product, plus the comments overlay on phones */}
        <div className="absolute bottom-0 left-0 right-20 flex flex-col gap-2 p-3 pb-6">
          {pinnedProduct && <PinnedProductCard product={pinnedProduct} onBuy={openCart} />}
          <div className="flex flex-col gap-2 md:hidden">
            <LiveCommentList comments={comments} variant="overlay" />
            <LiveCommentComposer onSubmit={postComment} variant="overlay" />
          </div>
        </div>
      </section>

      <LiveCartSheet open={cartOpen} products={products} focusProductId={cartFocus} onClose={() => setCartOpen(false)} />

      {/* Side panel from md up */}
      <aside className="hidden min-h-0 flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white md:flex md:max-h-[calc(100vh-8rem)]">
        <div className="border-b border-zinc-200 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Đang phát trực tiếp</p>
          <h2 className="mt-1 text-lg font-bold leading-tight text-zinc-950">{session.title}</h2>
          <p className="mt-1 text-xs text-zinc-500">
            {viewerCount} người đang xem · {heartCount.toLocaleString('vi-VN')} lượt thả tim
          </p>
        </div>
        <LiveCommentList comments={comments} variant="panel" />
        <LiveCommentComposer onSubmit={postComment} variant="panel" />
      </aside>
    </div>
  )
}
