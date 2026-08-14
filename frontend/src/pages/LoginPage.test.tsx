import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthProvider'
import LoginPage from './LoginPage'

vi.mock('../auth/AuthProvider', () => ({ useAuth: vi.fn() }))

const mockedUseAuth = vi.mocked(useAuth)

function renderPage(state?: unknown) {
  return render(<MemoryRouter initialEntries={[{ pathname: '/login', state }]}><LoginPage /></MemoryRouter>)
}

describe('LoginPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows validation errors without submitting', () => {
    const login = vi.fn()
    mockedUseAuth.mockReturnValue({ user: null, accessToken: null, loading: false, login, register: vi.fn(), logout: vi.fn() })
    renderPage()

    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!)

    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
    expect(login).not.toHaveBeenCalled()
  })

  it('shows API errors and restores the submit control after failure', async () => {
    let reject!: (error: ApiError) => void
    const login = vi.fn().mockImplementation(() => new Promise<void>((_, fail) => { reject = fail }))
    mockedUseAuth.mockReturnValue({ user: null, accessToken: null, loading: false, login, register: vi.fn(), logout: vi.fn() })
    renderPage()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } })

    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!)
    expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled()
    reject(new ApiError(401, { code: 'invalid_credentials', message: 'Invalid credentials' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials'))
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('keeps the recovery link state for the register handoff', () => {
    mockedUseAuth.mockReturnValue({ user: null, accessToken: null, loading: false, login: vi.fn(), register: vi.fn(), logout: vi.fn() })
    renderPage({ from: { pathname: '/cart' } })

    expect(screen.getByRole('link', { name: 'Register' })).toHaveAttribute('href', '/register')
  })
})
