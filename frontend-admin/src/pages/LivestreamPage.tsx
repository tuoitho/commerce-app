import { useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { adminLiveApi, type AdminLiveSession, type LiveProductInput, type LiveRoomEvent } from '@/api/live'
import { tokenStore } from '@/api/tokenStore'
import { useAdminLiveSocket } from '@/hooks/useAdminLiveSocket'
import { LiveSetupForm } from '@/components/live/LiveSetupForm'
import { LiveBroadcastPanel } from '@/components/live/LiveBroadcastPanel'
import { LiveCommentsPanel } from '@/components/live/LiveCommentsPanel'
import { LiveProductsManager } from '@/components/live/LiveProductsManager'
import { LiveSummaryCard } from '@/components/live/LiveSummaryCard'

const CURRENT_KEY = ['admin', 'live', 'current'] as const
const MAX_COMMENTS = 200
const MAX_HEARTS_PER_EVENT = 15

export function LivestreamPage() {
  const queryClient = useQueryClient()
  const current = useQuery({ queryKey: CURRENT_KEY, queryFn: adminLiveApi.getCurrent })
  const [session, setSession] = useState<AdminLiveSession | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  // The setup form's stream starts a brand-new session; a stream opened by "Tiếp tục phát" resumes one.
  const [freshStart, setFreshStart] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [heartBurst, setHeartBurst] = useState<{ seq: number; count: number } | null>(null)

  useEffect(() => {
    if (current.data) setSession(current.data)
  }, [current.data])

  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream])

  const showSummary = useCallback(
    (ended: AdminLiveSession) => {
      setSession(ended)
      setStream(null)
      queryClient.setQueryData(CURRENT_KEY, null)
    },
    [queryClient],
  )

  const liveId = session?.status === 'live' ? session.id : null

  const reload = useCallback(async () => {
    if (liveId) setSession(await adminLiveApi.getSession(liveId))
  }, [liveId])

  const handleEvent = useCallback(
    (event: LiveRoomEvent) => {
      setSession((s) => {
        if (!s) return s
        switch (event.type) {
          case 'live:comment':
            return s.comments.some((c) => c.id === event.payload.id) ? s : { ...s, comments: [...s.comments, event.payload].slice(-MAX_COMMENTS) }
          case 'live:comment_hidden':
            return { ...s, comments: s.comments.map((c) => (c.id === event.payload.commentId ? { ...c, hidden: true } : c)) }
          case 'live:hearts':
            return { ...s, heartCount: event.payload.total }
          case 'live:viewers':
            return { ...s, viewerCount: event.payload.count }
          case 'live:products':
            return { ...s, products: event.payload.products, pinnedProductId: event.payload.pinnedProductId }
          case 'live:signal':
            return { ...s, signalOnline: event.payload.online }
          default:
            return s
        }
      })
      if (event.type === 'live:hearts') {
        const count = event.payload.bursts.reduce((sum, b) => sum + b.count, 0)
        setHeartBurst((previous) => ({ seq: (previous?.seq ?? 0) + 1, count: Math.min(count, MAX_HEARTS_PER_EVENT) }))
      }
      if (event.type === 'live:ended' && liveId) {
        // Ended elsewhere (e.g. signal lost): fetch the final summary.
        void adminLiveApi.getSession(liveId).then(showSummary).catch(() => {})
      }
    },
    [liveId, showSummary],
  )

  useAdminLiveSocket({ sessionId: liveId, token: tokenStore.getToken(), onEvent: handleEvent, onReconnect: reload })

  const handlePublishFailed = useCallback(() => {
    if (!liveId) return
    void adminLiveApi.end(liveId).catch(() => {})
    setSession(null)
    setStream(null)
    setNotice('Không kết nối được máy chủ phát video. Phiên live đã được hủy, vui lòng thử lại.')
    void queryClient.invalidateQueries({ queryKey: CURRENT_KEY })
  }, [liveId, queryClient])

  const end = async () => {
    if (liveId) showSummary(await adminLiveApi.end(liveId))
  }

  const sendComment = async (content: string) => {
    if (!liveId) return
    const comment = await adminLiveApi.comment(liveId, content)
    setSession((s) => (s && !s.comments.some((c) => c.id === comment.id) ? { ...s, comments: [...s.comments, comment] } : s))
  }

  const hideComment = async (commentId: string) => {
    await adminLiveApi.hideComment(commentId)
    setSession((s) => (s ? { ...s, comments: s.comments.map((c) => (c.id === commentId ? { ...c, hidden: true } : c)) } : s))
  }

  const saveProducts = async (products: LiveProductInput[]) => {
    if (liveId) setSession(await adminLiveApi.replaceProducts(liveId, products))
  }

  const togglePin = async (productId: string | null) => {
    if (liveId) setSession(await adminLiveApi.pin(liveId, productId))
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-950">Livestream</h1>
        <p className="mt-1 text-sm text-zinc-500">Phát trực tiếp từ trình duyệt, chốt đơn với giá live và số suất giới hạn.</p>
      </header>

      {notice && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{notice}</p>}

      {current.isLoading ? (
        <div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />
      ) : session?.status === 'ended' ? (
        <LiveSummaryCard session={session} onNewSession={() => setSession(null)} />
      ) : session ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_minmax(0,20rem)]">
          <LiveBroadcastPanel
            session={session}
            stream={stream}
            onStreamChange={(resumed) => {
              setFreshStart(false)
              setStream(resumed)
            }}
            onPublishFailed={handlePublishFailed}
            cancelOnFirstFailure={freshStart}
            viewerCount={session.viewerCount}
            heartCount={session.heartCount}
            heartBurst={heartBurst}
            onEnd={end}
          />
          <LiveProductsManager products={session.products} pinnedProductId={session.pinnedProductId} onSave={saveProducts} onTogglePin={togglePin} />
          <div className="lg:max-h-[calc(100vh-10rem)]">
            <LiveCommentsPanel comments={session.comments} onSend={sendComment} onHide={hideComment} />
          </div>
        </div>
      ) : (
        <LiveSetupForm
          onStarted={(started, startedStream) => {
            setNotice(null)
            setSession(started)
            setFreshStart(true)
            setStream(startedStream)
            queryClient.setQueryData(CURRENT_KEY, started)
          }}
          onConflict={() => void queryClient.invalidateQueries({ queryKey: CURRENT_KEY })}
        />
      )}
    </div>
  )
}
