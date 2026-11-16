import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AvatarDisplay } from './AvatarDisplay'

describe('AvatarDisplay', () => {
  it('renders uppercase initial fallback when src is null', () => {
    render(<AvatarDisplay src={null} name="nguyễn minh anh" email="khach@example.com" />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('N')).toBeInTheDocument()
  })

  it('falls back to initial when image fails to load and recovers when src changes', () => {
    const { rerender } = render(
      <AvatarDisplay src="/media/avatars/broken.png" name="Bảo Ngọc" email="ngoc@example.com" />
    )
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', '/media/avatars/broken.png')

    fireEvent.error(img)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()

    rerender(<AvatarDisplay src="/media/avatars/recovered.webp" name="Bảo Ngọc" email="ngoc@example.com" />)
    expect(screen.getByRole('img')).toHaveAttribute('src', '/media/avatars/recovered.webp')
  })
})
