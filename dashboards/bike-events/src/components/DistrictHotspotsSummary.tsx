'use client'

import { useMemo } from 'react'
import { format, parseISO, startOfWeek } from 'date-fns'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { BikeEvent } from '@/types/bikeEvents'
import { buildDistrictHotspots, type DistrictHotspot } from '@/utils/districtHotspots'

interface DistrictHotspotsSummaryProps {
  events: BikeEvent[]
  selectedDistrict: string | null
  onSelectDistrict: (district: string, center: { lat: number; lon: number }) => void
  onSelectEvent: (event: BikeEvent) => void
}

const COLORS = {
  primary: '#8b5a2b',
  accent: '#dc2626',
  success: '#059669',
}

type WeeklyRow = {
  weekStart: string // yyyy-MM-dd
  open: number
  closed: number
}

const safeParseDate = (value: string) => {
  const d = parseISO(value)
  return Number.isFinite(d.getTime()) ? d : null
}

export default function DistrictHotspotsSummary({
  events,
  selectedDistrict,
  onSelectDistrict,
  onSelectEvent,
}: DistrictHotspotsSummaryProps) {
  const { hotspots, excludedNoDistrictCount } = useMemo(() => buildDistrictHotspots(events), [events])

  const selected = useMemo<DistrictHotspot | null>(() => {
    if (!selectedDistrict) return null
    return hotspots.find((h) => h.district === selectedDistrict) ?? null
  }, [hotspots, selectedDistrict])

  const top10 = useMemo(() => hotspots.slice(0, 10), [hotspots])
  const tableRows = useMemo(() => hotspots.slice(0, 25), [hotspots])

  const top10Counts = useMemo(
    () =>
      top10.map((h) => ({
        district: h.district.length > 18 ? h.district.slice(0, 18) + '...' : h.district,
        fullDistrict: h.district,
        total: h.totalCount,
      })),
    [top10]
  )

  const top10Status = useMemo(
    () =>
      top10.map((h) => ({
        district: h.district.length > 18 ? h.district.slice(0, 18) + '...' : h.district,
        fullDistrict: h.district,
        open: h.openCount,
        closed: h.closedCount,
      })),
    [top10]
  )

  const weekly = useMemo(() => {
    const byWeek = new Map<string, { open: number; closed: number }>()
    for (const event of events) {
      const date = safeParseDate(event.requested_at)
      if (!date) continue
      const ws = startOfWeek(date, { weekStartsOn: 1 })
      const key = format(ws, 'yyyy-MM-dd')
      const current = byWeek.get(key) ?? { open: 0, closed: 0 }
      if (event.status === 'open') current.open += 1
      if (event.status === 'closed') current.closed += 1
      byWeek.set(key, current)
    }

    const rows: WeeklyRow[] = Array.from(byWeek.entries())
      .map(([weekStart, c]) => ({ weekStart, open: c.open, closed: c.closed }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart))

    return rows.slice(-24)
  }, [events])

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              District analytics
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {excludedNoDistrictCount.toLocaleString()} events have no district label and are excluded
              from district hotspots.
            </p>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {hotspots.length.toLocaleString()} districts
          </div>
        </div>
      </div>

      {selected && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {selected.district}
              </h3>
              <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                Total: <span className="font-semibold">{selected.totalCount}</span>
                <span className="mx-2">|</span>
                Open: <span className="font-semibold">{selected.openCount}</span>
                <span className="mx-2">|</span>
                Closed: <span className="font-semibold">{selected.closedCount}</span>
                <span className="mx-2">|</span>
                Open share:{' '}
                <span className="font-semibold">
                  {Math.round(selected.openShare * 100)}%
                </span>
              </div>
            </div>
            <button
              onClick={() => onSelectDistrict(selected.district, selected.center)}
              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200 transition-colors"
              title="Center map on this district"
            >
              Center on map
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
                Top categories
              </div>
              <div className="space-y-2">
                {selected.topCategories.map((c) => (
                  <div
                    key={c.category}
                    className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-200"
                  >
                    <span className="truncate pr-3">{c.category}</span>
                    <span className="font-semibold">{c.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:col-span-2">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
                Most recent events in this district
              </div>
              <div className="divide-y divide-gray-200 dark:divide-gray-700 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
                {selected.events.slice(0, 5).map((e) => (
                  <button
                    key={e.service_request_id}
                    onClick={() => onSelectEvent(e)}
                    className="w-full text-left px-4 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    title="Open event details"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {e.title}
                      </div>
                      <div
                        className={
                          'text-[11px] font-semibold px-2 py-0.5 rounded-full ' +
                          (e.status === 'open'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                            : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200')
                        }
                      >
                        {e.status.toUpperCase()}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {safeParseDate(e.requested_at)
                        ? format(parseISO(e.requested_at), 'PPP')
                        : e.requested_at}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Top districts (event count)
          </h3>
          <div className="mt-4 w-full h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top10Counts} margin={{ left: 8, right: 8, top: 10, bottom: 10 }}>
                <XAxis dataKey="district" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" />
                <YAxis tick={{ fontSize: 11 }} width={40} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                  }}
                  formatter={(value: number | undefined, _name: string | undefined, props: any) => [
                    value,
                    props.payload.fullDistrict || props.payload.district,
                  ]}
                />
                <Bar dataKey="total" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Open vs closed (top districts)
          </h3>
          <div className="mt-4 w-full h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top10Status} margin={{ left: 8, right: 8, top: 10, bottom: 10 }}>
                <XAxis dataKey="district" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" />
                <YAxis tick={{ fontSize: 11 }} width={40} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                  }}
                  formatter={(value: number | undefined, name: string | undefined) => [
                    value,
                    name === 'open' ? 'Open' : 'Closed',
                  ]}
                />
                <Bar dataKey="open" stackId="status" fill={COLORS.accent} />
                <Bar dataKey="closed" stackId="status" fill={COLORS.success} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Weekly volume</h3>
        <div className="mt-4 w-full h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={weekly} margin={{ left: 8, right: 8, top: 10, bottom: 0 }}>
              <XAxis
                dataKey="weekStart"
                tick={{ fontSize: 11 }}
                tickFormatter={(value: string) => {
                  const d = parseISO(value)
                  return Number.isFinite(d.getTime()) ? format(d, 'MMM d') : value
                }}
                minTickGap={24}
              />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                }}
                labelFormatter={(label: any) => {
                  const d = parseISO(String(label))
                  return Number.isFinite(d.getTime()) ? `Week of ${format(d, 'PPP')}` : String(label)
                }}
              />
              <Area
                type="monotone"
                dataKey="open"
                stackId="status"
                stroke={COLORS.accent}
                fill={COLORS.accent}
                fillOpacity={0.22}
              />
              <Area
                type="monotone"
                dataKey="closed"
                stackId="status"
                stroke={COLORS.success}
                fill={COLORS.success}
                fillOpacity={0.22}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          District hotspots (Top 25)
        </h3>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <th className="py-2 pr-4">District</th>
                <th className="py-2 pr-4">Total</th>
                <th className="py-2 pr-4">Open</th>
                <th className="py-2 pr-4">Closed</th>
                <th className="py-2 pr-4">Open share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {tableRows.map((row) => (
                <tr
                  key={row.district}
                  className={
                    'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 ' +
                    (selectedDistrict === row.district ? 'bg-gray-50 dark:bg-gray-700' : '')
                  }
                  onClick={() => onSelectDistrict(row.district, row.center)}
                  title="Center map and show district details"
                >
                  <td className="py-2 pr-4 font-semibold text-gray-900 dark:text-gray-100">
                    {row.district}
                  </td>
                  <td className="py-2 pr-4 text-gray-700 dark:text-gray-200">{row.totalCount}</td>
                  <td className="py-2 pr-4 text-gray-700 dark:text-gray-200">{row.openCount}</td>
                  <td className="py-2 pr-4 text-gray-700 dark:text-gray-200">{row.closedCount}</td>
                  <td className="py-2 pr-4 text-gray-700 dark:text-gray-200">
                    {Math.round(row.openShare * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

