import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AdminNewMessagesScrollBadge } from './AdminNewMessagesScrollBadge'

describe('AdminNewMessagesScrollBadge', () => {
  it('does not render when count <= 0', () => {
    render(<AdminNewMessagesScrollBadge count={0} onClick={vi.fn()} />)
    expect(screen.queryByTestId('new-messages-scroll-badge')).not.toBeInTheDocument()
  })

  it('renders badge with count and fires onClick', () => {
    const handleClick = vi.fn()
    render(<AdminNewMessagesScrollBadge count={3} onClick={handleClick} />)

    const badge = screen.getByTestId('new-messages-scroll-badge')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('3 tin nhắn mới')

    fireEvent.click(badge)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})
