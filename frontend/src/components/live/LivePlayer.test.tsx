import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { LivePlayer } from './LivePlayer'
import { startLivePlayback, type PlaybackCallbacks } from '@/lib/liveMedia'

vi.mock('@/lib/liveMedia', () => ({ startLivePlayback: vi.fn() }))

const media = { whepUrl: 'http://media/whep', hlsUrl: 'http://media/hls' }
let callbacks: PlaybackCallbacks
const stop = vi.fn()

describe('LivePlayer', () => {
  beforeEach(() => {
    stop.mockReset()
    vi.mocked(startLivePlayback).mockImplementation((_video, _source, cb) => {
      callbacks = cb
      return { stop }
    })
  })

  it('starts playback with the token and stops on unmount', () => {
    const { unmount } = render(<LivePlayer media={media} token="tok" signalOnline />)
    expect(startLivePlayback).toHaveBeenCalledWith(expect.any(HTMLVideoElement), { ...media, getToken: expect.any(Function) }, expect.any(Object))
    expect(vi.mocked(startLivePlayback).mock.calls[0][1].getToken()).toBe('tok')
    unmount()
    expect(stop).toHaveBeenCalled()
  })

  it('shows the waiting overlay until the stream plays', () => {
    render(<LivePlayer media={media} token="tok" signalOnline={false} />)
    expect(screen.getByText('Đang chờ tín hiệu')).toBeInTheDocument()

    act(() => callbacks.onState({ status: 'playing', mode: 'webrtc' }))
    expect(screen.getByText('Đang chờ tín hiệu')).toBeInTheDocument()
  })

  it('hides the overlay once playing with signal, and offers sound when autoplay was muted', () => {
    render(<LivePlayer media={media} token="tok" signalOnline />)
    expect(screen.getByText('Đang kết nối…')).toBeInTheDocument()

    act(() => {
      callbacks.onState({ status: 'playing', mode: 'hls' })
      callbacks.onMutedAutoplay?.()
    })
    expect(screen.queryByText('Đang kết nối…')).not.toBeInTheDocument()
    const video = screen.getByTestId('live-video') as HTMLVideoElement
    video.muted = true
    video.play = vi.fn(async () => {})
    fireEvent.click(screen.getByRole('button', { name: /Bật âm thanh/ }))
    expect(video.muted).toBe(false)
    expect(screen.queryByRole('button', { name: /Bật âm thanh/ })).not.toBeInTheDocument()
  })
})
