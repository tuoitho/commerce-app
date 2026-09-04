import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NewMessagesScrollBadge } from './NewMessagesScrollBadge'

describe('NewMessagesScrollBadge', () => {
  it('does not render when count is 0 or negative', () => {
    const { rerender } = render(<NewMessagesScrollBadge count={0} onClick={vi.fn()} />)
    expect(screen.queryByTestId('new-messages-scroll-badge')).not.toBeInTheDocument()

    rerender(<NewMessagesScrollBadge count={-1} onClick={vi.fn()} />)
    expect(screen.queryByTestId('new-messages-scroll-badge')).not.toBeInTheDocument()
  })

  it('renders count and label when count > 0', () => {
    render(<NewMessagesScrollBadge count={3} onClick={vi.fn()} />)

    const badge = screen.getByTestId('new-messages-scroll-badge')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('3 tin nhắn mới')
  })

  it('triggers onClick when clicked', () => {
    const handleClick = vi.fn()
    render(<NewMessagesScrollBadge count={5} onClick={handleClick} />)

    fireEvent.click(screen.getByTestId('new-messages-scroll-badge'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})
