import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'

export default function SiteHeader() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <header className="site-header">
      <Link to="/products" className="site-brand">Commerce Store</Link>
      <nav aria-label="Main navigation">
        <Link to="/products">Catalog</Link>
        {user ? (
          <>
            <span className="header-user">{user.email}</span>
            <button type="button" className="header-button" onClick={handleLogout}>Log out</button>
          </>
        ) : <Link to="/login">Sign in</Link>}
      </nav>
    </header>
  )
}
