import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, Gift, Loader2, Tag, Ticket, Wallet } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import {
  claimVoucher,
  listDiscoverVouchers,
  listWalletVouchers,
  type WalletStatusFilter,
} from '@/api/vouchers'
import type { DiscoverVoucher, UserVoucher, Voucher, VoucherWalletStatus } from '@/api/types'
import { ApiError } from '@/api/client'
import { formatVND } from '@/lib/utils'

type TabMode = 'discover' | 'wallet'
type WalletFilterTab = 'all' | WalletStatusFilter

const WALLET_STATUS_LABELS: Record<VoucherWalletStatus, string> = {
  available: 'Khả dụng',
  used_up: 'Đã dùng hết lượt',
  expired: 'Đã hết hạn',
  exhausted: 'Hết lượt phát hành',
  inactive: 'Ngừng áp dụng',
  scheduled: 'Chưa bắt đầu',
}

const WALLET_STATUS_CLASSES: Record<VoucherWalletStatus, string> = {
  available: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  used_up: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  expired: 'bg-rose-50 text-rose-700 border-rose-200',
  exhausted: 'bg-amber-50 text-amber-800 border-amber-200',
  inactive: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
}

function formatVoucherBenefit(voucher: Voucher): string {
  if (voucher.voucherType === 'percent') {
    const cap = voucher.maxDiscountVnd ? ` (tối đa ${formatVND(voucher.maxDiscountVnd)})` : ''
    return `Giảm ${voucher.discountValue}%${cap}`
  }
  if (voucher.voucherType === 'freeship') {
    const cap = voucher.maxDiscountVnd ? ` tối đa ${formatVND(voucher.maxDiscountVnd)}` : ''
    return `Miễn phí vận chuyển${cap}`
  }
  return `Giảm ${formatVND(voucher.discountValue)}`
}

export function formatVoucherScopeLabel(voucher: Voucher): string {
  const scopeType = voucher.scopeType || 'all'
  if (scopeType === 'categories') {
    const names = (voucher.scopeCategories || []).map((c) => c.name)
    if (names.length === 0) return 'Áp dụng cho danh mục chọn lọc'
    return names.length <= 2
      ? `Danh mục: ${names.join(', ')}`
      : `Danh mục: ${names.slice(0, 2).join(', ')} (+${names.length - 2})`
  }
  if (scopeType === 'products') {
    const names = (voucher.scopeProducts || []).map((p) => p.name)
    if (names.length === 0) return 'Áp dụng cho sản phẩm chọn lọc'
    return names.length <= 2
      ? `Sản phẩm: ${names.join(', ')}`
      : `Sản phẩm: ${names.slice(0, 2).join(', ')} (+${names.length - 2})`
  }
  return 'Áp dụng toàn sàn'
}

function formatExpiryDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function VouchersPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const { success: toastSuccess, error: toastError } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const activeTab: TabMode = searchParams.get('tab') === 'wallet' ? 'wallet' : 'discover'
  const [walletFilter, setWalletFilter] = useState<WalletFilterTab>('all')
  const [discoverItems, setDiscoverItems] = useState<DiscoverVoucher[]>([])
  const [walletItems, setWalletItems] = useState<UserVoucher[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [claimingId, setClaimingId] = useState<string | null>(null)

  const setTab = (next: TabMode) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tab', next)
    setSearchParams(nextParams)
  }

  useEffect(() => {
    if (!isAuthenticated) return
    let active = true
    setLoading(true)
    setError(null)

    const load = async () => {
      try {
        if (activeTab === 'discover') {
          const items = await listDiscoverVouchers()
          if (active) setDiscoverItems(items)
        } else {
          const items = await listWalletVouchers(walletFilter === 'all' ? undefined : walletFilter)
          if (active) setWalletItems(items)
        }
      } catch (err) {
        if (!active) return
        const msg = err instanceof ApiError ? err.message : 'Không thể tải danh sách mã giảm giá.'
        setError(msg)
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [isAuthenticated, activeTab, walletFilter])

  const handleClaim = async (voucher: DiscoverVoucher) => {
    setClaimingId(voucher.id)
    try {
      const claimed = await claimVoucher(voucher.id)
      setDiscoverItems((prev) =>
        prev.map((item) =>
          item.id === voucher.id
            ? { ...item, claimed: true, claimedAt: claimed.claimedAt }
            : item
        )
      )
      toastSuccess(`Đã lưu mã ${voucher.code} vào ví voucher của bạn.`)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Không thể lưu mã giảm giá.'
      toastError(msg)
    } finally {
      setClaimingId(null)
    }
  }

  if (authLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-xs space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <Ticket className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-zinc-950">Kho & Ví Mã Giảm Giá</h1>
          <p className="text-sm text-zinc-600">
            Đăng nhập để sưu tầm mã giảm giá vào ví cá nhân và áp dụng khi thanh toán.
          </p>
          <Link
            to="/login?redirect=/vouchers"
            className="inline-flex items-center justify-center rounded-xl bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 transition-colors"
          >
            Đăng nhập ngay
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950">Kho & Ví Voucher</h1>
          <p className="text-sm text-zinc-600 mt-1">
            Lưu mã giảm giá vào ví cá nhân trước khi sử dụng tại bước thanh toán.
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-1 self-start">
          <button
            type="button"
            onClick={() => setTab('discover')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'discover'
                ? 'bg-zinc-950 text-white'
                : 'text-zinc-600 hover:text-zinc-950'
            }`}
          >
            <Gift className="h-4 w-4" />
            Khám phá voucher
          </button>
          <button
            type="button"
            onClick={() => setTab('wallet')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'wallet'
                ? 'bg-zinc-950 text-white'
                : 'text-zinc-600 hover:text-zinc-950'
            }`}
          >
            <Wallet className="h-4 w-4" />
            Ví của tôi
          </button>
        </div>
      </div>

      {activeTab === 'wallet' && (
        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: 'all', label: 'Tất cả' },
              { key: 'available', label: 'Khả dụng' },
              { key: 'used_up', label: 'Đã dùng hết lượt' },
              { key: 'unavailable', label: 'Hết hạn / Không khả dụng' },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setWalletFilter(f.key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors ${
                walletFilter === f.key
                  ? 'border-emerald-700 bg-emerald-700 text-white'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
        </div>
      ) : activeTab === 'discover' ? (
        discoverItems.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
            Hiện chưa có mã giảm giá nào đang phát hành.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {discoverItems.map((v) => (
              <div
                key={v.id}
                className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="inline-block rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-xs font-bold text-emerald-800 border border-emerald-200">
                        {v.code}
                      </span>
                      <h2 className="mt-1.5 text-base font-bold text-zinc-950">{v.title}</h2>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-emerald-700">
                      {formatVoucherBenefit(v)}
                    </span>
                  </div>
                  {v.description && <p className="text-xs text-zinc-600">{v.description}</p>}
                  <div className="flex flex-wrap gap-2 pt-1 text-xs text-zinc-600">
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 font-medium text-zinc-700">
                      <Tag className="h-3 w-3" />
                      {formatVoucherScopeLabel(v)}
                    </span>
                    <span className="rounded-full bg-zinc-100 px-2.5 py-0.5">
                      Đơn tối thiểu: {formatVND(v.minOrderVnd)}
                    </span>
                    <span className="rounded-full bg-zinc-100 px-2.5 py-0.5">
                      HSD: {formatExpiryDate(v.endsAt)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
                  <span className="text-xs text-zinc-500">
                    Còn {v.userRemainingUses} lượt dùng cho bạn
                  </span>
                  {v.claimed ? (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                      <Check className="h-3.5 w-3.5" />
                      Đã lưu vào ví
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={claimingId === v.id}
                      onClick={() => void handleClaim(v)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-950 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 transition-colors"
                    >
                      {claimingId === v.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Ticket className="h-3.5 w-3.5" />
                      )}
                      Lưu vào ví
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : walletItems.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center space-y-3">
          <p className="text-sm text-zinc-500">Chưa có mã giảm giá nào trong mục này.</p>
          <button
            type="button"
            onClick={() => setTab('discover')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
          >
            <Gift className="h-3.5 w-3.5" />
            Khám phá voucher ngay
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {walletItems.map((v) => (
            <div
              key={v.id}
              className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs space-y-4"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs font-bold text-zinc-900 border border-zinc-200">
                        {v.code}
                      </span>
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                          WALLET_STATUS_CLASSES[v.walletStatus]
                        }`}
                      >
                        {WALLET_STATUS_LABELS[v.walletStatus]}
                      </span>
                    </div>
                    <h2 className="mt-1.5 text-base font-bold text-zinc-950">{v.title}</h2>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-emerald-700">
                    {formatVoucherBenefit(v)}
                  </span>
                </div>
                {v.description && <p className="text-xs text-zinc-600">{v.description}</p>}
                <div className="flex flex-wrap gap-2 pt-1 text-xs text-zinc-600">
                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 font-medium text-zinc-700">
                    <Tag className="h-3 w-3" />
                    {formatVoucherScopeLabel(v)}
                  </span>
                  <span className="rounded-full bg-zinc-100 px-2.5 py-0.5">
                    Đơn tối thiểu: {formatVND(v.minOrderVnd)}
                  </span>
                  <span className="rounded-full bg-zinc-100 px-2.5 py-0.5">
                    HSD: {formatExpiryDate(v.endsAt)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
                <span className="text-xs text-zinc-500">
                  Còn {v.userRemainingUses}/{v.perUserLimit} lượt
                </span>
                {v.walletStatus === 'available' && (
                  <Link
                    to="/checkout"
                    className="inline-flex items-center rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors"
                  >
                    Dùng khi thanh toán
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
