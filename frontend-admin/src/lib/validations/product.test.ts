import { describe, it, expect } from 'vitest'
import { productFormSchema } from './product'

describe('productFormSchema', () => {
  describe('Simple Mode (hasVariants: false)', () => {
    it('validates a valid simple product', () => {
      const validData = {
        name: 'iPhone 15 Pro',
        model: 'A3106',
        brand: 'Apple',
        categoryId: 'cat-1',
        price: '25000000',
        stockQuantity: 10,
        description: 'Flagship phone',
        featured: false,
        imageUrls: '',
        hasVariants: false,
        optionGroups: [],
        variants: [],
      }

      const result = productFormSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it('rejects empty price or negative price in simple mode', () => {
      const emptyPrice = {
        name: 'iPhone 15 Pro',
        model: 'A3106',
        brand: 'Apple',
        categoryId: 'cat-1',
        price: '',
        stockQuantity: 10,
        hasVariants: false,
      }

      const res1 = productFormSchema.safeParse(emptyPrice)
      expect(res1.success).toBe(false)
      if (!res1.success) {
        expect(res1.error.issues.some((i) => i.path.includes('price'))).toBe(true)
      }

      const negativePrice = { ...emptyPrice, price: '-500' }
      const res2 = productFormSchema.safeParse(negativePrice)
      expect(res2.success).toBe(false)
      if (!res2.success) {
        expect(res2.error.issues.some((i) => i.message === 'Giá phải lớn hơn hoặc bằng 0')).toBe(true)
      }
    })

    it('rejects negative stock in simple mode', () => {
      const negativeStock = {
        name: 'iPhone 15 Pro',
        brand: 'Apple',
        categoryId: 'cat-1',
        price: '25000000',
        stockQuantity: -5,
        hasVariants: false,
      }

      const res = productFormSchema.safeParse(negativeStock)
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.error.issues.some((i) => i.message === 'Số lượng tồn kho không được âm')).toBe(true)
      }
    })
  })

  describe('Variant Mode (hasVariants: true)', () => {
    it('validates a valid multi-variant product without requiring simple price/stock', () => {
      const validData = {
        name: 'iPhone 15 Pro',
        model: 'A3106',
        brand: 'Apple',
        categoryId: 'cat-1',
        price: '',
        stockQuantity: 0,
        description: 'Flagship phone',
        featured: true,
        imageUrls: '',
        hasVariants: true,
        optionGroups: [
          {
            id: 'g-color',
            label: 'Màu sắc',
            position: 0,
            values: [
              { id: 'v-black', label: 'Titan Đen', position: 0 },
              { id: 'v-white', label: 'Titan Trắng', position: 1 },
            ],
          },
        ],
        variants: [
          {
            id: 'var-1',
            optionValueIds: { 'g-color': 'v-black' },
            priceVND: '28000000',
            stockQuantity: 10,
            active: true,
          },
          {
            id: 'var-2',
            optionValueIds: { 'g-color': 'v-white' },
            priceVND: '28500000',
            stockQuantity: 5,
            active: true,
          },
        ],
      }

      const result = productFormSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it('rejects variant mode when optionGroups is empty', () => {
      const data = {
        name: 'iPhone 15 Pro',
        brand: 'Apple',
        categoryId: 'cat-1',
        hasVariants: true,
        optionGroups: [],
        variants: [],
      }

      const result = productFormSchema.safeParse(data)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(
          result.error.issues.some(
            (i) => i.message === 'Vui lòng thêm ít nhất một nhóm phân loại'
          )
        ).toBe(true)
      }
    })

    it('rejects option group with empty label or empty values', () => {
      const data = {
        name: 'iPhone 15 Pro',
        brand: 'Apple',
        categoryId: 'cat-1',
        hasVariants: true,
        optionGroups: [
          {
            id: 'g-empty',
            label: '   ',
            values: [],
          },
        ],
        variants: [],
      }

      const result = productFormSchema.safeParse(data)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(
          result.error.issues.some(
            (i) => i.message === 'Tên nhóm thuộc tính không được để trống'
          )
        ).toBe(true)
        expect(
          result.error.issues.some(
            (i) => i.message === 'Nhóm thuộc tính phải có ít nhất một giá trị'
          )
        ).toBe(true)
      }
    })

    it('rejects duplicate value labels within the same option group', () => {
      const data = {
        name: 'iPhone 15 Pro',
        brand: 'Apple',
        categoryId: 'cat-1',
        hasVariants: true,
        optionGroups: [
          {
            id: 'g-color',
            label: 'Màu sắc',
            values: [
              { id: 'v1', label: 'Đen' },
              { id: 'v2', label: '  đen  ' },
            ],
          },
        ],
        variants: [
          {
            id: 'var-1',
            optionValueIds: { 'g-color': 'v1' },
            priceVND: '10000000',
            stockQuantity: 5,
            active: true,
          },
        ],
      }

      const result = productFormSchema.safeParse(data)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(
          result.error.issues.some(
            (i) => i.message === 'Giá trị phân loại không được trùng lặp'
          )
        ).toBe(true)
      }
    })

    it('rejects invalid variant price or negative stock', () => {
      const data = {
        name: 'iPhone 15 Pro',
        brand: 'Apple',
        categoryId: 'cat-1',
        hasVariants: true,
        optionGroups: [
          {
            id: 'g-color',
            label: 'Màu sắc',
            values: [{ id: 'v1', label: 'Đen' }],
          },
        ],
        variants: [
          {
            id: 'var-1',
            optionValueIds: { 'g-color': 'v1' },
            priceVND: '-1000',
            stockQuantity: -2,
            active: true,
          },
        ],
      }

      const result = productFormSchema.safeParse(data)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(
          result.error.issues.some(
            (i) => i.message === 'Giá biến thể phải là số không âm'
          )
        ).toBe(true)
        expect(
          result.error.issues.some(
            (i) => i.message === 'Số lượng tồn kho không được âm'
          )
        ).toBe(true)
      }
    })
  })
})
