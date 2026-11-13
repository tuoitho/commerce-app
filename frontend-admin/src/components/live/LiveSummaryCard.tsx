import { Clock, Eye, Heart, MessageSquare, Radio } from 'lucide-react'
import type { AdminLiveSession } from '@/api/live'

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

interface LiveSummaryCardProps {
  session: AdminLiveSession
  onNewSession: () => void
}

export function LiveSummaryCard({ session, onNewSession }: LiveSummaryCardProps) {
  const { summary } = session
  const soldRows = session.products.flatMap((p) =>
    p.livePrices.filter((price) => price.sold > 0 || price.quota !== null).map((price) => ({ product: p.name, ...price })),
  )
  return (
    <section className="flex flex-col gap-5 rounded-3xl border border-zinc-200 bg-white p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Phiên live đã kết thúc</p>
        <h2 className="mt-1 text-xl font-bold text-zinc-950">{session.title}</h2>
        {summary.endReason === 'signal_lost' && (
          <p className="mt-1 text-sm text-amber-700">Phiên tự kết thúc vì mất tín hiệu phát quá 10 phút.</p>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Clock} label="Thời lượng" value={formatDuration(summary.durationSeconds)} />
        <Stat icon={Eye} label="Người xem cao nhất" value={summary.peakViewers.toLocaleString('vi-VN')} />
        <Stat icon={MessageSquare} label="Bình luận" value={summary.commentCount.toLocaleString('vi-VN')} />
        <Stat icon={Heart} label="Lượt tim" value={summary.heartCount.toLocaleString('vi-VN')} />
      </dl>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-zinc-900">Suất giá live đã bán</h3>
        {soldRows.length === 0 ? (
          <p className="text-sm text-zinc-500">Không có biến thể nào bán giá live.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {soldRows.map((row) => (
                <tr key={row.variantId} className="border-t border-zinc-100">
                  <td className="py-2 text-zinc-800">{row.product} <span className="text-zinc-500">· {row.optionLabel}</span></td>
                  <td className="py-2 text-right font-mono tabular-nums text-zinc-900">
                    {row.sold}{row.quota !== null ? `/${row.quota}` : ''} suất
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <button type="button" onClick={onNewSession} className="inline-flex h-11 items-center justify-center gap-2 self-start rounded-xl bg-zinc-900 px-5 text-sm font-bold text-white hover:bg-zinc-800">
        <Radio className="h-4 w-4" /> Tạo phiên live mới
      </button>
    </section>
  )
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-zinc-50 px-4 py-3">
      <dt className="flex items-center gap-1.5 text-xs text-zinc-500"><Icon className="h-3.5 w-3.5" />{label}</dt>
      <dd className="mt-1 font-mono text-lg font-bold tabular-nums text-zinc-950">{value}</dd>
    </div>
  )
}
