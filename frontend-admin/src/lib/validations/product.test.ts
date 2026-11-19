import { describe, it, expect } from 'vitest'
import {
  productFormSchema,
  isValidProductImageUrl,
  validateProductImageFile,
  applyPhoneSpecsPreset,
  PHONE_SPEC_PRESET,
} from './product'

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

  describe('Image URLs & File Validation (Req 4.1, 4.3)', () => {
    it('accepts /media/products/<uuid>.(jpg|png|webp) and http(s) URLs and rejects invalid URLs', () => {
      expect(
        isValidProductImageUrl('/media/products/97b918af-45cb-4d3f-8baa-e1e7ce505a32.webp')
      ).toBe(true)
      expect(
        isValidProductImageUrl('/media/products/550e8400-e29b-41d4-a716-446655440000.jpg')
      ).toBe(true)
      expect(isValidProductImageUrl('https://example.com/phone.png')).toBe(true)
      expect(isValidProductImageUrl('http://cdn.example.com/phone.jpg')).toBe(true)
      expect(isValidProductImageUrl('/media/products/not-a-uuid.webp')).toBe(false)
      expect(isValidProductImageUrl('/media/products/97b918af-45cb-4d3f-8baa-e1e7ce505a32.gif')).toBe(false)
      expect(isValidProductImageUrl('ftp://example.com/a.jpg')).toBe(false)
      expect(isValidProductImageUrl('relative/path.jpg')).toBe(false)

      const validRes = productFormSchema.safeParse({
        name: 'iPhone 16 Pro',
        brand: 'Apple',
        categoryId: 'cat-1',
        price: '28990000',
        stockQuantity: 10,
        hasVariants: false,
        imageUrls: [
          '/media/products/97b918af-45cb-4d3f-8baa-e1e7ce505a32.webp',
          'https://example.com/ip16.jpg',
        ],
      })
      expect(validRes.success).toBe(true)

      const invalidRes = productFormSchema.safeParse({
        name: 'iPhone 16 Pro',
        brand: 'Apple',
        categoryId: 'cat-1',
        price: '28990000',
        stockQuantity: 10,
        hasVariants: false,
        imageUrls: ['ftp://bad-url.com/image.jpg'],
      })
      expect(invalidRes.success).toBe(false)
    })

    it('validates upload image file MIME types (JPEG, PNG, WebP) and <= 10 MB size', () => {
      expect(
        validateProductImageFile(new File(['abc'], 'a.webp', { type: 'image/webp' }))
      ).toBeNull()
      expect(
        validateProductImageFile(new File(['abc'], 'a.jpg', { type: 'image/jpeg' }))
      ).toBeNull()
      expect(
        validateProductImageFile(new File(['abc'], 'a.png', { type: 'image/png' }))
      ).toBeNull()
      expect(
        validateProductImageFile(new File(['abc'], 'a.gif', { type: 'image/gif' }))
      ).toMatch(/JPEG, PNG|WebP/i)
      expect(
        validateProductImageFile(new File([], 'empty.png', { type: 'image/png' }))
      ).toMatch(/10 MB/i)

      const overLimit = new File(['x'], 'big.png', { type: 'image/png' })
      Object.defineProperty(overLimit, 'size', { value: 10 * 1024 * 1024 + 1 })
      expect(validateProductImageFile(overLimit)).toMatch(/10 MB/i)
    })
  })

  describe('Structured Specs Validation & Phone Preset (Req 5.1, 5.2)', () => {
    const baseSimple = {
      name: 'iPhone 16 Pro',
      brand: 'Apple',
      categoryId: 'cat-1',
      price: '28990000',
      stockQuantity: 10,
      hasVariants: false,
    }

    it('validates valid specs and enforces group/item limits and uniqueness', () => {
      const ok = productFormSchema.safeParse({
        ...baseSimple,
        specs: [
          {
            group: 'Màn hình',
            items: [{ label: 'Kích thước', value: '6.3 inch OLED' }],
          },
        ],
      })
      expect(ok.success).toBe(true)

      const dupGroup = productFormSchema.safeParse({
        ...baseSimple,
        specs: [
          { group: 'Màn hình', items: [{ label: 'A', value: '1' }] },
          { group: '  màn hình ', items: [{ label: 'B', value: '2' }] },
        ],
      })
      expect(dupGroup.success).toBe(false)
      if (!dupGroup.success) {
        expect(dupGroup.error.issues.some((i) => i.message === 'Tên nhóm thông số không được trùng nhau')).toBe(true)
      }

      const tooManyGroups = productFormSchema.safeParse({
        ...baseSimple,
        specs: Array.from({ length: 13 }, (_, i) => ({
          group: `Nhóm ${i + 1}`,
          items: [{ label: 'L', value: 'V' }],
        })),
      })
      expect(tooManyGroups.success).toBe(false)
      if (!tooManyGroups.success) {
        expect(tooManyGroups.error.issues.some((i) => i.message === 'Tối đa 12 nhóm thông số kỹ thuật')).toBe(true)
      }

      const emptyItemValue = productFormSchema.safeParse({
        ...baseSimple,
        specs: [{ group: 'Camera', items: [{ label: 'Chính', value: '   ' }] }],
      })
      expect(emptyItemValue.success).toBe(false)
    })

    it('applyPhoneSpecsPreset initializes 6 standard phone groups without overwriting existing values', () => {
      expect(PHONE_SPEC_PRESET).toHaveLength(6)
      expect(PHONE_SPEC_PRESET.map((g) => g.group)).toEqual([
        'Màn hình',
        'Hiệu năng & Chipset',
        'Camera',
        'Pin & Sạc',
        'Kết nối',
        'Thiết kế & Độ bền',
      ])

      const existing = [
        {
          group: 'Màn hình',
          items: [
            { label: 'Kích thước & Tấm nền', value: '6.9 inch OLED' },
            { label: 'Độ sáng tối đa', value: '2000 nits' },
          ],
        },
        {
          group: 'Âm thanh',
          items: [{ label: 'Loa', value: 'Stereo Dolby Atmos' }],
        },
      ]

      const merged = applyPhoneSpecsPreset(existing)
      expect(merged.map((g) => g.group)).toEqual([
        'Màn hình',
        'Âm thanh',
        'Hiệu năng & Chipset',
        'Camera',
        'Pin & Sạc',
        'Kết nối',
        'Thiết kế & Độ bền',
      ])

      const screenGroup = merged.find((g) => g.group === 'Màn hình')!
      expect(screenGroup.items[0]).toEqual({ label: 'Kích thước & Tấm nền', value: '6.9 inch OLED' })
      expect(screenGroup.items[1]).toEqual({ label: 'Độ sáng tối đa', value: '2000 nits' })
      expect(screenGroup.items.some((i) => i.label === 'Độ phân giải' && i.value === '')).toBe(true)
      expect(screenGroup.items.some((i) => i.label === 'Tần số quét' && i.value === '')).toBe(true)

      // Idempotent on second click
      const second = applyPhoneSpecsPreset(merged)
      expect(second).toEqual(merged)
    })
  })
})
