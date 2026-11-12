import { useState, useEffect, useRef } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  Star,
  LayoutDashboard,
  Package,
  FolderTree,
  ShoppingBag,
  RotateCcw,
  Users,
  Settings,
  ShieldCheck,
  LogOut,
  Sparkles,
  MessageSquare,
  FileText,
  Menu,
  X,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listAdminConversations, type AdminConversation } from '@/api/chat'
import { useAdminChatSocket } from '@/hooks/useAdminChatSocket'
import { AdminNotificationBell } from '@/components/notifications/AdminNotificationBell'

interface NavItemConfig {
  to?: string
  end?: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
  showBadge?: boolean
  disabled?: boolean
  title?: string
}

const NAV_ITEMS: NavItemConfig[] = [
  { to: '/', end: true, icon: LayoutDashboard, label: 'Tổng quan' },
  { to: '/posts', icon: FileText, label: 'Bài viết' },
  { to: '/products', icon: Package, label: 'Sản phẩm' },
  { to: '/orders', icon: ShoppingBag, label: 'Đơn hàng' },
  { to: '/chat', icon: MessageSquare, label: 'Tin nhắn hỗ trợ', showBadge: true },
  { to: '/returns', icon: RotateCcw, label: 'Trả hàng' },
  { to: '/reviews', icon: Star, label: 'Đánh giá' },
  { to: '/categories', icon: FolderTree, label: 'Danh mục' },
  { icon: Users, label: 'Người dùng', disabled: true, title: 'Sắp ra mắt' },
  { icon: Settings, label: 'Cài đặt', disabled: true, title: 'Sắp ra mắt' },
]

function NavLinksList({
  onItemClick,
  totalChatUnread,
}: {
  onItemClick?: () => void
  totalChatUnread: number
}) {
  return (
    <nav className="p-4 space-y-1 flex-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        if (item.disabled || !item.to) {
          return (
            <div
              key={item.label}
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-400 cursor-not-allowed opacity-60"
              title={item.title || 'Sắp ra mắt'}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </div>
          )
        }

        if (item.showBadge) {
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onItemClick}
              className={({ isActive }) =>
                `flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <div className="flex items-center gap-3">
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </div>
              {totalChatUnread > 0 && (
                <span
                  data-testid="sidebar-chat-unread-badge"
                  className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-bold text-white shadow-xs"
                >
                  {totalChatUnread > 99 ? '99+' : totalChatUnread}
                </span>
              )}
            </NavLink>
          )
        }

        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onItemClick}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}

export function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (isDrawerOpen) {
      wasOpenRef.current = true
      drawerRef.current?.focus()

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsDrawerOpen(false)
        }
      }
      document.addEventListener('keydown', handleKeyDown)
      return () => {
        document.removeEventListener('keydown', handleKeyDown)
      }
    } else if (wasOpenRef.current) {
      menuButtonRef.current?.focus()
    }
  }, [isDrawerOpen])

  const { data: unreadConversations = [] } = useQuery<AdminConversation[]>({
    queryKey: ['admin-conversations-unread-badge'],
    queryFn: () => listAdminConversations({ filter: 'unread' }),
    refetchInterval: 15000,
    enabled: Boolean(user),
  })

  // Maintain admin presence and instant unread badge updates across all admin pages
  useAdminChatSocket({
    enabled: Boolean(user),
    onNewMessage: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-conversations-unread-badge'] })
      queryClient.invalidateQueries({ queryKey: ['admin-conversations'] })
      queryClient.invalidateQueries({ queryKey: ['admin-conversation-messages'] })
    },
    onMessagesRead: (payload) => {
      if (payload.readerRole === 'admin') {
        queryClient.invalidateQueries({ queryKey: ['admin-conversations-unread-badge'] })
      }
    },
  })

  const totalChatUnread = unreadConversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0)

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const userInitials = user?.email ? user.email.slice(0, 2).toUpperCase() : 'AD'

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Mobile Drawer Overlay */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            data-testid="drawer-backdrop"
            onClick={() => setIsDrawerOpen(false)}
            aria-hidden="true"
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
          />

          {/* Drawer Panel */}
          <div
            id="admin-drawer-nav"
            role="dialog"
            aria-modal="true"
            aria-label="Menu điều hướng"
            tabIndex={-1}
            ref={drawerRef}
            className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-white shadow-xl flex flex-col focus:outline-hidden"
          >
            <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/30 font-bold">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-base font-bold text-slate-900 tracking-tight leading-none">
                    AuraPhone Admin
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">Management Portal</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                aria-label="Đóng menu điều hướng"
                className="p-2 -mr-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors focus:outline-hidden focus:ring-2 focus:ring-blue-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <NavLinksList
              totalChatUnread={totalChatUnread}
              onItemClick={() => setIsDrawerOpen(false)}
            />

            <div className="p-4 border-t border-slate-200">
              <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-50 border border-slate-100">
                <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-xs shrink-0">
                  {userInitials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">Quản trị viên</p>
                  <p className="text-[11px] text-slate-500 truncate" title={user?.email || ''}>
                    {user?.email || 'admin@auraphone.vn'}
                  </p>
                </div>
                <Badge variant="success" className="text-[10px] px-1.5 py-0.5 shrink-0">
                  Admin
                </Badge>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 border-r border-slate-200 bg-white flex-col shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-slate-200 gap-3">
          <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/30 font-bold">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 tracking-tight leading-none">
              AuraPhone Admin
            </h1>
            <p className="text-xs text-slate-500 mt-1">Management Portal</p>
          </div>
        </div>

        <NavLinksList totalChatUnread={totalChatUnread} />

        {/* User Info bottom */}
        <div className="p-4 border-t border-slate-200">
          <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-50 border border-slate-100">
            <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-xs shrink-0">
              {userInitials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-800 truncate">Quản trị viên</p>
              <p className="text-[11px] text-slate-500 truncate" title={user?.email || ''}>
                {user?.email || 'admin@auraphone.vn'}
              </p>
            </div>
            <Badge variant="success" className="text-[10px] px-1.5 py-0.5 shrink-0">
              Admin
            </Badge>
          </div>
        </div>
      </aside>

      {/* Main Content Layout */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setIsDrawerOpen((prev) => !prev)}
              aria-label="Mở menu điều hướng"
              aria-expanded={isDrawerOpen}
              aria-controls="admin-drawer-nav"
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors focus:outline-hidden focus:ring-2 focus:ring-blue-600 shrink-0"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">
              Bảng điều khiển quản trị hệ thống AuraPhone
            </h2>
            <Badge variant="secondary" className="hidden sm:inline-flex gap-1 font-normal text-xs text-slate-600 shrink-0">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
              Phiên bản 3.0
            </Badge>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <AdminNotificationBell />

            <div className="text-right hidden sm:block">
              <span className="text-xs font-medium text-slate-500 block">Đang đăng nhập</span>
              <span className="text-xs font-semibold text-slate-800">{user?.email}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="gap-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-slate-200 hover:border-rose-200"
            >
              <LogOut className="h-3.5 w-3.5" />
              Đăng xuất
            </Button>
          </div>
        </header>

        {/* Dynamic Page Content */}
        <main className="p-4 lg:p-8 space-y-6 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
