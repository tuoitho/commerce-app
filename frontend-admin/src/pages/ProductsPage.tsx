import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Search,
  RefreshCw,
  Package,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'
import { getAdminProducts, deleteAdminProduct } from '@/api/products'
import { ApiError, type ProductSummary } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { formatVND } from '@/lib/utils'

export function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()

  const queryParam = searchParams.get('q') || ''
  const pageParam = parseInt(searchParams.get('page') || '1', 10)
  const currentPage = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam
  const limit = 10

  const [searchInput, setSearchInput] = useState(queryParam)
  const [productToDelete, setProductToDelete] = useState<ProductSummary | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'products', { q: queryParam, page: currentPage, limit }],
    queryFn: () => getAdminProducts({ q: queryParam, page: currentPage, limit }),
  })

  const products = data?.data || []
  const pagination = data?.meta.pagination || {
    page: currentPage,
    limit,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  }

  const handleConfirmDelete = async () => {
    if (!productToDelete) return

    try {
      setIsDeleting(true)
      setDeleteError(null)
      await deleteAdminProduct(productToDelete.id)
      setProductToDelete(null)
      setSuccessMessage('Đã xóa sản phẩm thành công')
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })
    } catch (err) {
      if (err instanceof ApiError) {
        setDeleteError(err.message)
      } else if (err instanceof Error) {
        setDeleteError(err.message)
      } else {
        setDeleteError('Đã có lỗi xảy ra khi xóa sản phẩm. Vui lòng thử lại.')
      }
    } finally {
      setIsDeleting(false)
    }
  }

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault()
    const nextParams = new URLSearchParams(searchParams)
    const trimmed = searchInput.trim()
    if (trimmed) {
      nextParams.set('q', trimmed)
    } else {
      nextParams.delete('q')
    }
    nextParams.set('page', '1')
    setSearchParams(nextParams)
  }

  const handleClearSearch = () => {
    setSearchInput('')
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('q')
    nextParams.set('page', '1')
    setSearchParams(nextParams)
  }

  const handlePageChange = (newPage: number) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('page', String(newPage))
    setSearchParams(nextParams)
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Quản lý sản phẩm</h1>
          <p className="text-sm text-slate-500 mt-1">
            Danh sách tất cả sản phẩm điện thoại và thiết bị công nghệ trong danh mục.
          </p>
        </div>
        <Link
          to="/products/new"
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] cursor-pointer select-none bg-blue-600 text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700 hover:shadow-md hover:shadow-blue-600/30 active:bg-blue-800 h-10 px-4 py-2"
        >
          <Plus className="h-4 w-4" />
          Thêm sản phẩm
        </Link>
      </div>

      {/* Success Notification Banner */}
      {successMessage && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-800 flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <span className="font-medium">{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-800 p-1 rounded-lg transition-colors cursor-pointer"
            aria-label="Đóng thông báo"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <Input
                type="text"
                placeholder="Tìm kiếm sản phẩm theo tên..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10 pr-10"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  aria-label="Xóa từ khóa tìm kiếm"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" variant="primary" className="shrink-0">
                <Search className="h-4 w-4 mr-1.5" />
                Tìm kiếm
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => refetch()}
                disabled={isFetching}
                title="Làm mới dữ liệu"
                className="shrink-0"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin text-blue-600' : ''}`} />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Main Content Area */}
      {isError ? (
        <Card className="border-rose-200 bg-rose-50/50">
          <CardContent className="p-8 flex flex-col items-center justify-center text-center">
            <div className="h-12 w-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 mb-3">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-rose-900">
              Đã có lỗi xảy ra khi tải danh sách sản phẩm
            </h3>
            <p className="text-sm text-rose-600 mt-1 max-w-md">
              {error instanceof Error ? error.message : 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại.'}
            </p>
            <Button
              variant="outline"
              onClick={() => refetch()}
              className="mt-4 border-rose-300 text-rose-700 hover:bg-rose-100"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Thử lại
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="rounded-2xl overflow-hidden border-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 text-center">Hình ảnh</TableHead>
                  <TableHead>Tên sản phẩm</TableHead>
                  <TableHead className="w-36">Thương hiệu</TableHead>
                  <TableHead className="w-36">Danh mục</TableHead>
                  <TableHead className="w-36">Giá</TableHead>
                  <TableHead className="w-32">Trạng thái</TableHead>
                  <TableHead className="w-28 text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <TableRow key={`skeleton-${idx}`} className="animate-pulse">
                      <TableCell className="text-center">
                        <div className="h-12 w-12 rounded-xl bg-slate-200 mx-auto" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 w-48 bg-slate-200 rounded mb-1.5" />
                        <div className="h-3 w-24 bg-slate-100 rounded" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 w-20 bg-slate-200 rounded" />
                      </TableCell>
                      <TableCell>
                        <div className="h-6 w-24 bg-slate-200 rounded-full" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 w-24 bg-slate-200 rounded" />
                      </TableCell>
                      <TableCell>
                        <div className="h-6 w-20 bg-slate-200 rounded-full" />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="h-8 w-16 bg-slate-200 rounded ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : products.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-64 text-center">
                      <div className="flex flex-col items-center justify-center text-slate-500 py-6">
                        <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                          <Package className="h-6 w-6" />
                        </div>
                        <p className="text-base font-semibold text-slate-800">
                          Không tìm thấy sản phẩm nào
                        </p>
                        <p className="text-xs text-slate-500 mt-1 max-w-sm">
                          {queryParam
                            ? `Không có kết quả nào phù hợp với từ khóa "${queryParam}". Thử tìm kiếm với từ khóa khác.`
                            : 'Chưa có sản phẩm nào trong danh mục. Hãy bắt đầu bằng cách thêm sản phẩm mới.'}
                        </p>
                        {queryParam && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleClearSearch}
                            className="mt-3"
                          >
                            Xóa bộ lọc
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  products.map((product) => (
                    <TableRow key={product.id} className="hover:bg-slate-50/70">
                      {/* Product Image */}
                      <TableCell className="text-center">
                        <div className="h-12 w-12 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center shrink-0 mx-auto">
                          {product.primaryImageUrl ? (
                            <img
                              src={product.primaryImageUrl}
                              alt={product.name}
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none'
                              }}
                            />
                          ) : (
                            <ImageIcon className="h-5 w-5 text-slate-400" />
                          )}
                        </div>
                      </TableCell>

                      {/* Product Name & Model */}
                      <TableCell>
                        <div className="font-medium text-slate-900 line-clamp-1">
                          {product.name}
                        </div>
                        {product.model && (
                          <div className="text-xs text-slate-500 font-mono mt-0.5">
                            {product.model}
                          </div>
                        )}
                      </TableCell>

                      {/* Plain text Brand column */}
                      <TableCell className="text-sm font-medium text-slate-700">
                        {product.brand || '—'}
                      </TableCell>

                      {/* Category */}
                      <TableCell>
                        <Badge variant="secondary" className="font-normal text-slate-700 bg-slate-100">
                          {product.category?.name || 'Chưa phân loại'}
                        </Badge>
                      </TableCell>

                      {/* Formatted Price */}
                      <TableCell className="font-semibold text-slate-900 whitespace-nowrap">
                        {formatVND(product.price)}
                      </TableCell>

                      {/* Stock Status */}
                      <TableCell>
                        {product.inStock ? (
                          <Badge variant="success">Còn hàng</Badge>
                        ) : (
                          <Badge variant="destructive">Hết hàng</Badge>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            to={`/products/${product.id}`}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Chỉnh sửa sản phẩm"
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              setProductToDelete(product)
                              setDeleteError(null)
                            }}
                            aria-label={`Xóa sản phẩm ${product.name}`}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Xóa sản phẩm"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {pagination.total > 0 && (
            <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-500">
                Hiển thị{' '}
                <span className="font-medium text-slate-700">
                  {Math.min((currentPage - 1) * limit + 1, pagination.total)}
                </span>{' '}
                -{' '}
                <span className="font-medium text-slate-700">
                  {Math.min(currentPage * limit, pagination.total)}
                </span>{' '}
                trên tổng số{' '}
                <span className="font-medium text-slate-700">{pagination.total}</span> sản phẩm
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={!pagination.hasPrev || currentPage <= 1}
                  className="gap-1 text-xs"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Trước
                </Button>

                <div className="text-xs font-medium text-slate-600 px-2">
                  Trang {pagination.page} / {Math.max(pagination.totalPages, 1)}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={!pagination.hasNext || currentPage >= pagination.totalPages}
                  className="gap-1 text-xs"
                >
                  Sau
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Confirmation Dialog for Product Deletion */}
      <AlertDialog
        open={Boolean(productToDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setProductToDelete(null)
            setDeleteError(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa sản phẩm</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa sản phẩm{' '}
              <span className="font-semibold text-slate-900">
                "{productToDelete?.name}"
              </span>{' '}
              không? Hành động này sẽ ẩn sản phẩm khỏi hệ thống danh mục.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleteError && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{deleteError}</span>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmDelete}
              isLoading={isDeleting}
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
