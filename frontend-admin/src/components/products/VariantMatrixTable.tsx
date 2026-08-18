import React, { useState } from 'react'
import { Layers, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  type VariantMatrixRow,
  applyBulkValues,
} from '@/lib/cartesian'

export interface VariantMatrixTableProps {
  variants: VariantMatrixRow[]
  onChange: (variants: VariantMatrixRow[]) => void
  errors?: Record<string, string>
  disabled?: boolean
}

export const VariantMatrixTable: React.FC<VariantMatrixTableProps> = ({
  variants,
  onChange,
  errors = {},
  disabled = false,
}) => {
  const [bulkPrice, setBulkPrice] = useState('')
  const [bulkStock, setBulkStock] = useState('')

  const handleBulkApply = () => {
    if (disabled || (!bulkPrice.trim() && !bulkStock.trim())) return

    const parsedStock = bulkStock.trim() !== '' ? Number(bulkStock) : undefined
    const updated = applyBulkValues(variants, {
      priceVND: bulkPrice.trim() !== '' ? bulkPrice : undefined,
      stockQuantity: parsedStock !== undefined && !isNaN(parsedStock) ? Math.max(0, parsedStock) : undefined,
    })

    onChange(updated)
  }

  const handlePriceChange = (index: number, value: string) => {
    if (disabled) return
    const updated = [...variants]
    updated[index] = { ...updated[index], priceVND: value }
    onChange(updated)
  }

  const handleStockChange = (index: number, value: string) => {
    if (disabled) return
    const parsed = parseInt(value, 10)
    const updated = [...variants]
    updated[index] = {
      ...updated[index],
      stockQuantity: isNaN(parsed) ? 0 : Math.max(0, parsed),
    }
    onChange(updated)
  }

  const handleActiveToggle = (index: number) => {
    if (disabled) return
    const updated = [...variants]
    updated[index] = {
      ...updated[index],
      active: !updated[index].active,
    }
    onChange(updated)
  }

  if (variants.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center bg-slate-50/50 text-slate-500">
        <Layers className="w-10 h-10 mx-auto text-slate-400 mb-2" />
        <p className="text-sm font-medium text-slate-700">Chưa có phân loại hàng</p>
        <p className="text-xs text-slate-500 mt-1">
          Vui lòng thêm các nhóm phân loại và giá trị ở trên để tạo bảng ma trận biến thể.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Bulk Apply Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50/80">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
            Áp dụng hàng loạt
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="w-36">
            <Input
              type="text"
              placeholder="Giá chung (VND)"
              value={bulkPrice}
              disabled={disabled}
              onChange={(e) => setBulkPrice(e.target.value)}
              className="h-8 text-xs bg-white"
            />
          </div>
          <div className="w-28">
            <Input
              type="number"
              min="0"
              placeholder="Kho chung"
              value={bulkStock}
              disabled={disabled}
              onChange={(e) => setBulkStock(e.target.value)}
              className="h-8 text-xs bg-white"
            />
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={disabled || (!bulkPrice.trim() && !bulkStock.trim())}
            onClick={handleBulkApply}
            className="h-8 px-3 text-xs"
          >
            Áp dụng cho tất cả phân loại
          </Button>
        </div>
      </div>

      {/* Matrix Table */}
      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[35%] min-w-[160px]">Phân loại hàng</TableHead>
              <TableHead className="w-[30%] min-w-[160px]">Giá bán (VND) <span className="text-rose-500">*</span></TableHead>
              <TableHead className="w-[20%] min-w-[120px]">Kho hàng <span className="text-rose-500">*</span></TableHead>
              <TableHead className="w-[15%] min-w-[90px] text-center">Kích hoạt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((row, idx) => {
              const priceError =
                errors[`variants.${idx}.priceVND`] ||
                errors[`variants.${idx}.priceVnd`] ||
                errors[`variants[${idx}].priceVND`] ||
                errors[`variants[${idx}].priceVnd`]
              const stockError =
                errors[`variants.${idx}.stockQuantity`] ||
                errors[`variants[${idx}].stockQuantity`]

              return (
                <TableRow key={row.combinationKey || row.id || idx}>
                  <TableCell className="font-medium text-slate-800">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-medium text-xs bg-slate-50 border-slate-200">
                        {row.combinationLabel}
                      </Badge>
                      {!row.active && (
                        <span className="text-[11px] text-slate-400 font-normal">
                          (Tắt)
                        </span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="space-y-1">
                      <Input
                        type="text"
                        placeholder="Nhập giá (VND)"
                        value={row.priceVND}
                        disabled={disabled}
                        error={Boolean(priceError)}
                        onChange={(e) => handlePriceChange(idx, e.target.value)}
                        className="h-9 text-sm"
                      />
                      {priceError && (
                        <p className="text-xs text-rose-500 font-medium">{priceError}</p>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="space-y-1">
                      <Input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={row.stockQuantity === 0 ? '0' : row.stockQuantity || ''}
                        disabled={disabled}
                        error={Boolean(stockError)}
                        onChange={(e) => handleStockChange(idx, e.target.value)}
                        className="h-9 text-sm"
                      />
                      {stockError && (
                        <p className="text-xs text-rose-500 font-medium">{stockError}</p>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="text-center">
                    <div className="flex justify-center items-center">
                      <Switch
                        checked={row.active}
                        disabled={disabled}
                        onChange={() => handleActiveToggle(idx)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
