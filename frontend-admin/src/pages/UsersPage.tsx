import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, ChevronLeft, ChevronRight, RefreshCw, Search, Users } from 'lucide-react'
import {
  listAdminUsers,
  USER_ROLE_LABELS,
  USER_STATUS_LABELS,
  type ListAdminUsersParams,
  type UserRole,
  type UserStatus,
} from '@/api/users'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatVietnamDate } from '@/components/dashboard/formatters'

const PAGE_SIZE = 20
const MAX_SEARCH_LENGTH = 100

export const roleBadgeClasses: Record<UserRole, string> = {
  customer: 'bg-slate-100 text-slate-700 border-slate-200',
  admin: 'bg-indigo-50 text-indigo-700 border-indigo-200',
}

export const statusBadgeClasses: Record<UserStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  locked: 'bg-rose-50 text-rose-700 border-rose-200',
}

function parseRole(value: string | null): UserRole | undefined {
  return value === 'customer' || value === 'admin' ? value : undefined
}

function parseStatus(value: string | null): UserStatus | undefined {
  return value === 'active' || value === 'locked' ? value : undefined
}

function parsePage(value: string | null): number {
  const page = Number(value)
  return Number.isInteger(page) && page >= 1 ? page : 1
}

export function UsersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()

  const search = (searchParams.get('search') || '').trim().slice(0, MAX_SEARCH_LENGTH)
  const role = parseRole(searchParams.get('role'))
  const status = parseStatus(searchParams.get('status'))
  const page = parsePage(searchParams.get('page'))

  const [searchInput, setSearchInput] = useState(search)
  useEffect(() => {
    setSearchInput(search)
  }, [search])

  const params: ListAdminUsersParams = {
    ...(search ? { search } : {}),
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
    page,
    limit: PAGE_SIZE,
  }

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-users', search, role ?? '', status ?? '', page],
    queryFn: () => listAdminUsers(params),
  })

  const users = data?.data ?? []
  const pagination = data?.meta?.pagination
  const total = pagination?.total ?? users.length
  const totalPages = pagination?.totalPages ?? 1

  // Default values are left out of the URL; any filter change returns to page 1.
  const updateParams = (next: { search?: string; role?: string; status?: string; page?: number }) => {
    const merged = {
      search: next.search ?? search,
      role: next.role ?? role ?? '',
      status: next.status ?? status ?? '',
      page: next.page ?? 1,
    }
    const nextParams = new URLSearchParams()
    if (merged.search) nextParams.set('search', merged.search)
    if (merged.role) nextParams.set('role', merged.role)
    if (merged.status) nextParams.set('status', merged.status)
    if (merged.page > 1) nextParams.set('page', String(merged.page))
    setSearchParams(nextParams)
  }

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault()
    updateParams({ search: searchInput.trim() })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Quản lý người dùng</h1>
        <p className="text-sm text-slate-500 mt-1">
          Tra cứu tài khoản khách hàng và quản trị viên, khóa hoặc mở khóa tài khoản vi phạm.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <form onSubmit={handleSearchSubmit} className="flex flex-1 items-center gap-2 min-w-0" role="search">
              <div className="relative flex-1 min-w-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  maxLength={MAX_SEARCH_LENGTH}
                  placeholder="Tìm theo email..."
                  aria-label="Tìm theo email"
                  className="pl-9"
                />
              </div>
              <Button type="submit" variant="primary" className="shrink-0">
                Tìm
              </Button>
            </form>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:w-[26rem]">
              <Select
                value={role ?? ''}
                onChange={(e) => updateParams({ role: e.target.value })}
                aria-label="Lọc theo vai trò"
              >
                <option value="">Tất cả vai trò</option>
                <option value="customer">{USER_ROLE_LABELS.customer}</option>
                <option value="admin">{USER_ROLE_LABELS.admin}</option>
              </Select>
              <Select
                value={status ?? ''}
                onChange={(e) => updateParams({ status: e.target.value })}
                aria-label="Lọc theo trạng thái"
              >
                <option value="">Tất cả trạng thái</option>
                <option value="active">{USER_STATUS_LABELS.active}</option>
                <option value="locked">{USER_STATUS_LABELS.locked}</option>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isError ? (
        <Card className="border-rose-200 bg-rose-50/50">
          <CardContent className="p-8 flex flex-col items-center justify-center text-center">
            <div className="h-12 w-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 mb-3">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h2 className="text-base font-semibold text-rose-900">Không thể tải danh sách người dùng</h2>
            <p className="text-sm text-rose-600 mt-1 max-w-md">
              {error instanceof Error ? error.message : 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại.'}
            </p>
            <Button
              variant="outline"
              onClick={() => refetch()}
              className="mt-4 border-rose-300 text-rose-700 hover:bg-rose-100"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Thử lại
            </Button>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-slate-500" role="status">
            <RefreshCw className="h-5 w-5 animate-spin text-blue-600 mx-auto mb-2" />
            Đang tải danh sách người dùng...
          </CardContent>
        </Card>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="py-14 flex flex-col items-center justify-center text-center text-slate-500">
            <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
              <Users className="h-6 w-6" />
            </div>
            <p className="text-base font-semibold text-slate-800">Không tìm thấy người dùng phù hợp</p>
          </CardContent>
        </Card>
      ) : (
        <Card className={isFetching ? 'opacity-70 transition-opacity' : undefined}>
          <div className="overflow-x-auto rounded-2xl">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead className="whitespace-nowrap">Vai trò</TableHead>
                  <TableHead className="whitespace-nowrap">Trạng thái</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Số đơn hàng</TableHead>
                  <TableHead className="whitespace-nowrap">Ngày tạo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id} className="hover:bg-slate-50/70 transition-colors">
                    <TableCell className="text-sm font-medium min-w-[14rem]">
                      <Link
                        to={`/users/${user.id}`}
                        state={{ from: location.search }}
                        className="text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-sm break-all"
                      >
                        {user.email}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant="secondary" className={roleBadgeClasses[user.role]}>
                        {USER_ROLE_LABELS[user.role] ?? user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant="secondary" className={statusBadgeClasses[user.status]}>
                        {USER_STATUS_LABELS[user.status] ?? user.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-slate-700">
                      {user.orderCount}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600 whitespace-nowrap">
                      {formatVietnamDate(user.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {!isError && !isLoading && users.length > 0 && (
        <nav
          aria-label="Phân trang người dùng"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-slate-600"
        >
          <p>Tổng cộng {total} người dùng</p>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateParams({ page: page - 1 })}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" aria-hidden="true" />
              Trước
            </Button>
            <span aria-live="polite">
              Trang {page} / {Math.max(totalPages, 1)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateParams({ page: page + 1 })}
              disabled={page >= totalPages}
            >
              Sau
              <ChevronRight className="h-4 w-4 ml-1" aria-hidden="true" />
            </Button>
          </div>
        </nav>
      )}
    </div>
  )
}
