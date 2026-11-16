import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import {
  Camera,
  CheckCircle2,
  KeyRound,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  User as UserIcon,
} from 'lucide-react'
import { accountApi } from '@/api/account'
import { addressesApi } from '@/api/addresses'
import { ApiError, type Address, type User } from '@/api/types'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { AvatarDisplay } from '@/components/AvatarDisplay'
import { AddressFormDialog } from '@/components/addresses/AddressFormDialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type AccountTab = 'profile' | 'password' | 'addresses'

const TAB_DEFS: { id: AccountTab; label: string; icon: typeof UserIcon }[] = [
  { id: 'profile', label: 'Hồ sơ cá nhân', icon: UserIcon },
  { id: 'password', label: 'Đổi mật khẩu', icon: KeyRound },
  { id: 'addresses', label: 'Sổ địa chỉ', icon: MapPin },
]

function parseTab(raw: string | null): AccountTab {
  if (raw === 'password' || raw === 'addresses') return raw
  return 'profile'
}

export function AccountPage() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = parseTab(searchParams.get('tab'))
  const { user, isAuthenticated, isLoading: authLoading, updateUser, applySession } = useAuth()
  const { success, error: toastError } = useToast()

  const tabRefs = useRef<Record<AccountTab, HTMLButtonElement | null>>({
    profile: null,
    password: null,
    addresses: null,
  })
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [profileUser, setProfileUser] = useState<User | null>(user)
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({})
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [deletingAvatar, setDeletingAvatar] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({})
  const [savingPassword, setSavingPassword] = useState(false)

  const [addresses, setAddresses] = useState<Address[]>([])
  const [addressesLoading, setAddressesLoading] = useState(false)
  const [addressesError, setAddressesError] = useState<string | null>(null)
  const [isAddressDialogOpen, setIsAddressDialogOpen] = useState(false)
  const [editingAddress, setEditingAddress] = useState<Address | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Address | null>(null)
  const [isDeletingAddress, setIsDeletingAddress] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) return
    let active = true
    accountApi
      .getProfile()
      .then((fresh) => {
        if (!active) return
        setProfileUser(fresh)
        setDisplayName(fresh.displayName ?? '')
        setPhone(fresh.phone ?? '')
        updateUser?.(fresh)
      })
      .catch(() => {
        // Keep cached auth user if transient network error occurs
      })
    return () => {
      active = false
    }
  }, [isAuthenticated, updateUser])

  const fetchAddresses = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      setAddressesLoading(true)
      setAddressesError(null)
      const list = await addressesApi.listAddresses()
      setAddresses(list)
    } catch {
      setAddressesError('Không thể tải danh sách địa chỉ. Vui lòng thử lại.')
    } finally {
      setAddressesLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (isAuthenticated && activeTab === 'addresses') {
      fetchAddresses()
    }
  }, [isAuthenticated, activeTab, fetchAddresses])

  if (authLoading && !user) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8 space-y-6">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    )
  }

  if (!authLoading && !isAuthenticated) {
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?redirect=${redirect}`} replace />
  }

  const switchTab = (next: AccountTab, moveFocus = false) => {
    setSearchParams({ tab: next }, { replace: false })
    if (moveFocus) {
      queueMicrotask(() => {
        tabRefs.current[next]?.focus()
      })
    }
  }

  const handleTabKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const delta = e.key === 'ArrowRight' ? 1 : -1
    const nextIdx = (idx + delta + TAB_DEFS.length) % TAB_DEFS.length
    switchTab(TAB_DEFS[nextIdx].id, true)
  }

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileErrors({})

    const trimmedName = displayName.trim()
    const trimmedPhone = phone.trim()
    const clientErrors: Record<string, string> = {}
    if (Array.from(trimmedName).length > 80) {
      clientErrors.displayName = 'Tên hiển thị tối đa 80 ký tự'
    }
    if (trimmedPhone && !/^0\d{9,10}$/.test(trimmedPhone)) {
      clientErrors.phone = 'Số điện thoại không hợp lệ (10-11 chữ số, bắt đầu bằng 0)'
    }
    if (Object.keys(clientErrors).length > 0) {
      setProfileErrors(clientErrors)
      return
    }

    try {
      setSavingProfile(true)
      const updated = await accountApi.updateProfile({
        displayName: trimmedName || null,
        phone: trimmedPhone || null,
      })
      setProfileUser(updated)
      setDisplayName(updated.displayName ?? '')
      setPhone(updated.phone ?? '')
      updateUser?.(updated)
      success('Lưu hồ sơ thành công', 'Thông tin cá nhân của bạn đã được cập nhật.')
    } catch (err: unknown) {
      if (err instanceof ApiError && err.fields) {
        setProfileErrors(err.fields)
      } else if (err instanceof ApiError) {
        toastError('Không thể cập nhật hồ sơ', err.message)
      } else {
        toastError('Lỗi kết nối', 'Không thể cập nhật thông tin tài khoản.')
      }
    } finally {
      setSavingProfile(false)
    }
  }

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setProfileErrors((prev) => {
      const next = { ...prev }
      delete next.avatar
      return next
    })

    if (file.size > 5 * 1024 * 1024) {
      setProfileErrors((prev) => ({
        ...prev,
        avatar: 'Ảnh đại diện không hợp lệ hoặc vượt quá 5MB',
      }))
      return
    }

    try {
      setUploadingAvatar(true)
      const updated = await accountApi.uploadAvatar(file)
      setProfileUser(updated)
      updateUser?.(updated)
      success('Cập nhật ảnh đại diện thành công', 'Ảnh đại diện mới đã được áp dụng.')
    } catch (err: unknown) {
      if (err instanceof ApiError && err.fields?.avatar) {
        setProfileErrors((prev) => ({ ...prev, avatar: err.fields!.avatar }))
      } else if (err instanceof ApiError) {
        toastError('Tải ảnh thất bại', err.message)
      } else {
        toastError('Lỗi kết nối', 'Không thể tải ảnh đại diện lên.')
      }
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleDeleteAvatar = async () => {
    try {
      setDeletingAvatar(true)
      const updated = await accountApi.deleteAvatar()
      setProfileUser(updated)
      updateUser?.(updated)
      success('Đã xóa ảnh đại diện', 'Ảnh đại diện đã được gỡ bỏ khỏi tài khoản.')
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        toastError('Không thể xóa ảnh', err.message)
      } else {
        toastError('Lỗi kết nối', 'Không thể xóa ảnh đại diện.')
      }
    } finally {
      setDeletingAvatar(false)
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!currentPassword) {
      errs.currentPassword = 'Vui lòng nhập mật khẩu hiện tại'
    }
    if (!newPassword) {
      errs.newPassword = 'Vui lòng nhập mật khẩu mới'
    }
    if (confirmNewPassword !== newPassword) {
      errs.confirmNewPassword = 'Mật khẩu xác nhận không khớp'
    }
    if (Object.keys(errs).length > 0) {
      setPasswordErrors(errs)
      return
    }

    setPasswordErrors({})
    try {
      setSavingPassword(true)
      const session = await accountApi.changePassword({
        currentPassword,
        newPassword,
      })
      applySession?.(session)
      setProfileUser(session.user)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
      success('Đổi mật khẩu thành công', 'Mật khẩu đã được cập nhật và các phiên cũ đã bị thu hồi.')
    } catch (err: unknown) {
      if (err instanceof ApiError && err.fields) {
        setPasswordErrors(err.fields)
      } else if (err instanceof ApiError) {
        toastError('Không thể đổi mật khẩu', err.message)
      } else {
        toastError('Lỗi kết nối', 'Không thể đổi mật khẩu lúc này.')
      }
    } finally {
      setSavingPassword(false)
    }
  }

  const handleSetDefaultAddress = async (addrId: string) => {
    try {
      await addressesApi.setDefaultAddress(addrId)
      success('Đặt mặc định thành công', 'Đã cập nhật địa chỉ nhận hàng mặc định.')
      await fetchAddresses()
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        toastError('Thao tác thất bại', err.message)
      } else {
        toastError('Lỗi kết nối', 'Không thể đặt địa chỉ mặc định.')
      }
    }
  }

  const handleConfirmDeleteAddress = async () => {
    if (!deleteTarget) return
    try {
      setIsDeletingAddress(true)
      await addressesApi.deleteAddress(deleteTarget.id)
      success('Đã xóa địa chỉ', 'Địa chỉ đã được loại bỏ khỏi sổ địa chỉ.')
      setDeleteTarget(null)
      await fetchAddresses()
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        toastError('Không thể xóa địa chỉ', err.message)
      } else {
        toastError('Lỗi kết nối', 'Không thể xóa địa chỉ.')
      }
    } finally {
      setIsDeletingAddress(false)
    }
  }

  const currentDisplayUser = profileUser ?? user
  const headerName = currentDisplayUser?.displayName?.trim() || 'Khách hàng'

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Editorial Account Header */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <AvatarDisplay
            src={currentDisplayUser?.avatarUrl}
            name={currentDisplayUser?.displayName}
            email={currentDisplayUser?.email}
            size="lg"
          />
          <div className="min-w-0 space-y-1">
            <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-400">
              Trung tâm tài khoản
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-zinc-950 truncate">
              {headerName}
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 truncate">
              {currentDisplayUser?.email}
            </p>
          </div>
        </div>
      </section>

      {/* Navigation Tabs */}
      <div
        role="tablist"
        aria-label="Mục quản lý tài khoản"
        className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-white p-1.5"
      >
        {TAB_DEFS.map((tab, idx) => {
          const Icon = tab.icon
          const selected = activeTab === tab.id
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el
              }}
              id={`account-tab-${tab.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`account-tabpanel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => switchTab(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, idx)}
              className={`flex-1 min-w-[110px] inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                selected
                  ? 'bg-zinc-950 text-white shadow-2xs'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab 1: Profile */}
      {activeTab === 'profile' && (
        <section
          id="account-tabpanel-profile"
          role="tabpanel"
          aria-labelledby="account-tab-profile"
          className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-6"
        >
          <div className="border-b border-zinc-100 pb-4">
            <h2 className="text-lg font-bold text-zinc-950">Hồ sơ cá nhân</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Cập nhật tên hiển thị, số điện thoại liên hệ và ảnh đại diện của bạn.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-5 pb-6 border-b border-zinc-100">
            <AvatarDisplay
              src={currentDisplayUser?.avatarUrl}
              name={currentDisplayUser?.displayName}
              email={currentDisplayUser?.email}
              size="lg"
            />
            <div className="space-y-2.5 min-w-0">
              <div className="text-sm font-semibold text-zinc-900">Ảnh đại diện</div>
              <p className="text-xs text-zinc-500">
                Hỗ trợ JPEG, PNG hoặc WebP với dung lượng tối đa 5MB.
              </p>
              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  ref={fileInputRef}
                  data-testid="avatar-file-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleAvatarFileChange}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  isLoading={uploadingAvatar}
                  disabled={uploadingAvatar || deletingAvatar}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl"
                >
                  <Camera className="h-3.5 w-3.5" />
                  <span>Tải ảnh mới</span>
                </Button>
                {currentDisplayUser?.avatarUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    isLoading={deletingAvatar}
                    disabled={uploadingAvatar || deletingAvatar}
                    onClick={handleDeleteAvatar}
                    className="rounded-xl text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Xóa ảnh</span>
                  </Button>
                )}
              </div>
              {profileErrors.avatar && (
                <p className="text-xs text-rose-600">{profileErrors.avatar}</p>
              )}
            </div>
          </div>

          <form onSubmit={handleProfileSubmit} className="space-y-4 max-w-lg">
            <div className="space-y-1.5">
              <Label htmlFor="account-email">Email</Label>
              <Input
                id="account-email"
                value={currentDisplayUser?.email ?? ''}
                readOnly
                className="bg-zinc-50 text-zinc-500 cursor-not-allowed"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="account-displayName">Tên hiển thị</Label>
              <Input
                id="account-displayName"
                placeholder="VD: Nguyễn Minh Anh"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                error={Boolean(profileErrors.displayName)}
              />
              {profileErrors.displayName && (
                <p className="text-xs text-rose-600">{profileErrors.displayName}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="account-phone">Số điện thoại</Label>
              <Input
                id="account-phone"
                type="tel"
                placeholder="VD: 0912345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                error={Boolean(profileErrors.phone)}
              />
              {profileErrors.phone && (
                <p className="text-xs text-rose-600">{profileErrors.phone}</p>
              )}
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                isLoading={savingProfile}
                disabled={savingProfile}
                className="rounded-xl"
              >
                Lưu thay đổi
              </Button>
            </div>
          </form>
        </section>
      )}

      {/* Tab 2: Password */}
      {activeTab === 'password' && (
        <section
          id="account-tabpanel-password"
          role="tabpanel"
          aria-labelledby="account-tab-password"
          className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-6"
        >
          <div className="border-b border-zinc-100 pb-4">
            <h2 className="text-lg font-bold text-zinc-950">Đổi mật khẩu</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Sau khi đổi mật khẩu, các thiết bị đăng nhập trước đó sẽ được yêu cầu đăng nhập lại.
            </p>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-lg">
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword" required>
                Mật khẩu hiện tại
              </Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                error={Boolean(passwordErrors.currentPassword)}
              />
              {passwordErrors.currentPassword && (
                <p className="text-xs text-rose-600">{passwordErrors.currentPassword}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="newPassword" required>
                Mật khẩu mới
              </Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                error={Boolean(passwordErrors.newPassword)}
              />
              {passwordErrors.newPassword && (
                <p className="text-xs text-rose-600">{passwordErrors.newPassword}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmNewPassword" required>
                Xác nhận mật khẩu mới
              </Label>
              <Input
                id="confirmNewPassword"
                type="password"
                autoComplete="new-password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                error={Boolean(passwordErrors.confirmNewPassword)}
              />
              {passwordErrors.confirmNewPassword && (
                <p className="text-xs text-rose-600">{passwordErrors.confirmNewPassword}</p>
              )}
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                isLoading={savingPassword}
                disabled={savingPassword}
                className="rounded-xl"
              >
                Đổi mật khẩu
              </Button>
            </div>
          </form>
        </section>
      )}

      {/* Tab 3: Address Book */}
      {activeTab === 'addresses' && (
        <section
          id="account-tabpanel-addresses"
          role="tabpanel"
          aria-labelledby="account-tab-addresses"
          className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-zinc-950">Sổ địa chỉ nhận hàng</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Quản lý danh sách địa chỉ dùng trực tiếp khi thanh toán đơn hàng.
              </p>
            </div>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => {
                setEditingAddress(null)
                setIsAddressDialogOpen(true)
              }}
              className="rounded-xl"
            >
              <Plus className="h-4 w-4" />
              <span>Thêm địa chỉ mới</span>
            </Button>
          </div>

          {addressesLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ) : addressesError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs sm:text-sm text-rose-700 font-medium">{addressesError}</p>
              <Button type="button" variant="outline" size="sm" onClick={fetchAddresses} className="rounded-xl">
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Thử lại</span>
              </Button>
            </div>
          ) : addresses.length === 0 ? (
            <EmptyState
              icon={<MapPin className="h-7 w-7 text-zinc-400" />}
              title="Bạn chưa có địa chỉ nhận hàng"
              description="Thêm địa chỉ mới để sử dụng nhanh chóng khi đặt mua sản phẩm."
            />
          ) : (
            <div className="space-y-3">
              {addresses.map((addr) => (
                <div
                  key={addr.id}
                  data-testid={`address-card-${addr.id}`}
                  className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 transition-colors ${
                    addr.isDefault ? 'border-zinc-950 bg-zinc-50/60' : 'border-zinc-200 bg-white'
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-zinc-950">{addr.recipientName}</span>
                      <span className="text-xs font-mono text-zinc-500">{addr.phone}</span>
                      {addr.isDefault && (
                        <Badge variant="success" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Mặc định</span>
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed break-words">
                      {addr.detailAddress}, {addr.wardName}, {addr.provinceName}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {!addr.isDefault && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetDefaultAddress(addr.id)}
                        className="rounded-xl text-xs"
                      >
                        Đặt mặc định
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="iconSm"
                      aria-label={`Sửa địa chỉ ${addr.recipientName}`}
                      onClick={() => {
                        setEditingAddress(addr)
                        setIsAddressDialogOpen(true)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="iconSm"
                      aria-label={`Xóa địa chỉ ${addr.recipientName}`}
                      onClick={() => setDeleteTarget(addr)}
                      className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <AddressFormDialog
        open={isAddressDialogOpen}
        onOpenChange={setIsAddressDialogOpen}
        editingAddress={editingAddress}
        defaultNewAddress={addresses.length === 0}
        onSaved={async () => {
          await fetchAddresses()
        }}
      />

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận xóa địa chỉ</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn xóa địa chỉ của{' '}
              <strong className="text-zinc-950">{deleteTarget?.recipientName}</strong> khỏi sổ địa chỉ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={isDeletingAddress}
              onClick={() => setDeleteTarget(null)}
              className="rounded-xl"
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              isLoading={isDeletingAddress}
              disabled={isDeletingAddress}
              onClick={handleConfirmDeleteAddress}
              className="rounded-xl"
            >
              Xác nhận xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
