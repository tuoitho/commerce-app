import Hls from 'hls.js'

/** Delay before asking again for a stream that has no publisher yet. */
export const WHEP_RETRY_MS = 3000
/** WebRTC that does not connect within this time falls back to HLS. */
export const WHEP_CONNECT_TIMEOUT_MS = 5000
const ICE_GATHERING_TIMEOUT_MS = 2000

export type PlaybackMode = 'webrtc' | 'hls'

export interface PlaybackState {
  status: 'connecting' | 'playing' | 'waiting'
  mode: PlaybackMode
}

export interface PlaybackSource {
  whepUrl: string
  hlsUrl: string
  /** Read before every request so a refreshed access token is used. */
  getToken: () => string
}

export interface PlaybackCallbacks {
  onState: (state: PlaybackState) => void
  /** Autoplay with sound was blocked; the video plays muted. */
  onMutedAutoplay?: () => void
  /** The media server refused the token; refresh it before the next attempt. */
  onUnauthorized?: () => Promise<void>
}

export interface LivePlayback {
  stop: () => void
}

/**
 * Plays a live stream into video: WebRTC (WHEP) first for sub-second latency,
 * LL-HLS when WebRTC is unavailable or cannot connect. A stream without a
 * publisher yet is retried until it appears.
 */
export function startLivePlayback(video: HTMLVideoElement, source: PlaybackSource, callbacks: PlaybackCallbacks): LivePlayback {
  let stopped = false
  let pc: RTCPeerConnection | null = null
  let whepSessionUrl: string | null = null
  let hls: Hls | null = null
  const timers = new Set<ReturnType<typeof setTimeout>>()

  const later = (fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer)
      if (!stopped) fn()
    }, ms)
    timers.add(timer)
  }
  const report = (status: PlaybackState['status'], mode: PlaybackMode) => {
    if (!stopped) callbacks.onState({ status, mode })
  }

  const play = async () => {
    try {
      await video.play()
    } catch (err) {
      if ((err as Error)?.name !== 'NotAllowedError') return
      video.muted = true
      await video.play().catch(() => {})
      callbacks.onMutedAutoplay?.()
    }
  }

  const closePeer = () => {
    if (pc) {
      pc.ontrack = null
      pc.onconnectionstatechange = null
      pc.close()
      pc = null
    }
    if (whepSessionUrl) {
      void fetch(whepSessionUrl, { method: 'DELETE', headers: { Authorization: `Bearer ${source.getToken()}` } }).catch(() => {})
      whepSessionUrl = null
    }
  }

  const startHls = () => {
    closePeer()
    report('connecting', 'hls')
    if (Hls.isSupported()) {
      const instance = new Hls({
        lowLatencyMode: true,
        xhrSetup: (xhr) => xhr.setRequestHeader('Authorization', `Bearer ${source.getToken()}`),
      })
      hls = instance
      instance.on(Hls.Events.MANIFEST_PARSED, () => {
        report('playing', 'hls')
        void play()
      })
      instance.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return
        instance.destroy()
        hls = null
        report('waiting', 'hls')
        later(startHls, WHEP_RETRY_MS)
      })
      instance.loadSource(source.hlsUrl)
      instance.attachMedia(video)
      return
    }
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native players cannot send headers; the media server accepts ?token=.
      video.src = `${source.hlsUrl}?token=${encodeURIComponent(source.getToken())}`
      video.onplaying = () => report('playing', 'hls')
      video.onerror = () => {
        report('waiting', 'hls')
        later(startHls, WHEP_RETRY_MS)
      }
      void play()
      return
    }
    report('waiting', 'hls')
  }

  const startWhep = async () => {
    report('connecting', 'webrtc')
    const peer = new RTCPeerConnection()
    pc = peer
    peer.addTransceiver('video', { direction: 'recvonly' })
    peer.addTransceiver('audio', { direction: 'recvonly' })
    peer.ontrack = (event) => {
      if (video.srcObject !== event.streams[0]) {
        video.srcObject = event.streams[0]
        void play()
      }
    }

    let response: Response
    try {
      await peer.setLocalDescription(await peer.createOffer())
      await waitForIceGathering(peer)
      response = await fetch(source.whepUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp', Authorization: `Bearer ${source.getToken()}` },
        body: peer.localDescription?.sdp ?? '',
      })
    } catch {
      if (!stopped) startHls()
      return
    }
    if (stopped || pc !== peer) return

    if (response.status === 401 || response.status === 403) {
      // An expired access token: refresh it, then try again.
      closePeer()
      report('waiting', 'webrtc')
      await callbacks.onUnauthorized?.().catch(() => {})
      later(() => void startWhep(), WHEP_RETRY_MS)
      return
    }
    if (response.status === 404) {
      // No publisher yet: keep waiting.
      closePeer()
      report('waiting', 'webrtc')
      later(() => void startWhep(), WHEP_RETRY_MS)
      return
    }
    if (!response.ok) {
      startHls()
      return
    }

    const location = response.headers.get('Location')
    whepSessionUrl = location ? new URL(location, source.whepUrl).toString() : null
    const connectTimeout = setTimeout(() => {
      timers.delete(connectTimeout)
      if (!stopped && pc === peer && peer.connectionState !== 'connected') startHls()
    }, WHEP_CONNECT_TIMEOUT_MS)
    timers.add(connectTimeout)

    peer.onconnectionstatechange = () => {
      if (stopped || pc !== peer) return
      if (peer.connectionState === 'connected') {
        clearTimeout(connectTimeout)
        timers.delete(connectTimeout)
        report('playing', 'webrtc')
      } else if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
        closePeer()
        report('waiting', 'webrtc')
        later(() => void startWhep(), WHEP_RETRY_MS)
      }
    }
    try {
      await peer.setRemoteDescription({ type: 'answer', sdp: await response.text() })
    } catch {
      if (!stopped) startHls()
      return
    }
    if (peer.connectionState === 'connected') peer.onconnectionstatechange?.(new Event('connectionstatechange'))
  }

  if (typeof RTCPeerConnection === 'undefined') {
    startHls()
  } else {
    void startWhep()
  }

  return {
    stop: () => {
      stopped = true
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
      closePeer()
      hls?.destroy()
      hls = null
      video.onplaying = null
      video.onerror = null
      video.srcObject = null
      video.removeAttribute('src')
    },
  }
}

function waitForIceGathering(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      peer.removeEventListener('icegatheringstatechange', check)
      resolve()
    }
    const check = () => {
      if (peer.iceGatheringState === 'complete') done()
    }
    const timer = setTimeout(done, ICE_GATHERING_TIMEOUT_MS)
    peer.addEventListener('icegatheringstatechange', check)
  })
}
