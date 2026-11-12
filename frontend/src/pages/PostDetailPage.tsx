import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { ArrowLeft, FileX, AlertCircle, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  postsApi,
  type PostDetail,
  type PostCommentThread,
  type ReactionSummary,
} from '@/api/posts'
import { PostMediaGallery } from '@/components/posts/PostMediaGallery'
import { ReferredProductCardList } from '@/components/posts/ReferredProductCardList'
import { ReactionBar } from '@/components/posts/ReactionBar'
import { PostCommentsSection } from '@/components/posts/PostCommentsSection'
import { formatDateTime } from '@/lib/utils'

export function PostDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()

  const focusTarget = searchParams.get('focus')
  const targetCommentId = searchParams.get('commentId')
  const focusTs = searchParams.get('focusTs')

  const [post, setPost] = useState<PostDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [highlightedTarget, setHighlightedTarget] = useState<string | null>(null)
  const [expandedThreadIds, setExpandedThreadIds] = useState<Set<string>>(new Set())
  const [commentNotFoundAlert, setCommentNotFoundAlert] = useState(false)

  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastProcessedFocusKeyRef = useRef<string | null>(null)

  // Fetch post detail
  useEffect(() => {
    if (!id) return
    let active = true
    setIsLoading(true)
    setError(null)

    postsApi
      .getPostById(id)
      .then((res) => {
        if (active) {
          setPost(res)
          setIsLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (active) {
          const msg = err instanceof Error ? err.message : 'Bài viết không tồn tại hoặc đã bị xóa'
          setError(msg)
          setIsLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [id])

  // Scroll and focus handler
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

      // Defer to next tick to ensure DOM is ready
      setTimeout(executeScroll, 50)

      highlightTimerRef.current = setTimeout(() => {
        setHighlightedTarget((prev) => (prev === 'post' ? null : prev))
      }, 3000)
    } else if (targetCommentId) {
      const findTargetComment = (currentPost: PostDetail) => {
        let found = false
        let parentThreadId: string | null = null

        for (const thread of currentPost.comments) {
          if (thread.id === targetCommentId) {
            found = true
            break
          }
          const reply = thread.replies.find((r) => r.id === targetCommentId)
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

        // Wait slightly longer if expanding a thread so it can render in DOM
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

  // Re-run scroll & highlight when post loads or focus query params change (Req 7.4)
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

  const handlePostReactionChange = (newReactions: ReactionSummary) => {
    if (post) {
      setPost({
        ...post,
        reactions: newReactions,
      })
    }
  }

  const handleCommentsChange = (
    newComments: PostCommentThread[],
    commentCountDelta?: number
  ) => {
    if (post) {
      const delta = commentCountDelta ?? (newComments.length - post.comments.length)
      setPost({
        ...post,
        comments: newComments,
        commentCount: Math.max(0, post.commentCount + delta),
      })
    }
  }

  const handleToggleExpandThread = (threadId: string) => {
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
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 space-y-6" data-testid="post-detail-loading">
        <Skeleton className="h-6 w-36 rounded-lg" />
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    )
  }

  if (error || !post) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400">
          <FileX className="h-8 w-8" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-zinc-900">
          Bài viết không tồn tại hoặc đã bị xóa
        </h2>
        <p className="mt-2 text-sm text-zinc-500">
          Liên kết bạn truy cập có thể đã hết hạn hoặc bài viết đã được gỡ bỏ bởi Quản trị viên.
        </p>
        <div className="mt-6">
          <Link to="/posts">
            <Button
              variant="default"
              className="rounded-xl bg-zinc-950 hover:bg-emerald-700 text-white transition-colors"
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              <span>Quay lại danh sách bài viết</span>
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const isPostHighlighted = highlightedTarget === 'post'
  const initialLetter = (post.authorName || 'Q').charAt(0).toUpperCase()

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Navigation Breadcrumb */}
      <div>
        <Link
          to="/posts"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-950 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Quay lại bảng tin bài viết</span>
        </Link>
      </div>

      {/* Target Comment Not Found Alert (Req 7.5) */}
      {commentNotFoundAlert && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>Bình luận mục tiêu không còn tồn tại hoặc đã bị xóa.</span>
          </div>
          <button
            type="button"
            onClick={() => setCommentNotFoundAlert(false)}
            className="text-amber-600 hover:text-amber-900 cursor-pointer"
            aria-label="Đóng thông báo"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Post Card Article (Req 7.2) */}
      <article
        id={`post-article-${post.id}`}
        tabIndex={-1}
        className={`rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-xs space-y-5 focus:outline-none transition-all duration-300 ${
          isPostHighlighted ? 'ring-2 ring-emerald-500 bg-emerald-50/40' : ''
        }`}
      >
        {/* Author Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-950 text-white font-mono font-bold text-base select-none">
            {initialLetter}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-zinc-950">
                {post.authorName || 'Quản trị viên'}
              </span>
              {post.authorRole === 'admin' && (
                <Badge
                  variant="outline"
                  className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-semibold px-2 py-0.5"
                >
                  Quản trị viên
                </Badge>
              )}
            </div>
            <span className="text-xs text-zinc-400 block mt-0.5">
              {formatDateTime(post.createdAt)}
            </span>
          </div>
        </div>

        {/* Post Text Content */}
        <div className="text-sm sm:text-base text-zinc-800 leading-relaxed whitespace-pre-line break-words">
          {post.content}
        </div>

        {/* Media Gallery */}
        {post.media && post.media.length > 0 && (
          <PostMediaGallery media={post.media} />
        )}

        {/* Referred Products List */}
        {post.referredProducts && post.referredProducts.length > 0 && (
          <div className="pt-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
              Sản phẩm giới thiệu trong bài viết
            </h4>
            <ReferredProductCardList products={post.referredProducts} />
          </div>
        )}

        {/* Reaction & Action Bar */}
        <ReactionBar
          postId={post.id}
          reactions={post.reactions}
          commentCount={post.commentCount}
          onReactionChange={handlePostReactionChange}
        />

        {/* 2-Level Comments Section */}
        <PostCommentsSection
          postId={post.id}
          comments={post.comments}
          highlightedCommentId={highlightedTarget !== 'post' ? highlightedTarget : null}
          expandedThreadIds={expandedThreadIds}
          onToggleExpandThread={handleToggleExpandThread}
          onCommentsChange={handleCommentsChange}
        />
      </article>
    </div>
  )
}
