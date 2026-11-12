import React, { useState } from 'react'
import type { DailyRevenueItem } from '@/api/dashboard'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { BarChart3 } from 'lucide-react'
import { formatMoneyVndExact } from './formatters'

export interface RevenueChartProps {
  dailyRevenue: DailyRevenueItem[]
}

function formatShortDate(dateStr: string): string {
  const parts = dateStr.split('-')
  if (parts.length >= 3) {
    return `${parts[2]}/${parts[1]}`
  }
  return dateStr
}

function formatCompactVnd(val: number): string {
  const abs = Math.abs(val)
  const sign = val < 0 ? '-' : ''
  if (abs >= 1_000_000_000) {
    const formatted = (abs / 1_000_000_000).toFixed(abs % 1_000_000_000 === 0 ? 0 : 1)
    return `${sign}${formatted} tỷ`
  }
  if (abs >= 1_000_000) {
    const formatted = (abs / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1)
    return `${sign}${formatted}tr`
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toFixed(0)}k`
  }
  return `${sign}${abs}`
}

export const RevenueChart: React.FC<RevenueChartProps> = ({ dailyRevenue }) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [focusIndex, setFocusIndex] = useState<number | null>(null)

  const activeIndex = hoverIndex ?? focusIndex
  const n = dailyRevenue.length

  if (n === 0) {
    return (
      <Card className="border-slate-200/80 shadow-xs" data-testid="revenue-chart-slot">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-base sm:text-lg font-semibold text-slate-900">
              Biểu đồ doanh thu theo ngày
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Chưa có dữ liệu doanh thu cho kỳ này
            </CardDescription>
          </div>
          <div className="p-2 rounded-lg bg-blue-50">
            <BarChart3 className="h-4 w-4 text-blue-600" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-64 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center p-6 text-center">
            <BarChart3 className="h-10 w-10 text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-600">
              Chưa có dữ liệu doanh thu
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Không có dữ liệu phát sinh trong kỳ được chọn.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Parse numeric values for geometry scaling
  const numericData = dailyRevenue.map((d) => ({
    date: d.date,
    del: Number(d.deliveredVnd) || 0,
    ref: Number(d.refundedVnd) || 0,
    net: Number(d.netVnd) || 0,
    raw: d,
  }))

  let maxVal = 0
  let minVal = 0
  for (const d of numericData) {
    if (d.del > maxVal) maxVal = d.del
    if (d.ref > maxVal) maxVal = d.ref
    if (d.net > maxVal) maxVal = d.net
    if (d.net < minVal) minVal = d.net
  }

  const effectiveMax = maxVal === 0 && minVal === 0 ? 100000 : (maxVal > 0 ? maxVal * 1.1 : 0)
  const effectiveMin = minVal < 0 ? minVal * 1.1 : 0
  const valueRange = effectiveMax - effectiveMin || 1

  const width = 800
  const height = 280
  const padding = { top: 28, right: 28, bottom: 44, left: 68 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom

  const getY = (val: number) => {
    const ratio = (val - effectiveMin) / valueRange
    return padding.top + (1 - ratio) * plotHeight
  }

  const yZero = getY(0)
  const slotWidth = plotWidth / n
  const maxBarW = Math.min(24, Math.max(3, (slotWidth - 8) / 2))
  const barGap = Math.max(1, Math.min(4, maxBarW / 3))

  const netPoints = numericData.map((d, i) => {
    const cx = padding.left + (i + 0.5) * slotWidth
    const cy = getY(d.net)
    return { cx, cy }
  })

  const linePath = netPoints.length > 1
    ? netPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.cx.toFixed(1)} ${pt.cy.toFixed(1)}`).join(' ')
    : ''

  // Y-axis grid & labels. The negative tick is dropped when it sits too close to the
  // zero line for the two labels (10px font) to be read separately.
  const minTickGap = 16
  const yTicks = [
    effectiveMax,
    effectiveMax * 0.5,
    0,
    ...(effectiveMin < 0 && getY(effectiveMin) - yZero >= minTickGap ? [effectiveMin] : []),
  ]

  const activeItem = activeIndex !== null ? dailyRevenue[activeIndex] : null

  return (
    <Card className="border-slate-200/80 shadow-xs" data-testid="revenue-chart-slot">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-3">
        <div>
          <CardTitle className="text-base sm:text-lg font-semibold text-slate-900">
            Biểu đồ doanh thu theo ngày
          </CardTitle>
          <CardDescription className="text-xs text-slate-500 mt-0.5">
            Doanh thu đã giao, hoàn tiền và doanh thu thuần ({n} ngày)
          </CardDescription>
        </div>

        {/* Legend distinguishing the 3 series by color AND shape */}
        <div
          data-testid="revenue-chart-legend"
          className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-600 select-none"
        >
          <div className="flex items-center gap-1.5">
            <span
              data-testid="legend-delivered-shape"
              aria-hidden="true"
              className="inline-block w-3.5 h-3.5 rounded-xs bg-emerald-500 border border-emerald-600 shadow-xs shrink-0"
              title="Cột đặc"
            />
            <span>Đã giao (Cột đặc)</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              data-testid="legend-refunded-shape"
              aria-hidden="true"
              className="inline-block w-3.5 h-3.5 rounded-xs border border-rose-500 bg-[repeating-linear-gradient(45deg,#f43f5e,#f43f5e_2px,#ffe4e6_2px,#ffe4e6_4px)] shadow-xs shrink-0"
              title="Cột sọc"
            />
            <span>Đã hoàn tiền (Cột sọc)</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              data-testid="legend-net-shape"
              aria-hidden="true"
              className="flex items-center justify-center w-4 h-3.5 shrink-0"
              title="Điểm hình thoi"
            >
              <span className="w-full h-0.5 bg-blue-600 relative flex items-center justify-center">
                <span className="w-2 h-2 rotate-45 bg-blue-600 border border-white" />
              </span>
            </span>
            <span>Doanh thu thuần (Đường / hình thoi)</span>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Accessible table for screen readers. The sr-only wrapper is a div because a
            table ignores the 1px width and would widen the page to its content. */}
        <div className="sr-only">
          <table>
            <caption>Bảng số liệu doanh thu theo ngày</caption>
            <thead>
              <tr>
                <th scope="col">Ngày</th>
                <th scope="col">Đã giao (VNĐ)</th>
                <th scope="col">Đã hoàn (VNĐ)</th>
                <th scope="col">Thuần (VNĐ)</th>
              </tr>
            </thead>
            <tbody>
              {dailyRevenue.map((item) => {
                const shortDate = formatShortDate(item.date)
                return (
                  <tr key={item.date}>
                    <td>{shortDate} ({item.date})</td>
                    <td>{formatMoneyVndExact(item.deliveredVnd)}</td>
                    <td>{formatMoneyVndExact(item.refundedVnd)}</td>
                    <td>{formatMoneyVndExact(item.netVnd)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Responsive chart container without overflow-hidden to prevent clipping tooltip on narrow screens */}
        <div className="relative w-full rounded-xl border border-slate-100 bg-slate-50/30 p-2 sm:p-4">
          {/* Tooltip on hover / touch / focus */}
          {activeItem && activeIndex !== null && (() => {
            const shortDate = formatShortDate(activeItem.date)
            const cx = padding.left + (activeIndex + 0.5) * slotWidth
            const leftPercent = (cx / width) * 100

            // Anchor edge days to sides instead of always centering to prevent tooltip cutoff on narrow viewports (Req 4.4, 10.1)
            let tooltipStyle: React.CSSProperties
            let positionClass = ''
            if (activeIndex === 0 || leftPercent <= 25) {
              tooltipStyle = { left: '8px' }
              positionClass = 'left-edge'
            } else if (activeIndex === n - 1 || leftPercent >= 75) {
              tooltipStyle = { right: '8px' }
              positionClass = 'right-edge'
            } else {
              tooltipStyle = { left: `${leftPercent}%` }
              positionClass = '-translate-x-1/2'
            }

            return (
              <div
                data-testid="revenue-chart-tooltip"
                data-position={positionClass}
                role="tooltip"
                id="revenue-chart-tooltip"
                className={`absolute z-20 pointer-events-none rounded-xl border border-slate-200 bg-white/95 backdrop-blur-xs p-3 shadow-lg text-xs min-w-44 top-3 transition-all duration-75 ${
                  positionClass === '-translate-x-1/2' ? '-translate-x-1/2' : ''
                }`}
                style={tooltipStyle}
              >
                <div className="font-semibold text-slate-800 border-b border-slate-100 pb-1.5 mb-1.5 flex items-center justify-between gap-4">
                  <span>Ngày {shortDate}</span>
                  <span className="text-[11px] font-normal text-slate-400">{activeItem.date}</span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <span className="inline-block w-2.5 h-2.5 rounded-xs bg-emerald-500" />
                      <span>Đã giao:</span>
                    </span>
                    <span className="font-medium text-slate-900 tabular-nums">
                      {formatMoneyVndExact(activeItem.deliveredVnd)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <span className="inline-block w-2.5 h-2.5 rounded-xs border border-rose-500 bg-rose-100" />
                      <span>Đã hoàn:</span>
                    </span>
                    <span className="font-medium text-rose-600 tabular-nums">
                      {formatMoneyVndExact(activeItem.refundedVnd)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <span className="inline-block w-2.5 h-2.5 rotate-45 bg-blue-600" />
                      <span>Thuần:</span>
                    </span>
                    <span
                      className={`font-semibold tabular-nums ${
                        activeItem.netVnd.startsWith('-') ? 'text-rose-600' : 'text-blue-600'
                      }`}
                    >
                      {formatMoneyVndExact(activeItem.netVnd)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* SVG Chart - not aria-hidden so interactive day items are exposed in accessibility tree */}
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto min-h-[220px] max-h-[360px] overflow-visible select-none"
          >
            <defs aria-hidden="true">
              {/* Striped diagonal pattern for refunded bars */}
              <pattern
                id="revenue-striped-pattern"
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="3" height="6" fill="#f43f5e" />
                <rect x="3" width="3" height="6" fill="#ffe4e6" />
              </pattern>
            </defs>

            {/* Decorative horizontal grid lines & Y-axis labels */}
            <g aria-hidden="true">
              {yTicks.map((tick, idx) => {
                const y = getY(tick)
                return (
                  <g key={`ytick-${idx}`}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={padding.left + plotWidth}
                      y2={y}
                      stroke={tick === 0 ? '#94a3b8' : '#e2e8f0'}
                      strokeWidth={tick === 0 && effectiveMin < 0 ? '1.5' : '1'}
                      strokeDasharray={tick === 0 && effectiveMin < 0 ? '4 4' : undefined}
                    />
                    <text
                      x={padding.left - 8}
                      y={y + 3.5}
                      textAnchor="end"
                      fontSize="10"
                      fill="#64748b"
                      fontFamily="monospace"
                    >
                      {formatCompactVnd(tick)}
                    </text>
                  </g>
                )
              })}
            </g>

            {/* Decorative net revenue line connecting diamond points */}
            {linePath && (
              <path
                aria-hidden="true"
                d={linePath}
                fill="none"
                stroke="#2563eb"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Interactive Day Groups with role="img" exposing accessible name */}
            {numericData.map((d, i) => {
              const shortDate = formatShortDate(d.date)
              const slotX = padding.left + i * slotWidth
              const cx = slotX + slotWidth / 2

              const delY = getY(d.del)
              const delHeight = Math.max(0, yZero - delY)
              const delX = cx - maxBarW - barGap / 2

              const refY = getY(d.ref)
              const refHeight = Math.max(0, yZero - refY)
              const refX = cx + barGap / 2

              const netY = getY(d.net)
              const isActive = activeIndex === i

              return (
                <g
                  key={d.date}
                  tabIndex={0}
                  role="img"
                  aria-label={`Ngày ${shortDate}: Đã giao ${formatMoneyVndExact(d.raw.deliveredVnd)}, Đã hoàn ${formatMoneyVndExact(d.raw.refundedVnd)}, Doanh thu thuần ${formatMoneyVndExact(d.raw.netVnd)}`}
                  aria-describedby={isActive ? 'revenue-chart-tooltip' : undefined}
                  data-testid={`chart-day-group-${i}`}
                  data-date={d.date}
                  className="outline-none cursor-pointer focus-visible:outline-none"
                  onMouseEnter={() => setHoverIndex(i)}
                  onMouseLeave={() => setHoverIndex(null)}
                  onFocus={() => setFocusIndex(i)}
                  onBlur={() => setFocusIndex(null)}
                  onTouchStart={() => setHoverIndex(i)}
                >
                  {/* Decorative hit area covering column */}
                  <rect
                    aria-hidden="true"
                    x={slotX}
                    y={padding.top}
                    width={slotWidth}
                    height={plotHeight}
                    fill="transparent"
                    pointerEvents="all"
                  />

                  {/* Active highlight background */}
                  {isActive && (
                    <rect
                      aria-hidden="true"
                      x={slotX + 1}
                      y={padding.top}
                      width={slotWidth - 2}
                      height={plotHeight}
                      fill="rgba(59, 130, 246, 0.08)"
                      stroke="#3b82f6"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                      rx="4"
                      pointerEvents="none"
                    />
                  )}

                  {/* Decorative Delivered bar (Solid) */}
                  {delHeight > 0 && (
                    <rect
                      aria-hidden="true"
                      x={delX}
                      y={delY}
                      width={maxBarW}
                      height={delHeight}
                      fill="#10b981"
                      rx="2"
                      pointerEvents="none"
                    />
                  )}

                  {/* Decorative Refunded bar (Striped) */}
                  {refHeight > 0 && (
                    <rect
                      aria-hidden="true"
                      x={refX}
                      y={refY}
                      width={maxBarW}
                      height={refHeight}
                      fill="url(#revenue-striped-pattern)"
                      stroke="#f43f5e"
                      strokeWidth="1"
                      rx="2"
                      pointerEvents="none"
                    />
                  )}

                  {/* Decorative Diamond marker for Net revenue */}
                  <polygon
                    aria-hidden="true"
                    points={`${cx},${netY - (isActive ? 6 : 5)} ${cx + (isActive ? 6 : 5)},${netY} ${cx},${netY + (isActive ? 6 : 5)} ${cx - (isActive ? 6 : 5)},${netY}`}
                    fill={isActive ? '#1d4ed8' : '#2563eb'}
                    stroke="#ffffff"
                    strokeWidth={isActive ? '2' : '1.5'}
                    pointerEvents="none"
                  />

                  {/* Decorative Date label at bottom */}
                  {(n <= 10 || i % 5 === 0 || i === n - 1) && (
                    <text
                      aria-hidden="true"
                      x={cx}
                      y={height - 12}
                      textAnchor="middle"
                      fontSize="11"
                      fill={isActive ? '#0f172a' : '#64748b'}
                      fontWeight={isActive ? '600' : 'normal'}
                      pointerEvents="none"
                    >
                      {shortDate}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        </div>
      </CardContent>
    </Card>
  )
}
