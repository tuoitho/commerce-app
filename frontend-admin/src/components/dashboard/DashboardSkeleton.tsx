import React from 'react'

export const DashboardSkeleton: React.FC = () => {
  return (
    <div className="space-y-6 animate-pulse" data-testid="dashboard-skeleton">
      {/* Header bar skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-slate-200 rounded-lg" />
          <div className="h-4 w-32 bg-slate-200 rounded-md" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-9 w-48 bg-slate-200 rounded-xl" />
          <div className="h-9 w-24 bg-slate-200 rounded-xl" />
        </div>
      </div>

      {/* Revenue summary skeleton (5 cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-28 rounded-2xl border border-slate-200/80 bg-white p-4 space-y-3">
            <div className="flex justify-between items-center">
              <div className="h-4 w-24 bg-slate-200 rounded" />
              <div className="h-7 w-7 bg-slate-200 rounded-lg" />
            </div>
            <div className="h-7 w-32 bg-slate-200 rounded" />
            <div className="h-3 w-40 bg-slate-200 rounded" />
          </div>
        ))}
      </div>

      {/* Chart skeleton */}
      <div className="h-80 rounded-2xl border border-slate-200/80 bg-white p-6 space-y-4">
        <div className="flex justify-between items-center">
          <div className="h-5 w-44 bg-slate-200 rounded" />
          <div className="h-5 w-20 bg-slate-200 rounded" />
        </div>
        <div className="h-56 bg-slate-100 rounded-xl" />
      </div>

      {/* Orders breakdown skeleton */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 space-y-4">
        <div className="h-5 w-40 bg-slate-200 rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="h-12 bg-slate-100 rounded-xl" />
          ))}
        </div>
      </div>

      {/* Pending work skeleton */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 space-y-4">
        <div className="h-5 w-36 bg-slate-200 rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-xl" />
          ))}
        </div>
      </div>

      {/* Bottom 2 columns: Top products & Low stock skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 space-y-3">
          <div className="h-5 w-36 bg-slate-200 rounded" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-slate-100 rounded-xl" />
          ))}
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 space-y-3">
          <div className="h-5 w-44 bg-slate-200 rounded" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-slate-100 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}
