import React, { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { OptionGroupItem } from '@/lib/cartesian'

export interface OptionGroupBuilderProps {
  groups: OptionGroupItem[]
  onChange: (groups: OptionGroupItem[]) => void
  maxGroups?: number
  errors?: Record<string, string>
  disabled?: boolean
}

export const OptionGroupBuilder: React.FC<OptionGroupBuilderProps> = ({
  groups,
  onChange,
  maxGroups = 3,
  errors = {},
  disabled = false,
}) => {
  const [draftInputs, setDraftInputs] = useState<Record<string, string>>({})
  const [duplicateErrors, setDuplicateErrors] = useState<Record<string, string>>({})

  const handleAddGroup = () => {
    if (groups.length >= maxGroups || disabled) return
    const newGroup: OptionGroupItem = {
      id: crypto.randomUUID(),
      label: '',
      values: [],
    }
    onChange([...groups, newGroup])
  }

  const handleRemoveGroup = (groupId: string) => {
    if (disabled) return
    const updated = groups.filter((g) => g.id !== groupId)
    onChange(updated)
  }

  const handleLabelChange = (groupId: string, newLabel: string) => {
    if (disabled) return
    const updated = groups.map((g) => (g.id === groupId ? { ...g, label: newLabel } : g))
    onChange(updated)
  }

  const handleAddValue = (groupId: string) => {
    if (disabled) return
    const rawText = draftInputs[groupId] || ''
    const trimmed = rawText.trim()
    if (!trimmed) return

    const group = groups.find((g) => g.id === groupId)
    if (!group) return

    const exists = group.values.some(
      (v) => v.label.trim().toLowerCase() === trimmed.toLowerCase()
    )

    if (exists) {
      setDuplicateErrors((prev) => ({
        ...prev,
        [groupId]: 'Giá trị phân loại này đã tồn tại trong nhóm',
      }))
      return
    }

    setDuplicateErrors((prev) => {
      const next = { ...prev }
      delete next[groupId]
      return next
    })

    setDraftInputs((prev) => ({ ...prev, [groupId]: '' }))

    const updated = groups.map((g) => {
      if (g.id !== groupId) return g
      return {
        ...g,
        values: [...g.values, { id: crypto.randomUUID(), label: trimmed }],
      }
    })

    onChange(updated)
  }

  const handleRemoveValue = (groupId: string, valueId: string) => {
    if (disabled) return
    const updated = groups.map((g) => {
      if (g.id !== groupId) return g
      return {
        ...g,
        values: g.values.filter((v) => v.id !== valueId),
      }
    })
    onChange(updated)
  }

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    groupId: string
  ) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      handleAddValue(groupId)
    }
  }

  return (
    <div className="space-y-4">
      {groups.map((group, index) => {
        const labelError =
          errors[`optionGroups.${index}.label`] ||
          errors[`optionGroups[${index}].label`]
        const valuesError =
          errors[`optionGroups.${index}.values`] ||
          errors[`optionGroups[${index}].values`] ||
          errors[`optionGroups.${index}`]
        const duplicateError = duplicateErrors[group.id]

        return (
          <Card key={group.id} className="border-slate-200 shadow-sm">
            <CardContent className="p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">
                  Nhóm phân loại {index + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Xóa nhóm"
                  disabled={disabled}
                  onClick={() => handleRemoveGroup(group.id)}
                  className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 -mr-2"
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Xóa nhóm
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-1 space-y-1.5">
                  <Label htmlFor={`group-label-${group.id}`} className="text-xs font-medium text-slate-600">
                    Tên nhóm phân loại <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    id={`group-label-${group.id}`}
                    placeholder="Ví dụ: Màu sắc, Dung lượng"
                    value={group.label}
                    disabled={disabled}
                    error={Boolean(labelError)}
                    onChange={(e) => handleLabelChange(group.id, e.target.value)}
                  />
                  {labelError && (
                    <p className="text-xs text-rose-500 mt-1 font-medium">{labelError}</p>
                  )}
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <Label htmlFor={`group-value-input-${group.id}`} className="text-xs font-medium text-slate-600">
                    Giá trị phân loại <span className="text-rose-500">*</span>
                  </Label>

                  {/* Value Chips container */}
                  <div className="flex flex-wrap items-center gap-1.5 min-h-10 p-2 rounded-xl border border-slate-200 bg-slate-50/50">
                    {group.values.map((val) => (
                      <Badge
                        key={val.id}
                        variant="secondary"
                        className="pl-2.5 pr-1.5 py-1 text-xs font-medium bg-white text-slate-800 border border-slate-200 shadow-2xs flex items-center gap-1"
                      >
                        <span>{val.label}</span>
                        <button
                          type="button"
                          aria-label={`Xóa giá trị ${val.label}`}
                          disabled={disabled}
                          onClick={() => handleRemoveValue(group.id, val.id)}
                          className="text-slate-400 hover:text-rose-600 rounded-full p-0.5 transition-colors cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}

                    <div className="flex items-center gap-1 flex-1 min-w-[180px]">
                      <input
                        id={`group-value-input-${group.id}`}
                        type="text"
                        placeholder={
                          group.values.length === 0
                            ? 'Nhập giá trị (ví dụ: Đen, Trắng) và nhấn Enter...'
                            : 'Nhập giá trị tiếp theo...'
                        }
                        value={draftInputs[group.id] || ''}
                        disabled={disabled}
                        onChange={(e) =>
                          setDraftInputs((prev) => ({
                            ...prev,
                            [group.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => handleKeyDown(e, group.id)}
                        className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none px-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={disabled || !(draftInputs[group.id] || '').trim()}
                        onClick={() => handleAddValue(group.id)}
                        className="h-7 px-2 text-xs bg-white"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Thêm
                      </Button>
                    </div>
                  </div>

                  {duplicateError && (
                    <p className="text-xs text-rose-500 mt-1 font-medium">{duplicateError}</p>
                  )}
                  {valuesError && (
                    <p className="text-xs text-rose-500 mt-1 font-medium">{valuesError}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}

      <div className="flex items-center justify-between pt-1">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || groups.length >= maxGroups}
          onClick={handleAddGroup}
          className="border-dashed border-slate-300 hover:border-slate-400 bg-white text-slate-700"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Thêm nhóm phân loại {groups.length > 0 && `(${groups.length}/${maxGroups})`}
        </Button>
        <span className="text-xs text-slate-500">
          Tối đa {maxGroups} nhóm thuộc tính (ví dụ: Màu sắc, Dung lượng, Phiên bản)
        </span>
      </div>
    </div>
  )
}
