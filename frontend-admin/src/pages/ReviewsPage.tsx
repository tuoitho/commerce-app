import React, { useEffect, useState, useCallback } from 'react'
import { getAdminReviews, updateAdminReply, deleteAdminReply } from '../api/reviews'
import type { AdminReview, GetAdminReviewsParams } from '../api/reviews'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'
import { Star, MessageSquare, Trash2, Edit } from 'lucide-react'

export const ReviewsPage: React.FC = () => {
  const [reviews, setReviews] = useState<AdminReview[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [params, setParams] = useState<GetAdminReviewsParams>({ page: 1, limit: 10, rating: 0, has_reply: '' })
  const [isLoading, setIsLoading] = useState(false)

  const [replyDialogOpen, setReplyDialogOpen] = useState(false)
  const [selectedReview, setSelectedReview] = useState<AdminReview | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replyError, setReplyError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const fetchReviews = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await getAdminReviews(params)
      setReviews(res.data)
      if (res.meta.pagination) {
        setTotal(res.meta.pagination.total)
        setTotalPages(res.meta.pagination.totalPages)
      }
    } catch (error: any) {
      alert(error.message || 'Lỗi khi tải danh sách đánh giá')
    } finally {
      setIsLoading(false)
    }
  }, [params])

  useEffect(() => {
    fetchReviews()
  }, [fetchReviews])

  const handleFilterChange = (key: keyof GetAdminReviewsParams, value: any) => {
    setParams(prev => ({ ...prev, [key]: value, page: 1 }))
  }

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return
    setParams(prev => ({ ...prev, page: newPage }))
  }

  const openReplyDialog = (review: AdminReview) => {
    setSelectedReview(review)
    setReplyText(review.adminReply || '')
    setReplyError(null)
    setReplyDialogOpen(true)
  }

  const openDeleteDialog = (review: AdminReview) => {
    setSelectedReview(review)
    setDeleteDialogOpen(true)
  }

  const submitReply = async () => {
    if (!selectedReview) return
    const text = replyText.trim()
    if (!text) {
      setReplyError('Nội dung phản hồi không được để trống')
      alert('Nội dung phản hồi không được để trống')
      return
    }
    if (text.length > 1000) {
      setReplyError('Nội dung phản hồi không được quá 1000 ký tự')
      alert('Nội dung phản hồi không được quá 1000 ký tự')
      return
    }
    setReplyError(null)

    setIsSubmitting(true)
    try {
      await updateAdminReply(selectedReview.id, text)
      alert('Cập nhật phản hồi thành công')
      setReplyDialogOpen(false)
      fetchReviews()
    } catch (error: any) {
      alert(error.message || 'Lỗi khi cập nhật phản hồi')
    } finally {
      setIsSubmitting(false)
    }
  }

  const submitDeleteReply = async () => {
    if (!selectedReview) return
    setIsSubmitting(true)
    try {
      await deleteAdminReply(selectedReview.id)
      alert('Xóa phản hồi thành công')
      setDeleteDialogOpen(false)
      fetchReviews()
    } catch (error: any) {
      alert(error.message || 'Lỗi khi xóa phản hồi')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Đánh giá sản phẩm</h1>
          <p className="text-muted-foreground">Quản lý và phản hồi đánh giá của khách hàng</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-xl border">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium whitespace-nowrap">Số sao:</span>
          <Select 
            value={params.rating || 0} 
            onChange={(e) => handleFilterChange('rating', Number(e.target.value))}
            className="w-32"
          >
            <option value="0">Tất cả</option>
            <option value="5">5 Sao</option>
            <option value="4">4 Sao</option>
            <option value="3">3 Sao</option>
            <option value="2">2 Sao</option>
            <option value="1">1 Sao</option>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium whitespace-nowrap">Trạng thái phản hồi:</span>
          <Select 
            value={params.has_reply || ''} 
            onChange={(e) => handleFilterChange('has_reply', e.target.value)}
            className="w-40"
          >
            <option value="">Tất cả</option>
            <option value="yes">Đã phản hồi</option>
            <option value="no">Chưa phản hồi</option>
          </Select>
        </div>
      </div>

      <div className="bg-white border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Sản phẩm</TableHead>
              <TableHead className="w-[150px]">Khách hàng</TableHead>
              <TableHead className="w-[100px]">Đánh giá</TableHead>
              <TableHead>Nội dung</TableHead>
              <TableHead className="w-[120px]">Trạng thái</TableHead>
              <TableHead className="text-right">Hành động</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                  Đang tải...
                </TableCell>
              </TableRow>
            ) : reviews.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                  Không tìm thấy đánh giá nào
                </TableCell>
              </TableRow>
            ) : (
              reviews.map((review) => (
                <TableRow key={review.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <img src={review.product.imageUrl} alt={review.product.name} className="w-10 h-10 rounded-md object-cover border" />
                      <div className="flex flex-col">
                        <span className="font-medium text-sm line-clamp-1">{review.product.name}</span>
                        <span className="text-xs text-muted-foreground">{review.product.model}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {review.reviewerEmail || 'Ẩn danh'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5 text-amber-500">
                      <span>{review.rating}</span>
                      <Star className="w-3.5 h-3.5 fill-current" />
                    </div>
                  </TableCell>
                  <TableCell className="max-w-md">
                    <p className="text-sm line-clamp-2">{review.comment || <span className="text-muted-foreground italic">Không có nhận xét</span>}</p>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(review.createdAt).toLocaleString('vi-VN')}</p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {review.adminReply ? (
                      <Badge className="bg-emerald-500 hover:bg-emerald-600 whitespace-nowrap">Đã phản hồi</Badge>
                    ) : (
                      <Badge className="text-amber-600 border-amber-200 bg-amber-50 whitespace-nowrap">Chưa phản hồi</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <div className="inline-flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openReplyDialog(review)}>
                        {review.adminReply ? <Edit className="w-4 h-4 mr-1" /> : <MessageSquare className="w-4 h-4 mr-1" />}
                        {review.adminReply ? 'Sửa' : 'Phản hồi'}
                      </Button>
                      {review.adminReply && (
                        <Button variant="destructive" size="sm" onClick={() => openDeleteDialog(review)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <div className="text-sm text-muted-foreground">
              Hiển thị {reviews.length} trên tổng {total}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={params.page === 1} onClick={() => handlePageChange((params.page || 1) - 1)}>
                Trước
              </Button>
              <Button variant="outline" size="sm" disabled={params.page === totalPages} onClick={() => handlePageChange((params.page || 1) + 1)}>
                Sau
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Reply Dialog */}
      <AlertDialog open={replyDialogOpen} onOpenChange={setReplyDialogOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{selectedReview?.adminReply ? 'Chỉnh sửa phản hồi' : 'Viết phản hồi'}</AlertDialogTitle>
            <AlertDialogDescription>
              Phản hồi này sẽ được hiển thị công khai trên trang sản phẩm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-slate-50 p-4 rounded-xl border text-sm">
              <p className="font-medium text-slate-800">{selectedReview?.reviewerEmail || 'Khách hàng ẩn danh'}</p>
              <div className="flex items-center gap-1 text-amber-500 my-1">
                {Array.from({ length: selectedReview?.rating || 5 }).map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 fill-current" />
                ))}
              </div>
              <p className="text-slate-600">{selectedReview?.comment}</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nội dung phản hồi (Tối đa 1000 ký tự)</label>
              <Textarea
                value={replyText}
                onChange={(e) => {
                  setReplyText(e.target.value)
                  if (replyError) setReplyError(null)
                }}
                placeholder="Nhập câu trả lời của cửa hàng..."
                className="h-32 resize-none"
                maxLength={1000}
              />
              <div className="flex items-center justify-between">
                {replyError ? (
                  <p role="alert" className="text-xs font-medium text-rose-600">
                    {replyError}
                  </p>
                ) : (
                  <span />
                )}
                <div className="text-right text-xs text-muted-foreground">
                  {replyText.length}/1000
                </div>
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction variant="primary" onClick={submitReply} isLoading={isSubmitting}>Lưu phản hồi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa phản hồi</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa phản hồi này? Đánh giá sẽ trở về trạng thái chưa phản hồi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={submitDeleteReply} isLoading={isSubmitting}>Xóa phản hồi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}


