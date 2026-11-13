import { useEffect, useRef, useState } from 'react'
import { Clock, Eye, Heart, Loader2, Mic, MicOff, Radio, Square, Video, VideoOff, WifiOff } from 'lucide-react'
import { adminLiveApi, type AdminLiveSession } from '@/api/live'
import { tokenStore } from '@/api/tokenStore'
import { startWhipPublish, type PublishState, type WhipPublish } from '@/lib/whip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { formatDuration } from './LiveSummaryCard'
import { FloatingHearts, type FloatingHeartsHandle } from './FloatingHearts'

interface LiveBroadcastPanelProps {
  session: AdminLiveSession
  /** Camera/microphone handed over by the setup form; null after a page reload. */
  stream: MediaStream | null
  onStreamChange: (stream: MediaStream) => void
  /** The very first publish of a just-created session could not reach the media server. */
  onPublishFailed: () => void
  /**
   * True only for the stream handed over right after creating the session; a
   * failed first attempt then cancels it. When resuming, failures are retried.
   */
  cancelOnFirstFailure: boolean
  viewerCount: number
  heartCount: number
  /** Latest batch of viewers' hearts to animate; seq changes with every batch. */
  heartBurst: { seq: number; count: number } | null
  onEnd: () => Promise<void>
}

const STATE_LABEL: Record<PublishState, string> = {
  connecting: 'Đang kết nối…',
  live: 'Đang phát',
  reconnecting: 'Mất kết nối – đang thử lại',
  failed: 'Không kết nối được máy chủ phát video',
}

export function LiveBroadcastPanel({ session, stream, onStreamChange, onPublishFailed, cancelOnFirstFailure, viewerCount, heartCount, heartBurst, onEnd }: LiveBroadcastPanelProps) {
  const previewRef = useRef<HTMLVideoElement>(null)
  const heartsRef = useRef<FloatingHeartsHandle>(null)
  const publishRef = useRef<WhipPublish | null>(null)
  const [state, setState] = useState<PublishState>('connecting')
  const [resumeError, setResumeError] = useState<string | null>(null)
  const [micOn, setMicOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(true)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [ending, setEnding] = useState(false)
  const elapsed = useElapsedSeconds(session.startedAt)
  const whipUrl = session.media?.whipUrl ?? null

  useEffect(() => {
    if (previewRef.current && stream) previewRef.current.srcObject = stream
  }, [stream])

  useEffect(() => {
    if (heartBurst && heartBurst.count > 0) heartsRef.current?.spawn(heartBurst.count)
  }, [heartBurst])

  useEffect(() => {
    if (!stream || !whipUrl) return
    const publish = startWhipPublish(stream, whipUrl, () => tokenStore.getToken(), {
      onState: setState,
      onFirstAttemptFailed: cancelOnFirstFailure ? onPublishFailed : undefined,
      // Any authenticated call refreshes an expired access token through the API client.
      onUnauthorized: async () => {
        await adminLiveApi.getSession(session.id)
      },
    })
    publishRef.current = publish
    return () => {
      publish.stop()
      publishRef.current = null
    }
    // Restart only for a new stream or URL: onPublishFailed changing identity must not drop the broadcast.
  }, [stream, whipUrl])

  // Muting keeps the session and the WebRTC connection; viewers get silence or black frames.
  const toggleTrack = (kind: 'audio' | 'video') => {
    const enabled = kind === 'audio' ? !micOn : !cameraOn
    stream?.getTracks().filter((t) => t.kind === kind).forEach((t) => (t.enabled = enabled))
    if (kind === 'audio') setMicOn(enabled)
    else setCameraOn(enabled)
  }

  const end = async () => {
    setEnding(true)
    try {
      await onEnd()
    } finally {
      setEnding(false)
      setConfirmEnd(false)
    }
  }

  const resume = async () => {
    setResumeError(null)
    try {
      onStreamChange(await navigator.mediaDevices.getUserMedia({ video: true, audio: true }))
    } catch {
      setResumeError('Không mở được camera/micro. Hãy cấp quyền cho trình duyệt rồi thử lại.')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-3xl bg-zinc-950">
        {stream ? (
          <video ref={previewRef} data-testid="live-preview" autoPlay muted playsInline className="h-full w-full -scale-x-100 object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-zinc-200">
            <p className="text-sm">Phiên live vẫn đang mở. Bấm để phát lại từ thiết bị này.</p>
            <button type="button" onClick={resume} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700">
              <Radio className="h-4 w-4" /> Tiếp tục phát
            </button>
            {resumeError && <p role="alert" className="text-xs text-rose-300">{resumeError}</p>}
          </div>
        )}
        {stream && (
          <span
            data-testid="publish-state"
            className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold text-white ${
              state === 'live' ? 'bg-rose-600' : 'bg-zinc-800/90'
            }`}
          >
            {state === 'live' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
            {state === 'connecting' && <Loader2 className="h-3 w-3 animate-spin" />}
            {(state === 'reconnecting' || state === 'failed') && <WifiOff className="h-3 w-3" />}
            {STATE_LABEL[state]}
          </span>
        )}
        <FloatingHearts ref={heartsRef} />
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <Metric icon={Clock} label="Thời lượng" value={formatDuration(elapsed)} testId="live-duration" />
        <Metric icon={Eye} label="Người xem" value={viewerCount.toLocaleString('vi-VN')} testId="live-viewers" />
        <Metric icon={Heart} label="Lượt tim" value={heartCount.toLocaleString('vi-VN')} testId="live-hearts" />
      </dl>

      <div className="flex gap-2">
        <button type="button" onClick={() => toggleTrack('audio')} disabled={!stream} aria-pressed={!micOn} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white text-sm font-semibold text-zinc-800 disabled:opacity-40">
          {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4 text-rose-600" />}
          {micOn ? 'Tắt micro' : 'Bật micro'}
        </button>
        <button type="button" onClick={() => toggleTrack('video')} disabled={!stream} aria-pressed={!cameraOn} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white text-sm font-semibold text-zinc-800 disabled:opacity-40">
          {cameraOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4 text-rose-600" />}
          {cameraOn ? 'Tắt camera' : 'Bật camera'}
        </button>
      </div>
      <button type="button" onClick={() => setConfirmEnd(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-zinc-950 text-sm font-bold text-white hover:bg-zinc-800">
        <Square className="h-3.5 w-3.5 fill-current" /> Kết thúc live
      </button>

      <AlertDialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kết thúc phiên live?</AlertDialogTitle>
            <AlertDialogDescription>Người xem sẽ thấy phiên đã kết thúc và mọi giá live hết hiệu lực ngay.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Tiếp tục phát</AlertDialogCancel>
            <AlertDialogAction onClick={end} isLoading={ending}>Kết thúc live</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Metric({ icon: Icon, label, value, testId }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; testId: string }) {
  return (
    <div className="rounded-xl bg-white px-2 py-2 ring-1 ring-zinc-200">
      <dt className="flex items-center justify-center gap-1 text-[11px] text-zinc-500"><Icon className="h-3 w-3" />{label}</dt>
      <dd data-testid={testId} className="font-mono text-base font-bold tabular-nums text-zinc-950">{value}</dd>
    </div>
  )
}

function useElapsedSeconds(startedAt: string): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return Math.max(0, (now - new Date(startedAt).getTime()) / 1000)
}
