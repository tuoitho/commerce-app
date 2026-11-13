import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startLivePlayback, WHEP_RETRY_MS, type PlaybackState } from './liveMedia'

const hlsInstances: Array<{ url: string; xhrSetup?: (xhr: { setRequestHeader: (k: string, v: string) => void }) => void; destroy: ReturnType<typeof vi.fn> }> = []
let hlsSupported = true

vi.mock('hls.js', () => {
  class FakeHls {
    static isSupported = () => hlsSupported
    static Events = { MANIFEST_PARSED: 'hlsManifestParsed', ERROR: 'hlsError' }
    url = ''
    xhrSetup?: (xhr: { setRequestHeader: (k: string, v: string) => void }) => void
    destroy = vi.fn()
    constructor(config: { xhrSetup?: FakeHls['xhrSetup'] }) {
      this.xhrSetup = config.xhrSetup
      hlsInstances.push(this)
    }
    loadSource(url: string) {
      this.url = url
    }
    attachMedia() {}
    on() {}
  }
  return { default: FakeHls }
})

class FakePeerConnection {
  static instances: FakePeerConnection[] = []
  connectionState = 'new'
  iceGatheringState = 'complete'
  localDescription = { type: 'offer', sdp: 'offer-sdp' }
  ontrack: ((e: { streams: MediaStream[] }) => void) | null = null
  onconnectionstatechange: (() => void) | null = null
  addTransceiver = vi.fn()
  createOffer = vi.fn(async () => ({ type: 'offer', sdp: 'offer-sdp' }))
  setLocalDescription = vi.fn(async () => {})
  setRemoteDescription = vi.fn(async () => {
    this.connectionState = 'connected'
    queueMicrotask(() => this.onconnectionstatechange?.())
  })
  addEventListener = vi.fn()
  close = vi.fn()
  constructor() {
    FakePeerConnection.instances.push(this)
  }
}

function makeVideo() {
  const video = document.createElement('video')
  video.play = vi.fn(async () => {})
  video.canPlayType = vi.fn((): CanPlayTypeResult => '')
  return video
}

const urls = { whepUrl: 'http://media/live/1/whep', hlsUrl: 'http://media/live/1/index.m3u8' }

describe('startLivePlayback', () => {
  let states: PlaybackState[]

  beforeEach(() => {
    vi.useFakeTimers()
    states = []
    hlsInstances.length = 0
    hlsSupported = true
    FakePeerConnection.instances = []
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('plays over WHEP with the bearer token', async () => {
    const fetchMock = vi.fn(async () => new Response('answer-sdp', { status: 201, headers: { Location: '/live/1/whep/session' } }))
    vi.stubGlobal('fetch', fetchMock)

    const player = startLivePlayback(makeVideo(), { ...urls, getToken: () => 'tok' }, { onState: (s) => states.push(s) })
    await vi.runAllTimersAsync()

    expect(fetchMock).toHaveBeenCalledWith(urls.whepUrl, expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer tok', 'Content-Type': 'application/sdp' }),
    }))
    expect(states.at(-1)).toEqual({ status: 'playing', mode: 'webrtc' })
    player.stop()
    expect(FakePeerConnection.instances[0].close).toHaveBeenCalled()
  })

  it('waits for a publisher when WHEP answers 404 and retries', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)

    const player = startLivePlayback(makeVideo(), { ...urls, getToken: () => 'tok' }, { onState: (s) => states.push(s) })
    await vi.advanceTimersByTimeAsync(10)
    expect(states.at(-1)).toEqual({ status: 'waiting', mode: 'webrtc' })
    await vi.advanceTimersByTimeAsync(WHEP_RETRY_MS)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(hlsInstances).toHaveLength(0)
    player.stop()
  })

  it('refreshes an expired token on 401 and retries with the new one', async () => {
    let token = 'expired'
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) =>
      (init.headers as Record<string, string>).Authorization === 'Bearer fresh'
        ? new Response('answer-sdp', { status: 201 })
        : new Response('', { status: 401 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const onUnauthorized = vi.fn(async () => {
      token = 'fresh'
    })

    const player = startLivePlayback(makeVideo(), { ...urls, getToken: () => token }, { onState: (s) => states.push(s), onUnauthorized })
    await vi.advanceTimersByTimeAsync(10)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    expect(states.at(-1)).toEqual({ status: 'waiting', mode: 'webrtc' })

    await vi.advanceTimersByTimeAsync(WHEP_RETRY_MS)
    expect(states.at(-1)).toEqual({ status: 'playing', mode: 'webrtc' })
    expect(hlsInstances).toHaveLength(0)
    player.stop()
  })

  it('falls back to HLS with the token header when WHEP fails otherwise', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))

    const player = startLivePlayback(makeVideo(), { ...urls, getToken: () => 'tok' }, { onState: (s) => states.push(s) })
    await vi.advanceTimersByTimeAsync(10)

    expect(hlsInstances).toHaveLength(1)
    expect(hlsInstances[0].url).toBe(urls.hlsUrl)
    const xhr = { setRequestHeader: vi.fn() }
    hlsInstances[0].xhrSetup?.(xhr)
    expect(xhr.setRequestHeader).toHaveBeenCalledWith('Authorization', 'Bearer tok')
    expect(states.some((s) => s.mode === 'hls')).toBe(true)
    player.stop()
    expect(hlsInstances[0].destroy).toHaveBeenCalled()
  })

  it('uses HLS directly without WebRTC support, and native HLS with a token query on Safari', async () => {
    vi.stubGlobal('RTCPeerConnection', undefined)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    startLivePlayback(makeVideo(), { ...urls, getToken: () => 'tok' }, { onState: (s) => states.push(s) }).stop()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(hlsInstances).toHaveLength(1)

    hlsSupported = false
    const video = makeVideo()
    video.canPlayType = vi.fn((): CanPlayTypeResult => 'maybe')
    const native = startLivePlayback(video, { ...urls, getToken: () => 'a b' }, { onState: (s) => states.push(s) })
    expect(video.src).toBe(`${urls.hlsUrl}?token=a%20b`)
    native.stop()
  })

  it('reports a muted start when autoplay with sound is blocked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('answer-sdp', { status: 201 })))
    const video = makeVideo()
    video.play = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }))
      .mockResolvedValueOnce(undefined)
    const onMutedAutoplay = vi.fn()

    const player = startLivePlayback(video, { ...urls, getToken: () => 'tok' }, { onState: () => {}, onMutedAutoplay })
    await vi.runAllTimersAsync()
    FakePeerConnection.instances[0].ontrack?.({ streams: [{} as MediaStream] })
    await vi.runAllTimersAsync()

    expect(video.muted).toBe(true)
    expect(onMutedAutoplay).toHaveBeenCalled()
    player.stop()
  })
})
