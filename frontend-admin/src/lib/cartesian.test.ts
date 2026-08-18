import { describe, it, expect } from 'vitest'
import {
  generateVariantMatrix,
  applyBulkValues,
  type OptionGroupItem,
  type VariantMatrixRow,
} from './cartesian'

describe('Cartesian product & variant matrix helper', () => {
  it('returns empty array when option groups are empty', () => {
    const matrix = generateVariantMatrix([])
    expect(matrix).toEqual([])
  })

  it('returns empty array when option groups have no values', () => {
    const groups: OptionGroupItem[] = [
      { id: 'g1', label: 'Màu sắc', values: [] },
    ]
    const matrix = generateVariantMatrix(groups)
    expect(matrix).toEqual([])
  })

  it('generates variants for a single option group', () => {
    const groups: OptionGroupItem[] = [
      {
        id: 'g-color',
        label: 'Màu sắc',
        values: [
          { id: 'v-black', label: 'Đen' },
          { id: 'v-white', label: 'Trắng' },
        ],
      },
    ]

    const matrix = generateVariantMatrix(groups)
    expect(matrix).toHaveLength(2)
    expect(matrix[0].combinationLabel).toBe('Đen')
    expect(matrix[0].optionValueIds).toEqual({ 'g-color': 'v-black' })
    expect(matrix[0].active).toBe(true)
    expect(matrix[0].stockQuantity).toBe(0)
    expect(matrix[0].priceVND).toBe('')

    expect(matrix[1].combinationLabel).toBe('Trắng')
    expect(matrix[1].optionValueIds).toEqual({ 'g-color': 'v-white' })
  })

  it('generates Cartesian product for 2 option groups (2 x 3 = 6 variants)', () => {
    const groups: OptionGroupItem[] = [
      {
        id: 'g-color',
        label: 'Màu sắc',
        values: [
          { id: 'v-black', label: 'Đen' },
          { id: 'v-white', label: 'Trắng' },
        ],
      },
      {
        id: 'g-storage',
        label: 'Dung lượng',
        values: [
          { id: 'v-128', label: '128GB' },
          { id: 'v-256', label: '256GB' },
          { id: 'v-512', label: '512GB' },
        ],
      },
    ]

    const matrix = generateVariantMatrix(groups)
    expect(matrix).toHaveLength(6)

    expect(matrix.map((r) => r.combinationLabel)).toEqual([
      'Đen / 128GB',
      'Đen / 256GB',
      'Đen / 512GB',
      'Trắng / 128GB',
      'Trắng / 256GB',
      'Trắng / 512GB',
    ])

    expect(matrix[0].optionValueIds).toEqual({
      'g-color': 'v-black',
      'g-storage': 'v-128',
    })
  })

  it('generates Cartesian product for 3 option groups (2 x 2 x 2 = 8 variants)', () => {
    const groups: OptionGroupItem[] = [
      {
        id: 'g1',
        label: 'Màu sắc',
        values: [
          { id: 'v1', label: 'Đen' },
          { id: 'v2', label: 'Trắng' },
        ],
      },
      {
        id: 'g2',
        label: 'Dung lượng',
        values: [
          { id: 'v3', label: '128GB' },
          { id: 'v4', label: '256GB' },
        ],
      },
      {
        id: 'g3',
        label: 'Bảo hành',
        values: [
          { id: 'v5', label: '12 tháng' },
          { id: 'v6', label: '24 tháng' },
        ],
      },
    ]

    const matrix = generateVariantMatrix(groups)
    expect(matrix).toHaveLength(8)
    expect(matrix[0].combinationLabel).toBe('Đen / 128GB / 12 tháng')
    expect(matrix[7].combinationLabel).toBe('Trắng / 256GB / 24 tháng')
  })

  it('reconciles with existing variants preserving price, stock, active and id', () => {
    const groups: OptionGroupItem[] = [
      {
        id: 'g-color',
        label: 'Màu sắc',
        values: [
          { id: 'v-black', label: 'Đen' },
          { id: 'v-white', label: 'Trắng' },
        ],
      },
      {
        id: 'g-storage',
        label: 'Dung lượng',
        values: [
          { id: 'v-128', label: '128GB' },
          { id: 'v-256', label: '256GB' },
        ],
      },
    ]

    const existing: VariantMatrixRow[] = [
      {
        id: 'var-1',
        optionValueIds: { 'g-color': 'v-black', 'g-storage': 'v-128' },
        combinationKey: 'g-color:v-black|g-storage:v-128',
        combinationLabel: 'Đen / 128GB',
        priceVND: '25000000',
        stockQuantity: 15,
        active: true,
      },
      {
        id: 'var-2',
        optionValueIds: { 'g-color': 'v-black', 'g-storage': 'v-256' },
        combinationKey: 'g-color:v-black|g-storage:v-256',
        combinationLabel: 'Đen / 256GB',
        priceVND: '28000000',
        stockQuantity: 5,
        active: false,
      },
    ]

    const matrix = generateVariantMatrix(groups, existing)
    expect(matrix).toHaveLength(4)

    // First variant matches existing
    const var1 = matrix.find((r) => r.combinationLabel === 'Đen / 128GB')!
    expect(var1.id).toBe('var-1')
    expect(var1.priceVND).toBe('25000000')
    expect(var1.stockQuantity).toBe(15)
    expect(var1.active).toBe(true)

    // Second variant matches existing
    const var2 = matrix.find((r) => r.combinationLabel === 'Đen / 256GB')!
    expect(var2.id).toBe('var-2')
    expect(var2.priceVND).toBe('28000000')
    expect(var2.stockQuantity).toBe(5)
    expect(var2.active).toBe(false)

    // New combination has default values
    const var3 = matrix.find((r) => r.combinationLabel === 'Trắng / 128GB')!
    expect(var3.priceVND).toBe('')
    expect(var3.stockQuantity).toBe(0)
    expect(var3.active).toBe(true)
    expect(var3.id).toBeDefined()
  })

  it('bulk applies price and stock to all variants', () => {
    const variants: VariantMatrixRow[] = [
      {
        id: '1',
        optionValueIds: { g: 'v1' },
        combinationKey: 'g:v1',
        combinationLabel: 'V1',
        priceVND: '1000',
        stockQuantity: 5,
        active: true,
      },
      {
        id: '2',
        optionValueIds: { g: 'v2' },
        combinationKey: 'g:v2',
        combinationLabel: 'V2',
        priceVND: '2000',
        stockQuantity: 10,
        active: false,
      },
    ]

    // Apply price only
    const updatedPrice = applyBulkValues(variants, { priceVND: '3500000' })
    expect(updatedPrice[0].priceVND).toBe('3500000')
    expect(updatedPrice[0].stockQuantity).toBe(5)
    expect(updatedPrice[1].priceVND).toBe('3500000')
    expect(updatedPrice[1].stockQuantity).toBe(10)

    // Apply stock only
    const updatedStock = applyBulkValues(variants, { stockQuantity: 50 })
    expect(updatedStock[0].priceVND).toBe('1000')
    expect(updatedStock[0].stockQuantity).toBe(50)
    expect(updatedStock[1].priceVND).toBe('2000')
    expect(updatedStock[1].stockQuantity).toBe(50)

    // Apply both
    const updatedBoth = applyBulkValues(variants, {
      priceVND: '5000000',
      stockQuantity: 20,
    })
    expect(updatedBoth[0].priceVND).toBe('5000000')
    expect(updatedBoth[0].stockQuantity).toBe(20)
    expect(updatedBoth[1].priceVND).toBe('5000000')
    expect(updatedBoth[1].stockQuantity).toBe(20)
  })
})
