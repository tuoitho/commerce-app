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
} from 'lucide-react'
import { catalogApi } from '@/api/catalog'
import type { Category } from '@/api/types'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { useToast } from '@/context/ToastContext'
import { Button } from './ui/button'

export function Header() {
  const { user, isAuthenticated, logout } = useAuth()
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
    <header className="sticky top-0 z-40 w-full bg-white shadow-xs border-b border-slate-200">
      {/* Top Utility Bar */}
      <div className="bg-slate-100 border-b border-slate-200/80 text-[12px] text-slate-600 hidden md:block">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center justify-between h-8">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1 text-slate-700">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>Hệ thống điện thoại chính hãng 100% VNA</span>
            </span>
            <span className="text-slate-300">|</span>
            <span className="flex items-center gap-1 text-slate-600">
              <MapPin className="h-3.5 w-3.5 text-slate-500" />
              <span>Hà Nội • TP. HCM • Đà Nẵng</span>
            </span>
          </div>

          <div className="flex items-center gap-5">
            <a
              href="tel:18006868"
              className="flex items-center gap-1 text-slate-700 hover:text-emerald-600 font-semibold transition-colors"
            >
              <PhoneCall className="h-3.5 w-3.5 text-emerald-600" />
              <span>Hotline: 1800 6868 (Miễn phí)</span>
            </a>
            <Link
              to="/products"
              className="flex items-center gap-1 hover:text-emerald-600 transition-colors"
            >
              <FileText className="h-3.5 w-3.5 text-slate-500" />
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
            className="flex items-center gap-3 font-bold text-2xl text-slate-900 shrink-0"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-600/20">
              <Smartphone className="h-6 w-6 stroke-[2.2]" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold tracking-tight text-slate-900 text-2xl leading-none">
                AuraPhone
              </span>
              <span className="text-[10px] font-semibold text-emerald-700 tracking-normal mt-0.5">
                Điện thoại chính hãng
              </span>
            </div>
          </Link>

          {/* Central Search Box */}
          <form
            onSubmit={handleHeaderSearchSubmit}
            className="hidden md:flex flex-1 max-w-lg relative mx-2"
          >
            <input
              type="text"
              placeholder="Bạn muốn tìm điện thoại gì? (vd: Tìm theo tên, hãng...)"
              value={headerSearch}
              onChange={(e) => setHeaderSearch(e.target.value)}
              className="w-full h-11 pl-10 pr-24 text-sm font-medium rounded-xl bg-slate-50 border border-slate-300 focus:bg-white focus:border-emerald-600 focus:ring-3 focus:ring-emerald-100 outline-none transition-all placeholder:text-slate-400"
            />
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            {headerSearch && (
              <button
                type="button"
                onClick={() => setHeaderSearch('')}
                className="absolute right-20 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors"
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
                  ? 'text-emerald-700 bg-emerald-50 font-bold'
                  : 'text-slate-700 hover:text-emerald-600 hover:bg-slate-50'
              }`}
            >
              Trang chủ
            </Link>

            <Link
              to="/products"
              className={`px-3 py-2 rounded-lg transition-colors ${
                location.pathname === '/products' && !location.search.includes('category_id')
                  ? 'text-emerald-700 bg-emerald-50 font-bold'
                  : 'text-slate-700 hover:text-emerald-600 hover:bg-slate-50'
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
                    ? 'text-emerald-700 bg-emerald-50 font-bold'
                    : 'text-slate-700 hover:text-emerald-600 hover:bg-slate-50'
                }`}
                aria-expanded={categoryDropdownOpen}
                aria-haspopup="true"
              >
                <span>Danh mục</span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-200 ${
                    categoryDropdownOpen ? 'rotate-180 text-emerald-600' : 'text-slate-400'
                  }`}
                />
              </button>

              {categoryDropdownOpen && (
                <div className="absolute left-0 mt-2 w-56 rounded-2xl bg-white border border-slate-200 shadow-xl py-2 z-50 animate-in fade-in duration-150">
                  <div className="px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                    Chọn theo danh mục
                  </div>
                  <div className="py-1 max-h-64 overflow-y-auto">
                    {categories.length > 0 ? (
                      categories.map((cat) => (
                        <Link
                          key={cat.id}
                          to={`/products?category_id=${cat.id}`}
                          onClick={() => setCategoryDropdownOpen(false)}
                          className={`flex items-center justify-between px-3.5 py-2 text-sm transition-colors ${
                            location.search.includes(cat.id)
                              ? 'text-emerald-700 bg-emerald-50 font-bold'
                              : 'text-slate-700 hover:bg-slate-50 hover:text-emerald-600'
                          }`}
                        >
                          <span>{cat.name}</span>
                          <Smartphone className="h-3.5 w-3.5 text-slate-400" />
                        </Link>
                      ))
                    ) : (
                      <div className="px-3.5 py-2 text-xs text-slate-400">Đang tải danh mục...</div>
                    )}
                  </div>
                  <div className="pt-1 border-t border-slate-100 px-2">
                    <Link
                      to="/products"
                      onClick={() => setCategoryDropdownOpen(false)}
                      className="block text-center py-1.5 text-xs font-bold text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
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
                  ? 'text-emerald-700 bg-emerald-50 font-bold'
                  : 'text-slate-700 hover:text-emerald-600 hover:bg-slate-50'
              }`}
            >
              Hàng có sẵn
            </Link>
          </nav>

          {/* Right Functional Actions */}
          <div className="flex items-center gap-3">
            {/* Cart Button */}
            <Link
              to="/cart"
              onClick={handleCartClick}
              className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800 hover:border-emerald-600 hover:text-emerald-600 transition-colors shadow-2xs"
              aria-label="Giỏ hàng"
              title="Giỏ hàng"
            >
              <ShoppingCart className="h-5 w-5 text-slate-700 hover:text-emerald-600 transition-colors" />
              {badgeCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-extrabold text-white shadow-xs">
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
              <span className="sr-only">Giỏ hàng</span>
            </Link>

            {/* Auth / Account */}
            <div className="hidden sm:flex items-center">
              {isAuthenticated && user ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-800 max-w-[170px] truncate">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white font-bold text-xs uppercase shrink-0">
                      {user.email.charAt(0)}
                    </div>
                    <span className="truncate">{user.email}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
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
                    className="h-11 px-4 rounded-xl font-bold text-xs bg-slate-900 hover:bg-emerald-600 text-white transition-colors"
                  >
                    <UserIcon className="h-4 w-4 mr-1.5" />
                    <span>Đăng nhập</span>
                  </Button>
                </Link>
              )}
            </div>

            {/* Mobile Menu Toggle Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="xl:hidden flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="xl:hidden border-t border-slate-200 bg-white px-4 pt-3 pb-6 space-y-4 shadow-xl">
          {/* Mobile Search */}
          <form onSubmit={handleHeaderSearchSubmit} className="relative">
            <input
              type="text"
              placeholder="Tìm kiếm điện thoại, thương hiệu..."
              value={headerSearch}
              onChange={(e) => setHeaderSearch(e.target.value)}
              className="w-full h-11 pl-10 pr-20 text-sm font-medium rounded-xl bg-slate-100 border border-slate-200 outline-none"
            />
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg"
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
                  ? 'text-emerald-700 bg-emerald-50 font-bold'
                  : 'text-slate-800 hover:bg-slate-50'
              }`}
            >
              Trang chủ
            </Link>
            <Link
              to="/products"
              onClick={() => setMobileMenuOpen(false)}
              className={`px-3.5 py-2.5 text-sm font-semibold rounded-xl ${
                location.pathname === '/products' && !location.search.includes('category_id')
                  ? 'text-emerald-700 bg-emerald-50 font-bold'
                  : 'text-slate-800 hover:bg-slate-50'
              }`}
            >
              Tất cả sản phẩm
            </Link>
            <Link
              to="/products?in_stock=true"
              onClick={() => setMobileMenuOpen(false)}
              className={`px-3.5 py-2.5 text-sm font-semibold rounded-xl ${
                location.search.includes('in_stock=true')
                  ? 'text-emerald-700 bg-emerald-50 font-bold'
                  : 'text-slate-800 hover:bg-slate-50'
              }`}
            >
              Hàng có sẵn giao ngay
            </Link>

            {/* Dynamic Categories in Mobile Drawer */}
            {categories.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <div className="px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Danh mục nổi bật
                </div>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  {categories.map((cat) => (
                    <Link
                      key={cat.id}
                      to={`/products?category_id=${cat.id}`}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center justify-between py-2.5 px-3 rounded-xl text-xs font-bold border transition-colors ${
                        location.search.includes(cat.id)
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700'
                      }`}
                    >
                      <span className="truncate">{cat.name}</span>
                      <Smartphone className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-1" />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </nav>

          {/* Mobile Auth */}
          <div className="pt-2 border-t border-slate-100">
            {isAuthenticated && user ? (
              <div className="space-y-3">
                <div className="px-3.5 py-2.5 rounded-xl bg-slate-50 text-xs font-medium text-slate-700">
                  Tài khoản: <span className="font-bold text-slate-900">{user.email}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-center text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl font-bold"
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
                <Button variant="default" className="w-full h-11 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white">
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
