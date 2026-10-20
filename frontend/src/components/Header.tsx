import { useEffect, useState, useRef, type MouseEvent, type FormEvent } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import {
  ShoppingCart,
  User as UserIcon,
  LogOut,
  Menu,
  X,
  Smartphone,
  Search,
  PhoneCall,
  MapPin,
  FileText,
  ShieldCheck,
  ChevronDown,
  Package,
  Heart,
  Star,
} from 'lucide-react'
import { catalogApi } from '@/api/catalog'
import type { Category } from '@/api/types'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { useToast } from '@/context/ToastContext'
import { Button } from './ui/button'
import { Skeleton } from './ui/skeleton'

export function Header() {
  const { user, isAuthenticated, isLoading, logout } = useAuth()
  const { badgeCount } = useCart()
  const { success } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [headerSearch, setHeaderSearch] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false)
  const categoryDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    catalogApi
      .listCategories()
      .then((res) => {
        if (active && res) {
          setCategories(res)
        }
      })
      .catch(() => {
        // Fallback gracefully if categories fail to load
      })
    return () => {
      active = false
    }
  }, [])

  // Close category dropdown when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (e: globalThis.MouseEvent) => {
      if (
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(e.target as Node)
      ) {
        setCategoryDropdownOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCategoryDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Close menus on route change
  useEffect(() => {
    setCategoryDropdownOpen(false)
    setMobileMenuOpen(false)
  }, [location.pathname, location.search])

  const handleCartClick = (e: MouseEvent) => {
    if (!isAuthenticated) {
      e.preventDefault()
      navigate('/login?redirect=/cart')
    }
  }

  const handleLogout = async () => {
    await logout()
    success('Đã đăng xuất', 'Hẹn gặp lại bạn lần sau!')
    setMobileMenuOpen(false)
    navigate('/')
  }

  const handleHeaderSearchSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (headerSearch.trim()) {
      navigate(`/products?q=${encodeURIComponent(headerSearch.trim())}`)
      setHeaderSearch('')
      setMobileMenuOpen(false)
    }
  }

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-zinc-200/90">
      {/* Top Architectural Telemetry Bar */}
      <div className="bg-zinc-950 border-b border-zinc-800/80 text-[11px] text-zinc-400 hidden md:block">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center justify-between h-8">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1.5 text-zinc-200 font-medium">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>Hệ thống phân phối thiết bị di động chính hãng VNA</span>
            </span>
            <span className="text-zinc-700">|</span>
            <span className="flex items-center gap-1.5 text-zinc-400">
              <MapPin className="h-3.5 w-3.5 text-zinc-500" />
              <span>Hà Nội • TP. HCM • Đà Nẵng</span>
            </span>
          </div>

          <div className="flex items-center gap-6">
            <a
              href="tel:18006868"
              className="flex items-center gap-1.5 text-zinc-200 hover:text-emerald-400 font-mono font-medium transition-colors"
            >
              <PhoneCall className="h-3.5 w-3.5 text-emerald-400" />
              <span>1800 6868</span>
            </a>
            <Link
              to="/products"
              className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors"
            >
              <FileText className="h-3.5 w-3.5 text-zinc-500" />
              <span>Tra cứu bảo hành</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Retail Header Bar */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 h-18">
          {/* Brand Logo */}
          <Link
            to="/"
            className="flex items-center gap-3 font-bold text-2xl text-zinc-950 shrink-0 group"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-950 text-white border border-zinc-800 transition-colors group-hover:bg-emerald-700 group-hover:border-emerald-700">
              <Smartphone className="h-5 w-5 stroke-[2]" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold tracking-tight text-zinc-950 text-xl sm:text-2xl leading-none">
                AuraPhone
              </span>
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mt-1">
                Flagship Studio
              </span>
            </div>
          </Link>

          {/* Central Search Box */}
          <form
            onSubmit={handleHeaderSearchSubmit}
            className="hidden md:flex flex-1 max-w-md relative mx-2"
          >
            <input
              type="text"
              placeholder="Tìm thiết bị, dòng máy, thương hiệu..."
              value={headerSearch}
              onChange={(e) => setHeaderSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-24 text-xs sm:text-sm font-medium rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-950 focus:bg-white focus:border-zinc-900 outline-none transition-all placeholder:text-zinc-400"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            {headerSearch && (
              <button
                type="button"
                onClick={() => setHeaderSearch('')}
                className="absolute right-20 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="submit"
              className="absolute right-1 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-zinc-950 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Tìm kiếm
            </button>
          </form>

          {/* Desktop Navigation Links */}
          <nav className="hidden xl:flex items-center gap-1 font-semibold text-sm">
            <Link
              to="/"
              className={`px-3 py-2 rounded-lg transition-colors ${
                location.pathname === '/' && !location.search
                  ? 'text-zinc-950 bg-zinc-100 font-bold'
                  : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50'
              }`}
            >
              Trang chủ
            </Link>

            <Link
              to="/products"
              className={`px-3 py-2 rounded-lg transition-colors ${
                location.pathname === '/products' && !location.search.includes('category_id')
                  ? 'text-zinc-950 bg-zinc-100 font-bold'
                  : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50'
              }`}
            >
              Sản phẩm
            </Link>

            {/* Dynamic Category Dropdown */}
            <div className="relative" ref={categoryDropdownRef}>
              <button
                type="button"
                onClick={() => setCategoryDropdownOpen((prev) => !prev)}
                className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                  categoryDropdownOpen || location.search.includes('category_id')
                    ? 'text-zinc-950 bg-zinc-100 font-bold'
                    : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50'
                }`}
                aria-expanded={categoryDropdownOpen}
                aria-haspopup="true"
              >
                <span>Danh mục</span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-200 ${
                    categoryDropdownOpen ? 'rotate-180 text-zinc-950' : 'text-zinc-400'
                  }`}
                />
              </button>

              {categoryDropdownOpen && (
                <div className="absolute left-0 mt-2 w-60 rounded-2xl bg-white border border-zinc-200 shadow-xl py-2 z-50 animate-in fade-in duration-150">
                  <div className="px-4 py-2 text-[10px] font-mono font-semibold uppercase tracking-widest text-zinc-400 border-b border-zinc-100">
                    Chọn theo danh mục
                  </div>
                  <div className="py-1 max-h-64 overflow-y-auto">
                    {categories.length > 0 ? (
                      categories.map((cat) => (
                        <Link
                          key={cat.id}
                          to={`/products?category_id=${cat.id}`}
                          onClick={() => setCategoryDropdownOpen(false)}
                          className={`flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                            location.search.includes(cat.id)
                              ? 'text-emerald-800 bg-emerald-50/70 font-bold'
                              : 'text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950'
                          }`}
                        >
                          <span>{cat.name}</span>
                          <Smartphone className="h-3.5 w-3.5 text-zinc-400" />
                        </Link>
                      ))
                    ) : (
                      <div className="px-4 py-2.5 text-xs text-zinc-400">Đang tải danh mục...</div>
                    )}
                  </div>
                  <div className="pt-1 border-t border-zinc-100 px-2">
                    <Link
                      to="/products"
                      onClick={() => setCategoryDropdownOpen(false)}
                      className="block text-center py-2 text-xs font-bold text-zinc-900 hover:bg-zinc-50 rounded-lg transition-colors"
                    >
                      Tất cả sản phẩm &rarr;
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <Link
              to="/products?in_stock=true"
              className={`px-3 py-2 rounded-lg transition-colors ${
                location.search.includes('in_stock=true')
                  ? 'text-zinc-950 bg-zinc-100 font-bold'
                  : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50'
              }`}
            >
              Hàng có sẵn
            </Link>

            {isAuthenticated && (
              <>
                <Link
                  to="/favorites"
                  className={`px-3 py-2 rounded-lg transition-colors ${
                    location.pathname.startsWith('/favorites')
                      ? 'text-zinc-950 bg-zinc-100 font-bold'
                      : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50'
                  }`}
                >
                  Sản phẩm yêu thích
                </Link>
                <Link
                  to="/orders"
                  className={`px-3 py-2 rounded-lg transition-colors ${
                    location.pathname.startsWith('/orders')
                      ? 'text-zinc-950 bg-zinc-100 font-bold'
                      : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50'
                  }`}
                >
                  Lịch sử mua hàng
                </Link>
                <Link
                  to="/reviews"
                  data-testid="header-reviews-link"
                  className={`px-3 py-2 rounded-lg transition-colors ${
                    location.pathname.startsWith('/reviews')
                      ? 'text-zinc-950 bg-zinc-100 font-bold'
                      : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50'
                  }`}
                >
                  Lịch sử đánh giá
                </Link>
              </>
            )}
          </nav>

          {/* Right Functional Actions */}
          <div className="flex items-center gap-2.5">
            {/* Cart Button */}
            <Link
              to="/cart"
              onClick={handleCartClick}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-900 hover:border-zinc-900 transition-colors"
              aria-label="Giỏ hàng"
              title="Giỏ hàng"
            >
              <ShoppingCart className="h-4 w-4 text-zinc-800" />
              {badgeCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-md bg-emerald-700 px-1 text-[10px] font-mono font-bold text-white shadow-2xs">
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
              <span className="sr-only">Giỏ hàng</span>
            </Link>

            {/* Auth / Account */}
            <div className="hidden sm:flex items-center">
              {isLoading && !user ? (
                <Skeleton data-testid="auth-loading-skeleton" className="h-10 w-28 rounded-xl" />
              ) : isAuthenticated && user ? (
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-zinc-50 border border-zinc-200 text-xs font-semibold text-zinc-900 max-w-[170px] truncate">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-zinc-950 text-white font-mono font-bold text-xs uppercase shrink-0">
                      {user.email.charAt(0)}
                    </div>
                    <span className="truncate">{user.email}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="p-2 text-zinc-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                    title="Đăng xuất"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <Link to="/login">
                  <Button
                    variant="default"
                    size="sm"
                    className="h-10 px-4 rounded-xl font-semibold text-xs bg-zinc-950 hover:bg-emerald-700 text-white transition-colors"
                  >
                    <UserIcon className="h-3.5 w-3.5 mr-1.5" />
                    <span>Đăng nhập</span>
                  </Button>
                </Link>
              )}
            </div>

            {/* Mobile Menu Toggle Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="mobile-menu-toggle"
              className="xl:hidden flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="xl:hidden border-t border-zinc-200 bg-white px-4 pt-3 pb-6 space-y-4 shadow-xl">
          {/* Mobile Search */}
          <form onSubmit={handleHeaderSearchSubmit} className="relative">
            <input
              type="text"
              placeholder="Tìm kiếm điện thoại, thương hiệu..."
              value={headerSearch}
              onChange={(e) => setHeaderSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-20 text-sm font-medium rounded-xl bg-zinc-50 border border-zinc-200 outline-none"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 bg-zinc-950 text-white text-xs font-semibold rounded-lg"
            >
              Tìm
            </button>
          </form>

          {/* Navigation links */}
          <nav className="flex flex-col gap-1">
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className={`px-3.5 py-2.5 text-sm font-semibold rounded-xl ${
                location.pathname === '/' && !location.search
                  ? 'text-zinc-950 bg-zinc-100 font-bold'
                  : 'text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              Trang chủ
            </Link>
            <Link
              to="/products"
              onClick={() => setMobileMenuOpen(false)}
              className={`px-3.5 py-2.5 text-sm font-semibold rounded-xl ${
                location.pathname === '/products' && !location.search.includes('category_id')
                  ? 'text-zinc-950 bg-zinc-100 font-bold'
                  : 'text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              Tất cả sản phẩm
            </Link>
            <Link
              to="/products?in_stock=true"
              onClick={() => setMobileMenuOpen(false)}
              className={`px-3.5 py-2.5 text-sm font-semibold rounded-xl ${
                location.search.includes('in_stock=true')
                  ? 'text-zinc-950 bg-zinc-100 font-bold'
                  : 'text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              Hàng có sẵn giao ngay
            </Link>

            {isAuthenticated && (
              <>
                <Link
                  to="/favorites"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-3.5 py-2.5 text-sm font-semibold rounded-xl flex items-center gap-2 ${
                    location.pathname.startsWith('/favorites')
                      ? 'text-zinc-950 bg-zinc-100 font-bold'
                      : 'text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <Heart className="h-4 w-4 text-zinc-600" />
                  <span>Sản phẩm yêu thích</span>
                </Link>
                <Link
                  to="/orders"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-3.5 py-2.5 text-sm font-semibold rounded-xl flex items-center gap-2 ${
                    location.pathname.startsWith('/orders')
                      ? 'text-zinc-950 bg-zinc-100 font-bold'
                      : 'text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <Package className="h-4 w-4 text-zinc-600" />
                  <span>Lịch sử mua hàng</span>
                </Link>
                <Link
                  to="/reviews"
                  data-testid="mobile-reviews-link"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-3.5 py-2.5 text-sm font-semibold rounded-xl flex items-center gap-2 ${
                    location.pathname.startsWith('/reviews')
                      ? 'text-zinc-950 bg-zinc-100 font-bold'
                      : 'text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <Star className="h-4 w-4 text-zinc-600" />
                  <span>Lịch sử đánh giá</span>
                </Link>
              </>
            )}

            {/* Dynamic Categories in Mobile Drawer */}
            {categories.length > 0 && (
              <div className="pt-2 border-t border-zinc-100">
                <div className="px-3.5 py-1 text-[10px] font-mono font-semibold uppercase tracking-widest text-zinc-400">
                  Danh mục nổi bật
                </div>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  {categories.map((cat) => (
                    <Link
                      key={cat.id}
                      to={`/products?category_id=${cat.id}`}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center justify-between py-2.5 px-3 rounded-xl text-xs font-semibold border transition-colors ${
                        location.search.includes(cat.id)
                          ? 'bg-zinc-950 text-white border-zinc-950'
                          : 'bg-zinc-50 text-zinc-800 border-zinc-200 hover:border-zinc-400'
                      }`}
                    >
                      <span className="truncate">{cat.name}</span>
                      <Smartphone className="h-3.5 w-3.5 text-zinc-400 shrink-0 ml-1" />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </nav>

          {/* Mobile Auth */}
          <div className="pt-2 border-t border-zinc-100">
            {isLoading && !user ? (
              <Skeleton data-testid="mobile-auth-loading-skeleton" className="h-10 w-full rounded-xl" />
            ) : isAuthenticated && user ? (
              <div className="space-y-3">
                <div className="px-3.5 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 text-xs font-medium text-zinc-600">
                  Tài khoản: <span className="font-bold text-zinc-950">{user.email}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-center text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl font-semibold"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Đăng xuất
                </Button>
              </div>
            ) : (
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="block"
              >
                <Button variant="default" className="w-full h-10 rounded-xl font-semibold bg-zinc-950 hover:bg-emerald-700 text-white">
                  Đăng nhập / Đăng ký
                </Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
