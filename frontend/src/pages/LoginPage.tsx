import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { validateCredentials } from '../auth/validation'
import { ApiError } from '../api/client'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const errs = validateCredentials(email, password, { requirePassword: false })
    setFields(errs)
    if (Object.keys(errs).length > 0) return
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      setError(err instanceof ApiError ? err.detail.message : 'Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <h1>Sign in</h1>
      {error && <p className="form-error" role="alert">{error}</p>}
      <form onSubmit={handleSubmit} noValidate>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(fields.email)}
          />
          {fields.email && <span className="field-error">{fields.email}</span>}
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(fields.password)}
          />
          {fields.password && <span className="field-error">{fields.password}</span>}
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p>
        Don&apos;t have an account? <Link to="/register">Register</Link>
      </p>
    </main>
  )
}