import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  Users,
  Settings,
  ShieldCheck,
  LogOut,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const userInitials = user?.email ? user.email.slice(0, 2).toUpperCase() : 'AD'

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-200 bg-white flex flex-col shrink-0">
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

        <nav className="p-4 space-y-1 flex-1">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            <LayoutDashboard className="h-4 w-4" />
            <span>Tổng quan</span>
          </NavLink>

          <NavLink
            to="/products"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            <Package className="h-4 w-4" />
            <span>Sản phẩm</span>
          </NavLink>

          <div
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-400 cursor-not-allowed opacity-60"
            title="Sắp ra mắt"
          >
            <Users className="h-4 w-4" />
            <span>Người dùng</span>
          </div>

          <div
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-400 cursor-not-allowed opacity-60"
            title="Sắp ra mắt"
          >
            <Settings className="h-4 w-4" />
            <span>Cài đặt</span>
          </div>
        </nav>

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
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900">
              Bảng điều khiển quản trị hệ thống AuraPhone
            </h2>
            <Badge variant="secondary" className="gap-1 font-normal text-xs text-slate-600">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
              Phiên bản 3.0
            </Badge>
          </div>

          <div className="flex items-center gap-4">
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
        <main className="p-8 space-y-6 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
