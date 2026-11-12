import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RevenueChart } from './RevenueChart'
import type { DailyRevenueItem } from '@/api/dashboard'
import { formatMoneyVndExact } from './formatters'

const mock7dData: DailyRevenueItem[] = [
  { date: '2026-11-06', deliveredVnd: '5000000', refundedVnd: '500000', netVnd: '4500000' },
  { date: '2026-11-07', deliveredVnd: '0', refundedVnd: '0', netVnd: '0' },
  { date: '2026-11-08', deliveredVnd: '12000000', refundedVnd: '0', netVnd: '12000000' },
  { date: '2026-11-09', deliveredVnd: '8000000', refundedVnd: '2000000', netVnd: '6000000' },
  { date: '2026-11-10', deliveredVnd: '0', refundedVnd: '1000000', netVnd: '-1000000' },
  { date: '2026-11-11', deliveredVnd: '15000000', refundedVnd: '3000000', netVnd: '12000000' },
  { date: '2026-11-12', deliveredVnd: '20000000', refundedVnd: '0', netVnd: '20000000' },
]

const mockTodayData: DailyRevenueItem[] = [
  { date: '2026-11-12', deliveredVnd: '1500000', refundedVnd: '200000', netVnd: '1300000' },
]

const mockAllZeroData: DailyRevenueItem[] = [
  { date: '2026-11-06', deliveredVnd: '0', refundedVnd: '0', netVnd: '0' },
  { date: '2026-11-07', deliveredVnd: '0', refundedVnd: '0', netVnd: '0' },
]

const mock30dData: DailyRevenueItem[] = Array.from({ length: 30 }, (_, i) => {
  const day = String(i + 1).padStart(2, '0')
  return {
    date: `2026-10-${day}`,
    deliveredVnd: `${(i + 1) * 1000000}`,
    refundedVnd: `${i * 100000}`,
    netVnd: `${(i + 1) * 1000000 - i * 100000}`,
  }
})

describe('RevenueChart', () => {
  it('renders the chart container, title, and legend distinguishing three series by color and shape (Req 4.1, 10.3)', () => {
    render(<RevenueChart dailyRevenue={mock7dData} />)

    expect(screen.getByText('Biểu đồ doanh thu theo ngày')).toBeInTheDocument()

    // Legend items
    const legend = screen.getByTestId('revenue-chart-legend')
    expect(legend).toBeInTheDocument()

    expect(legend).toHaveTextContent(/đã giao/i)
    expect(legend).toHaveTextContent(/đã hoàn/i)
    expect(legend).toHaveTextContent(/doanh thu thuần/i)

    // Check that legend includes shape indicators (solid, striped, diamond)
    expect(screen.getByTestId('legend-delivered-shape')).toBeInTheDocument()
    expect(screen.getByTestId('legend-refunded-shape')).toBeInTheDocument()
    expect(screen.getByTestId('legend-net-shape')).toBeInTheDocument()
  })

  it('renders the correct number of day column groups in ascending order (7 days, 1 day, 30 days) (Req 4.1, 4.2, 4.3)', () => {
    const { rerender } = render(<RevenueChart dailyRevenue={mock7dData} />)

    const groups7 = screen.getAllByTestId(/^chart-day-group-/)
    expect(groups7).toHaveLength(7)
    expect(groups7[0]).toHaveAttribute('data-date', '2026-11-06')
    expect(groups7[1]).toHaveAttribute('data-date', '2026-11-07') // zero day present
    expect(groups7[6]).toHaveAttribute('data-date', '2026-11-12')

    // 1 day (today - Req 4.3)
    rerender(<RevenueChart dailyRevenue={mockTodayData} />)
    const groups1 = screen.getAllByTestId(/^chart-day-group-/)
    expect(groups1).toHaveLength(1)
    expect(groups1[0]).toHaveAttribute('data-date', '2026-11-12')

    // 30 days (Req 4.1)
    rerender(<RevenueChart dailyRevenue={mock30dData} />)
    const groups30 = screen.getAllByTestId(/^chart-day-group-/)
    expect(groups30).toHaveLength(30)
  })

  it('provides an sr-only accessible table containing all data points formatted with formatMoneyVndExact (Req 10.3)', () => {
    render(<RevenueChart dailyRevenue={mock7dData} />)

    const table = screen.getByRole('table', { hidden: true })
    expect(table.parentElement).toHaveClass('sr-only')

    // Check rows count in tbody (hidden: true to find rows inside sr-only)
    const rows = table.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(7)

    // Check first row has date and exact formatted amounts
    const firstRowText = rows[0].textContent?.replace(/\u00a0/g, ' ') || ''
    expect(firstRowText).toContain('06/11')
    expect(firstRowText).toContain(formatMoneyVndExact('5000000').replace(/\u00a0/g, ' '))
    expect(firstRowText).toContain(formatMoneyVndExact('500000').replace(/\u00a0/g, ' '))
    expect(firstRowText).toContain(formatMoneyVndExact('4500000').replace(/\u00a0/g, ' '))

    // Check row with negative amount
    const negativeRowText = rows[4].textContent?.replace(/\u00a0/g, ' ') || ''
    expect(negativeRowText).toContain('10/11')
    expect(negativeRowText).toContain(formatMoneyVndExact('-1000000').replace(/\u00a0/g, ' '))
  })

  it('supports keyboard navigation: each day is focusable and reveals tooltip with dd/MM and exact values (Req 4.4, 10.2)', () => {
    render(<RevenueChart dailyRevenue={mock7dData} />)

    const groups = screen.getAllByTestId(/^chart-day-group-/)
    const firstGroup = groups[0]

    expect(firstGroup).toHaveAttribute('tabindex', '0')
    expect(firstGroup).toHaveAttribute('role', 'img')
    expect(firstGroup).toHaveAttribute('aria-label')

    // Focus triggers tooltip
    fireEvent.focus(firstGroup)

    const tooltip = screen.getByTestId('revenue-chart-tooltip')
    expect(tooltip).toBeInTheDocument()
    expect(tooltip).toHaveTextContent('06/11')
    const tooltipText = tooltip.textContent?.replace(/\u00a0/g, ' ') || ''
    expect(tooltipText).toContain(formatMoneyVndExact('5000000').replace(/\u00a0/g, ' '))
    expect(tooltipText).toContain(formatMoneyVndExact('500000').replace(/\u00a0/g, ' '))
    expect(tooltipText).toContain(formatMoneyVndExact('4500000').replace(/\u00a0/g, ' '))

    // Blur hides tooltip
    fireEvent.blur(firstGroup)
    expect(screen.queryByTestId('revenue-chart-tooltip')).not.toBeInTheDocument()
  })

  it('exposes accessible day elements with role="img" and accessible name without aria-hidden (Req 4.4, 10.3)', () => {
    const { container } = render(<RevenueChart dailyRevenue={mock7dData} />)

    // The <svg> itself must NOT be aria-hidden
    const svg = container.querySelector('svg')
    expect(svg).not.toHaveAttribute('aria-hidden')

    // Day groups must be exposed to screen readers as role="img" with descriptive accessible name WITHOUT { hidden: true }
    const dayImgs = screen.getAllByRole('img', { name: /Ngày 06\/11/ })
    expect(dayImgs).toHaveLength(1)
    expect(dayImgs[0]).toHaveAttribute('tabindex', '0')
    expect(dayImgs[0]).toHaveAccessibleName(/Ngày 06\/11: Đã giao 5\.000\.000/)

    // Focused day links tooltip via aria-describedby
    fireEvent.focus(dayImgs[0])
    expect(dayImgs[0]).toHaveAttribute('aria-describedby', 'revenue-chart-tooltip')
  })

  it('anchors tooltip to edges to prevent clipping on narrow viewports (Req 4.4, 10.1)', () => {
    const { container } = render(<RevenueChart dailyRevenue={mock7dData} />)

    // Chart container must not have overflow-hidden so tooltips are not clipped
    const chartWrapper = container.querySelector('.relative.w-full')
    expect(chartWrapper).not.toHaveClass('overflow-hidden')

    const groups = screen.getAllByTestId(/^chart-day-group-/)

    // First day: anchored to left-edge
    fireEvent.focus(groups[0])
    let tooltip = screen.getByTestId('revenue-chart-tooltip')
    expect(tooltip).toHaveAttribute('data-position', 'left-edge')
    expect(tooltip).toHaveStyle({ left: '8px' })

    // Last day: anchored to right-edge
    fireEvent.focus(groups[6])
    tooltip = screen.getByTestId('revenue-chart-tooltip')
    expect(tooltip).toHaveAttribute('data-position', 'right-edge')
    expect(tooltip).toHaveStyle({ right: '8px' })

    // Middle day: centered
    fireEvent.focus(groups[3])
    tooltip = screen.getByTestId('revenue-chart-tooltip')
    expect(tooltip).toHaveAttribute('data-position', '-translate-x-1/2')
  })

  it('reveals tooltip on mouse enter and touch start (Req 4.4)', () => {
    render(<RevenueChart dailyRevenue={mock7dData} />)

    const groups = screen.getAllByTestId(/^chart-day-group-/)
    const secondGroup = groups[1] // zero day: 2026-11-07

    // Hover mouse
    fireEvent.mouseEnter(secondGroup)
    let tooltip = screen.getByTestId('revenue-chart-tooltip')
    expect(tooltip).toBeInTheDocument()
    expect(tooltip).toHaveTextContent('07/11')
    let tooltipText = tooltip.textContent?.replace(/\u00a0/g, ' ') || ''
    expect(tooltipText).toContain(formatMoneyVndExact('0').replace(/\u00a0/g, ' '))

    // Mouse leave hides tooltip
    fireEvent.mouseLeave(secondGroup)
    expect(screen.queryByTestId('revenue-chart-tooltip')).not.toBeInTheDocument()

    // Touch start shows tooltip
    const fifthGroup = groups[4] // negative net day: 2026-11-10
    fireEvent.touchStart(fifthGroup)
    tooltip = screen.getByTestId('revenue-chart-tooltip')
    expect(tooltip).toBeInTheDocument()
    expect(tooltip).toHaveTextContent('10/11')
    tooltipText = tooltip.textContent?.replace(/\u00a0/g, ' ') || ''
    expect(tooltipText).toContain(formatMoneyVndExact('-1000000').replace(/\u00a0/g, ' '))
  })

  it('encodes data using distinct SVG shape primitives (solid rect, striped pattern rect, diamond polygon, path line)', () => {
    const { container } = render(<RevenueChart dailyRevenue={mock7dData} />)

    // Striped pattern definition exists
    const pattern = container.querySelector('#revenue-striped-pattern')
    expect(pattern).toBeInTheDocument()

    // Striped refunded bars
    const stripedBars = container.querySelectorAll('rect[fill="url(#revenue-striped-pattern)"]')
    expect(stripedBars.length).toBeGreaterThan(0)

    // Solid delivered bars
    const solidBars = container.querySelectorAll('rect[fill="#10b981"]')
    expect(solidBars.length).toBeGreaterThan(0)

    // Diamond polygon markers for Net revenue
    const diamondPolygons = container.querySelectorAll('polygon')
    expect(diamondPolygons.length).toBe(7)

    // Net line path connecting points
    const netPath = container.querySelector('path[stroke="#2563eb"]')
    expect(netPath).toBeInTheDocument()
  })

  it('handles all-zero revenue days without errors or NaN in tooltip and table (Req 4.2)', () => {
    render(<RevenueChart dailyRevenue={mockAllZeroData} />)

    const groups = screen.getAllByTestId(/^chart-day-group-/)
    expect(groups).toHaveLength(2)

    fireEvent.focus(groups[0])
    const tooltip = screen.getByTestId('revenue-chart-tooltip')
    expect(tooltip).toBeInTheDocument()
    const tooltipText = tooltip.textContent?.replace(/\u00a0/g, ' ') || ''
    expect(tooltipText).toContain(formatMoneyVndExact('0').replace(/\u00a0/g, ' '))
  })

  it('handles numbers exceeding Number.MAX_SAFE_INTEGER without losing precision in tooltip and table (Req 9.4)', () => {
    const mockBigNumberData: DailyRevenueItem[] = [
      {
        date: '2026-11-12',
        deliveredVnd: '9007199254740993',
        refundedVnd: '1000000',
        netVnd: '9007199253740993',
      },
    ]

    render(<RevenueChart dailyRevenue={mockBigNumberData} />)

    const table = screen.getByRole('table', { hidden: true })
    const tableText = table.textContent?.replace(/\u00a0/g, ' ') || ''
    expect(tableText).toContain(formatMoneyVndExact('9007199254740993').replace(/\u00a0/g, ' '))

    const group = screen.getByTestId('chart-day-group-0')
    fireEvent.focus(group)

    const tooltip = screen.getByTestId('revenue-chart-tooltip')
    const tooltipText = tooltip.textContent?.replace(/\u00a0/g, ' ') || ''
    expect(tooltipText).toContain(formatMoneyVndExact('9007199254740993').replace(/\u00a0/g, ' '))
    expect(tooltipText).toContain(formatMoneyVndExact('9007199253740993').replace(/\u00a0/g, ' '))
  })

  it('omits the negative axis label when it would overlap the zero label', () => {
    const data: DailyRevenueItem[] = [
      { date: '2026-11-11', deliveredVnd: '0', refundedVnd: '1000000', netVnd: '-1000000' },
      { date: '2026-11-12', deliveredVnd: '100000000', refundedVnd: '0', netVnd: '100000000' },
    ]
    const { container } = render(<RevenueChart dailyRevenue={data} />)
    const labels = Array.from(container.querySelectorAll('svg text')).map((t) => t.textContent)
    expect(labels).toContain('0')
    expect(labels.some((label) => label?.startsWith('-'))).toBe(false)
  })

  it('keeps the negative axis label when it is clearly apart from the zero label', () => {
    const data: DailyRevenueItem[] = [
      { date: '2026-11-11', deliveredVnd: '0', refundedVnd: '50000000', netVnd: '-50000000' },
      { date: '2026-11-12', deliveredVnd: '100000000', refundedVnd: '0', netVnd: '100000000' },
    ]
    const { container } = render(<RevenueChart dailyRevenue={data} />)
    const labels = Array.from(container.querySelectorAll('svg text')).map((t) => t.textContent)
    expect(labels.some((label) => label?.startsWith('-'))).toBe(true)
  })

  it('renders clean empty state if dailyRevenue is empty', () => {
    render(<RevenueChart dailyRevenue={[]} />)
    expect(screen.getByText('Chưa có dữ liệu doanh thu')).toBeInTheDocument()
  })
})
