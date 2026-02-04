'use client'

import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { BacklogFilters, BikeEvent } from '@/types/bikeEvents'

interface BacklogSummaryProps {
  events: BikeEvent[]
  filters: BacklogFilters
}

const BUCKET_ORDER: BikeEvent['backlog_bucket'][] = ['0–7d', '7–14d', '14–30d', '30d+', 'closed']

export default function BacklogSummary({ events, filters }: BacklogSummaryProps) {
  const stats = useMemo(() => {
    const total = events.length
    const open = events.filter((event) => event.status === 'open').length
    const closed = events.filter((event) => event.status === 'closed').length

    const bucketCounts = events.reduce(
      (acc, event) => {
        acc[event.backlog_bucket] = (acc[event.backlog_bucket] || 0) + 1
        return acc
      },
      {} as Record<BikeEvent['backlog_bucket'], number>
    )

    const confidenceSum = events.reduce(
      (sum, event) => sum + Number(event[filters.confidenceMetric] ?? 0),
      0
    )
    const avgConfidence = total ? confidenceSum / total : 0

    return { total, open, closed, bucketCounts, avgConfidence }
  }, [events, filters.confidenceMetric])

  const bucketData = BUCKET_ORDER.map((bucket) => ({
    bucket,
    count: stats.bucketCounts[bucket] || 0,
  }))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Backlog total
        </div>
        <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">
          {stats.total}
        </div>
        <div className="mt-4 text-sm text-gray-600 dark:text-gray-300">
          Open: <span className="font-semibold text-emerald-500">{stats.open}</span>
          <span className="mx-2">|</span>
          Closed: <span className="font-semibold text-red-500">{stats.closed}</span>
        </div>
        <div className="mt-4 text-sm text-gray-600 dark:text-gray-300">
          Avg confidence ({filters.confidenceMetric === 'bike_issue_confidence' ? 'issue' : 'bike'}):
          <span className="font-semibold ml-2">{stats.avgConfidence.toFixed(2)}</span>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 lg:col-span-2">
        <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-4">
          Backlog distribution
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={bucketData}>
            <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
              }}
            />
            <Bar dataKey="count" fill="#8b5a2b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
