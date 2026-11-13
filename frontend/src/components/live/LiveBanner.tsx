import { Link } from 'react-router-dom'
import { ArrowRight, Radio } from 'lucide-react'
import type { LiveSummary } from '@/api/live'

export function LiveBanner({ live }: { live: LiveSummary }) {
  return (
    <section className="border-b border-zinc-200 bg-white" aria-label="Đang phát trực tiếp">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-zinc-950 via-teal-950 to-teal-800 px-5 py-5 text-white sm:px-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:28px_28px]"
          />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <span className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-md bg-rose-600 px-2 py-1 text-[11px] font-bold tracking-wider">
                <span className="live-pulse-dot h-1.5 w-1.5 rounded-full bg-white" />
                LIVE
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-teal-200">
                  <Radio className="h-3.5 w-3.5" /> Đang phát trực tiếp
                </p>
                <h2 className="mt-1 truncate text-lg font-bold leading-tight sm:text-xl">{live.title}</h2>
                <p className="mt-1 text-sm text-zinc-300">Giá live chỉ áp dụng trong lúc phát — vào xem để chốt đơn ngay.</p>
              </div>
            </div>
            <Link
              to={`/live/${live.id}`}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-zinc-950 transition-colors hover:bg-teal-50"
            >
              Xem ngay <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
