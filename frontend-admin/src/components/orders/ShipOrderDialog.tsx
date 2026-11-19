import { useState, useEffect, type FormEvent } from 'react'
import { AlertCircle, Truck, X } from 'lucide-react'
import { ApiError, type ShipOrderInput } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const CARRIER_SUGGESTIONS = ['GHN', 'GHTK', 'Viettel Post', 'Ahamove 2h'] as const
const TRACKING_CODE_PATTERN = /^[A-Za-z0-9_-]{3,64}$/

export interface ShipOrderDialogProps {
  open: boolean
  orderId: string
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: ShipOrderInput) => Promise<void>
}

export function ShipOrderDialog({
  open,
  orderId,
  isPending,
  onOpenChange,
  onSubmit,
}: ShipOrderDialogProps) {
  const [carrier, setCarrier] = useState('')
  const [trackingCode, setTrackingCode] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ carrier?: string; trackingCode?: string }>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setCarrier('')
      setTrackingCode('')
      setFieldErrors({})
      setSubmitError(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) {
        onOpenChange(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, isPending, onOpenChange])

  if (!open) return null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitError(null)
    const trimmedCarrier = carrier.trim()
    const trimmedTracking = trackingCode.trim()

    const nextErrors: { carrier?: string; trackingCode?: string } = {}
    if (trimmedCarrier.length < 1 || trimmedCarrier.length > 80) {
      nextErrors.carrier = 'Vui lòng nhập đơn vị vận chuyển (1–80 ký tự)'
    }
    if (!TRACKING_CODE_PATTERN.test(trimmedTracking)) {
      nextErrors.trackingCode = 'Mã vận đơn phải từ 3 đến 64 ký tự (chữ, số, -, _)'
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors)
      return
    }

    setFieldErrors({})
    try {
      await onSubmit({ carrier: trimmedCarrier, trackingCode: trimmedTracking })
    } catch (err) {
      if (err instanceof ApiError && err.isValidationError()) {
        setFieldErrors({
          carrier: err.fields?.carrier,
          trackingCode: err.fields?.trackingCode,
        })
        setSubmitError(err.message || 'Dữ liệu xuất kho không hợp lệ.')
      } else if (err instanceof ApiError) {
        setSubmitError(err.message || 'Không thể bàn giao vận chuyển. Vui lòng thử lại.')
      } else if (err instanceof Error && err.message) {
        setSubmitError(err.message)
      } else {
        setSubmitError('Không thể bàn giao vận chuyển. Vui lòng thử lại.')
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ship-order-dialog-title"
    >
      <div
        className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
        onClick={() => !isPending && onOpenChange(false)}
        aria-hidden="true"
      />

      <div className="relative z-50 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <h2 id="ship-order-dialog-title" className="text-base font-bold text-slate-900">
                Xuất kho & Bàn giao vận chuyển
              </h2>
              <p className="text-xs text-slate-500">Đơn hàng #{orderId}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Đóng hộp thoại xuất kho"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit} className="mt-5 space-y-4">
          {submitError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="ship-carrier" required>
              Đơn vị vận chuyển
            </Label>
            <Input
              id="ship-carrier"
              value={carrier}
              onChange={(e) => {
                setCarrier(e.target.value)
                setFieldErrors((prev) => ({ ...prev, carrier: undefined }))
              }}
              placeholder="Ví dụ: GHN, GHTK, Viettel Post..."
              aria-invalid={Boolean(fieldErrors.carrier)}
            />
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {CARRIER_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setCarrier(suggestion)
                    setFieldErrors((prev) => ({ ...prev, carrier: undefined }))
                  }}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    carrier === suggestion
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {suggestion}
                </button>
              ))}
            </div>
            {fieldErrors.carrier && (
              <p className="text-xs text-rose-600">{fieldErrors.carrier}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ship-tracking-code" required>
              Mã vận đơn
            </Label>
            <Input
              id="ship-tracking-code"
              value={trackingCode}
              onChange={(e) => {
                setTrackingCode(e.target.value)
                setFieldErrors((prev) => ({ ...prev, trackingCode: undefined }))
              }}
              placeholder="Ví dụ: GHN-123456"
              className="font-mono"
              aria-invalid={Boolean(fieldErrors.trackingCode)}
            />
            <p className="text-[11px] text-slate-500">
              Từ 3–64 ký tự gồm chữ, số, dấu gạch ngang (-) hoặc gạch dưới (_).
            </p>
            {fieldErrors.trackingCode && (
              <p className="text-xs text-rose-600">{fieldErrors.trackingCode}</p>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              Hủy
            </Button>
            <Button type="submit" variant="primary" isLoading={isPending}>
              <Truck className="h-4 w-4 mr-1.5" />
              Xác nhận xuất kho
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
