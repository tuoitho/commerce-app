import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ArrowLeft, Lock, LockOpen, RefreshCw, UserX } from 'lucide-react'
import {
  getAdminUser,
  lockAdminUser,
  unlockAdminUser,
  USER_ROLE_LABELS,
  USER_STATUS_LABELS,
  type AdminUserDetail,
} from '@/api/users'
import { ApiError, ORDER_STATUS_LABELS } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { formatVietnamDateTime } from '@/components/dashboard/formatters'
import { formatVND } from '@/lib/utils'
import { roleBadgeClasses, statusBadgeClasses } from './UsersPage'

const MAX_REASON_LENGTH = 500
const CONFLICT_CODES = new Set(['user_already_locked', 'user_not_locked', 'cannot_lock_admin'])

type DialogMode = 'lock' | 'unlock' | null
type Notice = { kind: 'success' | 'error'; message: string } | null

function backToListPath(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from
  return typeof from === 'string' && from.startsWith('?') ? `/users${from}` : '/users'
}

export function UserDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const location = useLocation()
  const queryClient = useQueryClient()
  const backPath = backToListPath(location.state)

  const [dialog, setDialog] = useState<DialogMode>(null)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const noticeRef = useRef<HTMLDivElement>(null)

  const { data: user, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-user', id],
    queryFn: () => getAdminUser(id),
  })

  // The button that opened the dialog is replaced after a successful action,
  // so focus moves to the notice that announces the result.
  useEffect(() => {
    if (notice) noticeRef.current?.focus()
  }, [notice])

  const closeDialog = () => {
    setDialog(null)
    setReason('')
    setReasonError(null)
    setDialogError(null)
  }

  const handleSuccess = (updated: AdminUserDetail, message: string) => {
    queryClient.setQueryData(['admin-user', id], updated)
    queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    closeDialog()
    setNotice({ kind: 'success', message })
  }

  const handleError = (err: unknown) => {
    if (err instanceof ApiError && err.fields?.reason) {
      setReasonError(err.fields.reason)
      return
    }
    if (err instanceof ApiError && CONFLICT_CODES.has(err.code)) {
      closeDialog()
      setNotice({ kind: 'error', message: err.message })
      refetch()
      return
    }
    setDialogError(err instanceof Error ? err.message : 'Đã xảy ra lỗi. Vui lòng thử lại.')
  }

  const lockMutation = useMutation({
    mutationFn: () => lockAdminUser(id, reason.trim()),
    onSuccess: (updated) => handleSuccess(updated, 'Đã khóa tài khoản'),
    onError: handleError,
  })

  const unlockMutation = useMutation({
    mutationFn: () => unlockAdminUser(id),
    onSuccess: (updated) => handleSuccess(updated, 'Đã mở khóa tài khoản'),
    onError: handleError,
  })

  const isSubmitting = lockMutation.isPending || unlockMutation.isPending

  const backLink = (
    <Link
      to={backPath}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Quay lại danh sách
    </Link>
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        {backLink}
        <Card>
          <CardContent className="p-10 text-center text-sm text-slate-500">
            <RefreshCw className="h-5 w-5 animate-spin text-blue-600 mx-auto mb-2" />
            Đang tải thông tin người dùng...
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isError || !user) {
    const notFound = error instanceof ApiError && error.code === 'user_not_found'
    return (
      <div className="space-y-6">
        {backLink}
        <Card className={notFound ? undefined : 'border-rose-200 bg-rose-50/50'}>
          <CardContent className="p-8 flex flex-col items-center justify-center text-center">
            <div className="h-12 w-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 mb-3">
              {notFound ? <UserX className="h-6 w-6" /> : <AlertCircle className="h-6 w-6" />}
            </div>
            <h1 className="text-base font-semibold text-slate-900">
              {notFound ? 'Không tìm thấy người dùng' : 'Không thể tải thông tin người dùng'}
            </h1>
            {!notFound && (
              <>
                <p className="text-sm text-rose-600 mt-1 max-w-md">
                  {error instanceof Error ? error.message : 'Không thể kết nối đến máy chủ.'}
                </p>
                <Button
                  variant="outline"
                  onClick={() => refetch()}
                  className="mt-4 border-rose-300 text-rose-700 hover:bg-rose-100"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Thử lại
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const canLock = user.role === 'customer' && user.status === 'active'
  const canUnlock = user.status === 'locked'
  const summary = user.orderSummary

  return (
    <div className="space-y-6">
      {backLink}

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight break-all">{user.email}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className={roleBadgeClasses[user.role]}>
              {USER_ROLE_LABELS[user.role] ?? user.role}
            </Badge>
            <Badge variant="secondary" className={statusBadgeClasses[user.status]}>
              {USER_STATUS_LABELS[user.status] ?? user.status}
            </Badge>
          </div>
        </div>
        {canLock && (
          <Button variant="destructive" onClick={() => setDialog('lock')} className="shrink-0">
            <Lock className="h-4 w-4 mr-2" aria-hidden="true" />
            Khóa tài khoản
          </Button>
        )}
        {canUnlock && (
          <Button variant="outline" onClick={() => setDialog('unlock')} className="shrink-0">
            <LockOpen className="h-4 w-4 mr-2" aria-hidden="true" />
            Mở khóa tài khoản
          </Button>
        )}
      </div>

      {notice && (
        <div
          ref={noticeRef}
          tabIndex={-1}
          role={notice.kind === 'success' ? 'status' : 'alert'}
          className={
            notice.kind === 'success'
              ? 'rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500'
              : 'rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500'
          }
        >
          {notice.message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="user-account-heading">
          <Card className="h-full">
            <CardContent className="p-5">
              <h2 id="user-account-heading" className="text-sm font-semibold text-slate-900 mb-4">
                Thông tin tài khoản
              </h2>
              <dl className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-x-4 gap-y-3 text-sm">
                <dt className="text-slate-500">Ngày tạo</dt>
                <dd className="text-slate-900">{formatVietnamDateTime(user.createdAt)}</dd>
                {user.status === 'locked' && (
                  <>
                    <dt className="text-slate-500">Thời điểm khóa</dt>
                    <dd className="text-slate-900">{formatVietnamDateTime(user.lockedAt)}</dd>
                    <dt className="text-slate-500">Lý do khóa</dt>
                    <dd className="text-slate-900 break-words whitespace-pre-line">
                      {user.lockReason || <span className="text-slate-500 italic">Không có lý do</span>}
                    </dd>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="user-summary-heading">
          <Card className="h-full">
            <CardContent className="p-5">
              <h2 id="user-summary-heading" className="text-sm font-semibold text-slate-900 mb-4">
                Tóm tắt mua hàng
              </h2>
              <dl className="grid grid-cols-1 sm:grid-cols-[12rem_1fr] gap-x-4 gap-y-3 text-sm">
                <dt className="text-slate-500">Tổng số đơn hàng</dt>
                <dd className="text-slate-900 tabular-nums">{summary.totalOrders}</dd>
                <dt className="text-slate-500">Số đơn đã giao</dt>
                <dd className="text-slate-900 tabular-nums">{summary.deliveredOrders}</dd>
                <dt className="text-slate-500">Tổng giá trị đơn đã giao</dt>
                <dd className="text-slate-900 font-semibold tabular-nums">{formatVND(summary.deliveredTotalVnd)}</dd>
                <dt className="text-slate-500">Đơn gần nhất</dt>
                <dd className="text-slate-900">
                  {summary.lastOrderAt ? formatVietnamDateTime(summary.lastOrderAt) : 'Chưa có đơn hàng'}
                </dd>
              </dl>
            </CardContent>
          </Card>
        </section>
      </div>

      <section aria-labelledby="user-orders-heading">
        <Card>
          <CardContent className="p-5">
            <h2 id="user-orders-heading" className="text-sm font-semibold text-slate-900 mb-4">
              Đơn hàng gần nhất
            </h2>
            {user.recentOrders.length === 0 ? (
              <p className="text-sm text-slate-500">Tài khoản chưa có đơn hàng</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {user.recentOrders.map((order) => (
                  <li key={order.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        to={`/orders/${order.id}`}
                        className="font-mono text-xs font-semibold text-blue-700 hover:underline break-all rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        #{order.id}
                      </Link>
                      <p className="text-xs text-slate-500 mt-0.5">{formatVietnamDateTime(order.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge variant="secondary">{ORDER_STATUS_LABELS[order.status] ?? order.status}</Badge>
                      <span className="text-sm font-semibold text-slate-900 tabular-nums">
                        {formatVND(order.totalVnd)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <AlertDialog open={dialog !== null} onOpenChange={(open) => !open && !isSubmitting && closeDialog()}>
        <AlertDialogContent>
          {dialog === 'lock' ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Khóa tài khoản</AlertDialogTitle>
                <AlertDialogDescription>
                  Tài khoản <strong className="text-slate-800 break-all">{user.email}</strong> sẽ không thể đăng
                  nhập và mọi phiên đăng nhập hiện có sẽ bị thu hồi.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="mt-4 space-y-1.5">
                <label htmlFor="lock-reason" className="text-sm font-medium text-slate-700">
                  Lý do khóa
                </label>
                <Textarea
                  id="lock-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={MAX_REASON_LENGTH}
                  placeholder="Không bắt buộc"
                  error={Boolean(reasonError)}
                  aria-invalid={reasonError ? 'true' : undefined}
                  aria-describedby={reasonError ? 'lock-reason-error' : undefined}
                />
                {reasonError && (
                  <p id="lock-reason-error" className="text-xs text-rose-600">
                    {reasonError}
                  </p>
                )}
              </div>
            </>
          ) : (
            <AlertDialogHeader>
              <AlertDialogTitle>Mở khóa tài khoản</AlertDialogTitle>
              <AlertDialogDescription>
                Tài khoản <strong className="text-slate-800 break-all">{user.email}</strong> sẽ đăng nhập lại được
                bằng mật khẩu hiện có.
              </AlertDialogDescription>
            </AlertDialogHeader>
          )}
          {dialogError && (
            <p role="alert" className="mt-3 text-sm text-rose-600">
              {dialogError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Hủy</AlertDialogCancel>
            {dialog === 'lock' ? (
              <AlertDialogAction onClick={() => lockMutation.mutate()} isLoading={lockMutation.isPending}>
                Khóa tài khoản
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                variant="primary"
                onClick={() => unlockMutation.mutate()}
                isLoading={unlockMutation.isPending}
              >
                Mở khóa
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
