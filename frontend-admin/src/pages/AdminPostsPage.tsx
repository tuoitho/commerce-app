import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  FileText,
  Share2,
  Trash2,
  Pencil,
  Eye,
  X,
  Upload,
  Search,
  Check,
  AlertCircle,
  Loader2,
  Package,
} from 'lucide-react'
import {
  postsApi,
  type PostItem,
  type PostMediaAttachment,
  type ReferredProductCard,
  type CreatePostPayload,
  type UpdatePostPayload,
} from '@/api/posts'
import { getAdminProducts } from '@/api/products'
import type { ProductSummary } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { formatDateTime, formatVND } from '@/lib/utils'

export function AdminPostsPage() {
  const navigate = useNavigate()

  const [posts, setPosts] = useState<PostItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Toast message
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToastMessage(msg)
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null)
    }, 3000)
  }

  // Delete post state
  const [postToDelete, setPostToDelete] = useState<PostItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Create / Edit post modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingPost, setEditingPost] = useState<PostItem | null>(null)
  const [formContent, setFormContent] = useState('')
  const [formMedia, setFormMedia] = useState<PostMediaAttachment[]>([])
  const [formProducts, setFormProducts] = useState<ReferredProductCard[]>([])
  const [formErrors, setFormErrors] = useState<{ content?: string; products?: string; general?: string }>({})
  const [isUploadingMedia, setIsUploadingMedia] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Product search in modal
  const [productSearch, setProductSearch] = useState('')
  const [searchResults, setSearchResults] = useState<ProductSummary[]>([])
  const [isSearchingProducts, setIsSearchingProducts] = useState(false)

  // Fetch posts
  const fetchPosts = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const res = await postsApi.listPosts({ page: 1, limit: 30 })
      setPosts(res.data || [])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi tải danh sách bài viết'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  // Search products when modal search input changes
  useEffect(() => {
    if (!productSearch.trim()) {
      setSearchResults([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearchingProducts(true)
        const res = await getAdminProducts({ q: productSearch.trim(), limit: 10 })
        setSearchResults(res.data || [])
      } catch {
        setSearchResults([])
      } finally {
        setIsSearchingProducts(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [productSearch])

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingPost(null)
    setFormContent('')
    setFormMedia([])
    setFormProducts([])
    setFormErrors({})
    setProductSearch('')
    setSearchResults([])
    setIsModalOpen(true)
  }

  // Open Edit Modal
  const handleOpenEditModal = (post: PostItem) => {
    setEditingPost(post)
    setFormContent(post.content)
    setFormMedia([...(post.media || [])])
    setFormProducts([...(post.referredProducts || [])])
    setFormErrors({})
    setProductSearch('')
    setSearchResults([])
    setIsModalOpen(true)
  }

  // Handle Share (Req 2.5)
  const handleSharePost = async (postId: string) => {
    const postUrl = `${window.location.origin}/posts/${postId}`
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(postUrl)
      }
      showToast('Đã sao chép liên kết bài viết')
    } catch {
      showToast('Đã sao chép liên kết bài viết')
    }
  }

  // Handle Delete Post
  const handleConfirmDelete = async () => {
    if (!postToDelete) return
    try {
      setIsDeleting(true)
      await postsApi.deleteAdminPost(postToDelete.id)
      setPostToDelete(null)
      showToast('Xóa bài viết thành công')
      fetchPosts()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi xóa bài viết'
      showToast(msg)
    } finally {
      setIsDeleting(false)
    }
  }

  // Media upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      // Validation
      const isImage = file.type.startsWith('image/')
      const isVideo = file.type.startsWith('video/')

      if (!isImage && !isVideo) {
        setFormErrors((prev) => ({
          ...prev,
          general: 'Định dạng tệp không được hỗ trợ (chỉ chấp nhận JPEG, PNG, WebP, GIF, MP4, WebM)',
        }))
        continue
      }

      const maxImageSize = 10 * 1024 * 1024 // 10MB
      const maxVideoSize = 50 * 1024 * 1024 // 50MB

      if (isImage && file.size > maxImageSize) {
        setFormErrors((prev) => ({
          ...prev,
          general: 'Dung lượng tệp vượt quá giới hạn cho phép (tối đa 10MB cho ảnh, 50MB cho video)',
        }))
        continue
      }

      if (isVideo && file.size > maxVideoSize) {
        setFormErrors((prev) => ({
          ...prev,
          general: 'Dung lượng tệp vượt quá giới hạn cho phép (tối đa 10MB cho ảnh, 50MB cho video)',
        }))
        continue
      }

      try {
        setIsUploadingMedia(true)
        const uploaded = await postsApi.uploadPostMedia(file)
        setFormMedia((prev) => [...prev, uploaded])
        setFormErrors((prev) => ({ ...prev, general: undefined }))
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Tải tệp lên thất bại'
        setFormErrors((prev) => ({ ...prev, general: msg }))
      } finally {
        setIsUploadingMedia(false)
      }
    }

    // Reset file input value
    e.target.value = ''
  }

  const handleRemoveMedia = (mediaId: string) => {
    setFormMedia((prev) => prev.filter((m) => m.id !== mediaId))
  }

  const handleAddProduct = (product: ProductSummary) => {
    if (formProducts.length >= 10) {
      setFormErrors((prev) => ({
        ...prev,
        products: 'Chỉ được chọn tối đa 10 sản phẩm giới thiệu',
      }))
      return
    }

    if (formProducts.some((p) => p.id === product.id)) {
      return
    }

    const card: ReferredProductCard = {
      id: product.id,
      name: product.name,
      brand: product.brand || 'AuraPhone',
      price: String(product.price),
      currency: product.currency || 'VND',
      imageUrl: product.primaryImageUrl || '',
      inStock: Boolean(product.inStock),
      active: true,
    }

    setFormProducts((prev) => [...prev, card])
    setFormErrors((prev) => ({ ...prev, products: undefined }))
  }

  const handleRemoveProduct = (productId: string) => {
    setFormProducts((prev) => prev.filter((p) => p.id !== productId))
  }

  // Handle Form Submit
  const handleSubmitPost = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedContent = formContent.trim()
    const errors: { content?: string; products?: string; general?: string } = {}

    if (!trimmedContent || trimmedContent.length > 5000) {
      errors.content = 'Nội dung bài viết phải từ 1 đến 5.000 ký tự'
    }

    if (formProducts.length === 0 || formProducts.length > 10) {
      errors.products = 'Vui lòng chọn từ 1 đến 10 sản phẩm giới thiệu'
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    setIsSubmitting(true)
    setFormErrors({})

    try {
      if (editingPost) {
        const payload: UpdatePostPayload = {
          content: trimmedContent,
          mediaIds: formMedia.map((m) => m.id),
          referredProductIds: formProducts.map((p) => p.id),
        }
        await postsApi.updateAdminPost(editingPost.id, payload)
        showToast('Cập nhật bài viết thành công')
      } else {
        const payload: CreatePostPayload = {
          content: trimmedContent,
          mediaIds: formMedia.map((m) => m.id),
          referredProductIds: formProducts.map((p) => p.id),
        }
        await postsApi.createAdminPost(payload)
        showToast('Tạo bài viết thành công')
      }

      setIsModalOpen(false)
      fetchPosts()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Có lỗi xảy ra khi lưu bài viết'
      setFormErrors({ general: msg })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-xl animate-in fade-in slide-in-from-bottom-2">
          <Check className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Quản lý bài viết giới thiệu
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Tạo và quản lý các bài viết truyền thông kèm sản phẩm giới thiệu từ danh mục cửa hàng.
          </p>
        </div>

        <Button
          onClick={handleOpenCreateModal}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl gap-2 cursor-pointer shadow-sm shadow-blue-500/20"
        >
          <Plus className="h-4 w-4" />
          <span>Tạo bài viết</span>
        </Button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="py-20 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm">Đang tải danh sách bài viết...</p>
        </div>
      )}

      {/* Error state */}
      {!isLoading && error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center space-y-3">
          <AlertCircle className="mx-auto h-8 w-8 text-rose-600" />
          <p className="text-sm font-semibold text-rose-900">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchPosts}>
            Thử lại
          </Button>
        </div>
      )}

      {/* Empty State (Req 2.6) */}
      {!isLoading && !error && posts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <FileText className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900">Chưa có bài viết nào</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Hệ thống chưa có bài viết nào. Hãy tạo bài viết đầu tiên để giới thiệu sản phẩm tới khách hàng.
            </p>
          </div>
          <Button
            onClick={handleOpenCreateModal}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl gap-2 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Tạo bài viết ngay</span>
          </Button>
        </div>
      )}

      {/* Posts List */}
      {!isLoading && !error && posts.length > 0 && (
        <div className="space-y-4">
          {posts.map((post) => (
            <article
              key={post.id}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4 hover:border-slate-300 transition-colors"
            >
              {/* Author & Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white font-bold text-sm select-none">
                    {(post.authorName || 'Q').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">
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

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/posts/${post.id}`)}
                    className="gap-1.5 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    <Eye className="h-3.5 w-3.5 text-slate-500" />
                    <span>Xem chi tiết</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSharePost(post.id)}
                    className="gap-1.5 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    <Share2 className="h-3.5 w-3.5 text-slate-500" />
                    <span>Chia sẻ</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenEditModal(post)}
                    className="gap-1.5 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    <Pencil className="h-3.5 w-3.5 text-slate-500" />
                    <span>Chỉnh sửa</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPostToDelete(post)}
                    className="gap-1.5 text-xs text-rose-600 hover:bg-rose-50 border-slate-200 hover:border-rose-200"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Xóa</span>
                  </Button>
                </div>
              </div>

              {/* Content */}
              <p className="text-sm text-slate-800 whitespace-pre-line leading-relaxed">
                {post.content}
              </p>

              {/* Media Preview */}
              {post.media && post.media.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {post.media.map((m) => (
                    <div
                      key={m.id}
                      className="relative h-20 w-24 rounded-lg overflow-hidden border border-slate-200 bg-slate-100"
                    >
                      {m.fileType === 'image' ? (
                        <img
                          src={m.fileUrl}
                          alt={m.fileName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-slate-900 text-white text-[10px] font-bold">
                          VIDEO
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Referred Products Preview */}
              {post.referredProducts && post.referredProducts.length > 0 && (
                <div className="pt-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                    Sản phẩm giới thiệu ({post.referredProducts.length}):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {post.referredProducts.map((prod) => (
                      <div
                        key={prod.id}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700"
                      >
                        <Package className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                        <span className="font-medium text-slate-900">{prod.name}</span>
                        <span className="text-slate-400">({formatVND(prod.price)})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Stats Footer */}
              <div className="flex items-center gap-4 text-xs text-slate-500 pt-2 border-t border-slate-100">
                <span>
                  <strong>{post.reactions?.totalCount || 0}</strong> lượt cảm xúc
                </span>
                <span>•</span>
                <span>
                  <strong>{post.commentCount || 0}</strong> bình luận
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={Boolean(postToDelete)} onOpenChange={(open) => !open && setPostToDelete(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa bài viết</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa bài viết này không? Toàn bộ cảm xúc, bình luận và tệp đính kèm sẽ bị xóa hoàn toàn khỏi hệ thống.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {isDeleting ? 'Đang xóa...' : 'Xác nhận xóa'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto"
        >
          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 my-8 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-bold text-slate-900">
                {editingPost ? 'Chỉnh sửa bài viết' : 'Tạo bài viết mới'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1"
                aria-label="Đóng"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmitPost} className="p-6 space-y-6 overflow-y-auto flex-1">
              {/* General Error Banner */}
              {formErrors.general && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{formErrors.general}</span>
                </div>
              )}

              {/* Content textarea */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="post-content" className="text-xs font-semibold text-slate-700">
                    Nội dung bài viết <span className="text-rose-600">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {formContent.length}/5000
                  </span>
                </div>
                <Textarea
                  id="post-content"
                  placeholder="Nhập nội dung bài viết giới thiệu..."
                  rows={4}
                  value={formContent}
                  onChange={(e) => {
                    setFormContent(e.target.value)
                    if (formErrors.content) {
                      setFormErrors((prev) => ({ ...prev, content: undefined }))
                    }
                  }}
                  className={`rounded-xl resize-y ${
                    formErrors.content ? 'border-rose-400 focus-visible:ring-rose-400' : ''
                  }`}
                />
                {formErrors.content && (
                  <p className="text-xs text-rose-600 font-medium">{formErrors.content}</p>
                )}
              </div>

              {/* Media Upload Section */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-700 block">
                  Ảnh hoặc video đính kèm (Ảnh &le; 10MB, Video &le; 50MB)
                </label>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer transition-colors">
                    <Upload className="h-4 w-4 text-blue-600" />
                    <span>Tải lên ảnh hoặc video</span>
                    <input
                      type="file"
                      aria-label="Tải lên ảnh hoặc video"
                      accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={isUploadingMedia}
                    />
                  </label>
                  {isUploadingMedia && (
                    <span className="flex items-center gap-1.5 text-xs text-blue-600">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Đang tải lên...
                    </span>
                  )}
                </div>

                {/* Media preview chips */}
                {formMedia.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {formMedia.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5 pr-2.5 text-xs"
                      >
                        <span className="font-mono text-[10px] uppercase font-bold text-blue-600 px-1 py-0.5 rounded bg-blue-100">
                          {m.fileType}
                        </span>
                        <span className="text-slate-800 max-w-[150px] truncate" title={m.fileName}>
                          {m.fileName}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveMedia(m.id)}
                          className="text-slate-400 hover:text-rose-600 cursor-pointer p-0.5"
                          aria-label={`Xóa tệp ${m.fileName}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Referred Products Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">
                    Sản phẩm giới thiệu <span className="text-rose-600">*</span> (1 – 10 sản phẩm)
                  </label>
                  <span className="text-[11px] text-slate-400">
                    Đã chọn {formProducts.length}/10
                  </span>
                </div>

                {/* Selected Products list */}
                {formProducts.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formProducts.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-1.5 text-xs text-blue-900"
                      >
                        <Package className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                        <span className="font-semibold">{p.name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveProduct(p.id)}
                          className="text-blue-500 hover:text-rose-600 cursor-pointer p-0.5 ml-1"
                          aria-label={`Bỏ chọn ${p.name}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {formErrors.products && (
                  <p className="text-xs text-rose-600 font-medium">{formErrors.products}</p>
                )}

                {/* Product Search Input */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Tìm kiếm sản phẩm từ danh mục..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="pl-9 rounded-xl text-xs"
                  />
                  {isSearchingProducts && (
                    <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-slate-400" />
                  )}
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-xs">
                    {searchResults.map((prod) => {
                      const isSelected = formProducts.some((p) => p.id === prod.id)
                      return (
                        <div
                          key={prod.id}
                          className="flex items-center justify-between p-2.5 hover:bg-slate-50 transition-colors text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {prod.primaryImageUrl ? (
                              <img
                                src={prod.primaryImageUrl}
                                alt={prod.name}
                                className="h-8 w-8 rounded-lg object-cover shrink-0 border border-slate-200"
                              />
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-400 shrink-0">
                                <Package className="h-4 w-4" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 truncate">{prod.name}</p>
                              <p className="text-[11px] text-slate-500">{formatVND(prod.price)}</p>
                            </div>
                          </div>

                          <Button
                            type="button"
                            size="sm"
                            variant={isSelected ? 'secondary' : 'outline'}
                            disabled={isSelected || formProducts.length >= 10}
                            onClick={() => handleAddProduct(prod)}
                            className="text-xs h-7 px-2.5 rounded-lg"
                          >
                            {isSelected ? 'Đã chọn' : 'Chọn sản phẩm'}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="rounded-xl"
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || isUploadingMedia}
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl gap-2 cursor-pointer shadow-sm shadow-blue-500/20"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>{editingPost ? 'Lưu bài viết' : 'Đăng bài viết'}</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
