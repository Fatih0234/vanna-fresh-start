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

interface TrendsDashboardProps {
  events: BikeEvent[]
}

const COLORS = {
  primary: '#8b5a2b',
  secondary: '#d97706',
  accent: '#dc2626',
  success: '#059669',
  info: '#2563eb',
}

type WeeklyRow = {
  weekStart: string // yyyy-MM-dd
  open: number
  closed: number
  total: number
}

export default function TrendsDashboard({ events }: TrendsDashboardProps) {
  const kpis = useMemo(() => {
    const total = events.length
    const open = events.filter((e) => e.status === 'open').length
    const closed = events.filter((e) => e.status === 'closed').length
    const openShare = total ? (open / total) * 100 : 0
    return { total, open, closed, openShare }
  }, [events])

  const weekly = useMemo(() => {
    const byWeek = new Map<string, { open: number; closed: number }>()

    for (const event of events) {
      const date = parseISO(event.requested_at)
      if (!Number.isFinite(date.getTime())) continue

      const weekStart = startOfWeek(date, { weekStartsOn: 1 })
      const key = format(weekStart, 'yyyy-MM-dd')

      const current = byWeek.get(key) ?? { open: 0, closed: 0 }
      if (event.status === 'open') current.open += 1
      if (event.status === 'closed') current.closed += 1
      byWeek.set(key, current)
    }

    const rows: WeeklyRow[] = Array.from(byWeek.entries())
      .map(([weekStart, counts]) => ({
        weekStart,
        open: counts.open,
        closed: counts.closed,
        total: counts.open + counts.closed,
      }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart))

    return rows
  }, [events])

  const topDistricts = useMemo(() => {
    const counts = events.reduce((acc, e) => {
      const key = e.district?.trim() ? e.district.trim() : 'Unknown'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([district, count]) => ({ district, count }))
  }, [events])

  const topCategories = useMemo(() => {
    const counts = events.reduce((acc, e) => {
      const key = e.bike_issue_category?.trim() ? e.bike_issue_category.trim() : 'Unknown'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([category, count]) => ({
        category: category.length > 28 ? category.slice(0, 28) + '...' : category,
        count,
      }))
  }, [events])

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Trends & Breakdown</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Events in view
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">
            {kpis.total.toLocaleString()}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Open
          </div>
          <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
            {kpis.open.toLocaleString()}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Closed
          </div>
          <div className="text-3xl font-bold text-red-600 dark:text-red-400 mt-2">
            {kpis.closed.toLocaleString()}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Open share
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">
            {kpis.openShare.toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Weekly volume</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Counts by week of request creation (open vs closed).
            </p>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {weekly.length.toLocaleString()} weeks
          </div>
        </div>

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
                stroke={COLORS.success}
                fill={COLORS.success}
                fillOpacity={0.25}
              />
              <Area
                type="monotone"
                dataKey="closed"
                stackId="status"
                stroke={COLORS.accent}
                fill={COLORS.accent}
                fillOpacity={0.25}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Top districts</h3>
          <div className="mt-4 w-full h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topDistricts} margin={{ left: 8, right: 8, top: 10, bottom: 10 }}>
                <XAxis dataKey="district" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" />
                <YAxis tick={{ fontSize: 11 }} width={40} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                  }}
                />
                <Bar dataKey="count" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Top issue categories
          </h3>
          <div className="mt-4 w-full h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topCategories} margin={{ left: 8, right: 8, top: 10, bottom: 10 }}>
                <XAxis dataKey="category" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" />
                <YAxis tick={{ fontSize: 11 }} width={40} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                  }}
                />
                <Bar dataKey="count" fill={COLORS.secondary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

