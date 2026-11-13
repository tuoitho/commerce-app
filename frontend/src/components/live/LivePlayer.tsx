import { useEffect, useRef, useState } from 'react'
import { Loader2, Volume2, WifiOff } from 'lucide-react'
import type { LiveMedia } from '@/api/live'
import { authApi } from '@/api/auth'
import { tokenStore } from '@/api/tokenStore'
import { startLivePlayback, type PlaybackState } from '@/lib/liveMedia'

interface LivePlayerProps {
  media: LiveMedia
  token: string
  /** Whether the media server currently sees the broadcaster. */
  signalOnline: boolean
}

export function LivePlayer({ media, token, signalOnline }: LivePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  // Read through a ref so a refreshed access token is used without restarting playback.
  const tokenRef = useRef(token)
  useEffect(() => {
    tokenRef.current = token
  }, [token])
  const [state, setState] = useState<PlaybackState>({ status: 'connecting', mode: 'webrtc' })
  const [mutedByBrowser, setMutedByBrowser] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const playback = startLivePlayback(
      video,
      { whepUrl: media.whepUrl, hlsUrl: media.hlsUrl, getToken: () => tokenStore.getToken() ?? tokenRef.current },
      {
        onState: setState,
        onMutedAutoplay: () => setMutedByBrowser(true),
        // Any authenticated call refreshes an expired access token through the API client.
        onUnauthorized: async () => {
          await authApi.getMe()
        },
      },
    )
    return () => playback.stop()
  }, [media.whepUrl, media.hlsUrl])

  const unmute = () => {
    const video = videoRef.current
    if (!video) return
    video.muted = false
    void video.play().catch(() => {})
    setMutedByBrowser(false)
  }

  const showOverlay = state.status !== 'playing' || !signalOnline
  const connecting = state.status === 'connecting' && signalOnline

  return (
    <div className="absolute inset-0 bg-zinc-950">
      <video
        ref={videoRef}
        data-testid="live-video"
        className="h-full w-full object-cover"
        playsInline
        autoPlay
      />
      {showOverlay && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950/80 text-center text-white">
          {connecting ? <Loader2 className="h-7 w-7 animate-spin text-teal-300" /> : <WifiOff className="h-7 w-7 text-zinc-400" />}
          <p className="text-sm font-semibold">{connecting ? 'Đang kết nối…' : 'Đang chờ tín hiệu'}</p>
          {!connecting && <p className="max-w-56 text-xs text-zinc-400">Chủ shop sẽ quay lại ngay, bạn vẫn có thể bình luận và xem giỏ hàng live.</p>}
        </div>
      )}
      {mutedByBrowser && !showOverlay && (
        <button
          type="button"
          onClick={unmute}
          className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-zinc-950 shadow-lg"
        >
          <Volume2 className="h-4 w-4" /> Bật âm thanh
        </button>
      )}
    </div>
  )
}
