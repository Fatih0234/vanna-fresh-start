'use client'

import { useMemo } from 'react'
import type { BikeEvent } from '@/types/bikeEvents'
import { buildHeatmapGrid } from '@/utils/heatmapGrid'

interface HeatmapHotspotsProps {
  events: BikeEvent[]
  onSelectHotspot: (center: { lat: number; lon: number }) => void
  cellSizeMeters?: number
  maxHotspots?: number
}

export default function HeatmapHotspots({
  events,
  onSelectHotspot,
  cellSizeMeters = 250,
  maxHotspots = 8,
}: HeatmapHotspotsProps) {
  const hotspots = useMemo(() => {
    const grid = buildHeatmapGrid(events, cellSizeMeters)
    return grid
      .sort((a, b) => b.count - a.count)
      .slice(0, maxHotspots)
  }, [events, cellSizeMeters, maxHotspots])

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Top hotspots</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Based on ~{cellSizeMeters}m grid cells (event count only).
          </p>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {events.length.toLocaleString()} events in view
        </div>
      </div>

      {hotspots.length === 0 ? (
        <div className="mt-4 text-sm text-gray-600 dark:text-gray-300">No events to summarize.</div>
      ) : (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {hotspots.map((cell, idx) => (
            <button
              key={cell.key}
              onClick={() => onSelectHotspot(cell.center)}
              className="text-left rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors p-3"
              title="Zoom to hotspot"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  Hotspot {idx + 1}
                </div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {cell.count.toLocaleString()}
                </div>
              </div>
              <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                Near {cell.center.lat.toFixed(3)}, {cell.center.lon.toFixed(3)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

