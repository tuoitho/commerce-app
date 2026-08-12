import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider, useAuth } from './AuthProvider'
import { tokenStore } from '../api/tokenStore'

function Probe() {
  const { user, accessToken, loading } = useAuth()
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user?.email ?? 'none'}</span>
      <span data-testid="token">{accessToken ?? 'none'}</span>
    </div>
  )
}

describe('AuthProvider session restore', () => {
  const ORIGINAL_STORAGE = window.localStorage

  beforeEach(() => {
    tokenStore.set(null)
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    window.localStorage = ORIGINAL_STORAGE
  })

  it('restores a session from the refresh endpoint when no access token is held', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ user: { id: '1', email: 'user@example.com' }, accessToken: 'abc' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(screen.getByTestId('user').textContent).toBe('user@example.com')
    expect(screen.getByTestId('token').textContent).toBe('abc')
    expect(window.localStorage.getItem('access_token')).toBe('abc')
  })

  it('stays signed out when refresh endpoint rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }))

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(screen.getByTestId('user').textContent).toBe('none')
    expect(screen.getByTestId('token').textContent).toBe('none')
  })

  it('uses a persisted access token without calling refresh', async () => {
    window.localStorage.setItem('access_token', 'persisted-token')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await act(async () => {
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )
    })

    expect(screen.getByTestId('token').textContent).toBe('persisted-token')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})