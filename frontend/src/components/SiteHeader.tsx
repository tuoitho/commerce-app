import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { useCart } from '../cart/CartProvider'

export default function SiteHeader() {
  const { user, logout } = useAuth()
  const { cart } = useCart()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <header className="site-header">
      <Link to="/" className="site-brand">Commerce Store</Link>
      <nav aria-label="Main navigation">
        <Link to="/">Home</Link>
        <Link to="/products">Phones</Link>
        <Link to="/cart">Cart ({cart?.totalUnits ?? 0})</Link>
        {user ? (
          <>
            <span className="header-user">{user.email}</span>
            <button type="button" className="header-button" onClick={handleLogout}>Log out</button>
          </>
        ) : (
          <>
            <Link to="/login">Sign in</Link>
            <Link to="/register">Register</Link>
          </>
        )}
      </nav>
    </header>
  )
}
