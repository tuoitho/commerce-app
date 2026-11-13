import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startWhipPublish, type PublishState } from './whip'

class FakeSender {
  replaceTrack = vi.fn(async () => {})
  track: MediaStreamTrack
  constructor(track: MediaStreamTrack) {
    this.track = track
  }
}

class FakePeerConnection {
  static instances: FakePeerConnection[] = []
  connectionState = 'new'
  iceGatheringState = 'complete'
  localDescription = { type: 'offer', sdp: 'offer-sdp' }
  onconnectionstatechange: (() => void) | null = null
  transceivers: { sender: FakeSender; setCodecPreferences: ReturnType<typeof vi.fn> }[] = []
  addTransceiver = vi.fn((track: MediaStreamTrack) => {
    const t = { sender: new FakeSender(track), setCodecPreferences: vi.fn() }
    this.transceivers.push(t)
    return t
  })
  createOffer = vi.fn(async () => ({ type: 'offer', sdp: 'offer-sdp' }))
  setLocalDescription = vi.fn(async () => {})
  setRemoteDescription = vi.fn(async () => {})
  addEventListener = vi.fn()
  close = vi.fn()
  constructor() {
    FakePeerConnection.instances.push(this)
  }
  connect(state: string) {
    this.connectionState = state
    this.onconnectionstatechange?.()
  }
}

function track(kind: 'audio' | 'video'): MediaStreamTrack {
  return { kind, enabled: true } as MediaStreamTrack
}

function stream(): MediaStream {
  const tracks = [track('video'), track('audio')]
  return { getTracks: () => tracks } as unknown as MediaStream
}

describe('startWhipPublish', () => {
  let states: PublishState[]

  beforeEach(() => {
    vi.useFakeTimers()
    states = []
    FakePeerConnection.instances = []
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection)
    vi.stubGlobal('RTCRtpSender', {
      getCapabilities: (kind: string) =>
        kind === 'video'
          ? { codecs: [{ mimeType: 'video/VP8' }, { mimeType: 'video/H264' }, { mimeType: 'video/rtx' }] }
          : { codecs: [{ mimeType: 'audio/opus' }] },
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('publishes every track with the bearer token and prefers H264', async () => {
    const fetchMock = vi.fn(async () => new Response('answer', { status: 201, headers: { Location: '/live/1/whip/s' } }))
    vi.stubGlobal('fetch', fetchMock)

    const publish = startWhipPublish(stream(), 'http://media/live/1/whip', () => 'tok', { onState: (s) => states.push(s) })
    await vi.advanceTimersByTimeAsync(10)

    expect(fetchMock).toHaveBeenCalledWith('http://media/live/1/whip', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer tok', 'Content-Type': 'application/sdp' }),
    }))
    const pc = FakePeerConnection.instances[0]
    expect(pc.addTransceiver).toHaveBeenCalledTimes(2)
    const videoPrefs = pc.transceivers[0].setCodecPreferences.mock.calls[0][0] as { mimeType: string }[]
    expect(videoPrefs[0].mimeType).toBe('video/H264')

    pc.connect('connected')
    expect(states.at(-1)).toBe('live')
    publish.stop()
    expect(pc.close).toHaveBeenCalled()
  })

  it('reports a failed first attempt so the caller can end the session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    const onFirstAttemptFailed = vi.fn()

    startWhipPublish(stream(), 'http://media/whip', () => 'tok', { onState: (s) => states.push(s), onFirstAttemptFailed })
    await vi.advanceTimersByTimeAsync(10)

    expect(onFirstAttemptFailed).toHaveBeenCalled()
    expect(states.at(-1)).toBe('failed')
  })

  it('retries instead of failing when resuming without a cancel-on-failure handler', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValue(new Response('answer', { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    const publish = startWhipPublish(stream(), 'http://media/whip', () => 'tok', { onState: (s) => states.push(s) })
    await vi.advanceTimersByTimeAsync(10)
    expect(states).not.toContain('failed')
    expect(states.at(-1)).toBe('reconnecting')
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    publish.stop()
  })

  it('refreshes an expired token on 401 and publishes with the new one', async () => {
    let token = 'expired'
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) =>
      (init.headers as Record<string, string>).Authorization === 'Bearer fresh'
        ? new Response('answer', { status: 201 })
        : new Response('', { status: 401 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const onUnauthorized = vi.fn(async () => {
      token = 'fresh'
    })

    const publish = startWhipPublish(stream(), 'http://media/whip', () => token, { onState: (s) => states.push(s), onUnauthorized })
    await vi.advanceTimersByTimeAsync(10)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    FakePeerConnection.instances.at(-1)?.connect('connected')
    expect(states.at(-1)).toBe('live')
    publish.stop()
  })

  it('reconnects with growing backoff after the connection drops', async () => {
    const fetchMock = vi.fn(async () => new Response('answer', { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const publish = startWhipPublish(stream(), 'http://media/whip', () => 'tok', { onState: (s) => states.push(s) })
    await vi.advanceTimersByTimeAsync(10)
    FakePeerConnection.instances[0].connect('connected')

    FakePeerConnection.instances[0].connect('failed')
    expect(states.at(-1)).toBe('reconnecting')
    await vi.advanceTimersByTimeAsync(999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    FakePeerConnection.instances[1].connect('failed')
    await vi.advanceTimersByTimeAsync(1999)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    publish.stop()
  })

  it('swaps a track on device change without renegotiating', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('answer', { status: 201 })))
    const publish = startWhipPublish(stream(), 'http://media/whip', () => 'tok', { onState: () => {} })
    await vi.advanceTimersByTimeAsync(10)

    const newCamera = track('video')
    await publish.replaceTrack(newCamera)
    expect(FakePeerConnection.instances[0].transceivers[0].sender.replaceTrack).toHaveBeenCalledWith(newCamera)
    expect(FakePeerConnection.instances).toHaveLength(1)
    publish.stop()
  })
})
