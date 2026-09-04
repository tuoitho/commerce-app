import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  validateMediaFile,
  PendingMediaPreview,
  MessageAttachments,
  type PendingMedia,
} from './MediaAttachmentPreview'
import type { ChatAttachment } from '@/api/chat'

describe('validateMediaFile', () => {
  it('accepts valid images under 10MB', () => {
    const validJpg = new File(['dummy'], 'photo.jpg', { type: 'image/jpeg' })
    const validPng = new File(['dummy'], 'photo.png', { type: 'image/png' })
    const validWebp = new File(['dummy'], 'photo.webp', { type: 'image/webp' })
    const validGif = new File(['dummy'], 'animation.gif', { type: 'image/gif' })

    expect(validateMediaFile(validJpg)).toEqual({ valid: true, fileType: 'image' })
    expect(validateMediaFile(validPng)).toEqual({ valid: true, fileType: 'image' })
    expect(validateMediaFile(validWebp)).toEqual({ valid: true, fileType: 'image' })
    expect(validateMediaFile(validGif)).toEqual({ valid: true, fileType: 'image' })
  })

  it('rejects images exceeding 10MB', () => {
    const bigFile = new File([''], 'big.jpg', { type: 'image/jpeg' })
    Object.defineProperty(bigFile, 'size', { value: 11 * 1024 * 1024 })

    const result = validateMediaFile(bigFile)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('10MB')
  })

  it('accepts valid videos under 50MB', () => {
    const validMp4 = new File(['dummy'], 'clip.mp4', { type: 'video/mp4' })
    const validWebm = new File(['dummy'], 'clip.webm', { type: 'video/webm' })

    expect(validateMediaFile(validMp4)).toEqual({ valid: true, fileType: 'video' })
    expect(validateMediaFile(validWebm)).toEqual({ valid: true, fileType: 'video' })
  })

  it('rejects videos exceeding 50MB', () => {
    const bigVideo = new File([''], 'big.mp4', { type: 'video/mp4' })
    Object.defineProperty(bigVideo, 'size', { value: 55 * 1024 * 1024 })

    const result = validateMediaFile(bigVideo)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('50MB')
  })

  it('rejects unsupported file MIME types', () => {
    const pdf = new File(['dummy'], 'document.pdf', { type: 'application/pdf' })
    const result = validateMediaFile(pdf)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Chỉ hỗ trợ định dạng ảnh')
  })
})

describe('PendingMediaPreview', () => {
  it('renders nothing when pendingMedia list is empty', () => {
    const { container } = render(<PendingMediaPreview pendingMedia={[]} onRemove={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders pending items with upload spinner and remove button', () => {
    const onRemove = vi.fn()
    const items: PendingMedia[] = [
      {
        tempId: 'temp-1',
        file: new File(['dummy'], 'photo.png', { type: 'image/png' }),
        previewUrl: 'blob:http://localhost/temp-photo',
        fileType: 'image',
        isUploading: true,
      },
      {
        tempId: 'temp-2',
        file: new File(['dummy'], 'clip.mp4', { type: 'video/mp4' }),
        previewUrl: 'blob:http://localhost/temp-video',
        fileType: 'video',
        isUploading: false,
        error: 'Lỗi tải tệp lên',
      },
    ]

    render(<PendingMediaPreview pendingMedia={items} onRemove={onRemove} />)

    expect(screen.getByTestId('pending-media-item-temp-1')).toBeInTheDocument()
    expect(screen.getByTestId('media-uploading-spinner')).toBeInTheDocument()

    expect(screen.getByTestId('pending-media-item-temp-2')).toBeInTheDocument()
    expect(screen.getByText('clip.mp4')).toBeInTheDocument()

    // Test onRemove
    fireEvent.click(screen.getByTestId('remove-pending-media-temp-1'))
    expect(onRemove).toHaveBeenCalledWith('temp-1')
  })
})

describe('MessageAttachments', () => {
  const attachments: ChatAttachment[] = [
    {
      id: 'att-img-1',
      fileType: 'image',
      fileUrl: 'https://example.com/photo.jpg',
      fileName: 'photo.jpg',
      fileSize: 1024,
      mimeType: 'image/jpeg',
    },
    {
      id: 'att-vid-1',
      fileType: 'video',
      fileUrl: 'https://example.com/video.mp4',
      fileName: 'video.mp4',
      fileSize: 20480,
      mimeType: 'video/mp4',
    },
  ]

  it('renders image thumbnail and opens lightbox on click', () => {
    render(<MessageAttachments attachments={attachments} />)

    const imgBtn = screen.getByTestId('message-attachment-image-att-img-1')
    expect(imgBtn).toBeInTheDocument()

    // Lightbox modal not visible initially
    expect(screen.queryByTestId('image-lightbox-modal')).not.toBeInTheDocument()

    // Click image thumbnail
    fireEvent.click(imgBtn)

    // Lightbox modal should now be open
    expect(screen.getByTestId('image-lightbox-modal')).toBeInTheDocument()
    const lightboxImg = screen.getByTestId('lightbox-image') as HTMLImageElement
    expect(lightboxImg.src).toBe('https://example.com/photo.jpg')
  })

  it('authenticates media URLs by appending token query param', () => {
    render(<MessageAttachments attachments={attachments} token="mock-jwt-token" />)

    const img = screen.getByAltText('photo.jpg') as HTMLImageElement
    expect(img.src).toBe('https://example.com/photo.jpg?token=mock-jwt-token')

    const videoSource = screen.getByTestId('message-attachment-video-att-vid-1').querySelector('source')
    expect(videoSource?.src).toBe('https://example.com/video.mp4?token=mock-jwt-token')
  })

  it('renders video element with controls', () => {
    render(<MessageAttachments attachments={attachments} />)

    const videoContainer = screen.getByTestId('message-attachment-video-att-vid-1')
    expect(videoContainer).toBeInTheDocument()

    const video = videoContainer.querySelector('video')
    expect(video).toBeInTheDocument()
    expect(video).toHaveAttribute('controls')
  })
})
