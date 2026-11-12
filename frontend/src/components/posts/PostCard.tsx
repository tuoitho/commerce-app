import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { PostMediaGallery } from './PostMediaGallery'
import { ReferredProductCardList } from './ReferredProductCardList'
import { ReactionBar } from './ReactionBar'
import type { PostItem, ReactionSummary } from '@/api/posts'
import { formatDateTime } from '@/lib/utils'

export interface PostCardProps {
  post: PostItem
  onPostUpdated?: (updated: PostItem) => void
  className?: string
}

export function PostCard({ post, onPostUpdated, className = '' }: PostCardProps) {
  const handleReactionChange = (newReactions: ReactionSummary) => {
    if (onPostUpdated) {
      onPostUpdated({
        ...post,
        reactions: newReactions,
      })
    }
  }

  const initialLetter = (post.authorName || 'Q').charAt(0).toUpperCase()

  return (
    <article
      id={`post-article-${post.id}`}
      tabIndex={-1}
      className={`rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-xs transition-shadow hover:shadow-sm space-y-4 focus:outline-none ${className}`}
    >
      {/* Post Header: Author, Role Badge, Timestamp */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-950 text-white font-mono font-bold text-sm select-none">
            {initialLetter}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-zinc-950">
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

            <Link
              to={`/posts/${post.id}`}
              className="text-xs text-zinc-400 hover:text-zinc-600 hover:underline transition-colors block mt-0.5"
            >
              {formatDateTime(post.createdAt)}
            </Link>
          </div>
        </div>
      </div>

      {/* Post Text Content */}
      <div className="text-sm text-zinc-800 leading-relaxed whitespace-pre-line break-words">
        {post.content}
      </div>

      {/* Media Gallery (images/video) */}
      {post.media && post.media.length > 0 && (
        <PostMediaGallery media={post.media} />
      )}

      {/* Referred Product Cards */}
      {post.referredProducts && post.referredProducts.length > 0 && (
        <ReferredProductCardList products={post.referredProducts} />
      )}

      {/* Reaction and Interaction Bar */}
      <ReactionBar
        postId={post.id}
        reactions={post.reactions}
        commentCount={post.commentCount}
        onReactionChange={handleReactionChange}
      />
    </article>
  )
}
