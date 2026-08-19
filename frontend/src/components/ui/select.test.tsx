import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Select } from './select'

describe('Select UI Primitive', () => {
  it('renders select with options and handles change', () => {
    const onChange = vi.fn()

    render(
      <Select data-testid="test-select" onChange={onChange} defaultValue="1">
        <option value="1">Hà Nội</option>
        <option value="2">Hồ Chí Minh</option>
      </Select>
    )

    const select = screen.getByTestId('test-select') as HTMLSelectElement
    expect(select).toBeInTheDocument()
    expect(select.value).toBe('1')

    fireEvent.change(select, { target: { value: '2' } })
    expect(onChange).toHaveBeenCalled()
    expect(select.value).toBe('2')
  })

  it('applies error styling when error is true', () => {
    render(
      <Select data-testid="error-select" error>
        <option value="1">Option 1</option>
      </Select>
    )

    const select = screen.getByTestId('error-select')
    expect(select.className).toContain('border-rose-500')
  })

  it('respects disabled prop', () => {
    render(
      <Select data-testid="disabled-select" disabled>
        <option value="1">Option 1</option>
      </Select>
    )

    const select = screen.getByTestId('disabled-select') as HTMLSelectElement
    expect(select.disabled).toBe(true)
  })
})
