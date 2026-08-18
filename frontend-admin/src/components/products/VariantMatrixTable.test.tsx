import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VariantMatrixTable } from './VariantMatrixTable'
import type { VariantMatrixRow } from '@/lib/cartesian'

describe('VariantMatrixTable Component', () => {
  const sampleVariants: VariantMatrixRow[] = [
    {
      id: 'v-1',
      optionValueIds: { 'g-1': 'val-1', 'g-2': 'val-3' },
      combinationKey: 'g-1:val-1|g-2:val-3',
      combinationLabel: 'Đen / 128GB',
      priceVND: '24990000',
      stockQuantity: 10,
      active: true,
    },
    {
      id: 'v-2',
      optionValueIds: { 'g-1': 'val-1', 'g-2': 'val-4' },
      combinationKey: 'g-1:val-1|g-2:val-4',
      combinationLabel: 'Đen / 256GB',
      priceVND: '27990000',
      stockQuantity: 5,
      active: true,
    },
    {
      id: 'v-3',
      optionValueIds: { 'g-1': 'val-2', 'g-2': 'val-3' },
      combinationKey: 'g-1:val-2|g-2:val-3',
      combinationLabel: 'Trắng / 128GB',
      priceVND: '24990000',
      stockQuantity: 8,
      active: false,
    },
  ]

  it('renders empty message when variants list is empty', () => {
    render(<VariantMatrixTable variants={[]} onChange={vi.fn()} />)
    expect(
      screen.getByText(/Chưa có phân loại hàng/i)
    ).toBeInTheDocument()
  })

  it('renders table headers and variant combination rows', () => {
    render(<VariantMatrixTable variants={sampleVariants} onChange={vi.fn()} />)

    expect(screen.getByText('Phân loại hàng')).toBeInTheDocument()
    expect(screen.getByText(/Giá bán/i)).toBeInTheDocument()
    expect(screen.getByText(/Kho hàng/i)).toBeInTheDocument()
    expect(screen.getByText('Kích hoạt')).toBeInTheDocument()

    expect(screen.getByText('Đen / 128GB')).toBeInTheDocument()
    expect(screen.getByText('Đen / 256GB')).toBeInTheDocument()
    expect(screen.getByText('Trắng / 128GB')).toBeInTheDocument()
  })

  it('allows updating an individual variant price', () => {
    const onChange = vi.fn()
    render(<VariantMatrixTable variants={sampleVariants} onChange={onChange} />)

    const priceInputs = screen.getAllByPlaceholderText(/Nhập giá/i)
    fireEvent.change(priceInputs[0], { target: { value: '25500000' } })

    expect(onChange).toHaveBeenCalledTimes(1)
    const updated = onChange.mock.calls[0][0]
    expect(updated[0].priceVND).toBe('25500000')
    expect(updated[1].priceVND).toBe('27990000')
  })

  it('allows updating an individual variant stock quantity', () => {
    const onChange = vi.fn()
    render(<VariantMatrixTable variants={sampleVariants} onChange={onChange} />)

    const stockInputs = screen.getAllByPlaceholderText(/0/i)
    fireEvent.change(stockInputs[1], { target: { value: '25' } })

    expect(onChange).toHaveBeenCalledTimes(1)
    const updated = onChange.mock.calls[0][0]
    expect(updated[1].stockQuantity).toBe(25)
  })

  it('allows toggling variant active switch', () => {
    const onChange = vi.fn()
    render(<VariantMatrixTable variants={sampleVariants} onChange={onChange} />)

    const checkboxes = screen.getAllByRole('checkbox')
    // Toggle first active switch (from true to false)
    fireEvent.click(checkboxes[0])

    expect(onChange).toHaveBeenCalledTimes(1)
    const updated = onChange.mock.calls[0][0]
    expect(updated[0].active).toBe(false)
  })

  it('bulk applies price and stock to all variants', () => {
    const onChange = vi.fn()
    render(<VariantMatrixTable variants={sampleVariants} onChange={onChange} />)

    const bulkPriceInput = screen.getByPlaceholderText(/Giá chung/i)
    const bulkStockInput = screen.getByPlaceholderText(/Kho chung/i)
    const applyButton = screen.getByRole('button', {
      name: /Áp dụng cho tất cả phân loại/i,
    })

    fireEvent.change(bulkPriceInput, { target: { value: '30000000' } })
    fireEvent.change(bulkStockInput, { target: { value: '100' } })
    fireEvent.click(applyButton)

    expect(onChange).toHaveBeenCalledTimes(1)
    const updated: VariantMatrixRow[] = onChange.mock.calls[0][0]
    expect(updated).toHaveLength(3)
    expect(updated[0].priceVND).toBe('30000000')
    expect(updated[0].stockQuantity).toBe(100)
    expect(updated[1].priceVND).toBe('30000000')
    expect(updated[1].stockQuantity).toBe(100)
    expect(updated[2].priceVND).toBe('30000000')
    expect(updated[2].stockQuantity).toBe(100)
  })

  it('displays field errors when provided', () => {
    render(
      <VariantMatrixTable
        variants={sampleVariants}
        onChange={vi.fn()}
        errors={{
          'variants.0.priceVND': 'Giá biến thể phải là số không âm',
          'variants.1.stockQuantity': 'Số lượng tồn kho không được âm',
        }}
      />
    )

    expect(
      screen.getByText('Giá biến thể phải là số không âm')
    ).toBeInTheDocument()
    expect(
      screen.getByText('Số lượng tồn kho không được âm')
    ).toBeInTheDocument()
  })
})
