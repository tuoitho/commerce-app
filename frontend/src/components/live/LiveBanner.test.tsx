import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LiveBanner } from './LiveBanner'

describe('LiveBanner', () => {
  it('introduces the live session and links to it', () => {
    render(
      <MemoryRouter>
        <LiveBanner live={{ id: 'live-1', title: 'Flash sale iPhone 16', startedAt: '2026-11-13T03:00:00Z' }} />
      </MemoryRouter>,
    )

    expect(screen.getByText('Flash sale iPhone 16')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Xem ngay/ })).toHaveAttribute('href', '/live/live-1')
  })
})
