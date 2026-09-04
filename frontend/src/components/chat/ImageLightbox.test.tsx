import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImageLightbox } from './ImageLightbox'

describe('ImageLightbox', () => {
  it('does not render when isOpen is false', () => {
    render(<ImageLightbox src="https://example.com/test.jpg" isOpen={false} onClose={vi.fn()} />)
    expect(screen.queryByTestId('image-lightbox-modal')).not.toBeInTheDocument()
  })

  it('renders image and backdrop when isOpen is true', () => {
    const handleClose = vi.fn()
    render(
      <ImageLightbox
        src="https://example.com/test.jpg"
        alt="Ảnh phóng to"
        isOpen={true}
        onClose={handleClose}
      />
    )

    expect(screen.getByTestId('image-lightbox-modal')).toBeInTheDocument()
    const img = screen.getByTestId('lightbox-image') as HTMLImageElement
    expect(img).toBeInTheDocument()
    expect(img.src).toBe('https://example.com/test.jpg')
    expect(img.alt).toBe('Ảnh phóng to')
  })

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn()
    render(
      <ImageLightbox
        src="https://example.com/test.jpg"
        isOpen={true}
        onClose={handleClose}
      />
    )

    fireEvent.click(screen.getByTestId('close-lightbox-btn'))
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape key is pressed', () => {
    const handleClose = vi.fn()
    render(
      <ImageLightbox
        src="https://example.com/test.jpg"
        isOpen={true}
        onClose={handleClose}
      />
    )

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(handleClose).toHaveBeenCalledTimes(1)
  })
})
