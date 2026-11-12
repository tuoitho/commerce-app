import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { MessageSquare, Share2, ThumbsUp } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { postsApi, type ReactionType, type ReactionSummary } from '@/api/posts'

const EMOTIONS: Array<{
  type: ReactionType
  label: string
  emoji: string
  color: string
}> = [
  { type: 'like', label: 'Thích', emoji: '👍', color: 'text-blue-600' },
  { type: 'love', label: 'Yêu thích', emoji: '❤️', color: 'text-rose-600' },
  { type: 'haha', label: 'Haha', emoji: '😆', color: 'text-amber-500' },
  { type: 'wow', label: 'Wow', emoji: '😮', color: 'text-amber-500' },
  { type: 'sad', label: 'Buồn', emoji: '😢', color: 'text-amber-600' },
  { type: 'angry', label: 'Phẫn nộ', emoji: '😡', color: 'text-orange-600' },
]

export interface ReactionBarProps {
  postId: string
  reactions: ReactionSummary
  commentCount: number
  onReactionChange?: (updated: ReactionSummary) => void
  onCommentClick?: () => void
  className?: string
}

export function ReactionBar({
  postId,
  reactions,
  commentCount,
  onReactionChange,
  onCommentClick,
  className = '',
}: ReactionBarProps) {
  const { isAuthenticated } = useAuth()
  const { success, error } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const [currentReactions, setCurrentReactions] = useState<ReactionSummary>(reactions)
  const [showPicker, setShowPicker] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const pickerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null)
  const emotionButtonsRef = useRef<(HTMLButtonElement | null)[]>([])
  const escapedRef = useRef(false)

  useEffect(() => {
    setCurrentReactions(reactions)
  }, [reactions])

  const handleMouseEnter = () => {
    if (pickerTimeoutRef.current) {
      clearTimeout(pickerTimeoutRef.current)
      pickerTimeoutRef.current = null
    }
    setShowPicker(true)
  }

  const handleMouseLeave = () => {
    pickerTimeoutRef.current = setTimeout(() => {
      setShowPicker(false)
    }, 300)
  }

  const handleFocusCapture = () => {
    if (pickerTimeoutRef.current) {
      clearTimeout(pickerTimeoutRef.current)
      pickerTimeoutRef.current = null
    }
  }

  const handleBlurCapture = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      escapedRef.current = false
      setShowPicker(false)
    }
  }

  const handleTriggerFocus = () => {
    if (escapedRef.current) {
      escapedRef.current = false
      return
    }
    setShowPicker(true)
  }

  const handleContainerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      escapedRef.current = true
      setShowPicker(false)
      triggerButtonRef.current?.focus()
      return
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (document.activeElement === triggerButtonRef.current) {
        e.preventDefault()
        escapedRef.current = false
        setShowPicker(true)
      }
    }
  }

  const handlePickerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      const currentIndex = emotionButtonsRef.current.findIndex((btn) => btn === document.activeElement)
      const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % EMOTIONS.length
      emotionButtonsRef.current[nextIndex]?.focus()
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      const currentIndex = emotionButtonsRef.current.findIndex((btn) => btn === document.activeElement)
      const prevIndex = currentIndex <= 0 ? EMOTIONS.length - 1 : currentIndex - 1
      emotionButtonsRef.current[prevIndex]?.focus()
    }
  }

  const handleReactionClick = async (reactionType: ReactionType) => {
    setShowPicker(false)

    if (!isAuthenticated) {
      const currentUrl = location.pathname.startsWith('/posts/')
        ? location.pathname
        : `/posts/${postId}`
      navigate(`/login?redirect=${encodeURIComponent(currentUrl)}`)
      return
    }

    if (isSubmitting) return

    // If already has this reaction, unset it
    const targetReaction = currentReactions.viewerReaction === reactionType ? null : reactionType

    setIsSubmitting(true)
    try {
      const updated = await postsApi.setPostReaction(postId, targetReaction)
      setCurrentReactions(updated)
      onReactionChange?.(updated)
    } catch {
      // Revert or fallback gracefully
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleMainButtonClick = () => {
    if (!isAuthenticated) {
      const currentUrl = location.pathname.startsWith('/posts/')
        ? location.pathname
        : `/posts/${postId}`
      navigate(`/login?redirect=${encodeURIComponent(currentUrl)}`)
      return
    }

    if (currentReactions.viewerReaction) {
      // Unset reaction
      handleReactionClick(currentReactions.viewerReaction)
    } else {
      // Default to like
      handleReactionClick('like')
    }
  }

  const handleShareClick = async () => {
    const postUrl = `${window.location.origin}/posts/${postId}`
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(postUrl)
      }
      success('Đã sao chép liên kết bài viết')
    } catch {
      error('Không thể sao chép liên kết')
    }
  }

  const handleCommentButton = () => {
    if (onCommentClick) {
      onCommentClick()
    } else {
      navigate(`/posts/${postId}`)
    }
  }

  const activeEmotion = EMOTIONS.find((e) => e.type === currentReactions.viewerReaction)

  // Extract top reacted emojis
  const reactedEmojis = EMOTIONS.filter(
    (e) => (currentReactions.counts?.[e.type] ?? 0) > 0
  ).slice(0, 3)

  return (
    <div className={`space-y-2 border-t border-zinc-200/90 pt-2.5 ${className}`}>
      {/* Telemetry counts row */}
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <div className="flex items-center gap-1.5 min-h-[20px]">
          {currentReactions.totalCount > 0 ? (
            <>
              <div className="flex -space-x-1">
                {reactedEmojis.map((e) => (
                  <span
                    key={e.type}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs shadow-2xs border border-zinc-100"
                    title={e.label}
                  >
                    {e.emoji}
                  </span>
                ))}
              </div>
              <span className="font-semibold text-zinc-700 ml-1">
                {currentReactions.totalCount}
              </span>
            </>
          ) : (
            <span className="text-zinc-400">0 lượt cảm xúc</span>
          )}
        </div>

        <button
          type="button"
          data-testid="post-comment-count-badge"
          onClick={handleCommentButton}
          className="hover:underline hover:text-zinc-800 transition-colors cursor-pointer"
        >
          {commentCount} bình luận
        </button>
      </div>

      {/* Action buttons row */}
      <div className="grid grid-cols-3 gap-1 border-t border-zinc-100 pt-1.5 relative">
        {/* Reaction button with popover */}
        <div
          className="relative"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onFocusCapture={handleFocusCapture}
          onBlurCapture={handleBlurCapture}
          onKeyDown={handleContainerKeyDown}
        >
          {/* Floating Emotion Picker */}
          {showPicker && (
            <div
              data-testid="emotion-picker"
              role="toolbar"
              aria-label="Cảm xúc bài viết"
              onKeyDown={handlePickerKeyDown}
              className="absolute -top-12 left-0 z-30 flex items-center gap-1 rounded-full border border-zinc-200 bg-white p-1.5 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-150"
            >
              {EMOTIONS.map((e, index) => (
                <button
                  key={e.type}
                  ref={(el) => {
                    emotionButtonsRef.current[index] = el
                  }}
                  type="button"
                  data-testid={`reaction-option-${e.type}`}
                  onClick={() => handleReactionClick(e.type)}
                  aria-label={`Bày tỏ ${e.label}`}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-xl transition-transform hover:scale-125 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  title={e.label}
                >
                  {e.emoji}
                </button>
              ))}
            </div>
          )}

          <button
            ref={triggerButtonRef}
            type="button"
            data-testid="reaction-trigger-button"
            aria-haspopup="true"
            aria-expanded={showPicker}
            onFocus={handleTriggerFocus}
            onClick={handleMainButtonClick}
            aria-label={activeEmotion ? `Bày tỏ cảm xúc: ${activeEmotion.label}` : 'Bày tỏ cảm xúc'}
            className={`flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-colors hover:bg-zinc-100 cursor-pointer ${
              activeEmotion ? `${activeEmotion.color} font-bold` : 'text-zinc-600'
            }`}
          >
            {activeEmotion ? (
              <>
                <span className="text-base">{activeEmotion.emoji}</span>
                <span>{activeEmotion.label}</span>
              </>
            ) : (
              <>
                <ThumbsUp className="h-4 w-4" />
                <span>Thích</span>
              </>
            )}
          </button>
        </div>

        {/* Comment Button */}
        <button
          type="button"
          data-testid="comment-action-button"
          onClick={handleCommentButton}
          aria-label="Bình luận bài viết"
          className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors cursor-pointer"
        >
          <MessageSquare className="h-4 w-4" />
          <span>Bình luận</span>
        </button>

        {/* Share Button */}
        <button
          type="button"
          data-testid="share-action-button"
          onClick={handleShareClick}
          aria-label="Chia sẻ bài viết"
          className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors cursor-pointer"
        >
          <Share2 className="h-4 w-4" />
          <span>Chia sẻ</span>
        </button>
      </div>
    </div>
  )
}
