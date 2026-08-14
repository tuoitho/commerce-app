import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <main className="not-found-page recovery-state">
      <h1>Page not found</h1>
      <p>The page you requested does not exist.</p>
      <Link className="primary-action" to="/">Back to home</Link>
    </main>
  )
}
