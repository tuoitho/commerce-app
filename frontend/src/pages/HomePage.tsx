import { useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'

export default function HomePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  if (!user) return null

  return (
    <main className="home-page">
      <h1>Welcome</h1>
      <p>Signed in as {user.email}</p>
      <button type="button" onClick={handleLogout}>
        Log out
      </button>
    </main>
  )
}