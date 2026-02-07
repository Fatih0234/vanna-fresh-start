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

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Events in view
        </div>
        <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">
          {stats.total}
        </div>
        <div className="mt-4 text-sm text-gray-600 dark:text-gray-300">
          Open: <span className="font-semibold text-emerald-500">{stats.open}</span>
          <span className="mx-2">|</span>
          Closed: <span className="font-semibold text-red-500">{stats.closed}</span>
        </div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Top districts
        </div>
        <div className="mt-3 h-[170px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.topDistricts} layout="vertical" margin={{ left: 0, right: 8 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={90}
                tick={{ fontSize: 11 }}
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
              <Bar dataKey="count" fill={COLORS.primary} radius={[4, 4, 4, 4]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Top issue categories
        </div>
        <div className="mt-3 h-[170px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.topCategories} layout="vertical" margin={{ left: 0, right: 8 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={100}
                tick={{ fontSize: 11 }}
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
              <Bar dataKey="count" fill={COLORS.secondary} radius={[4, 4, 4, 4]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
