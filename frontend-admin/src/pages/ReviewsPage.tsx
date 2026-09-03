import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  MessageSquareText,
  RefreshCw,
  Search,
  Star,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react'
import {
  createStoreResponse,
  getAdminReviews,
  getAdminReviewStats,
  updateStoreResponse,
  type AdminReviewItem,
  type AdminStoreReviewResponse,
} from '@/api/reviews'
import { ApiError } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime } from '@/lib/utils'

const PAGE_LIMIT = 10

export function ReviewsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedPage = Number.parseInt(searchParams.get('page') || '1', 10)
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const sort = (searchParams.get('sort') as 'latest' | 'most_helpful' | 'most_unhelpful') || 'latest'
  const productId = searchParams.get('productId') || undefined
  const search = searchParams.get('search') || undefined

  const [searchInput, setSearchInput] = useState(search || '')

  // Overview Metrics Stats Query
  const statsQuery = useQuery({
    queryKey: ['admin-review-stats'] as const,
    queryFn: getAdminReviewStats,
  })
  const stats = statsQuery.data

  const queryKey = ['admin-reviews', page, PAGE_LIMIT, sort, productId, search] as const
  const query = useQuery({
    queryKey,
    queryFn: () => getAdminReviews({ page, limit: PAGE_LIMIT, sort, productId, search }),
  })
  const reviews = query.data?.data ?? []
  const pagination = query.data?.meta.pagination
  const totalPages = Math.max(pagination?.totalPages ?? 1, 1)

  const changePage = (nextPage: number) => {
    const params = new URLSearchParams(searchParams)
    params.set('page', String(nextPage))
    setSearchParams(params)
  }

  const handleSortChange = (newSort: 'latest' | 'most_helpful' | 'most_unhelpful') => {
    const params = new URLSearchParams(searchParams)
    if (newSort === 'latest') {
      params.delete('sort')
    } else {
      params.set('sort', newSort)
    }
    params.set('page', '1')
    setSearchParams(params)
  }

  const handleSearchSubmit = () => {
    const params = new URLSearchParams(searchParams)
    const trimmed = searchInput.trim()
    if (trimmed) {
      params.set('search', trimmed)
    } else {
      params.delete('search')
    }
    params.set('page', '1')
    setSearchParams(params)
  }

  const handleFilterByProduct = (targetProductId?: string) => {
    const params = new URLSearchParams(searchParams)
    if (targetProductId) {
      params.set('productId', targetProductId)
    } else {
      params.delete('productId')
    }
    params.set('page', '1')
    setSearchParams(params)
  }

  const handleClearFilters = () => {
    setSearchInput('')
    const params = new URLSearchParams()
    setSearchParams(params)
  }

  const handleRefreshAll = () => {
    statsQuery.refetch()
    query.refetch()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Đánh giá khách hàng</h1>
          <p className="mt-1 text-sm text-slate-500">Đọc đánh giá và gửi một phản hồi chính thức từ cửa hàng.</p>
        </div>
        <Button variant="outline" onClick={handleRefreshAll} disabled={query.isFetching || statsQuery.isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching || statsQuery.isFetching ? 'animate-spin' : ''}`} />
          Làm mới
        </Button>
      </div>

      {/* Overview Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
              <MessageSquareText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Tổng đánh giá</p>
              <p className="text-xl font-bold text-slate-900">{stats?.totalReviews ?? 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
              <ThumbsUp className="h-5 w-5 fill-emerald-600 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Đánh giá hữu ích</p>
              <p className="text-xl font-bold text-emerald-700">{stats?.totalHelpful ?? 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-rose-50 text-rose-600 rounded-xl shrink-0">
              <ThumbsDown className="h-5 w-5 fill-rose-600 text-rose-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Đánh giá không hữu ích</p>
              <p className="text-xl font-bold text-rose-700">{stats?.totalUnhelpful ?? 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Chưa phản hồi</p>
              <p className="text-xl font-bold text-amber-700">{stats?.unansweredCount ?? 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Tìm theo tên sản phẩm..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearchSubmit()
              }}
              className="pl-9 h-9"
              aria-label="Tìm kiếm sản phẩm"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleSearchSubmit} className="h-9">
            Tìm kiếm
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-52">
            <Select
              value={sort}
              onChange={(e) => handleSortChange(e.target.value as 'latest' | 'most_helpful' | 'most_unhelpful')}
              className="h-9 text-xs"
              aria-label="Sắp xếp đánh giá"
            >
              <option value="latest">Mới nhất</option>
              <option value="most_helpful">Nhiều hữu ích nhất</option>
              <option value="most_unhelpful">Nhiều không hữu ích nhất</option>
            </Select>
          </div>

          {(productId || search || sort !== 'latest') && (
            <Button variant="ghost" size="sm" onClick={handleClearFilters} className="h-9 text-xs text-slate-500 hover:text-slate-700">
              <X className="mr-1 h-3.5 w-3.5" />
              Xóa lọc
            </Button>
          )}
        </div>
      </div>

      {productId && (
        <div className="flex items-center gap-2 bg-blue-50/80 border border-blue-200 px-3.5 py-2 rounded-xl text-xs text-blue-800">
          <Filter className="h-3.5 w-3.5 text-blue-600" />
          <span>Đang lọc theo mã sản phẩm: <strong>{productId}</strong></span>
          <button
            type="button"
            onClick={() => handleFilterByProduct(undefined)}
            className="ml-auto text-blue-600 hover:text-blue-800 cursor-pointer font-semibold p-1"
            aria-label="Bỏ lọc theo sản phẩm"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {query.isLoading ? (
        <StatusCard icon={<RefreshCw className="h-6 w-6 animate-spin" />} title="Đang tải danh sách đánh giá..." />
      ) : query.isError && !query.data ? (
        <StatusCard
          error
          icon={<AlertCircle className="h-6 w-6" />}
          title="Không thể tải danh sách đánh giá"
          detail={query.error instanceof Error ? query.error.message : 'Không thể kết nối đến máy chủ.'}
          action={<Button variant="outline" onClick={() => query.refetch()}>Thử lại</Button>}
        />
      ) : reviews.length === 0 ? (
        <StatusCard
          icon={<MessageSquareText className="h-6 w-6" />}
          title="Chưa có đánh giá nào"
          detail="Các đánh giá của khách hàng sẽ xuất hiện tại đây."
        />
      ) : (
        <div className="space-y-4">
          {reviews.map((item) => (
            <ReviewCard
              key={item.review.id}
              item={item}
              queryKey={queryKey}
              activeProductId={productId}
              onFilterByProduct={handleFilterByProduct}
              onReload={query.refetch}
            />
          ))}
        </div>
      )}

      {!query.isError && !query.isLoading && (pagination?.total ?? 0) > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:flex-row">
          <p className="text-xs text-slate-500">Tổng cộng {pagination?.total} đánh giá</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => changePage(page - 1)} disabled={page <= 1}>
              <ChevronLeft className="mr-1 h-4 w-4" />Trước
            </Button>
            <span className="px-2 text-xs font-medium text-slate-600">Trang {pagination?.page ?? page} / {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => changePage(page + 1)} disabled={page >= totalPages}>
              Sau<ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ReviewCard({
  item,
  queryKey,
  activeProductId,
  onFilterByProduct,
  onReload,
}: {
  item: AdminReviewItem
  queryKey: readonly unknown[]
  activeProductId?: string
  onFilterByProduct: (productId?: string) => void
  onReload: () => Promise<{ isSuccess: boolean }>
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(item.review.response?.content ?? '')
  const [fieldError, setFieldError] = useState('')
  const [message, setMessage] = useState('')
  const [conflicted, setConflicted] = useState(false)
  const [reloading, setReloading] = useState(false)
  const response = item.review.response

  const mutation = useMutation({
    mutationFn: (content: string) => item.responseVersion === null
      ? createStoreResponse(item.review.id, { content })
      : updateStoreResponse(item.review.id, { content, version: item.responseVersion }),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey, (current: { data: AdminReviewItem[] } | undefined) => {
        if (!current) return current
        return {
          ...current,
          data: current.data.map((entry) => entry.review.id === item.review.id ? withSavedResponse(entry, saved) : entry),
        }
      })
      setDraft(saved.content)
      setFieldError('')
      setMessage(item.responseVersion === null ? 'Đã gửi phản hồi.' : 'Đã lưu thay đổi.')
      setConflicted(false)
    },
    onError: (error) => {
      if (error instanceof ApiError && error.isValidationError()) {
        setFieldError(error.fields?.content || 'Nội dung phản hồi không hợp lệ')
        setMessage('')
      } else if (error instanceof ApiError && error.code === 'review_response_conflict') {
        setMessage(error.message)
        setConflicted(true)
      } else {
        setMessage('Không thể lưu phản hồi. Vui lòng thử lại.')
      }
    },
  })

  const submit = () => {
    const content = draft.trim()
    setFieldError('')
    setMessage('')
    if (!content) {
      setFieldError('Nội dung phản hồi không được để trống')
      return
    }
    if (content.length > 1000) {
      setFieldError('Nội dung phản hồi không được vượt quá 1000 ký tự')
      return
    }
    mutation.mutate(content)
  }

  const reload = async () => {
    setReloading(true)
    try {
      const result = await onReload()
      if (result.isSuccess) {
        setConflicted(false)
        setMessage('Đã tải trạng thái mới. Bản nháp của bạn vẫn được giữ lại.')
      } else {
        setMessage('Không thể tải trạng thái mới. Vui lòng thử lại.')
      }
    } finally {
      setReloading(false)
    }
  }

  return (
    <Card>
      <CardContent className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)] lg:p-6">
        <section className="min-w-0" aria-labelledby={`review-title-${item.review.id}`}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`review-title-${item.review.id}`} className="font-semibold text-slate-900">{item.product.name}</h2>
            <Badge variant="secondary">Đã mua hàng</Badge>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 font-normal text-xs">
              <ThumbsUp className="h-3 w-3 fill-emerald-600 text-emerald-600" /> {item.review.helpfulCount ?? 0} hữu ích
            </Badge>
            <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 gap-1 font-normal text-xs">
              <ThumbsDown className="h-3 w-3 fill-rose-600 text-rose-600" /> {item.review.unhelpfulCount ?? 0} không hữu ích
            </Badge>
            {item.product.id !== activeProductId ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onFilterByProduct(item.product.id)}
                className="h-6 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              >
                <Filter className="mr-1 h-3 w-3" />
                Lọc theo sản phẩm này
              </Button>
            ) : (
              <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-[11px]">
                Đang lọc theo sản phẩm này
              </Badge>
            )}
          </div>
          <div className="mt-2 flex items-center gap-1" aria-label={`${item.review.rating} trên 5 sao`}>
            {Array.from({ length: 5 }, (_, index) => (
              <Star key={index} className={`h-4 w-4 ${index < item.review.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
            ))}
          </div>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-700">{item.review.comment || 'Khách hàng không để lại nhận xét.'}</p>
          {item.review.purchasedOptions.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              {item.review.purchasedOptions.map((option) => `${option.groupLabel}: ${option.valueLabel}`).join(' · ')}
            </p>
          )}
          <p className="mt-2 text-xs text-slate-400">Cập nhật {formatDateTime(item.review.updatedAt)}</p>
        </section>

        <section className="rounded-xl border border-blue-100 bg-blue-50/50 p-4" aria-label={`Phản hồi cửa hàng cho ${item.product.name}`}>
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-900">{response ? 'Phản hồi hiện tại' : 'Tạo phản hồi cửa hàng'}</h3>
            {response && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{response.content}</p>}
            {response && <p className="mt-1 text-xs text-slate-500">Cập nhật {formatDateTime(response.updatedAt)}</p>}
          </div>
          <label htmlFor={`response-${item.review.id}`} className="text-sm font-medium text-slate-700">
            Nội dung phản hồi cho {item.product.name}
          </label>
          <Textarea
            id={`response-${item.review.id}`}
            value={draft}
            onChange={(event) => { setDraft(event.target.value); setFieldError('') }}
            maxLength={1001}
            error={Boolean(fieldError)}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={`response-help-${item.review.id}`}
            className="mt-2 min-h-28"
          />
          <div id={`response-help-${item.review.id}`} aria-live="polite" className="mt-1 flex justify-between gap-3 text-xs">
            <span className={fieldError ? 'text-rose-600' : 'text-slate-500'}>{fieldError || message}</span>
            <span className="shrink-0 text-slate-400">{draft.trim().length}/1000</span>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
            {conflicted && (
              <Button type="button" variant="outline" onClick={reload} disabled={reloading}>
                {reloading && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}Tải trạng thái mới
              </Button>
            )}
            <Button type="button" onClick={submit} disabled={mutation.isPending || conflicted}>
              {mutation.isPending && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              {response ? 'Lưu thay đổi' : 'Gửi phản hồi'}
            </Button>
          </div>
        </section>
      </CardContent>
    </Card>
  )
}

function withSavedResponse(item: AdminReviewItem, saved: AdminStoreReviewResponse): AdminReviewItem {
  const { version, ...response } = saved
  return { ...item, review: { ...item.review, response }, responseVersion: version }
}

function StatusCard({ icon, title, detail, action, error = false }: { icon: React.ReactNode; title: string; detail?: string; action?: React.ReactNode; error?: boolean }) {
  return (
    <Card className={error ? 'border-rose-200 bg-rose-50/50' : ''}>
      <CardContent className="flex min-h-56 flex-col items-center justify-center p-8 text-center">
        <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full ${error ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>{icon}</div>
        <h2 className={`font-semibold ${error ? 'text-rose-900' : 'text-slate-900'}`}>{title}</h2>
        {detail && <p className={`mt-1 max-w-md text-sm ${error ? 'text-rose-700' : 'text-slate-500'}`}>{detail}</p>}
        {action && <div className="mt-4">{action}</div>}
      </CardContent>
    </Card>
  )
}
