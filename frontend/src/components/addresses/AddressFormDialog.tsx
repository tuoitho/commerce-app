import { useEffect, useState, useCallback } from 'react'
import { addressesApi } from '@/api/addresses'
import { areasApi } from '@/api/areas'
import {
  ApiError,
  type Address,
  type AddressInput,
  type Province,
  type Ward,
} from '@/api/types'
import { useToast } from '@/context/ToastContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface AddressFormData {
  recipientName: string
  phone: string
  provinceCode: number | ''
  wardCode: number | ''
  detailAddress: string
  isDefault: boolean
}

const emptyFormData: AddressFormData = {
  recipientName: '',
  phone: '',
  provinceCode: '',
  wardCode: '',
  detailAddress: '',
  isDefault: false,
}

interface AddressFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingAddress: Address | null
  defaultNewAddress?: boolean
  onSaved: (saved: Address, isEdit: boolean) => Promise<void> | void
}

export function AddressFormDialog({
  open,
  onOpenChange,
  editingAddress,
  defaultNewAddress = false,
  onSaved,
}: AddressFormDialogProps) {
  const { success, error: toastError } = useToast()

  const [formData, setFormData] = useState<AddressFormData>(emptyFormData)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)

  const [provinces, setProvinces] = useState<Province[]>([])
  const [wards, setWards] = useState<Ward[]>([])
  const [wardsLoading, setWardsLoading] = useState(false)

  const fetchWardsForProvince = useCallback(
    async (provinceCode: number) => {
      try {
        setWardsLoading(true)
        const data = await areasApi.listWards(provinceCode)
        setWards(data)
      } catch {
        setWards([])
        toastError('Lỗi tải phường/xã', 'Không thể tải danh sách phường/xã.')
      } finally {
        setWardsLoading(false)
      }
    },
    [toastError]
  )

  useEffect(() => {
    if (provinces.length > 0) return
    let active = true
    areasApi
      .listProvinces()
      .then((data) => {
        if (active) setProvinces(data)
      })
      .catch(() => {
        // Retryable when reopening
      })
    return () => {
      active = false
    }
  }, [open, provinces.length])

  useEffect(() => {
    if (!open) return
    setFormErrors({})
    if (editingAddress) {
      setFormData({
        recipientName: editingAddress.recipientName,
        phone: editingAddress.phone,
        provinceCode: editingAddress.provinceCode,
        wardCode: editingAddress.wardCode,
        detailAddress: editingAddress.detailAddress,
        isDefault: editingAddress.isDefault,
      })
      fetchWardsForProvince(editingAddress.provinceCode)
    } else {
      setFormData({
        ...emptyFormData,
        isDefault: defaultNewAddress,
      })
      setWards([])
    }
  }, [open, editingAddress, defaultNewAddress, fetchWardsForProvince])

  const handleProvinceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    const code = val ? Number(val) : ''
    setFormData((prev) => ({
      ...prev,
      provinceCode: code,
      wardCode: '',
    }))
    setFormErrors((prev) => {
      const next = { ...prev }
      delete next.provinceCode
      delete next.wardCode
      return next
    })

    if (code) {
      fetchWardsForProvince(code)
    } else {
      setWards([])
    }
  }

  const validate = (): boolean => {
    const errors: Record<string, string> = {}
    if (!formData.recipientName.trim()) {
      errors.recipientName = 'Vui lòng nhập họ và tên người nhận'
    }
    if (!formData.phone.trim()) {
      errors.phone = 'Vui lòng nhập số điện thoại'
    } else if (!/^0\d{9,10}$/.test(formData.phone.trim())) {
      errors.phone = 'Số điện thoại không hợp lệ (10-11 chữ số, bắt đầu bằng 0)'
    }
    if (!formData.provinceCode) {
      errors.provinceCode = 'Vui lòng chọn Tỉnh/Thành phố'
    }
    if (!formData.wardCode) {
      errors.wardCode = 'Vui lòng chọn Phường/Xã'
    }
    if (!formData.detailAddress.trim()) {
      errors.detailAddress = 'Vui lòng nhập địa chỉ chi tiết'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    try {
      setIsSaving(true)
      const payload: AddressInput = {
        recipientName: formData.recipientName.trim(),
        phone: formData.phone.trim(),
        provinceCode: Number(formData.provinceCode),
        wardCode: Number(formData.wardCode),
        detailAddress: formData.detailAddress.trim(),
        isDefault: formData.isDefault,
      }

      if (editingAddress) {
        const updated = await addressesApi.updateAddress(editingAddress.id, payload)
        success('Cập nhật thành công', 'Địa chỉ giao hàng đã được cập nhật.')
        onOpenChange(false)
        await onSaved(updated, true)
      } else {
        const created = await addressesApi.createAddress(payload)
        success('Thêm thành công', 'Địa chỉ giao hàng mới đã được lưu.')
        onOpenChange(false)
        await onSaved(created, false)
      }
    } catch (err: unknown) {
      if (err instanceof ApiError && err.fields) {
        const mapped: Record<string, string> = {}
        if (err.fields.recipient_name) mapped.recipientName = err.fields.recipient_name
        if (err.fields.recipientName) mapped.recipientName = err.fields.recipientName
        if (err.fields.phone) mapped.phone = err.fields.phone
        if (err.fields.province_code) mapped.provinceCode = err.fields.province_code
        if (err.fields.provinceCode) mapped.provinceCode = err.fields.provinceCode
        if (err.fields.ward_code) mapped.wardCode = err.fields.ward_code
        if (err.fields.wardCode) mapped.wardCode = err.fields.wardCode
        if (err.fields.detail_address) mapped.detailAddress = err.fields.detail_address
        if (err.fields.detailAddress) mapped.detailAddress = err.fields.detailAddress
        setFormErrors(mapped)
      } else if (err instanceof ApiError) {
        toastError('Không thể lưu địa chỉ', err.message)
      } else {
        toastError('Lỗi', 'Có lỗi xảy ra khi lưu địa chỉ.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editingAddress ? 'Chỉnh sửa địa chỉ nhận hàng' : 'Thêm địa chỉ nhận hàng mới'}
          </DialogTitle>
          <DialogDescription>
            Điền thông tin người nhận và địa chỉ giao hàng chính xác để chúng tôi giao hàng đúng hẹn.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="recipientName" required>
              Họ và tên người nhận
            </Label>
            <Input
              id="recipientName"
              placeholder="VD: Nguyễn Văn A"
              value={formData.recipientName}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, recipientName: e.target.value }))
              }
              error={Boolean(formErrors.recipientName)}
            />
            {formErrors.recipientName && (
              <p className="text-xs text-rose-600">{formErrors.recipientName}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone" required>
              Số điện thoại
            </Label>
            <Input
              id="phone"
              type="tel"
              placeholder="VD: 0987654321"
              value={formData.phone}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, phone: e.target.value }))
              }
              error={Boolean(formErrors.phone)}
            />
            {formErrors.phone && (
              <p className="text-xs text-rose-600">{formErrors.phone}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="provinceCode" required>
                Tỉnh / Thành phố
              </Label>
              <Select
                id="provinceCode"
                value={formData.provinceCode}
                onChange={handleProvinceChange}
                error={Boolean(formErrors.provinceCode)}
              >
                <option value="">Chọn Tỉnh / Thành phố</option>
                {provinces.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </Select>
              {formErrors.provinceCode && (
                <p className="text-xs text-rose-600">{formErrors.provinceCode}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wardCode" required>
                Phường / Xã
              </Label>
              <Select
                id="wardCode"
                value={formData.wardCode}
                onChange={(e) => {
                  const val = e.target.value
                  setFormData((prev) => ({
                    ...prev,
                    wardCode: val ? Number(val) : '',
                  }))
                  setFormErrors((prev) => {
                    const next = { ...prev }
                    delete next.wardCode
                    return next
                  })
                }}
                disabled={!formData.provinceCode || wardsLoading}
                error={Boolean(formErrors.wardCode)}
              >
                <option value="">
                  {wardsLoading
                    ? 'Đang tải...'
                    : !formData.provinceCode
                    ? 'Chọn tỉnh trước'
                    : 'Chọn Phường / Xã'}
                </option>
                {wards.map((w) => (
                  <option key={w.code} value={w.code}>
                    {w.name}
                  </option>
                ))}
              </Select>
              {formErrors.wardCode && (
                <p className="text-xs text-rose-600">{formErrors.wardCode}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="detailAddress" required>
              Địa chỉ chi tiết (Số nhà, tên đường, tòa nhà...)
            </Label>
            <Input
              id="detailAddress"
              placeholder="VD: Số 123 Đường Cầu Giấy"
              value={formData.detailAddress}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, detailAddress: e.target.value }))
              }
              error={Boolean(formErrors.detailAddress)}
            />
            {formErrors.detailAddress && (
              <p className="text-xs text-rose-600">{formErrors.detailAddress}</p>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="isDefault"
              checked={formData.isDefault}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, isDefault: Boolean(checked) }))
              }
            />
            <Label htmlFor="isDefault" className="cursor-pointer text-xs font-normal text-zinc-700">
              Đặt làm địa chỉ nhận hàng mặc định
            </Label>
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
              className="rounded-xl"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSaving}
              disabled={isSaving}
              className="rounded-xl font-semibold"
            >
              {editingAddress ? 'Cập nhật địa chỉ' : 'Lưu địa chỉ'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
