import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  MessageSquare,
  CornerDownRight,
  Trash2,
  Send,
  ChevronDown,
  ChevronUp,
  X,
  Smile,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import {
  postsApi,
  type PostComment,
  type PostCommentThread,
  type ReactionType,
  type ReactionSummary,
} from '@/api/posts'
import { formatDateTime } from '@/lib/utils'

export interface PostCommentsSectionProps {
  postId: string
  comments: PostCommentThread[]
  highlightedCommentId?: string | null
  expandedThreadIds?: Set<string>
  onToggleExpandThread?: (threadId: string) => void
  onCommentsChange?: (newComments: PostCommentThread[], commentCountDelta?: number) => void
  className?: string
}

interface EmotionDef {
  type: ReactionType
  label: string
  emoji: string
  color: string
}

const EMOTIONS: EmotionDef[] = [
  { type: 'like', label: 'Thích', emoji: '👍', color: 'text-blue-600' },
  { type: 'love', label: 'Yêu thích', emoji: '❤️', color: 'text-rose-600' },
  { type: 'haha', label: 'Haha', emoji: '😆', color: 'text-amber-500' },
  { type: 'wow', label: 'Wow', emoji: '😮', color: 'text-amber-500' },
  { type: 'sad', label: 'Buồn', emoji: '😢', color: 'text-amber-600' },
  { type: 'angry', label: 'Phẫn nộ', emoji: '😡', color: 'text-orange-600' },
]

export function PostCommentsSection({
  postId,
  comments,
  highlightedCommentId,
  expandedThreadIds: controlledExpandedThreadIds,
  onToggleExpandThread,
  onCommentsChange,
  className = '',
}: PostCommentsSectionProps) {
  const { user, isAuthenticated } = useAuth()
  const { success, error } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  // Local comments state to allow responsive updates
  const [localComments, setLocalComments] = useState<PostCommentThread[]>(comments)

  useEffect(() => {
    setLocalComments(comments)
  }, [comments])

  // Internal expanded threads state
  const [internalExpandedIds, setInternalExpandedIds] = useState<Set<string>>(new Set())

  const isControlled = controlledExpandedThreadIds !== undefined

  const isThreadExpanded = (threadId: string) => {
    if (isControlled) {
      return controlledExpandedThreadIds.has(threadId)
    }
    return internalExpandedIds.has(threadId)
  }

  const toggleThread = (threadId: string) => {
    if (isControlled) {
      onToggleExpandThread?.(threadId)
      return
    }
    setInternalExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(threadId)) {
        next.delete(threadId)
      } else {
        next.add(threadId)
      }
      return next
    })
  }

  // Root comment input
  const [rootContent, setRootContent] = useState('')
  const [isSubmittingRoot, setIsSubmittingRoot] = useState(false)

  // Reply form state
  const [replyTarget, setReplyTarget] = useState<{
    commentId: string
    rootThreadId: string
    targetUserName: string
  } | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [isSubmittingReply, setIsSubmittingReply] = useState(false)

  // Active emotion picker dropdown comment id
  const [activePickerCommentId, setActivePickerCommentId] = useState<string | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setActivePickerCommentId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const redirectToLogin = () => {
    const redirectUrl = `${location.pathname}${location.search}`
    navigate(`/login?redirect=${encodeURIComponent(redirectUrl)}`)
  }

  // Handle creating root comment
  const handleCreateRootComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAuthenticated) {
      redirectToLogin()
      return
    }

    const trimmed = rootContent.trim()
    if (!trimmed) {
      error('Nội dung bình luận không được để trống')
      return
    }
    if (trimmed.length > 1000) {
      error('Nội dung bình luận không được vượt quá 1.000 ký tự')
      return
    }

    try {
      setIsSubmittingRoot(true)
      const newComment = await postsApi.createComment(postId, { content: trimmed })
      const newThread: PostCommentThread = {
        ...newComment,
        replies: [],
      }
      const updated = [...localComments, newThread]
      setLocalComments(updated)
      setRootContent('')
      onCommentsChange?.(updated, 1)
      success('Đã gửi bình luận')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không thể gửi bình luận'
      error(message)
    } finally {
      setIsSubmittingRoot(false)
    }
  }

  // Handle creating reply
  const handleCreateReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAuthenticated) {
      redirectToLogin()
      return
    }
    if (!replyTarget) return

    const trimmed = replyContent.trim()
    if (!trimmed) {
      error('Nội dung câu trả lời không được để trống')
      return
    }
    if (trimmed.length > 1000) {
      error('Nội dung câu trả lời không được vượt quá 1.000 ký tự')
      return
    }

    try {
      setIsSubmittingReply(true)
      const newReply = await postsApi.createComment(postId, {
        content: trimmed,
        parentCommentId: replyTarget.commentId,
      })

      // The new reply belongs to rootThreadId
      const updated = localComments.map((thread) => {
        if (thread.id === replyTarget.rootThreadId) {
          return {
            ...thread,
            replies: [...thread.replies, newReply],
          }
        }
        return thread
      })

      setLocalComments(updated)
      setReplyContent('')
      setReplyTarget(null)
      // Ensure thread is expanded so new reply is visible
      if (!isThreadExpanded(replyTarget.rootThreadId)) {
        toggleThread(replyTarget.rootThreadId)
      }
      onCommentsChange?.(updated, 1)
      success('Đã gửi câu trả lời')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không thể gửi câu trả lời'
      error(message)
    } finally {
      setIsSubmittingReply(false)
    }
  }

  // Handle deleting comment
  const handleDeleteComment = async (commentId: string, isRoot: boolean) => {
    try {
      await postsApi.deleteComment(postId, commentId)
      let countDelta = -1
      let updated: PostCommentThread[] = []

      if (isRoot) {
        const deletedThread = localComments.find((t) => t.id === commentId)
        const repliesCount = deletedThread ? deletedThread.replies.length : 0
        countDelta = -(1 + repliesCount)
        updated = localComments.filter((t) => t.id !== commentId)
      } else {
        countDelta = -1
        updated = localComments.map((thread) => ({
          ...thread,
          replies: thread.replies.filter((r) => r.id !== commentId),
        }))
      }

      setLocalComments(updated)
      onCommentsChange?.(updated, countDelta)
      success('Đã xóa bình luận')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không thể xóa bình luận'
      error(message)
    }
  }

  // Handle reaction on comment or reply
  const handleReactionClick = async (
    targetComment: PostComment,
    reaction: ReactionType
  ) => {
    if (!isAuthenticated) {
      redirectToLogin()
      return
    }

    setActivePickerCommentId(null)

    const isCurrent = targetComment.reactions.viewerReaction === reaction
    const nextReaction: ReactionType | null = isCurrent ? null : reaction

    // Optimistic reaction summary
    const prevReaction = targetComment.reactions.viewerReaction
    const newCounts = { ...targetComment.reactions.counts }
    let newTotal = targetComment.reactions.totalCount

    if (prevReaction) {
      newCounts[prevReaction] = Math.max(0, (newCounts[prevReaction] || 1) - 1)
      newTotal = Math.max(0, newTotal - 1)
    }
    if (nextReaction) {
      newCounts[nextReaction] = (newCounts[nextReaction] || 0) + 1
      newTotal += 1
    }

    const optimisticSummary: ReactionSummary = {
      totalCount: newTotal,
      counts: newCounts,
      viewerReaction: nextReaction,
    }

    // Update in localComments (optimistic)
    const updated = localComments.map((thread) => {
      if (thread.id === targetComment.id) {
        return { ...thread, reactions: optimisticSummary }
      }
      return {
        ...thread,
        replies: thread.replies.map((reply) =>
          reply.id === targetComment.id ? { ...reply, reactions: optimisticSummary } : reply
        ),
      }
    })
    setLocalComments(updated)
    onCommentsChange?.(updated, 0)

    try {
      const serverReactions = await postsApi.setCommentReaction(targetComment.id, nextReaction)
      const confirmed = localComments.map((thread) => {
        if (thread.id === targetComment.id) {
          return { ...thread, reactions: serverReactions }
        }
        return {
          ...thread,
          replies: thread.replies.map((reply) =>
            reply.id === targetComment.id ? { ...reply, reactions: serverReactions } : reply
          ),
        }
      })
      setLocalComments(confirmed)
      onCommentsChange?.(confirmed, 0)
    } catch (err: unknown) {
      setLocalComments(localComments)
      onCommentsChange?.(localComments, 0)
      const message = err instanceof Error ? err.message : 'Không thể bày tỏ cảm xúc'
      error(message)
    }
  }

  const renderReactionPicker = (targetComment: PostComment) => {
    return (
      <div
        ref={pickerRef}
        data-testid={`comment-reaction-picker-${targetComment.id}`}
        className="absolute bottom-full left-0 mb-1.5 z-30 flex items-center gap-1 rounded-full border border-zinc-200/90 bg-white/95 px-2 py-1 shadow-md backdrop-blur-xs animate-in fade-in zoom-in-95 duration-150"
      >
        {EMOTIONS.map((emotion) => (
          <button
            key={emotion.type}
            type="button"
            data-testid={`comment-reaction-btn-${targetComment.id}-${emotion.type}`}
            onClick={() => handleReactionClick(targetComment, emotion.type)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-base transition-transform hover:scale-125 focus:outline-none"
            title={emotion.label}
            aria-label={emotion.label}
          >
            {emotion.emoji}
          </button>
        ))}
      </div>
    )
  }

  const renderCommentItem = (
    comment: PostComment,
    rootThreadId: string,
    isRoot: boolean
  ) => {
    const isHighlighted = highlightedCommentId === comment.id
    const activeEmotion = EMOTIONS.find((e) => e.type === comment.reactions.viewerReaction)
    const canDelete =
      Boolean(user) &&
      (user?.id === comment.authorId || user?.role === 'admin')
    const initial = (comment.authorName || 'K').charAt(0).toUpperCase()
    const pickerOpen = activePickerCommentId === comment.id

    return (
      <div
        key={comment.id}
        id={`comment-${comment.id}`}
        tabIndex={-1}
        className={`group relative rounded-xl p-3 text-sm transition-all focus:outline-none ${
          isHighlighted
            ? 'ring-2 ring-emerald-500 bg-emerald-50/40'
            : 'bg-zinc-50/70 hover:bg-zinc-50 border border-zinc-100'
        }`}
      >
        <div className="flex items-start gap-3">
          {/* Avatar / initial */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 font-mono text-xs font-bold text-white select-none">
            {initial}
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            {/* Header: Name, Badge, Time */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-zinc-950">
                {comment.authorName || 'Khách hàng'}
              </span>

              {comment.authorRole === 'admin' && (
                <Badge
                  variant="outline"
                  className="border-emerald-200 bg-emerald-50 px-1.5 py-0 text-[10px] font-semibold text-emerald-700"
                >
                  Quản trị viên
                </Badge>
              )}

              <span className="text-xs text-zinc-400">
                {formatDateTime(comment.createdAt)}
              </span>
            </div>

            {/* Comment Text Content */}
            <div className="text-zinc-800 leading-relaxed whitespace-pre-line break-words">
              {!isRoot && comment.replyToUserName && (
                <span className="font-semibold text-emerald-700 mr-1 select-none">
                  @{comment.replyToUserName}
                </span>
              )}
              {comment.content}
            </div>

            {/* Actions: Reaction, Reply, Delete */}
            <div className="flex items-center gap-4 pt-1 text-xs">
              {/* Reaction button */}
              <div className="relative">
                <button
                  type="button"
                  data-testid={`comment-reaction-trigger-${comment.id}`}
                  onClick={() => {
                    if (!isAuthenticated) {
                      redirectToLogin()
                      return
                    }
                    setActivePickerCommentId(pickerOpen ? null : comment.id)
                  }}
                  className={`flex items-center gap-1 font-medium transition-colors cursor-pointer ${
                    activeEmotion ? activeEmotion.color : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  <Smile className="h-3.5 w-3.5" />
                  <span>{activeEmotion ? activeEmotion.label : 'Thích'}</span>
                </button>

                {pickerOpen && renderReactionPicker(comment)}
              </div>

              {/* Reply button */}
              <button
                type="button"
                data-testid={`reply-btn-${comment.id}`}
                onClick={() => {
                  if (!isAuthenticated) {
                    redirectToLogin()
                    return
                  }
                  setReplyTarget({
                    commentId: comment.id,
                    rootThreadId,
                    targetUserName: comment.authorName || 'Người dùng',
                  })
                  if (!isThreadExpanded(rootThreadId)) {
                    toggleThread(rootThreadId)
                  }
                }}
                className="flex items-center gap-1 font-medium text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer"
              >
                <CornerDownRight className="h-3.5 w-3.5" />
                <span>Trả lời</span>
              </button>

              {/* Delete button (owner or admin) */}
              {canDelete && (
                <button
                  type="button"
                  data-testid={`delete-comment-${comment.id}`}
                  onClick={() => handleDeleteComment(comment.id, isRoot)}
                  className="flex items-center gap-1 font-medium text-zinc-400 hover:text-rose-600 transition-colors cursor-pointer ml-auto"
                  title="Xóa bình luận"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Xóa</span>
                </button>
              )}

              {/* Reaction count summary badge */}
              {comment.reactions.totalCount > 0 && (
                <div
                  data-testid={`comment-reactions-summary-${comment.id}`}
                  className="flex items-center gap-1 rounded-full bg-white border border-zinc-200/80 px-2 py-0.5 text-[11px] text-zinc-600 shadow-2xs"
                >
                  {EMOTIONS.filter((e) => (comment.reactions.counts?.[e.type] ?? 0) > 0)
                    .slice(0, 3)
                    .map((e) => (
                      <span key={e.type}>{e.emoji}</span>
                    ))}
                  <span className="font-mono ml-0.5">{comment.reactions.totalCount}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <section className={`space-y-6 pt-4 border-t border-zinc-200/80 ${className}`}>
      {/* Title & Comment Count */}
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-bold text-zinc-950">
          <MessageSquare className="h-4 w-4 text-emerald-700" />
          <span>Bình luận</span>
          <span className="text-xs font-mono font-normal text-zinc-500">
            ({localComments.reduce((acc, t) => acc + 1 + t.replies.length, 0)})
          </span>
        </h3>
      </div>

      {/* Root Comment Form */}
      <form onSubmit={handleCreateRootComment} className="space-y-2">
        <div className="relative">
          <textarea
            value={rootContent}
            onChange={(e) => setRootContent(e.target.value)}
            placeholder="Viết bình luận của bạn..."
            maxLength={1000}
            rows={3}
            className="w-full resize-none rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
          <div className="absolute right-3 bottom-3 flex items-center gap-2 text-xs text-zinc-400">
            <span>{rootContent.length}/1000</span>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            data-testid="submit-root-comment"
            disabled={isSubmittingRoot || !rootContent.trim()}
            size="sm"
            className="rounded-xl bg-zinc-950 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
          >
            <Send className="mr-1.5 h-3.5 w-3.5" />
            <span>Gửi bình luận</span>
          </Button>
        </div>
      </form>

      {/* Comments List */}
      <div className="space-y-4">
        {localComments.length === 0 ? (
          <div className="py-8 text-center text-sm text-zinc-400">
            Chưa có bình luận nào. Hãy là người đầu tiên chia sẻ ý kiến!
          </div>
        ) : (
          localComments.map((thread) => {
            const repliesExpanded = isThreadExpanded(thread.id)
            const hasReplies = thread.replies && thread.replies.length > 0
            const isReplyingToThisThread =
              replyTarget && replyTarget.rootThreadId === thread.id

            return (
              <div key={thread.id} className="space-y-3">
                {/* Level 1 Comment */}
                {renderCommentItem(thread, thread.id, true)}

                {/* Level 2 Replies Toggle & Container */}
                {hasReplies && (
                  <div className="pl-6 sm:pl-10">
                    <button
                      type="button"
                      data-testid={`toggle-replies-${thread.id}`}
                      onClick={() => toggleThread(thread.id)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition-colors cursor-pointer"
                    >
                      {repliesExpanded ? (
                        <>
                          <ChevronUp className="h-3.5 w-3.5" />
                          <span>Thu gọn câu trả lời</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3.5 w-3.5" />
                          <span>Xem {thread.replies.length} câu trả lời</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Expanded Replies */}
                {hasReplies && repliesExpanded && (
                  <div className="pl-6 sm:pl-10 space-y-2 border-l-2 border-zinc-100 ml-4 sm:ml-5">
                    {thread.replies.map((reply) =>
                      renderCommentItem(reply, thread.id, false)
                    )}
                  </div>
                )}

                {/* Inline Reply Form */}
                {isReplyingToThisThread && (
                  <form
                    onSubmit={handleCreateReply}
                    className="pl-6 sm:pl-10 ml-4 sm:ml-5 space-y-2 pt-2"
                  >
                    <div className="flex items-center justify-between text-xs text-zinc-600 bg-zinc-100/80 px-3 py-1.5 rounded-lg">
                      <span>
                        Đang trả lời{' '}
                        <strong className="text-zinc-900">@{replyTarget.targetUserName}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setReplyTarget(null)
                          setReplyContent('')
                        }}
                        className="text-zinc-400 hover:text-zinc-700 cursor-pointer"
                        title="Hủy trả lời"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="relative">
                      <textarea
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        placeholder={`Viết câu trả lời cho @${replyTarget.targetUserName}...`}
                        maxLength={1000}
                        rows={2}
                        className="w-full resize-none rounded-xl border border-zinc-200 bg-white p-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                        autoFocus
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-zinc-400">
                        {replyContent.length}/1000
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setReplyTarget(null)
                            setReplyContent('')
                          }}
                          className="h-8 text-xs text-zinc-600 hover:bg-zinc-100 rounded-lg"
                        >
                          Hủy
                        </Button>
                        <Button
                          type="submit"
                          data-testid={`submit-reply-${thread.id}`}
                          disabled={isSubmittingReply || !replyContent.trim()}
                          size="sm"
                          className="h-8 rounded-lg bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
                        >
                          <Send className="mr-1 h-3 w-3" />
                          <span>Trả lời</span>
                        </Button>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
