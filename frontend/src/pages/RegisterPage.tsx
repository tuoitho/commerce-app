import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { validateCredentials } from '../auth/validation'
import { ApiError } from '../api/client'
import { getInternalReturnPath } from '../auth/returnLocation'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const errs = validateCredentials(email, password)
    setFields(errs)
    if (Object.keys(errs).length > 0) return
    setError(null)
    setSubmitting(true)
    try {
      await register(email, password)
      navigate(getInternalReturnPath(location.state))
    } catch (err) {
      setError(err instanceof ApiError ? err.detail.message : 'Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page auth-surface">
      <header className="auth-heading">
        <p className="technical-label">New customer</p>
        <h1>Create account</h1>
      </header>
      {error && <p className="form-error" role="alert">{error}</p>}
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <label className="form-field">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(fields.email)}
          />
          {fields.email && <span className="field-error">{fields.email}</span>}
        </label>
        <label className="form-field">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(fields.password)}
          />
          {fields.password && <span className="field-error">{fields.password}</span>}
        </label>
        <button className="primary-action" type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="auth-recovery">
        Already have an account? <Link to="/login" state={location.state}>Sign in</Link>
      </p>
    </main>
  )
}
