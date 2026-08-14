import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthProvider'
import RegisterPage from './RegisterPage'

vi.mock('../auth/AuthProvider', () => ({ useAuth: vi.fn() }))

const mockedUseAuth = vi.mocked(useAuth)

describe('RegisterPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows email and password validation errors without registering', () => {
    const register = vi.fn()
    mockedUseAuth.mockReturnValue({ user: null, accessToken: null, loading: false, login: vi.fn(), register, logout: vi.fn() })
    render(<MemoryRouter><RegisterPage /></MemoryRouter>)

    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form')!)

    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(register).not.toHaveBeenCalled()
  })

  it('shows API errors and keeps submit pending until registration settles', async () => {
    let resolve!: () => void
    const register = vi.fn().mockImplementation(() => new Promise<void>((_, reject) => {
      resolve = () => reject(new ApiError(409, { code: 'email_taken', message: 'Email is already registered' }))
    }))
    mockedUseAuth.mockReturnValue({ user: null, accessToken: null, loading: false, login: vi.fn(), register, logout: vi.fn() })
    render(<MemoryRouter><RegisterPage /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form')!)

    expect(await screen.findByRole('button', { name: 'Creating account…' })).toBeDisabled()
    resolve()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Email is already registered'))
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled()
  })

  it('provides a recovery link back to sign in', () => {
    mockedUseAuth.mockReturnValue({ user: null, accessToken: null, loading: false, login: vi.fn(), register: vi.fn(), logout: vi.fn() })
    render(<MemoryRouter><RegisterPage /></MemoryRouter>)

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  })
})
