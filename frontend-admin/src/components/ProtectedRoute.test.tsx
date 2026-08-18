import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'
import { useAuth } from '@/context/AuthContext'

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

describe('ProtectedRoute', () => {
  it('renders loading indicator while auth is resolving', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      role: null,
      isAuthenticated: false,
      isLoading: true,
      login: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Secret Admin Dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByTestId('auth-loading')).toBeInTheDocument()
    expect(screen.queryByText('Secret Admin Dashboard')).not.toBeInTheDocument()
  })

  it('redirects unauthenticated users to /login', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      role: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Secret Admin Dashboard</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Trang Đăng Nhập</div>} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Trang Đăng Nhập')).toBeInTheDocument()
    expect(screen.queryByText('Secret Admin Dashboard')).not.toBeInTheDocument()
  })

  it('renders children when user is authenticated as admin', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: '1', email: 'admin@auraphone.vn', role: 'admin' },
      role: 'admin',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Secret Admin Dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Secret Admin Dashboard')).toBeInTheDocument()
  })
})
