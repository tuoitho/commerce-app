import { Link } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'

export default function HomePage() {
  const { user } = useAuth()

  if (!user) return null

  return (
    <main className="home-page">
      <h1>Welcome</h1>
      <p>Signed in as {user.email}</p>
      <Link to="/products">Browse the catalog</Link>
    </main>
  )
}
