import { useEffect, useState, useRef, type MouseEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
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
import type { Category, ProductSummary } from '@/api/types'
import { formatVND } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { useToast } from '@/context/ToastContext'
import { Button } from './ui/button'
import { Skeleton } from './ui/skeleton'
import { NotificationBell } from './notifications/NotificationBell'
import { AvatarDisplay } from './AvatarDisplay'
import { useCurrentLive } from '@/hooks/useCurrentLive'

interface HeaderSearchBoxProps {
  placeholder: string
  submitLabel: string
  formClassName: string
  inputClassName: string
  submitClassName: string
  clearButtonClassName?: string
  listboxId: string
  onAfterNavigate?: () => void
}

function HeaderSearchBox({
  placeholder,
  submitLabel,
  formClassName,
  inputClassName,
  submitClassName,
  clearButtonClassName,
  listboxId,
  onAfterNavigate,
}: HeaderSearchBoxProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<ProductSummary[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const requestIdRef = useRef(0)

  const trimmedQuery = query.trim()

  useEffect(() => {
    setIsOpen(false)
    setActiveIndex(-1)
  }, [location.pathname, location.search])

  useEffect(() => {
    const handleClickOutside = (e: globalThis.MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    requestIdRef.current += 1
    const currentReqId = requestIdRef.current

    if (trimmedQuery.length < 2) {
      setSuggestions([])
      setIsOpen(false)
      setIsSearching(false)
      setActiveIndex(-1)
      return
    }

    if (typeof catalogApi.listProductsWithMeta !== 'function') {
      return
    }

    const timer = window.setTimeout(() => {
      setIsSearching(true)
      setIsOpen(true)
      catalogApi
        .listProductsWithMeta({ q: trimmedQuery, limit: 5 })
        .then((res) => {
          if (currentReqId !== requestIdRef.current) return
          setSuggestions((res?.data || []).slice(0, 5))
          setActiveIndex(-1)
          setIsOpen(true)
        })
        .catch(() => {
          if (currentReqId !== requestIdRef.current) return
          setSuggestions([])
        })
        .finally(() => {
          if (currentReqId !== requestIdRef.current) return
          setIsSearching(false)
        })
    }, 250)

    return () => {
      window.clearTimeout(timer)
    }
  }, [trimmedQuery])

  const closeAndReset = () => {
    requestIdRef.current += 1
    setIsOpen(false)
    setActiveIndex(-1)
    setQuery('')
    setSuggestions([])
    onAfterNavigate?.()
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!trimmedQuery) return
    const targetUrl = `/products?q=${encodeURIComponent(trimmedQuery)}`
    closeAndReset()
    navigate(targetUrl)
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault()
        setIsOpen(false)
        setActiveIndex(-1)
      }
      return
    }

    if (e.key === 'ArrowDown') {
      if (suggestions.length === 0) return
      e.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
        setActiveIndex(0)
      } else {
        setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0))
      }
      return
    }

    if (e.key === 'ArrowUp') {
      if (suggestions.length === 0) return
      e.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
        setActiveIndex(suggestions.length - 1)
      } else {
        setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1))
      }
      return
    }

    if (e.key === 'Enter' && isOpen && activeIndex >= 0 && activeIndex < suggestions.length) {
      e.preventDefault()
      const selected = suggestions[activeIndex]
      closeAndReset()
      navigate(`/products/${selected.id}`)
    }
  }

  const activeOptionId =
    isOpen && activeIndex >= 0 && activeIndex < suggestions.length
      ? `${listboxId}-option-${suggestions[activeIndex].id}`
      : undefined

  return (
    <div ref={containerRef} className={formClassName}>
      <form onSubmit={handleSubmit} className="relative w-full">
        <input
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (trimmedQuery.length >= 2 && (suggestions.length > 0 || isSearching)) {
              setIsOpen(true)
            }
          }}
          onKeyDown={handleKeyDown}
          className={inputClassName}
        />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
        {query && clearButtonClassName && (
          <button
            type="button"
            onClick={() => {
              requestIdRef.current += 1
              setQuery('')
              setSuggestions([])
              setIsOpen(false)
              setActiveIndex(-1)
            }}
            aria-label="Xóa từ khóa"
            className={clearButtonClassName}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <button type="submit" className={submitClassName}>
          {submitLabel}
        </button>
      </form>

      {isOpen && trimmedQuery.length >= 2 && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Gợi ý sản phẩm"
          className="absolute left-0 right-0 top-full mt-2 rounded-2xl bg-white border border-zinc-200 shadow-xl overflow-hidden z-50"
        >
          {isSearching && suggestions.length === 0 ? (
            <div className="px-4 py-3 text-xs text-zinc-500">Đang tìm kiếm sản phẩm...</div>
          ) : suggestions.length === 0 ? (
            <div className="px-4 py-3 text-xs text-zinc-500">Không tìm thấy sản phẩm phù hợp</div>
          ) : (
            <div className="divide-y divide-zinc-100 max-h-80 overflow-y-auto">
              {suggestions.map((item, idx) => {
                const isSelected = idx === activeIndex
                const hasReviews = (item.reviewCount ?? 0) > 0
                return (
                  <Link
                    key={item.id}
                    id={`${listboxId}-option-${item.id}`}
                    role="option"
                    aria-selected={isSelected}
                    to={`/products/${item.id}`}
                    onClick={() => closeAndReset()}
                    className={`flex items-center gap-3 px-3.5 py-2.5 transition-colors ${
                      isSelected ? 'bg-emerald-50/90' : 'hover:bg-zinc-50'
                    }`}
                  >
                    <div className="h-11 w-11 shrink-0 rounded-lg border border-zinc-100 bg-[#f7f7f5] p-1 flex items-center justify-center overflow-hidden">
                      <img
                        src={item.primaryImageUrl || '/iphone-16-pro.jpg'}
                        alt={item.name}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                          {item.brand || 'Smartphone'}
                        </span>
                        {hasReviews ? (
                          <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-zinc-700">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            <span>{Number(item.averageRating ?? 0).toFixed(1)}</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-emerald-700">Mới</span>
                        )}
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-zinc-950 truncate">
                        {item.name}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="font-mono text-xs font-bold text-zinc-950 tabular-nums">
                        {formatVND(item.minPriceVnd || item.price)}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}

          <div className="border-t border-zinc-100 bg-zinc-50/80 px-3.5 py-2">
            <Link
              to={`/products?q=${encodeURIComponent(trimmedQuery)}`}
              onClick={() => closeAndReset()}
              className="block text-center text-xs font-bold text-emerald-700 hover:text-emerald-800 hover:underline py-0.5"
            >
              Xem tất cả kết quả cho &ldquo;{trimmedQuery}&rdquo; &rarr;
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

export function Header() {
  const { user, isAuthenticated, isLoading, logout } = useAuth()
  const { badgeCount } = useCart()
  const currentLive = useCurrentLive()
  const { success } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
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
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-2 sm:gap-4 h-18">
          {/* Brand Logo */}
          <Link
            to="/"
            className="flex items-center gap-2 sm:gap-3 font-bold text-xl sm:text-2xl text-zinc-950 shrink-0 min-w-0 group"
          >
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-white border border-zinc-800 transition-colors group-hover:bg-emerald-700 group-hover:border-emerald-700">
              <Smartphone className="h-4 w-4 sm:h-5 sm:w-5 stroke-[2]" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-extrabold tracking-tight text-zinc-950 text-lg sm:text-2xl leading-none">
                AuraPhone
              </span>
              <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-widest text-zinc-500 mt-1">
                Flagship Studio
              </span>
            </div>
          </Link>

          {/* Central Search Box */}
          <HeaderSearchBox
            placeholder="Tìm thiết bị, dòng máy, thương hiệu..."
            submitLabel="Tìm kiếm"
            formClassName="hidden md:flex flex-1 max-w-xl min-w-[240px] relative mx-2 lg:mx-6"
            inputClassName="w-full h-10 pl-9 pr-24 text-xs sm:text-sm font-medium rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-950 focus:bg-white focus:border-zinc-900 outline-none transition-all placeholder:text-zinc-400"
            clearButtonClassName="absolute right-20 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
            submitClassName="absolute right-1 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-zinc-950 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            listboxId="header-search-listbox"
          />

          {/* Right Functional Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {currentLive && (
              <Link
                to={`/live/${currentLive.id}`}
                className="xl:hidden inline-flex h-9 sm:h-10 items-center gap-1.5 rounded-xl bg-rose-600 px-2.5 sm:px-3 text-xs font-bold tracking-wider text-white"
                title={currentLive.title}
              >
                <span className="live-pulse-dot h-1.5 w-1.5 rounded-full bg-white" />
                LIVE
              </Link>
            )}

            {/* Notification Bell (when authenticated) */}
            {isAuthenticated && <NotificationBell />}

            {/* Cart Button */}
            <Link
              to="/cart"
              onClick={handleCartClick}
              className="relative flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-900 hover:border-zinc-900 transition-colors"
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
                  <Link
                    to="/account"
                    data-testid="header-account-link"
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-zinc-50 border border-zinc-200 text-xs font-semibold text-zinc-900 max-w-[190px] hover:border-zinc-900 transition-colors"
                  >
                    <AvatarDisplay
                      src={user.avatarUrl}
                      name={user.displayName}
                      email={user.email}
                      size="xs"
                    />
                    <span className="truncate">{user.displayName || user.email}</span>
                  </Link>
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
              className="xl:hidden flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Desktop Navigation Strip */}
        <nav className="hidden xl:flex items-center gap-1.5 h-11 border-t border-zinc-100 font-semibold text-sm whitespace-nowrap">
          <Link
            to="/"
            className={`shrink-0 px-3 py-1.5 rounded-lg transition-colors ${
              location.pathname === '/' && !location.search
                ? 'text-zinc-950 bg-zinc-100 font-bold'
                : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50'
            }`}
          >
            Trang chủ
          </Link>

          {currentLive && (
            <Link
              to={`/live/${currentLive.id}`}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-rose-600 transition-colors hover:bg-rose-50"
              title={currentLive.title}
            >
              <span className="live-pulse-dot h-2 w-2 rounded-full bg-rose-600" />
              LIVE
            </Link>
          )}

          <Link
            to="/products"
            className={`shrink-0 px-3 py-1.5 rounded-lg transition-colors ${
              location.pathname === '/products' && !location.search.includes('category_id')
                ? 'text-zinc-950 bg-zinc-100 font-bold'
                : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50'
            }`}
          >
            Sản phẩm
          </Link>

          {/* Dynamic Category Dropdown */}
          <div className="relative shrink-0" ref={categoryDropdownRef}>
            <button
              type="button"
              onClick={() => setCategoryDropdownOpen((prev) => !prev)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
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
            className={`shrink-0 px-3 py-1.5 rounded-lg transition-colors ${
              location.search.includes('in_stock=true')
                ? 'text-zinc-950 bg-zinc-100 font-bold'
                : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50'
            }`}
          >
            Hàng có sẵn
          </Link>

          <Link
            to="/posts"
            data-testid="header-posts-link"
            className={`shrink-0 px-3 py-1.5 rounded-lg transition-colors ${
              location.pathname.startsWith('/posts')
                ? 'text-zinc-950 bg-zinc-100 font-bold'
                : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50'
            }`}
          >
            Bài viết
          </Link>

          {isAuthenticated && (
            <>
              <Link
                to="/favorites"
                className={`shrink-0 px-3 py-1.5 rounded-lg transition-colors ${
                  location.pathname.startsWith('/favorites')
                    ? 'text-zinc-950 bg-zinc-100 font-bold'
                    : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50'
                }`}
              >
                Sản phẩm yêu thích
              </Link>
              <Link
                to="/orders"
                className={`shrink-0 px-3 py-1.5 rounded-lg transition-colors ${
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
                className={`shrink-0 px-3 py-1.5 rounded-lg transition-colors ${
                  location.pathname.startsWith('/reviews')
                    ? 'text-zinc-950 bg-zinc-100 font-bold'
                    : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50'
                }`}
              >
                Lịch sử đánh giá
              </Link>
              <Link
                to="/vouchers"
                data-testid="header-vouchers-link"
                className={`shrink-0 px-3 py-1.5 rounded-lg transition-colors ${
                  location.pathname.startsWith('/vouchers')
                    ? 'text-zinc-950 bg-zinc-100 font-bold'
                    : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50'
                }`}
              >
                Kho & Ví Voucher
              </Link>
            </>
          )}
        </nav>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="xl:hidden border-t border-zinc-200 bg-white px-4 pt-3 pb-6 space-y-4 shadow-xl">
          {/* Mobile Search */}
          <HeaderSearchBox
            placeholder="Tìm kiếm điện thoại, thương hiệu..."
            submitLabel="Tìm"
            formClassName="relative"
            inputClassName="w-full h-10 pl-9 pr-20 text-sm font-medium rounded-xl bg-zinc-50 border border-zinc-200 outline-none"
            submitClassName="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 bg-zinc-950 text-white text-xs font-semibold rounded-lg"
            listboxId="mobile-header-search-listbox"
            onAfterNavigate={() => setMobileMenuOpen(false)}
          />

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
            <Link
              to="/posts"
              data-testid="mobile-posts-link"
              onClick={() => setMobileMenuOpen(false)}
              className={`px-3.5 py-2.5 text-sm font-semibold rounded-xl ${
                location.pathname.startsWith('/posts')
                  ? 'text-zinc-950 bg-zinc-100 font-bold'
                  : 'text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              Bài viết
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
                <Link
                  to="/vouchers"
                  data-testid="mobile-vouchers-link"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-3.5 py-2.5 text-sm font-semibold rounded-xl flex items-center gap-2 ${
                    location.pathname.startsWith('/vouchers')
                      ? 'text-zinc-950 bg-zinc-100 font-bold'
                      : 'text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <span>Kho & Ví Voucher</span>
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
                <Link
                  to="/account"
                  data-testid="mobile-account-link"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 text-xs font-medium text-zinc-600 hover:border-zinc-900 transition-colors"
                >
                  <AvatarDisplay
                    src={user.avatarUrl}
                    name={user.displayName}
                    email={user.email}
                    size="xs"
                  />
                  <span className="truncate">
                    Tài khoản: <span className="font-bold text-zinc-950">{user.displayName || user.email}</span>
                  </span>
                </Link>
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
