import React from 'react'
import { ArrowDown, ArrowUp, Plus, Smartphone, Trash2 } from 'lucide-react'
import type { SpecGroup } from '@/api/types'
import {
  applyPhoneSpecsPreset,
  MAX_SPEC_GROUPS,
  MAX_SPEC_ITEMS_PER_GROUP,
} from '@/lib/validations/product'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface ProductSpecsEditorProps {
  specs: SpecGroup[]
  onChange: (specs: SpecGroup[]) => void
  errors?: Record<string, string>
  disabled?: boolean
}

/**
 * Structured product specifications editor supporting groups, rows, reordering, and phone preset.
 */
export const ProductSpecsEditor: React.FC<ProductSpecsEditorProps> = ({
  specs,
  onChange,
  errors = {},
  disabled = false,
}) => {
  const handleApplyPhonePreset = () => {
    if (disabled) return
    onChange(applyPhoneSpecsPreset(specs))
  }

  const handleAddGroup = () => {
    if (disabled || specs.length >= MAX_SPEC_GROUPS) return
    onChange([...specs, { group: '', items: [{ label: '', value: '' }] }])
  }

  const handleRemoveGroup = (gIdx: number) => {
    if (disabled) return
    onChange(specs.filter((_, idx) => idx !== gIdx))
  }

  const handleMoveGroup = (gIdx: number, direction: -1 | 1) => {
    if (disabled) return
    const target = gIdx + direction
    if (target < 0 || target >= specs.length) return
    const next = [...specs]
    const [moved] = next.splice(gIdx, 1)
    next.splice(target, 0, moved)
    onChange(next)
  }

  const handleGroupNameChange = (gIdx: number, groupName: string) => {
    if (disabled) return
    onChange(specs.map((g, idx) => (idx === gIdx ? { ...g, group: groupName } : g)))
  }

  const handleAddItem = (gIdx: number) => {
    if (disabled) return
    const group = specs[gIdx]
    if (!group || group.items.length >= MAX_SPEC_ITEMS_PER_GROUP) return
    onChange(
      specs.map((g, idx) =>
        idx === gIdx ? { ...g, items: [...g.items, { label: '', value: '' }] } : g
      )
    )
  }

  const handleRemoveItem = (gIdx: number, iIdx: number) => {
    if (disabled) return
    onChange(
      specs.map((g, idx) =>
        idx === gIdx ? { ...g, items: g.items.filter((_, itemIdx) => itemIdx !== iIdx) } : g
      )
    )
  }

  const handleMoveItem = (gIdx: number, iIdx: number, direction: -1 | 1) => {
    if (disabled) return
    const group = specs[gIdx]
    if (!group) return
    const target = iIdx + direction
    if (target < 0 || target >= group.items.length) return
    const nextItems = [...group.items]
    const [moved] = nextItems.splice(iIdx, 1)
    nextItems.splice(target, 0, moved)
    onChange(specs.map((g, idx) => (idx === gIdx ? { ...g, items: nextItems } : g)))
  }

  const handleItemFieldChange = (
    gIdx: number,
    iIdx: number,
    field: 'label' | 'value',
    val: string
  ) => {
    if (disabled) return
    onChange(
      specs.map((g, idx) =>
        idx === gIdx
          ? {
              ...g,
              items: g.items.map((item, itemIdx) =>
                itemIdx === iIdx ? { ...item, [field]: val } : item
              ),
            }
          : g
      )
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Tối đa {MAX_SPEC_GROUPS} nhóm, mỗi nhóm tối đa {MAX_SPEC_ITEMS_PER_GROUP} thông số.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={handleApplyPhonePreset}
          >
            <Smartphone className="h-4 w-4 mr-1.5 text-blue-600" />
            Áp dụng mẫu Điện thoại
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled || specs.length >= MAX_SPEC_GROUPS}
            onClick={handleAddGroup}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Thêm nhóm thông số
          </Button>
        </div>
      </div>

      {errors['specs'] && (
        <p className="text-xs text-rose-600 font-medium" role="alert">
          {errors['specs']}
        </p>
      )}

      {specs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-sm text-slate-500">
          Chưa có thông số kỹ thuật. Nhấn &ldquo;Áp dụng mẫu Điện thoại&rdquo; để khởi tạo 6 nhóm chuẩn hoặc thêm nhóm thủ công.
        </div>
      ) : (
        <div className="space-y-4">
          {specs.map((group, gIdx) => {
            const groupNameError =
              errors[`specs.${gIdx}.group`] || errors[`specs[${gIdx}].group`]
            const groupItemsError =
              errors[`specs.${gIdx}.items`] || errors[`specs[${gIdx}].items`]

            return (
              <div
                key={`spec-group-${gIdx}`}
                className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-3"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 space-y-1">
                    <Label
                      htmlFor={`spec-group-name-${gIdx}`}
                      className="text-xs font-medium text-slate-600"
                    >
                      Nhóm {gIdx + 1}
                    </Label>
                    <Input
                      id={`spec-group-name-${gIdx}`}
                      aria-label={`Tên nhóm thông số ${gIdx + 1}`}
                      placeholder="Tên nhóm (vd: Màn hình)"
                      value={group.group}
                      disabled={disabled}
                      error={Boolean(groupNameError)}
                      onChange={(e) => handleGroupNameChange(gIdx, e.target.value)}
                    />
                    {groupNameError && (
                      <p className="text-xs text-rose-600 font-medium" role="alert">
                        {groupNameError}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 pt-5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Di chuyển nhóm ${gIdx + 1} lên`}
                      disabled={disabled || gIdx === 0}
                      onClick={() => handleMoveGroup(gIdx, -1)}
                      className="h-9 w-9 p-0"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Di chuyển nhóm ${gIdx + 1} xuống`}
                      disabled={disabled || gIdx === specs.length - 1}
                      onClick={() => handleMoveGroup(gIdx, 1)}
                      className="h-9 w-9 p-0"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Xóa nhóm ${gIdx + 1}`}
                      disabled={disabled}
                      onClick={() => handleRemoveGroup(gIdx)}
                      className="h-9 w-9 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {groupItemsError && (
                  <p className="text-xs text-rose-600 font-medium" role="alert">
                    {groupItemsError}
                  </p>
                )}

                <div className="space-y-2">
                  {group.items.map((item, iIdx) => {
                    const labelError =
                      errors[`specs.${gIdx}.items.${iIdx}.label`] ||
                      errors[`specs[${gIdx}].items[${iIdx}].label`]
                    const valueError =
                      errors[`specs.${gIdx}.items.${iIdx}.value`] ||
                      errors[`specs[${gIdx}].items[${iIdx}].value`]

                    return (
                      <div
                        key={`spec-item-${gIdx}-${iIdx}`}
                        className="rounded-lg bg-white border border-slate-200/80 p-2.5 space-y-1.5"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_auto] gap-2 items-center">
                          <Input
                            aria-label={`Nhãn thông số ${gIdx + 1}.${iIdx + 1}`}
                            placeholder="Tên thông số (vd: Chipset)"
                            value={item.label}
                            disabled={disabled}
                            error={Boolean(labelError)}
                            onChange={(e) =>
                              handleItemFieldChange(gIdx, iIdx, 'label', e.target.value)
                            }
                          />
                          <Input
                            aria-label={`Giá trị thông số ${gIdx + 1}.${iIdx + 1}`}
                            placeholder="Giá trị thông số (vd: Apple A18 Pro)"
                            value={item.value}
                            disabled={disabled}
                            error={Boolean(valueError)}
                            onChange={(e) =>
                              handleItemFieldChange(gIdx, iIdx, 'value', e.target.value)
                            }
                          />
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Di chuyển dòng ${gIdx + 1}.${iIdx + 1} lên`}
                              disabled={disabled || iIdx === 0}
                              onClick={() => handleMoveItem(gIdx, iIdx, -1)}
                              className="h-8 w-8 p-0"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Di chuyển dòng ${gIdx + 1}.${iIdx + 1} xuống`}
                              disabled={disabled || iIdx === group.items.length - 1}
                              onClick={() => handleMoveItem(gIdx, iIdx, 1)}
                              className="h-8 w-8 p-0"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Xóa dòng ${gIdx + 1}.${iIdx + 1}`}
                              disabled={disabled}
                              onClick={() => handleRemoveItem(gIdx, iIdx)}
                              className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        {(labelError || valueError) && (
                          <div className="space-y-0.5">
                            {labelError && (
                              <p className="text-xs text-rose-600 font-medium" role="alert">
                                {labelError}
                              </p>
                            )}
                            {valueError && (
                              <p className="text-xs text-rose-600 font-medium" role="alert">
                                {valueError}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled || group.items.length >= MAX_SPEC_ITEMS_PER_GROUP}
                    onClick={() => handleAddItem(gIdx)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Thêm dòng thông số
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
