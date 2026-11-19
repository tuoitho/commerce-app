import { z } from 'zod'
import type { SpecGroup } from '@/api/types'

export const MAX_PRODUCT_IMAGE_BYTES = 10 * 1024 * 1024
export const ALLOWED_PRODUCT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const PRODUCT_MEDIA_URL_REGEX =
  /^\/media\/products\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/

export const MAX_SPEC_GROUPS = 12
export const MAX_SPEC_ITEMS_PER_GROUP = 20
export const MAX_SPEC_GROUP_LEN = 80
export const MAX_SPEC_LABEL_LEN = 80
export const MAX_SPEC_VALUE_LEN = 300

export const PHONE_SPEC_PRESET: ReadonlyArray<{
  group: string
  labels: readonly string[]
}> = [
  {
    group: 'Màn hình',
    labels: ['Kích thước & Tấm nền', 'Độ phân giải', 'Tần số quét'],
  },
  {
    group: 'Hiệu năng & Chipset',
    labels: ['Chipset', 'RAM', 'Hệ điều hành'],
  },
  {
    group: 'Camera',
    labels: ['Camera sau', 'Camera trước', 'Quay video'],
  },
  {
    group: 'Pin & Sạc',
    labels: ['Dung lượng pin', 'Công nghệ sạc'],
  },
  {
    group: 'Kết nối',
    labels: ['Mạng di động', 'Wi-Fi & Bluetooth', 'Cổng kết nối'],
  },
  {
    group: 'Thiết kế & Độ bền',
    labels: ['Chất liệu khung', 'Kháng nước/bụi', 'Trọng lượng'],
  },
]

export function isValidProductImageUrl(raw: string): boolean {
  const trimmed = raw.trim()
  if (!trimmed) return false
  if (trimmed.startsWith('/media/products/')) {
    return PRODUCT_MEDIA_URL_REGEX.test(trimmed)
  }
  try {
    const parsed = new URL(trimmed)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname !== ''
  } catch {
    return false
  }
}

export function validateProductImageFile(file: File): string | null {
  const mime = (file.type || '').toLowerCase()
  if (!ALLOWED_PRODUCT_IMAGE_TYPES.includes(mime as (typeof ALLOWED_PRODUCT_IMAGE_TYPES)[number])) {
    return 'Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP'
  }
  if (file.size <= 0 || file.size > MAX_PRODUCT_IMAGE_BYTES) {
    return 'Ảnh sản phẩm phải có dung lượng từ 1 byte đến tối đa 10 MB'
  }
  return null
}

export function applyPhoneSpecsPreset(existing: SpecGroup[]): SpecGroup[] {
  const result: SpecGroup[] = existing.map((group) => ({
    group: group.group,
    items: group.items.map((item) => ({ ...item })),
  }))

  const groupIndexByLowerName = new Map<string, number>()
  result.forEach((group, idx) => {
    const key = group.group.trim().toLowerCase()
    if (key && !groupIndexByLowerName.has(key)) {
      groupIndexByLowerName.set(key, idx)
    }
  })

  for (const preset of PHONE_SPEC_PRESET) {
    const key = preset.group.toLowerCase()
    const existingIdx = groupIndexByLowerName.get(key)

    if (existingIdx !== undefined) {
      const targetGroup = result[existingIdx]
      const existingLabels = new Set(
        targetGroup.items.map((item) => item.label.trim().toLowerCase()).filter(Boolean)
      )
      for (const label of preset.labels) {
        if (targetGroup.items.length >= MAX_SPEC_ITEMS_PER_GROUP) break
        if (!existingLabels.has(label.toLowerCase())) {
          targetGroup.items.push({ label, value: '' })
          existingLabels.add(label.toLowerCase())
        }
      }
    } else if (result.length < MAX_SPEC_GROUPS) {
      groupIndexByLowerName.set(key, result.length)
      result.push({
        group: preset.group,
        items: preset.labels.map((label) => ({ label, value: '' })),
      })
    }
  }

  return result
}

export const specItemSchema = z.object({
  label: z.string(),
  value: z.string(),
})

export const specGroupSchema = z.object({
  group: z.string(),
  items: z.array(specItemSchema).default([]),
})

export const optionValueSchema = z.object({
  id: z.string(),
  label: z.string().trim().min(1, 'Giá trị phân loại không được để trống'),
  position: z.number().optional(),
})

export const optionGroupSchema = z.object({
  id: z.string(),
  label: z.string().trim().min(1, 'Tên nhóm thuộc tính không được để trống'),
  position: z.number().optional(),
  values: z.array(optionValueSchema).min(1, 'Nhóm thuộc tính phải có ít nhất một giá trị'),
})

export const variantItemSchema = z.object({
  id: z.string().optional(),
  optionValueIds: z.record(z.string(), z.string()),
  combinationKey: z.string().optional(),
  combinationLabel: z.string().optional(),
  priceVND: z.string().default(''),
  stockQuantity: z.union([z.number(), z.string()]).default(0),
  active: z.boolean().default(true),
})

export const productFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Tên sản phẩm không được để trống'),
    model: z.string().default(''),
    brand: z.string().trim().min(1, 'Thương hiệu không được để trống'),
    categoryId: z.string().trim().min(1, 'Vui lòng chọn danh mục'),
    price: z.string().default(''),
    stockQuantity: z.union([z.number(), z.string()]).default(0),
    description: z.string().default(''),
    featured: z.boolean().default(false),
    imageUrls: z.union([z.array(z.string()), z.string()]).default([]),
    hasVariants: z.boolean().default(false),
    optionGroups: z.array(optionGroupSchema).default([]),
    variants: z.array(variantItemSchema).default([]),
    specs: z.array(specGroupSchema).default([]),
  })
  .superRefine((data, ctx) => {
    const imageUrlList =
      typeof data.imageUrls === 'string'
        ? data.imageUrls
            .split(/[\n,]+/)
            .map((u) => u.trim())
            .filter(Boolean)
        : data.imageUrls

    imageUrlList.forEach((rawUrl, idx) => {
      if (!isValidProductImageUrl(rawUrl)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Đường dẫn ảnh phải là URL http(s) hợp lệ hoặc /media/products/...',
          path: Array.isArray(data.imageUrls) ? ['imageUrls', idx] : ['imageUrls'],
        })
      }
    })

    if (data.specs.length > MAX_SPEC_GROUPS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tối đa 12 nhóm thông số kỹ thuật',
        path: ['specs'],
      })
    } else {
      const seenSpecGroups = new Set<string>()
      data.specs.forEach((specGroup, gIdx) => {
        const trimmedGroup = specGroup.group.trim()
        const groupLen = Array.from(trimmedGroup).length
        if (groupLen === 0 || groupLen > MAX_SPEC_GROUP_LEN) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Tên nhóm thông số phải dài từ 1 đến 80 ký tự',
            path: ['specs', gIdx, 'group'],
          })
        } else {
          const lowerGroup = trimmedGroup.toLowerCase()
          if (seenSpecGroups.has(lowerGroup)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Tên nhóm thông số không được trùng nhau',
              path: ['specs', gIdx, 'group'],
            })
          }
          seenSpecGroups.add(lowerGroup)
        }

        if (specGroup.items.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Mỗi nhóm thông số phải có ít nhất một dòng',
            path: ['specs', gIdx, 'items'],
          })
        } else if (specGroup.items.length > MAX_SPEC_ITEMS_PER_GROUP) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Mỗi nhóm tối đa 20 dòng thông số',
            path: ['specs', gIdx, 'items'],
          })
        } else {
          specGroup.items.forEach((item, iIdx) => {
            const labelLen = Array.from(item.label.trim()).length
            const valueLen = Array.from(item.value.trim()).length
            if (labelLen === 0 || labelLen > MAX_SPEC_LABEL_LEN) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Nhãn thông số phải dài từ 1 đến 80 ký tự',
                path: ['specs', gIdx, 'items', iIdx, 'label'],
              })
            }
            if (valueLen === 0 || valueLen > MAX_SPEC_VALUE_LEN) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Giá trị thông số phải dài từ 1 đến 300 ký tự',
                path: ['specs', gIdx, 'items', iIdx, 'value'],
              })
            }
          })
        }
      })
    }
    if (!data.hasVariants) {
      // Simple mode: price and stock are required
      const priceStr = (data.price ?? '').trim()
      if (!priceStr) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Giá sản phẩm không được để trống',
          path: ['price'],
        })
      } else {
        const num = Number(priceStr)
        if (isNaN(num) || num < 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Giá phải lớn hơn hoặc bằng 0',
            path: ['price'],
          })
        }
      }

      const stockVal = data.stockQuantity
      const stockNum = typeof stockVal === 'string' ? (stockVal === '' ? 0 : Number(stockVal)) : stockVal
      if (isNaN(stockNum) || stockNum < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Số lượng tồn kho không được âm',
          path: ['stockQuantity'],
        })
      }
    } else {
      // Variant mode: optionGroups and variants are required
      if (!data.optionGroups || data.optionGroups.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Vui lòng thêm ít nhất một nhóm phân loại',
          path: ['optionGroups'],
        })
      } else {
        data.optionGroups.forEach((group, gIdx) => {
          if (!group.label || group.label.trim() === '') {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Tên nhóm thuộc tính không được để trống',
              path: ['optionGroups', gIdx, 'label'],
            })
          }

          if (!group.values || group.values.length === 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Nhóm thuộc tính phải có ít nhất một giá trị',
              path: ['optionGroups', gIdx, 'values'],
            })
          } else {
            const seenValues = new Set<string>()
            group.values.forEach((val, vIdx) => {
              const trimmed = val.label.trim().toLowerCase()
              if (!trimmed) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: 'Giá trị phân loại không được để trống',
                  path: ['optionGroups', gIdx, 'values', vIdx, 'label'],
                })
              } else if (seenValues.has(trimmed)) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: 'Giá trị phân loại không được trùng lặp',
                  path: ['optionGroups', gIdx, 'values', vIdx, 'label'],
                })
              } else {
                seenValues.add(trimmed)
              }
            })
          }
        })
      }

      if (!data.variants || data.variants.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Danh sách biến thể không được để trống',
          path: ['variants'],
        })
      } else {
        data.variants.forEach((v, vIdx) => {
          const rawPrice = (v.priceVND ?? '').trim()
          if (!rawPrice) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Giá biến thể không được để trống',
              path: ['variants', vIdx, 'priceVND'],
            })
          } else {
            const pNum = Number(rawPrice)
            if (isNaN(pNum) || pNum < 0) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Giá biến thể phải là số không âm',
                path: ['variants', vIdx, 'priceVND'],
              })
            }
          }

          const sVal = v.stockQuantity
          const sNum = typeof sVal === 'string' ? (sVal === '' ? 0 : Number(sVal)) : sVal
          if (isNaN(sNum) || sNum < 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Số lượng tồn kho không được âm',
              path: ['variants', vIdx, 'stockQuantity'],
            })
          }
        })
      }
    }
  })

export type ProductFormInput = z.input<typeof productFormSchema>
export type ProductFormValues = z.output<typeof productFormSchema>
