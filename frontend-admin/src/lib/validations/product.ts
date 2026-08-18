import { z } from 'zod'

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
    imageUrls: z.string().default(''),
    hasVariants: z.boolean().default(false),
    optionGroups: z.array(optionGroupSchema).default([]),
    variants: z.array(variantItemSchema).default([]),
  })
  .superRefine((data, ctx) => {
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
