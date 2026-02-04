'use client'

import { useMemo } from 'react'
import type { BikeEvent, HeatmapSettings } from '@/types/bikeEvents'

interface HeatmapSummaryProps {
  events: BikeEvent[]
  settings: HeatmapSettings
}

export default function HeatmapSummary({ events, settings }: HeatmapSummaryProps) {
  const stats = useMemo(() => {
    const total = events.length
    const open = events.filter((event) => event.status === 'open').length
    const closed = events.filter((event) => event.status === 'closed').length
    const bikeConfAvg =
      events.reduce((sum, event) => sum + Number(event.bike_confidence ?? 0), 0) /
      (events.length || 1)
    const issueConfAvg =
      events.reduce((sum, event) => sum + Number(event.bike_issue_confidence ?? 0), 0) /
      (events.length || 1)

    return {
      total,
      open,
      closed,
      bikeConfAvg,
      issueConfAvg,
    }
  }, [events])

  const activeWeightLabel =
    settings.weightBy === 'count'
      ? 'Event count'
      : settings.weightBy === 'bike_confidence'
        ? 'Bike confidence'
        : 'Issue confidence'

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
          Avg bike confidence
        </div>
        <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">
          {stats.bikeConfAvg.toFixed(2)}
        </div>
        <div className="mt-4 text-sm text-gray-600 dark:text-gray-300">
          Category confidence: <span className="font-semibold">{stats.issueConfAvg.toFixed(2)}</span>
        </div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Heatmap weighting
        </div>
        <div className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-2">
          {activeWeightLabel}
        </div>
        <div className="mt-4 text-sm text-gray-600 dark:text-gray-300">
          Adjust radius + blur to reveal corridor-level vs neighborhood density.
        </div>
      </div>
    </div>
  )
}
