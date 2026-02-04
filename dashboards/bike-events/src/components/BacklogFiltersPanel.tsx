'use client'

import { useMemo } from 'react'
import type { BacklogFilters, BikeEvent } from '@/types/bikeEvents'

interface BacklogFiltersPanelProps {
  filters: BacklogFilters
  onChange: (filters: BacklogFilters) => void
  events: BikeEvent[]
}

const BUCKET_ORDER: BikeEvent['backlog_bucket'][] = ['0–7d', '7–14d', '14–30d', '30d+', 'closed']

export default function BacklogFiltersPanel({ filters, onChange, events }: BacklogFiltersPanelProps) {
  const bucketCounts = useMemo(() => {
    return events.reduce(
      (acc, event) => {
        acc[event.backlog_bucket] = (acc[event.backlog_bucket] || 0) + 1
        return acc
      },
      {} as Record<BikeEvent['backlog_bucket'], number>
    )
  }, [events])

  const handleBucketToggle = (bucket: BikeEvent['backlog_bucket'], checked: boolean) => {
    const nextBuckets = checked
      ? [...filters.buckets, bucket]
      : filters.buckets.filter((b) => b !== bucket)

    onChange({ ...filters, buckets: nextBuckets })
  }

  const handleMinChange = (value: number) => {
    const nextMin = Math.min(value, filters.confidenceMax)
    onChange({ ...filters, confidenceMin: nextMin })
  }

  const handleMaxChange = (value: number) => {
    const nextMax = Math.max(value, filters.confidenceMin)
    onChange({ ...filters, confidenceMax: nextMax })
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Backlog Filters</h3>

      <div className="space-y-2">
        <label className="text-sm font-semibold text-gray-600 dark:text-gray-300">
          Backlog buckets
        </label>
        <div className="space-y-2">
          {BUCKET_ORDER.map((bucket) => (
            <label key={bucket} className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-300">
              <span>
                <input
                  type="checkbox"
                  checked={filters.buckets.includes(bucket)}
                  onChange={(e) => handleBucketToggle(bucket, e.target.checked)}
                  className="mr-2 h-4 w-4 text-primary-600 border-gray-300 rounded"
                />
                {bucket}
              </span>
              <span className="text-xs text-gray-400">{bucketCounts[bucket] || 0}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold text-gray-600 dark:text-gray-300">
          Confidence metric
        </label>
        <select
          value={filters.confidenceMetric}
          onChange={(e) =>
            onChange({
              ...filters,
              confidenceMetric: e.target.value as BacklogFilters['confidenceMetric'],
            })
          }
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        >
          <option value="bike_issue_confidence">Issue category confidence</option>
          <option value="bike_confidence">Bike relation confidence</option>
        </select>
      </div>

      <div className="space-y-3">
        <div className="text-sm font-semibold text-gray-600 dark:text-gray-300">Confidence range</div>
        <div>
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Min</span>
            <span>{filters.confidenceMin.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={filters.confidenceMin}
            onChange={(e) => handleMinChange(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div>
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Max</span>
            <span>{filters.confidenceMax.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={filters.confidenceMax}
            onChange={(e) => handleMaxChange(Number(e.target.value))}
            className="w-full"
          />
        </div>
      </div>

      <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
          Marker legend
        </div>
        <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
          <div>Size = backlog age</div>
          <div>Color = confidence score</div>
          <div>Border = open vs closed</div>
        </div>
      </div>
    </div>
  )
}
