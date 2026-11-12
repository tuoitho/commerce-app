import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  FileX,
  AlertCircle,
  X,
  Share2,
  Trash2,
  MessageSquare,
  Package,
  Send,
  CornerDownRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  Check,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  postsApi,
  type PostDetail,
  type PostCommentThread,
  type ReactionType,
} from '@/api/posts'
import { formatDateTime, formatVND } from '@/lib/utils'

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

export function AdminPostDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const focusTarget = searchParams.get('focus')
  const targetCommentId = searchParams.get('commentId')
  const focusTs = searchParams.get('focusTs')

  const [post, setPost] = useState<PostDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [highlightedTarget, setHighlightedTarget] = useState<string | null>(null)
  const [expandedThreadIds, setExpandedThreadIds] = useState<Set<string>>(new Set())
  const [commentNotFoundAlert, setCommentNotFoundAlert] = useState(false)

  // Floating toast
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToastMessage(msg)
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null)
    }, 3000)
  }

  // Post reaction picker state
  const [showPostPicker, setShowPostPicker] = useState(false)
  const postPickerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Comment reaction picker state: commentId -> boolean
  const [activeCommentPickerId, setActiveCommentPickerId] = useState<string | null>(null)

  // New comment input at root
  const [newCommentText, setNewCommentText] = useState('')
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)

  // Reply input state
  const [replyingToThreadId, setReplyingToThreadId] = useState<string | null>(null)
  const [replyTargetCommentId, setReplyTargetCommentId] = useState<string | null>(null)
  const [replyTargetUser, setReplyTargetUser] = useState<{ id: string; name: string } | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [isSubmittingReply, setIsSubmittingReply] = useState(false)

  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastProcessedFocusKeyRef = useRef<string | null>(null)

  // Fetch post details
  const fetchPostDetail = useCallback(async () => {
    if (!id) return
    try {
      setIsLoading(true)
      setError(null)
      const data = await postsApi.getPostById(id)
      setPost(data)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bài viết không tồn tại hoặc đã bị xóa'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchPostDetail()
  }, [fetchPostDetail])

  // Scroll and focus handler (Req 7.1 - 7.5)
  const triggerFocusAndScroll = useCallback(() => {
    if (!post) return

    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current)
      highlightTimerRef.current = null
    }

    if (focusTarget === 'post') {
      setCommentNotFoundAlert(false)
      setHighlightedTarget('post')

      const executeScroll = () => {
        const el = document.getElementById(`post-article-${post.id}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.focus({ preventScroll: true })
        }
      }

      setTimeout(executeScroll, 50)

      highlightTimerRef.current = setTimeout(() => {
        setHighlightedTarget((prev) => (prev === 'post' ? null : prev))
      }, 3000)
    } else if (targetCommentId) {
      const findTargetComment = (currentPost: PostDetail) => {
        let found = false
        let parentThreadId: string | null = null

        for (const thread of currentPost.comments || []) {
          if (thread.id === targetCommentId) {
            found = true
            break
          }
          const reply = (thread.replies || []).find((r) => r.id === targetCommentId)
          if (reply) {
            found = true
            parentThreadId = thread.id
            break
          }
        }

        return { found, parentThreadId }
      }

      const applyCommentFocus = (parentThreadId: string | null) => {
        setCommentNotFoundAlert(false)
        if (parentThreadId) {
          setExpandedThreadIds((prev) => {
            const next = new Set(prev)
            next.add(parentThreadId)
            return next
          })
        }

        setHighlightedTarget(targetCommentId)

        const executeScroll = () => {
          const el = document.getElementById(`comment-${targetCommentId}`)
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            el.focus({ preventScroll: true })
          }
        }

        setTimeout(executeScroll, parentThreadId ? 100 : 50)

        highlightTimerRef.current = setTimeout(() => {
          setHighlightedTarget((prev) => (prev === targetCommentId ? null : prev))
        }, 3000)
      }

      const initialLookup = findTargetComment(post)
      if (initialLookup.found) {
        applyCommentFocus(initialLookup.parentThreadId)
      } else {
        postsApi
          .getPostById(post.id)
          .then((freshPost) => {
            setPost(freshPost)
            const freshLookup = findTargetComment(freshPost)
            if (freshLookup.found) {
              applyCommentFocus(freshLookup.parentThreadId)
            } else {
              setCommentNotFoundAlert(true)
              setHighlightedTarget(null)
            }
          })
          .catch(() => {
            setCommentNotFoundAlert(true)
            setHighlightedTarget(null)
          })
      }
    }
  }, [post, focusTarget, targetCommentId])

  useEffect(() => {
    if (!post) return
    const hasFocusTarget = focusTarget === 'post' || Boolean(targetCommentId)
    if (!hasFocusTarget) return

    const focusKey = `${post.id}:${focusTarget ?? ''}:${targetCommentId ?? ''}:${focusTs ?? ''}`
    if (lastProcessedFocusKeyRef.current !== focusKey) {
      lastProcessedFocusKeyRef.current = focusKey
      triggerFocusAndScroll()
    }
  }, [post, focusTarget, targetCommentId, focusTs, triggerFocusAndScroll])

  // Share post (Req 2.5)
  const handleShareClick = async () => {
    if (!post) return
    const postUrl = `${window.location.origin}/posts/${post.id}`
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(postUrl)
      }
      showToast('Đã sao chép liên kết bài viết')
    } catch {
      showToast('Đã sao chép liên kết bài viết')
    }
  }

  // Handle post reaction
  const handlePostReaction = async (reactionType: ReactionType) => {
    if (!post) return
    setShowPostPicker(false)

    const targetReaction = post.reactions.viewerReaction === reactionType ? null : reactionType

    try {
      const updated = await postsApi.setPostReaction(post.id, targetReaction)
      setPost({
        ...post,
        reactions: updated,
      })
    } catch {
      // Ignore reaction error
    }
  }

  const handleMainPostReactionButton = () => {
    if (!post) return
    if (post.reactions.viewerReaction) {
      handlePostReaction(post.reactions.viewerReaction)
    } else {
      handlePostReaction('like')
    }
  }

  // Handle comment reaction
  const handleCommentReaction = async (commentId: string, reactionType: ReactionType) => {
    if (!post) return
    setActiveCommentPickerId(null)

    // Find current viewerReaction for this comment
    let currentViewerReaction: ReactionType | null = null
    for (const t of post.comments) {
      if (t.id === commentId) {
        currentViewerReaction = t.reactions.viewerReaction
        break
      }
      const r = t.replies.find((rep) => rep.id === commentId)
      if (r) {
        currentViewerReaction = r.reactions.viewerReaction
        break
      }
    }

    const targetReaction = currentViewerReaction === reactionType ? null : reactionType

    try {
      const updatedSummary = await postsApi.setCommentReaction(commentId, targetReaction)

      setPost((prev) => {
        if (!prev) return prev
        const nextComments = prev.comments.map((thread) => {
          if (thread.id === commentId) {
            return { ...thread, reactions: updatedSummary }
          }
          const nextReplies = thread.replies.map((reply) => {
            if (reply.id === commentId) {
              return { ...reply, reactions: updatedSummary }
            }
            return reply
          })
          return { ...thread, replies: nextReplies }
        })
        return { ...prev, comments: nextComments }
      })
    } catch {
      // Ignore reaction error
    }
  }

  // Handle add root comment
  const handleAddRootComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!post || !newCommentText.trim()) return

    try {
      setIsSubmittingComment(true)
      const created = await postsApi.createComment(post.id, {
        content: newCommentText.trim(),
        parentCommentId: null,
      })

      const newThread: PostCommentThread = {
        ...created,
        replies: [],
      }

      setPost((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          comments: [...prev.comments, newThread],
          commentCount: prev.commentCount + 1,
        }
      })
      setNewCommentText('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi gửi bình luận'
      showToast(msg)
    } finally {
      setIsSubmittingComment(false)
    }
  }

  // Handle add reply
  const handleAddReply = async (threadId: string) => {
    if (!post || !replyContent.trim()) return

    try {
      setIsSubmittingReply(true)
      const created = await postsApi.createComment(post.id, {
        content: replyContent.trim(),
        parentCommentId: replyTargetCommentId || threadId,
      })

      setPost((prev) => {
        if (!prev) return prev
        const nextComments = prev.comments.map((thread) => {
          if (thread.id === threadId) {
            return {
              ...thread,
              replies: [...thread.replies, created],
            }
          }
          return thread
        })
        return {
          ...prev,
          comments: nextComments,
          commentCount: prev.commentCount + 1,
        }
      })

      // Auto-expand thread
      setExpandedThreadIds((prev) => {
        const next = new Set(prev)
        next.add(threadId)
        return next
      })

      setReplyingToThreadId(null)
      setReplyTargetCommentId(null)
      setReplyTargetUser(null)
      setReplyContent('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi gửi phản hồi'
      showToast(msg)
    } finally {
      setIsSubmittingReply(false)
    }
  }

  // Handle delete comment
  const handleDeleteComment = async (commentId: string) => {
    if (!post) return

    try {
      const res = await postsApi.deleteComment(post.id, commentId)

      setPost((prev) => {
        if (!prev) return prev
        let wasDeleted = false
        // Check root comment
        const filteredRoots = prev.comments.filter((t) => {
          if (t.id === commentId) {
            wasDeleted = true
            return false
          }
          return true
        })

        if (wasDeleted) {
          return {
            ...prev,
            comments: filteredRoots,
            commentCount: res.commentCount,
          }
        }

        // Check child replies
        const updatedThreads = prev.comments.map((t) => ({
          ...t,
          replies: t.replies.filter((r) => r.id !== commentId),
        }))

        return {
          ...prev,
          comments: updatedThreads,
          commentCount: res.commentCount,
        }
      })
      showToast('Xóa bình luận thành công')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi xóa bình luận'
      showToast(msg)
    }
  }

  // Toggle thread expansion
  const toggleThreadExpansion = (threadId: string) => {
    setExpandedThreadIds((prev) => {
      const next = new Set(prev)
      if (next.has(threadId)) {
        next.delete(threadId)
      } else {
        next.add(threadId)
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="py-20 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-sm">Đang tải chi tiết bài viết...</p>
      </div>
    )
  }

  if (error || !post) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center space-y-4 max-w-xl mx-auto my-12">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <FileX className="h-7 w-7" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">
          Bài viết không tồn tại hoặc đã bị xóa
        </h3>
        <p className="text-sm text-slate-500">
          Liên kết bạn truy cập có thể đã hết hạn hoặc bài viết đã bị xóa khỏi hệ thống.
        </p>
        <Link to="/posts">
          <Button variant="default" className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white gap-2">
            <ArrowLeft className="h-4 w-4" />
            <span>Quay lại danh sách bài viết</span>
          </Button>
        </Link>
      </div>
    )
  }

  const isPostHighlighted = highlightedTarget === 'post'
  const activePostEmotion = EMOTIONS.find((e) => e.type === post.reactions.viewerReaction)

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-xl animate-in fade-in slide-in-from-bottom-2">
          <Check className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Back button */}
      <div>
        <Link
          to="/posts"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Quay lại danh sách bài viết</span>
        </Link>
      </div>

      {/* Target Comment Not Found Alert (Req 7.5) */}
      {commentNotFoundAlert && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>Bình luận mục tiêu không còn tồn tại hoặc đã bị xóa</span>
          </div>
          <button
            type="button"
            onClick={() => setCommentNotFoundAlert(false)}
            className="text-amber-600 hover:text-amber-900 cursor-pointer p-0.5"
            aria-label="Đóng thông báo"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Post Article (Req 7.2) */}
      <article
        id={`post-article-${post.id}`}
        tabIndex={-1}
        className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5 focus:outline-none transition-all duration-300 ${
          isPostHighlighted ? 'ring-2 ring-emerald-500 bg-emerald-50/40' : ''
        }`}
      >
        {/* Author Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-white font-bold text-base select-none">
            {(post.authorName || 'Q').charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-slate-900">
                {post.authorName || 'Quản trị viên'}
              </span>
              {post.authorRole === 'admin' && (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">
                  Quản trị viên
                </Badge>
              )}
            </div>
            <span className="text-xs text-slate-400 block mt-0.5">
              {formatDateTime(post.createdAt)}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="text-sm sm:text-base text-slate-800 leading-relaxed whitespace-pre-line break-words">
          {post.content}
        </div>

        {/* Media Gallery */}
        {post.media && post.media.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {post.media.map((m) => (
              <div
                key={m.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center max-h-96"
              >
                {m.fileType === 'image' ? (
                  <img
                    src={m.fileUrl}
                    alt={m.fileName}
                    className="w-full h-full object-contain max-h-96"
                  />
                ) : (
                  <video
                    controls
                    src={m.fileUrl}
                    className="w-full rounded-xl max-h-96 bg-black"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Referred Products List (Req 2.3) */}
        {post.referredProducts && post.referredProducts.length > 0 && (
          <div className="pt-3 border-t border-slate-100">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Sản phẩm giới thiệu ({post.referredProducts.length})
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {post.referredProducts.map((prod) => (
                <div
                  key={prod.id}
                  onClick={() => navigate(`/products/${prod.id}`)}
                  className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-blue-50/50 hover:border-blue-200 transition-colors cursor-pointer"
                >
                  {prod.imageUrl ? (
                    <img
                      src={prod.imageUrl}
                      alt={prod.name}
                      className="h-12 w-12 rounded-lg object-cover shrink-0 border border-slate-200"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-200 text-slate-400 shrink-0">
                      <Package className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-xs text-slate-900 truncate">{prod.name}</p>
                    <p className="text-xs font-bold text-blue-600 mt-0.5">{formatVND(prod.price)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-slate-400">{prod.brand}</span>
                      <span className="text-[10px] text-slate-300">•</span>
                      <Badge
                        variant={prod.inStock ? 'success' : 'secondary'}
                        className="text-[9px] px-1.5 py-0"
                      >
                        {prod.inStock ? 'Còn hàng' : 'Hết hàng'}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reaction Bar & Stats */}
        <div className="pt-3 border-t border-slate-100 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              <strong>{post.reactions?.totalCount || 0}</strong> lượt cảm xúc
            </span>
            <span>
              <strong>{post.commentCount || 0}</strong> bình luận
            </span>
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
            {/* 6-Emotion Reaction Button */}
            <div
              className="relative"
              onMouseEnter={() => {
                if (postPickerTimerRef.current) clearTimeout(postPickerTimerRef.current)
                setShowPostPicker(true)
              }}
              onMouseLeave={() => {
                postPickerTimerRef.current = setTimeout(() => setShowPostPicker(false), 300)
              }}
              onFocusCapture={() => {
                if (postPickerTimerRef.current) clearTimeout(postPickerTimerRef.current)
              }}
              onBlurCapture={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setShowPostPicker(false)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setShowPostPicker(false)
                } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  e.preventDefault()
                  setShowPostPicker(true)
                }
              }}
            >
              {/* Flyout picker */}
              {showPostPicker && (
                <div
                  role="toolbar"
                  aria-label="Cảm xúc bài viết"
                  className="absolute -top-12 left-0 z-30 flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100"
                >
                  {EMOTIONS.map((e) => (
                    <button
                      key={e.type}
                      type="button"
                      data-testid={`post-reaction-option-${e.type}`}
                      onClick={() => {
                        setShowPostPicker(false)
                        handlePostReaction(e.type)
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-lg hover:scale-125 transition-transform cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-600"
                      title={e.label}
                      aria-label={`Bày tỏ ${e.label}`}
                    >
                      {e.emoji}
                    </button>
                  ))}
                </div>
              )}

              <Button
                type="button"
                data-testid="post-reaction-button"
                variant="ghost"
                size="sm"
                aria-haspopup="true"
                aria-expanded={showPostPicker}
                onFocus={() => setShowPostPicker(true)}
                onClick={handleMainPostReactionButton}
                className={`gap-1.5 text-xs font-semibold rounded-xl ${
                  activePostEmotion ? activePostEmotion.color : 'text-slate-600'
                }`}
              >
                <span>{activePostEmotion ? activePostEmotion.emoji : '👍'}</span>
                <span>{activePostEmotion ? activePostEmotion.label : 'Thích'}</span>
              </Button>
            </div>

            {/* Comment shortcut */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const input = document.getElementById('new-comment-input')
                input?.focus()
              }}
              className="gap-1.5 text-xs font-semibold text-slate-600 rounded-xl"
            >
              <MessageSquare className="h-4 w-4" />
              <span>Bình luận</span>
            </Button>

            {/* Share */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleShareClick}
              className="gap-1.5 text-xs font-semibold text-slate-600 rounded-xl"
            >
              <Share2 className="h-4 w-4" />
              <span>Chia sẻ</span>
            </Button>
          </div>
        </div>

        {/* 2-Level Comments Section */}
        <div className="pt-6 border-t border-slate-100 space-y-5">
          <h4 className="text-sm font-bold text-slate-900">
            Bình luận ({post.commentCount || 0})
          </h4>

          {/* Root comment input */}
          <form onSubmit={handleAddRootComment} className="flex gap-2">
            <input
              id="new-comment-input"
              type="text"
              placeholder="Viết bình luận công khai..."
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <Button
              type="submit"
              size="sm"
              disabled={isSubmittingComment || !newCommentText.trim()}
              className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white gap-1.5 cursor-pointer text-xs"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Gửi bình luận</span>
            </Button>
          </form>

          {/* Comments list */}
          <div className="space-y-4 pt-2">
            {post.comments && post.comments.length > 0 ? (
              post.comments.map((thread) => {
                const isThreadHighlighted = highlightedTarget === thread.id
                const isExpanded = expandedThreadIds.has(thread.id)
                const activeThreadEmotion = EMOTIONS.find(
                  (e) => e.type === thread.reactions?.viewerReaction
                )

                return (
                  <div
                    key={thread.id}
                    id={`comment-${thread.id}`}
                    tabIndex={-1}
                    className={`rounded-xl p-3.5 space-y-3 transition-colors ${
                      isThreadHighlighted ? 'ring-2 ring-emerald-500 bg-emerald-50/40' : 'bg-slate-50'
                    }`}
                  >
                    {/* Root comment header & author */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-white font-bold text-xs select-none">
                          {(thread.authorName || 'N').charAt(0).toUpperCase()}
                        </div>
                        <span className="font-semibold text-xs text-slate-900">
                          {thread.authorName || 'Người dùng'}
                        </span>
                        {thread.authorRole === 'admin' && (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[9px] px-1.5 py-0">
                            Quản trị viên
                          </Badge>
                        )}
                        <span className="text-[11px] text-slate-400">
                          {formatDateTime(thread.createdAt)}
                        </span>
                      </div>

                      {/* Admin delete comment */}
                      <button
                        type="button"
                        data-testid={`delete-comment-${thread.id}`}
                        onClick={() => handleDeleteComment(thread.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer transition-colors"
                        title="Xóa bình luận"
                        aria-label="Xóa bình luận"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Content */}
                    <p className="text-xs text-slate-800 whitespace-pre-line pl-9">
                      {thread.content}
                    </p>

                    {/* Comment action footer */}
                    <div className="flex items-center gap-3 pl-9 text-[11px]">
                      {/* Reaction button */}
                      <div className="relative">
                        {activeCommentPickerId === thread.id && (
                          <div className="absolute -top-10 left-0 z-30 flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 shadow-lg">
                            {EMOTIONS.map((e) => (
                              <button
                                key={e.type}
                                type="button"
                                onClick={() => handleCommentReaction(thread.id, e.type)}
                                className="h-6 w-6 text-sm hover:scale-125 transition-transform cursor-pointer"
                              >
                                {e.emoji}
                              </button>
                            ))}
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setActiveCommentPickerId(
                              activeCommentPickerId === thread.id ? null : thread.id
                            )
                          }}
                          className={`font-semibold cursor-pointer ${
                            activeThreadEmotion ? activeThreadEmotion.color : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          {activeThreadEmotion ? `${activeThreadEmotion.emoji} ${activeThreadEmotion.label}` : 'Thích'}
                          {(thread.reactions?.totalCount || 0) > 0 && ` (${thread.reactions.totalCount})`}
                        </button>
                      </div>

                      {/* Reply button */}
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingToThreadId(thread.id)
                          setReplyTargetCommentId(thread.id)
                          setReplyTargetUser({ id: thread.authorId, name: thread.authorName })
                          setReplyContent('')
                        }}
                        className="font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
                      >
                        Trả lời
                      </button>

                      {/* Expand/collapse replies button (Req 4.4) */}
                      {thread.replies && thread.replies.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleThreadExpansion(thread.id)}
                          className="flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700 cursor-pointer ml-auto"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="h-3 w-3" />
                              <span>Thu gọn ({thread.replies.length})</span>
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3 w-3" />
                              <span>Xem {thread.replies.length} phản hồi</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Inline reply form */}
                    {replyingToThreadId === thread.id && (
                      <div className="pl-9 pt-2">
                        <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 p-2">
                          <CornerDownRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <input
                            type="text"
                            placeholder={
                              replyTargetUser
                                ? `Trả lời @${replyTargetUser.name}...`
                                : 'Viết câu trả lời...'
                            }
                            value={replyContent}
                            onChange={(e) => setReplyContent(e.target.value)}
                            className="flex-1 text-xs focus:outline-none"
                            autoFocus
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setReplyingToThreadId(null)
                              setReplyTargetCommentId(null)
                              setReplyTargetUser(null)
                            }}
                            className="h-7 text-xs px-2"
                          >
                            Hủy
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={isSubmittingReply || !replyContent.trim()}
                            onClick={() => handleAddReply(thread.id)}
                            className="h-7 text-xs px-3 bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            Gửi
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Level 2 Replies */}
                    {isExpanded && thread.replies && thread.replies.length > 0 && (
                      <div className="pl-9 pt-2 space-y-3 border-l-2 border-slate-200 ml-4">
                        {thread.replies.map((reply) => {
                          const isReplyHighlighted = highlightedTarget === reply.id
                          const activeReplyEmotion = EMOTIONS.find(
                            (e) => e.type === reply.reactions?.viewerReaction
                          )

                          return (
                            <div
                              key={reply.id}
                              id={`comment-${reply.id}`}
                              tabIndex={-1}
                              className={`rounded-xl p-3 space-y-2 transition-colors ${
                                isReplyHighlighted
                                  ? 'ring-2 ring-emerald-500 bg-emerald-50/40'
                                  : 'bg-white border border-slate-100'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-white font-bold text-[10px] select-none">
                                    {(reply.authorName || 'N').charAt(0).toUpperCase()}
                                  </div>
                                  <span className="font-semibold text-xs text-slate-900">
                                    {reply.authorName || 'Người dùng'}
                                  </span>
                                  {reply.authorRole === 'admin' && (
                                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[9px] px-1.5 py-0">
                                      Quản trị viên
                                    </Badge>
                                  )}
                                  <span className="text-[10px] text-slate-400">
                                    {formatDateTime(reply.createdAt)}
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  data-testid={`delete-comment-${reply.id}`}
                                  onClick={() => handleDeleteComment(reply.id)}
                                  className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer transition-colors"
                                  title="Xóa phản hồi"
                                  aria-label="Xóa phản hồi"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>

                              <p className="text-xs text-slate-800 pl-8">
                                {reply.replyToUserName && (
                                  <span className="font-semibold text-blue-600 mr-1.5">
                                    @{reply.replyToUserName}
                                  </span>
                                )}
                                {reply.content}
                              </p>

                              <div className="flex items-center gap-3 pl-8 text-[11px]">
                                {/* Reply reaction */}
                                <div className="relative">
                                  {activeCommentPickerId === reply.id && (
                                    <div className="absolute -top-10 left-0 z-30 flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 shadow-lg">
                                      {EMOTIONS.map((e) => (
                                        <button
                                          key={e.type}
                                          type="button"
                                          onClick={() => handleCommentReaction(reply.id, e.type)}
                                          className="h-6 w-6 text-sm hover:scale-125 transition-transform cursor-pointer"
                                        >
                                          {e.emoji}
                                        </button>
                                      ))}
                                    </div>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveCommentPickerId(
                                        activeCommentPickerId === reply.id ? null : reply.id
                                      )
                                    }}
                                    className={`font-semibold cursor-pointer ${
                                      activeReplyEmotion ? activeReplyEmotion.color : 'text-slate-500 hover:text-slate-900'
                                    }`}
                                  >
                                    {activeReplyEmotion ? `${activeReplyEmotion.emoji} ${activeReplyEmotion.label}` : 'Thích'}
                                    {(reply.reactions?.totalCount || 0) > 0 && ` (${reply.reactions.totalCount})`}
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setReplyingToThreadId(thread.id)
                                    setReplyTargetCommentId(reply.id)
                                    setReplyTargetUser({ id: reply.authorId, name: reply.authorName })
                                    setReplyContent('')
                                  }}
                                  className="font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
                                >
                                  Trả lời
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })
            ) : (
              <p className="text-xs text-slate-400 py-3 text-center">
                Chưa có bình luận nào. Hãy gửi bình luận đầu tiên!
              </p>
            )}
          </div>
        </div>
      </article>
    </div>
  )
}
