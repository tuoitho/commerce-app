import { useState, useEffect, useCallback } from 'react'
import { Sparkles, RefreshCw, ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import { postsApi, type PostItem } from '@/api/posts'
import type { PaginationMeta } from '@/api/types'
import { PostCard } from '@/components/posts/PostCard'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export function PostsFeedPage() {
  const [posts, setPosts] = useState<PostItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState<number>(1)
  const [pagination, setPagination] = useState<PaginationMeta | null>(null)

  const fetchPosts = useCallback(async (targetPage: number) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await postsApi.listPosts({ page: targetPage, limit: 10 })
      setPosts(res.data || [])
      setPagination(res.meta?.pagination || null)
    } catch {
      setError('Không thể tải danh sách bài viết. Vui lòng kiểm tra lại kết nối và thử lại.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPosts(page)
  }, [fetchPosts, page])

  const handlePostUpdated = (updatedPost: PostItem) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === updatedPost.id ? updatedPost : p))
    )
  }

  const handlePrevPage = () => {
    if (page > 1) {
      setPage((prev) => prev - 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleNextPage = () => {
    if (pagination?.hasNext) {
      setPage((prev) => prev + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f7f5] pb-16 pt-6">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 space-y-6">
        {/* Editorial Page Header */}
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-widest text-emerald-700">
            <Sparkles className="h-4 w-4" />
            <span>AuraPhone Editorial</span>
          </div>
          <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950">
            Bảng tin & Đánh giá Flagship
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Tổng hợp bài viết giới thiệu thiết bị, đánh giá tính năng và các sản phẩm gợi ý mới nhất từ ban biên tập.
          </p>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div data-testid="posts-feed-loading" className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-zinc-200/80 bg-white p-5 space-y-4 shadow-xs">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-32 rounded-md" />
                    <Skeleton className="h-3 w-20 rounded-md" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full rounded-md" />
                  <Skeleton className="h-4 w-5/6 rounded-md" />
                </div>
                <Skeleton className="h-52 w-full rounded-xl" />
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-8 text-center space-y-3">
            <p className="text-sm font-medium text-rose-800">{error}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fetchPosts(page)}
              className="border-rose-300 text-rose-900 hover:bg-rose-100 rounded-xl"
            >
              <RefreshCw className="mr-1.5 h-4 w-4" />
              Thử lại
            </Button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && posts.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400">
              <FileText className="h-6 w-6 stroke-[1.5]" />
            </div>
            <h3 className="text-base font-bold text-zinc-900">Chưa có bài viết nào</h3>
            <p className="text-xs sm:text-sm text-zinc-500 max-w-sm mx-auto">
              Hiện tại chưa có bài viết giới thiệu sản phẩm nào được đăng tải. Hãy quay lại sau để cập nhật những bài viết mới nhất!
            </p>
          </div>
        )}

        {/* Posts List */}
        {!isLoading && !error && posts.length > 0 && (
          <div className="space-y-5">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onPostUpdated={handlePostUpdated}
              />
            ))}
          </div>
        )}

        {/* Pagination Controls */}
        {!isLoading && !error && pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-zinc-200/80 pt-4 px-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={handlePrevPage}
              className="rounded-xl border-zinc-300 text-xs font-semibold text-zinc-700 disabled:opacity-40"
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Trang trước
            </Button>

            <span className="text-xs font-mono font-medium text-zinc-500">
              Trang {page} / {pagination.totalPages}
            </span>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!pagination.hasNext}
              onClick={handleNextPage}
              className="rounded-xl border-zinc-300 text-xs font-semibold text-zinc-700 disabled:opacity-40"
            >
              Trang sau
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
export default PostsFeedPage
