import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ReactionBar } from './ReactionBar'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { postsApi } from '@/api/posts'
import type { ReactionSummary } from '@/api/posts'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/context/ToastContext', () => ({
  useToast: vi.fn(),
}))

vi.mock('@/api/posts', () => ({
  postsApi: {
    setPostReaction: vi.fn(),
  },
}))

describe('ReactionBar Component', () => {
  const initialReactions: ReactionSummary = {
    totalCount: 3,
    counts: {
      like: 1,
      love: 2,
      haha: 0,
      wow: 0,
      sad: 0,
      angry: 0,
    },
    viewerReaction: null,
  }

  const mockToastSuccess = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useToast).mockReturnValue({
      success: mockToastSuccess,
      error: vi.fn(),
      info: vi.fn(),
      toast: vi.fn(),
    })
  })

  it('renders reaction counts and comment count properly (Req 2.1)', () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      user: null,
      accessToken: null,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <MemoryRouter>
        <ReactionBar
          postId="post-1"
          reactions={initialReactions}
          commentCount={5}
        />
      </MemoryRouter>
    )

    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('5 bình luận')).toBeInTheDocument()
    expect(screen.getByTestId('reaction-trigger-button')).toBeInTheDocument()
    expect(screen.getByTestId('share-action-button')).toBeInTheDocument()
    expect(screen.getByTestId('comment-action-button')).toBeInTheDocument()
  })

  it('redirects unauthenticated user to /login?redirect=... when attempting to react (Req 3.6)', async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      user: null,
      accessToken: null,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <MemoryRouter>
        <ReactionBar
          postId="post-1"
          reactions={initialReactions}
          commentCount={0}
        />
      </MemoryRouter>
    )

    const reactBtn = screen.getByTestId('reaction-trigger-button')
    fireEvent.click(reactBtn)

    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/login?redirect='))
    expect(postsApi.setPostReaction).not.toHaveBeenCalled()
  })

  it('allows authenticated user to choose from 6 emotion reactions (Req 3.1, 3.2)', async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { id: 'u-1', email: 'test@example.com', role: 'customer' } as any,
      accessToken: 'token',
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    const updatedSummary: ReactionSummary = {
      totalCount: 4,
      counts: { like: 1, love: 3, haha: 0, wow: 0, sad: 0, angry: 0 },
      viewerReaction: 'love',
    }
    vi.mocked(postsApi.setPostReaction).mockResolvedValue(updatedSummary)

    const onReactionChange = vi.fn()

    render(
      <MemoryRouter>
        <ReactionBar
          postId="post-1"
          reactions={initialReactions}
          commentCount={0}
          onReactionChange={onReactionChange}
        />
      </MemoryRouter>
    )

    // Open emotion picker
    const trigger = screen.getByTestId('reaction-trigger-button')
    fireEvent.mouseEnter(trigger)

    // Check all 6 emotions exist by testid
    expect(screen.getByTestId('reaction-option-like')).toBeInTheDocument()
    expect(screen.getByTestId('reaction-option-love')).toBeInTheDocument()
    expect(screen.getByTestId('reaction-option-haha')).toBeInTheDocument()
    expect(screen.getByTestId('reaction-option-wow')).toBeInTheDocument()
    expect(screen.getByTestId('reaction-option-sad')).toBeInTheDocument()
    expect(screen.getByTestId('reaction-option-angry')).toBeInTheDocument()

    // Select "love"
    const loveOption = screen.getByTestId('reaction-option-love')
    fireEvent.click(loveOption)

    await waitFor(() => {
      expect(postsApi.setPostReaction).toHaveBeenCalledWith('post-1', 'love')
      expect(onReactionChange).toHaveBeenCalledWith(updatedSummary)
    })
  })

  it('unsets reaction when clicking the already active reaction (Req 3.4)', async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { id: 'u-1', email: 'test@example.com', role: 'customer' } as any,
      accessToken: 'token',
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    const activeReactions: ReactionSummary = {
      totalCount: 1,
      counts: { like: 0, love: 1, haha: 0, wow: 0, sad: 0, angry: 0 },
      viewerReaction: 'love',
    }
    const unsetSummary: ReactionSummary = {
      totalCount: 0,
      counts: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
      viewerReaction: null,
    }
    vi.mocked(postsApi.setPostReaction).mockResolvedValue(unsetSummary)

    render(
      <MemoryRouter>
        <ReactionBar
          postId="post-1"
          reactions={activeReactions}
          commentCount={0}
        />
      </MemoryRouter>
    )

    // Clicking the main button when viewerReaction === 'love' should toggle it off (reaction: null)
    const trigger = screen.getByTestId('reaction-trigger-button')
    fireEvent.click(trigger)

    await waitFor(() => {
      expect(postsApi.setPostReaction).toHaveBeenCalledWith('post-1', null)
    })
  })

  it('copies post link to clipboard and shows toast on Share button click (Req 2.5)', async () => {
    const originalClipboard = navigator.clipboard
    const mockWriteText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText: mockWriteText,
      },
    })

    render(
      <MemoryRouter>
        <ReactionBar
          postId="post-123"
          reactions={initialReactions}
          commentCount={0}
        />
      </MemoryRouter>
    )

    const shareBtn = screen.getByTestId('share-action-button')
    fireEvent.click(shareBtn)

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith(expect.stringContaining('/posts/post-123'))
      expect(mockToastSuccess).toHaveBeenCalledWith('Đã sao chép liên kết bài viết')
    })

    Object.assign(navigator, { clipboard: originalClipboard })
  })

  it('enables keyboard accessibility to open 6-emotion picker, navigate, select emotion, and close with Escape (Req 8.3)', async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { id: 'u-1', email: 'test@example.com', role: 'customer' } as any,
      accessToken: 'token',
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    const updatedSummary: ReactionSummary = {
      totalCount: 4,
      counts: { like: 1, love: 2, haha: 1, wow: 0, sad: 0, angry: 0 },
      viewerReaction: 'haha',
    }
    vi.mocked(postsApi.setPostReaction).mockResolvedValue(updatedSummary)

    const onReactionChange = vi.fn()

    render(
      <MemoryRouter>
        <ReactionBar
          postId="post-1"
          reactions={initialReactions}
          commentCount={0}
          onReactionChange={onReactionChange}
        />
      </MemoryRouter>
    )

    const trigger = screen.getByTestId('reaction-trigger-button')

    // 1. Tabbing/focusing on the trigger button opens the picker
    fireEvent.focus(trigger)
    expect(screen.getByTestId('emotion-picker')).toBeInTheDocument()

    // 2. Pressing Escape closes the picker
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByTestId('emotion-picker')).not.toBeInTheDocument()

    // 3. Pressing ArrowUp on trigger re-opens the picker
    fireEvent.keyDown(trigger, { key: 'ArrowUp' })
    expect(screen.getByTestId('emotion-picker')).toBeInTheDocument()

    // 4. Keyboard Arrow navigation between emotion buttons
    const picker = screen.getByTestId('emotion-picker')
    const likeBtn = screen.getByTestId('reaction-option-like')
    const loveBtn = screen.getByTestId('reaction-option-love')
    likeBtn.focus()
    expect(document.activeElement).toBe(likeBtn)

    fireEvent.keyDown(picker, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(loveBtn)

    // 5. Selecting reaction via click/activation
    const hahaBtn = screen.getByTestId('reaction-option-haha')
    fireEvent.click(hahaBtn)

    await waitFor(() => {
      expect(postsApi.setPostReaction).toHaveBeenCalledWith('post-1', 'haha')
      expect(onReactionChange).toHaveBeenCalledWith(updatedSummary)
      expect(screen.queryByTestId('emotion-picker')).not.toBeInTheDocument()
    })
  })
})
