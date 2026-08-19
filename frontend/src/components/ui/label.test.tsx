import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Label } from './label'

describe('Label UI Primitive', () => {
  it('renders children correctly', () => {
    render(<Label htmlFor="test-input">Họ và tên</Label>)

    const label = screen.getByText('Họ và tên')
    expect(label).toBeInTheDocument()
    expect(label.getAttribute('for')).toBe('test-input')
  })

  it('renders required asterisk when required is true', () => {
    render(<Label required>Số điện thoại</Label>)

    expect(screen.getByText('Số điện thoại')).toBeInTheDocument()
    expect(screen.getByText('*')).toBeInTheDocument()
    expect(screen.getByText('*')).toHaveClass('text-rose-500')
  })
})
