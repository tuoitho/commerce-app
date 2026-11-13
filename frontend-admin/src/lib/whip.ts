export type PublishState = 'connecting' | 'live' | 'reconnecting' | 'failed'

export interface PublishCallbacks {
  onState: (state: PublishState) => void
  /** The very first publish attempt could not reach the media server. */
  onFirstAttemptFailed?: () => void
  /** The media server refused the token; refresh it before the next attempt. */
  onUnauthorized?: () => Promise<void>
}

export interface WhipPublish {
  /** Swaps the outgoing audio or video track, e.g. after choosing another device. */
  replaceTrack: (track: MediaStreamTrack) => Promise<void>
  stop: () => void
}

const MAX_BACKOFF_MS = 30_000
const ICE_GATHERING_TIMEOUT_MS = 2000

/**
 * Publishes a camera/microphone stream to the media server over WHIP. Video
 * prefers H264 so HLS viewers can play it; a dropped connection is retried
 * with exponential backoff (1s, 2s, 4s … 30s).
 */
export function startWhipPublish(
  stream: MediaStream,
  whipUrl: string,
  getToken: () => string | null,
  callbacks: PublishCallbacks,
): WhipPublish {
  let stopped = false
  let attempts = 0
  let everConnected = false
  let pc: RTCPeerConnection | null = null
  let transceivers: RTCRtpTransceiver[] = []
  let sessionUrl: string | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  const tracks = new Map(stream.getTracks().map((t) => [t.kind, t]))

  const report = (state: PublishState) => {
    if (!stopped) callbacks.onState(state)
  }

  const teardown = () => {
    if (pc) {
      pc.onconnectionstatechange = null
      pc.close()
      pc = null
    }
    if (sessionUrl) {
      void fetch(sessionUrl, { method: 'DELETE', headers: authHeaders(getToken()) }).catch(() => {})
      sessionUrl = null
    }
  }

  const scheduleRetry = () => {
    teardown()
    report('reconnecting')
    const delay = Math.min(1000 * 2 ** attempts, MAX_BACKOFF_MS)
    attempts++
    retryTimer = setTimeout(() => void connect(), delay)
  }

  const connect = async () => {
    if (stopped) return
    report(everConnected ? 'reconnecting' : 'connecting')
    const peer = new RTCPeerConnection()
    pc = peer
    transceivers = []
    for (const track of tracks.values()) {
      const transceiver = peer.addTransceiver(track, { direction: 'sendonly', streams: [stream] })
      if (track.kind === 'video') preferH264(transceiver)
      transceivers.push(transceiver)
    }

    let response: Response
    try {
      await peer.setLocalDescription(await peer.createOffer())
      await waitForIceGathering(peer)
      response = await fetch(whipUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp', ...authHeaders(getToken()) },
        body: peer.localDescription?.sdp ?? '',
      })
      if (response.status === 401 && (everConnected || !callbacks.onFirstAttemptFailed)) {
        // The access token expired during the broadcast: refresh, then retry.
        await callbacks.onUnauthorized?.().catch(() => {})
        if (!stopped && pc === peer) scheduleRetry()
        return
      }
      if (!response.ok) throw new Error(`WHIP ${response.status}`)
      const location = response.headers.get('Location')
      sessionUrl = location ? new URL(location, whipUrl).toString() : null
      await peer.setRemoteDescription({ type: 'answer', sdp: await response.text() })
    } catch {
      if (stopped || pc !== peer) return
      if (!everConnected && attempts === 0 && callbacks.onFirstAttemptFailed) {
        teardown()
        report('failed')
        callbacks.onFirstAttemptFailed?.()
        return
      }
      scheduleRetry()
      return
    }

    peer.onconnectionstatechange = () => {
      if (stopped || pc !== peer) return
      if (peer.connectionState === 'connected') {
        everConnected = true
        attempts = 0
        report('live')
      } else if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
        scheduleRetry()
      }
    }
  }

  void connect()

  return {
    replaceTrack: async (track) => {
      tracks.set(track.kind, track)
      const transceiver = transceivers.find((t) => t.sender.track?.kind === track.kind)
      await transceiver?.sender.replaceTrack(track)
    },
    stop: () => {
      stopped = true
      if (retryTimer) clearTimeout(retryTimer)
      teardown()
    },
  }
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function preferH264(transceiver: RTCRtpTransceiver) {
  const capabilities = typeof RTCRtpSender !== 'undefined' ? RTCRtpSender.getCapabilities?.('video') : null
  if (!capabilities || typeof transceiver.setCodecPreferences !== 'function') return
  const h264 = capabilities.codecs.filter((c) => c.mimeType.toLowerCase() === 'video/h264')
  if (h264.length === 0) return
  const others = capabilities.codecs.filter((c) => c.mimeType.toLowerCase() !== 'video/h264')
  transceiver.setCodecPreferences([...h264, ...others])
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
