import React, { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useToast } from '@/context/ToastContext'
import { createReturn } from '@/api/returns'
import { formatVND } from '@/lib/utils'
import { ApiError, type Order, type ReturnReasonCode } from '@/api/types'
import { Package, AlertCircle } from 'lucide-react'

interface ReturnRequestDialogProps {
  order: Order
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

const REASON_OPTIONS: { code: ReturnReasonCode; label: string }[] = [
  { code: 'defective', label: 'Sản phẩm lỗi / hư hỏng' },
  { code: 'not_as_described', label: 'Không giống mô tả' },
  { code: 'wrong_or_missing', label: 'Giao sai sản phẩm / thiếu phụ kiện' },
  { code: 'changed_mind', label: 'Không còn nhu cầu sử dụng' },
]

export const ReturnRequestDialog: React.FC<ReturnRequestDialogProps> = ({
  order,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { success } = useToast()
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])
  const [reasonCode, setReasonCode] = useState<ReturnReasonCode>('defective')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Initialize selected items when dialog opens if empty
  const handleToggleItem = (itemId: string) => {
    setErrorMessage(null)
    setSelectedItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    )
  }

  const handleSelectAll = () => {
    setErrorMessage(null)
    if (selectedItemIds.length === order.items.length) {
      setSelectedItemIds([])
    } else {
      setSelectedItemIds(order.items.map((i) => i.id))
    }
  }

  // Calculate refund preview
  const refundPreview = useMemo(() => {
    const selectedItems = order.items.filter((item) => selectedItemIds.includes(item.id))
    const itemsTotal = selectedItems.reduce(
      (sum, item) => sum + (Number(item.lineTotalVnd) || 0),
      0
    )
    const isFullReturn =
      order.items.length > 0 && selectedItems.length === order.items.length
    const shippingFee = isFullReturn ? Number(order.shippingFeeVnd) || 0 : 0
    const totalRefund = itemsTotal + shippingFee

    return {
      itemsTotal,
      isFullReturn,
      shippingFee,
      totalRefund,
    }
  }, [order, selectedItemIds])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedItemIds.length === 0) {
      setErrorMessage('Vui lòng chọn ít nhất một sản phẩm để trả hàng.')
      return
    }

    setSubmitting(true)
    setErrorMessage(null)
    try {
      await createReturn(order.id, {
        orderItemIds: selectedItemIds,
        reasonCode,
        description: description.trim() || undefined,
      })
      success('Gửi yêu cầu trả hàng thành công!')
      onSuccess()
      onClose()
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message || 'Không thể gửi yêu cầu trả hàng. Vui lòng thử lại.')
      } else {
        setErrorMessage('Đã xảy ra lỗi kết nối. Vui lòng kiểm tra lại.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-900">
            <Package className="w-5 h-5 text-indigo-600" />
            Yêu cầu trả hàng & hoàn tiền
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            Chọn sản phẩm bạn muốn trả và cung cấp lý do để cửa hàng xử lý hoàn tiền.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-rose-700 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Select Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-slate-800">
                Sản phẩm muốn trả ({selectedItemIds.length}/{order.items.length})
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-indigo-600 hover:text-indigo-700 h-7 px-2"
                onClick={handleSelectAll}
              >
                {selectedItemIds.length === order.items.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
              </Button>
            </div>

            <div className="space-y-2 border border-slate-200 rounded-lg p-3 max-h-60 overflow-y-auto divide-y divide-slate-100">
              {order.items.map((item) => {
                const isSelected = selectedItemIds.includes(item.id)
                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0 cursor-pointer"
                    onClick={() => handleToggleItem(item.id)}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleToggleItem(item.id)}
                      className="mt-1"
                    />
                    <img
                      src={item.imageUrl || '/placeholder.png'}
                      alt={item.productName}
                      className="w-14 h-14 object-cover rounded-md border border-slate-200 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-500">{item.brandName}</p>
                      <h4 className="text-sm font-medium text-slate-900 truncate">
                        {item.productName}
                      </h4>
                      {item.options && item.options.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {item.options.map((opt, idx) => (
                            <span
                              key={idx}
                              className="text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded"
                            >
                              {opt.groupLabel}: {opt.valueLabel}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-1 text-xs text-slate-600">
                        <span>Số lượng: {item.quantity}</span>
                        <span className="font-semibold text-slate-900">
                          {formatVND(item.lineTotalVnd)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Reason Code */}
          <div className="space-y-2">
            <Label htmlFor="return-reason" className="text-sm font-semibold text-slate-800">
              Lý do trả hàng <span className="text-rose-500">*</span>
            </Label>
            <Select
              id="return-reason"
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value as ReturnReasonCode)}
            >
              {REASON_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="return-desc" className="text-sm font-semibold text-slate-800">
                Chi tiết lý do (không bắt buộc)
              </Label>
              <span className="text-xs text-slate-400">{description.length}/1000</span>
            </div>
            <textarea
              id="return-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 1000))}
              placeholder="Mô tả cụ thể tình trạng sản phẩm để shop hỗ trợ nhanh hơn..."
              className="w-full text-sm rounded-md border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Refund Amount Preview */}
          <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-lg space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Tiền hàng hoàn trả ({selectedItemIds.length} sản phẩm):</span>
              <span className="font-medium text-slate-800">
                {formatVND(refundPreview.itemsTotal)}
              </span>
            </div>
            {refundPreview.isFullReturn && refundPreview.shippingFee > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Hoàn phí vận chuyển (trả toàn bộ đơn):</span>
                <span className="font-medium text-slate-800">
                  +{formatVND(refundPreview.shippingFee)}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-indigo-200/60 text-sm">
              <span className="font-semibold text-slate-900">Tổng tiền dự kiến hoàn:</span>
              <span className="font-bold text-indigo-700 text-base">
                {formatVND(refundPreview.totalRefund)}
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              Đóng
            </Button>
            <Button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
              disabled={submitting || selectedItemIds.length === 0}
            >
              {submitting ? 'Đang gửi...' : 'Gửi yêu cầu trả hàng'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
