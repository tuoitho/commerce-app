import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OptionGroupBuilder } from './OptionGroupBuilder'
import type { OptionGroupItem } from '@/lib/cartesian'

describe('OptionGroupBuilder Component', () => {
  it('renders add group button and allows adding a new group', () => {
    const onChange = vi.fn()
    render(<OptionGroupBuilder groups={[]} onChange={onChange} />)

    const addButton = screen.getByRole('button', { name: /Thêm nhóm phân loại/i })
    expect(addButton).toBeInTheDocument()
    expect(addButton).not.toBeDisabled()

    fireEvent.click(addButton)
    expect(onChange).toHaveBeenCalledTimes(1)
    const newGroups: OptionGroupItem[] = onChange.mock.calls[0][0]
    expect(newGroups).toHaveLength(1)
    expect(newGroups[0].id).toBeDefined()
    expect(newGroups[0].label).toBe('')
    expect(newGroups[0].values).toEqual([])
  })

  it('disables add group button when max limit of 3 groups is reached', () => {
    const onChange = vi.fn()
    const groups: OptionGroupItem[] = [
      { id: '1', label: 'Màu sắc', values: [{ id: 'v1', label: 'Đen' }] },
      { id: '2', label: 'Dung lượng', values: [{ id: 'v2', label: '128GB' }] },
      { id: '3', label: 'Phiên bản', values: [{ id: 'v3', label: 'LTE' }] },
    ]

    render(<OptionGroupBuilder groups={groups} onChange={onChange} />)

    const addButton = screen.getByRole('button', { name: /Thêm nhóm phân loại/i })
    expect(addButton).toBeDisabled()
  })

  it('allows updating the group label', () => {
    const onChange = vi.fn()
    const groups: OptionGroupItem[] = [
      { id: '1', label: 'Màu', values: [] },
    ]

    render(<OptionGroupBuilder groups={groups} onChange={onChange} />)

    const labelInput = screen.getByPlaceholderText(/Ví dụ: Màu sắc, Dung lượng/i)
    fireEvent.change(labelInput, { target: { value: 'Màu sắc mới' } })

    expect(onChange).toHaveBeenCalledWith([
      { id: '1', label: 'Màu sắc mới', values: [] },
    ])
  })

  it('allows adding value chips by typing and pressing Enter or clicking Add', () => {
    const onChange = vi.fn()
    const groups: OptionGroupItem[] = [
      { id: '1', label: 'Màu sắc', values: [] },
    ]

    render(<OptionGroupBuilder groups={groups} onChange={onChange} />)

    const valueInput = screen.getByPlaceholderText(/Nhập giá trị/i)
    fireEvent.change(valueInput, { target: { value: 'Đen nhám' } })
    fireEvent.keyDown(valueInput, { key: 'Enter', code: 'Enter' })

    expect(onChange).toHaveBeenCalledTimes(1)
    const updated = onChange.mock.calls[0][0]
    expect(updated[0].values).toHaveLength(1)
    expect(updated[0].values[0].label).toBe('Đen nhám')
    expect(updated[0].values[0].id).toBeDefined()
  })

  it('prevents adding duplicate values within the same group (case-insensitive)', () => {
    const onChange = vi.fn()
    const groups: OptionGroupItem[] = [
      {
        id: '1',
        label: 'Màu sắc',
        values: [{ id: 'v1', label: 'Đen' }],
      },
    ]

    render(<OptionGroupBuilder groups={groups} onChange={onChange} />)

    const valueInput = screen.getByPlaceholderText(/Nhập giá trị/i)
    fireEvent.change(valueInput, { target: { value: '  đen  ' } })
    fireEvent.keyDown(valueInput, { key: 'Enter', code: 'Enter' })

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText(/Giá trị phân loại này đã tồn tại/i)).toBeInTheDocument()
  })

  it('allows removing an option value chip', () => {
    const onChange = vi.fn()
    const groups: OptionGroupItem[] = [
      {
        id: '1',
        label: 'Màu sắc',
        values: [
          { id: 'v1', label: 'Đen' },
          { id: 'v2', label: 'Trắng' },
        ],
      },
    ]

    render(<OptionGroupBuilder groups={groups} onChange={onChange} />)

    const removeBtn = screen.getByRole('button', { name: /Xóa giá trị Đen/i })
    fireEvent.click(removeBtn)

    expect(onChange).toHaveBeenCalledWith([
      {
        id: '1',
        label: 'Màu sắc',
        values: [{ id: 'v2', label: 'Trắng' }],
      },
    ])
  })

  it('allows deleting an entire option group', () => {
    const onChange = vi.fn()
    const groups: OptionGroupItem[] = [
      { id: '1', label: 'Màu sắc', values: [{ id: 'v1', label: 'Đen' }] },
      { id: '2', label: 'Dung lượng', values: [{ id: 'v2', label: '128GB' }] },
    ]

    render(<OptionGroupBuilder groups={groups} onChange={onChange} />)

    const deleteGroupButtons = screen.getAllByRole('button', { name: /Xóa nhóm/i })
    fireEvent.click(deleteGroupButtons[0])

    expect(onChange).toHaveBeenCalledWith([
      { id: '2', label: 'Dung lượng', values: [{ id: 'v2', label: '128GB' }] },
    ])
  })

  it('displays field error messages when provided', () => {
    const groups: OptionGroupItem[] = [
      { id: '1', label: '', values: [] },
    ]

    render(
      <OptionGroupBuilder
        groups={groups}
        onChange={vi.fn()}
        errors={{
          'optionGroups.0.label': 'Tên nhóm thuộc tính không được để trống',
          'optionGroups.0.values': 'Nhóm thuộc tính phải có ít nhất một giá trị',
        }}
      />
    )

    expect(
      screen.getByText('Tên nhóm thuộc tính không được để trống')
    ).toBeInTheDocument()
    expect(
      screen.getByText('Nhóm thuộc tính phải có ít nhất một giá trị')
    ).toBeInTheDocument()
  })
})
