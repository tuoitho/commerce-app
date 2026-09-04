import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AdminImageLightbox } from './AdminImageLightbox'

describe('AdminImageLightbox', () => {
  it('does not render when isOpen is false', () => {
    render(<AdminImageLightbox src="test.jpg" isOpen={false} onClose={vi.fn()} />)
    expect(screen.queryByTestId('image-lightbox-modal')).not.toBeInTheDocument()
  })

  it('renders image and handles close on button click and Escape key', () => {
    const onClose = vi.fn()
    render(<AdminImageLightbox src="test.jpg" alt="Ảnh test" isOpen={true} onClose={onClose} />)

    expect(screen.getByTestId('image-lightbox-modal')).toBeInTheDocument()
    const img = screen.getByTestId('lightbox-image')
    expect(img).toHaveAttribute('src', 'test.jpg')
    expect(img).toHaveAttribute('alt', 'Ảnh test')

    // Close button
    fireEvent.click(screen.getByTestId('close-lightbox-btn'))
    expect(onClose).toHaveBeenCalledTimes(1)

    // Escape key
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
