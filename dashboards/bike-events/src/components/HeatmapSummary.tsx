'use client'

import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { BikeEvent } from '@/types/bikeEvents'

interface HeatmapSummaryProps {
  events: BikeEvent[]
}

const COLORS = {
  primary: '#8b5a2b',
  secondary: '#d97706',
}

export default function HeatmapSummary({ events }: HeatmapSummaryProps) {
  const stats = useMemo(() => {
    const total = events.length
    const open = events.filter((event) => event.status === 'open').length
    const closed = events.filter((event) => event.status === 'closed').length

    const districtCounts = events.reduce((acc, event) => {
      const key = event.district?.trim() ? event.district.trim() : 'Unknown'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const topDistricts = Object.entries(districtCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([district, count]) => ({
        name: district.length > 18 ? district.slice(0, 18) + '...' : district,
        fullName: district,
        count,
      }))

    const categoryCounts = events.reduce((acc, event) => {
      const key = event.bike_issue_category?.trim() ? event.bike_issue_category.trim() : 'Unknown'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const topCategories = Object.entries(categoryCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([category, count]) => ({
        name: category.length > 20 ? category.slice(0, 20) + '...' : category,
        fullName: category,
        count,
      }))

    return { total, open, closed, topDistricts, topCategories }
  }, [events])

  const openPercentage = stats.total ? ((stats.open / stats.total) * 100).toFixed(1) : 0
  const closedPercentage = stats.total ? ((stats.closed / stats.total) * 100).toFixed(1) : 0

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Copy of the "Overview" stats card used in the Clustered Overview tab. */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">Overview</h3>
        <div className="text-4xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</div>
        <p className="text-xs text-gray-500 dark:text-gray-400">Total Events</p>

        <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Open</span>
            <span className="font-semibold text-green-600 dark:text-green-400">
              {stats.open} ({openPercentage}%)
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div className="bg-green-500 h-2 rounded-full" style={{ width: `${openPercentage}%` }} />
          </div>

          <div className="flex justify-between text-sm mt-3">
            <span className="text-gray-600 dark:text-gray-400">Closed</span>
            <span className="font-semibold text-red-600 dark:text-red-400">
              {stats.closed} ({closedPercentage}%)
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div className="bg-red-500 h-2 rounded-full" style={{ width: `${closedPercentage}%` }} />
          </div>
        </div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Top districts
        </div>
        <div className="mt-3 h-[210px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.topDistricts} layout="vertical" margin={{ left: 0, right: 8 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tick={{ fontSize: 11 }}
                interval={0}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                }}
                formatter={(value: number | undefined, _name: string | undefined, props: any) => [
                  value,
                  props.payload.fullName || props.payload.name,
                ]}
              />
              <Bar dataKey="count" fill={COLORS.primary} radius={[4, 4, 4, 4]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Top issue categories
        </div>
        <div className="mt-3 h-[210px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.topCategories} layout="vertical" margin={{ left: 0, right: 8 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={140}
                tick={{ fontSize: 11 }}
                interval={0}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                }}
                formatter={(value: number | undefined, _name: string | undefined, props: any) => [
                  value,
                  props.payload.fullName || props.payload.name,
                ]}
              />
              <Bar dataKey="count" fill={COLORS.secondary} radius={[4, 4, 4, 4]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
