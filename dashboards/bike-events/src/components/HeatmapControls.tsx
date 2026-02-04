'use client'

import type { HeatmapSettings } from '@/types/bikeEvents'

interface HeatmapControlsProps {
  settings: HeatmapSettings
  onChange: (settings: HeatmapSettings) => void
  eventCount: number
}

export default function HeatmapControls({ settings, onChange, eventCount }: HeatmapControlsProps) {
  const update = (patch: Partial<HeatmapSettings>) => {
    onChange({ ...settings, ...patch })
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Heatmap Controls</h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">{eventCount} points</span>
      </div>

      <div className="space-y-3">
        <label className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300">
          <span>Show heatmap</span>
          <input
            type="checkbox"
            checked={settings.showHeatmap}
            onChange={(e) => update({ showHeatmap: e.target.checked })}
            className="h-4 w-4 text-primary-600 border-gray-300 rounded"
          />
        </label>
        <label className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300">
          <span>Show clusters</span>
          <input
            type="checkbox"
            checked={settings.showClusters}
            onChange={(e) => update({ showClusters: e.target.checked })}
            className="h-4 w-4 text-primary-600 border-gray-300 rounded"
          />
        </label>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Intensity Weight</label>
        <select
          value={settings.weightBy}
          onChange={(e) => update({ weightBy: e.target.value as HeatmapSettings['weightBy'] })}
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        >
          <option value="count">Event count</option>
          <option value="bike_confidence">Bike relation confidence</option>
          <option value="bike_issue_confidence">Issue category confidence</option>
        </select>
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Radius</span>
            <span>{settings.radius}px</span>
          </div>
          <input
            type="range"
            min={15}
            max={60}
            step={1}
            value={settings.radius}
            onChange={(e) => update({ radius: Number(e.target.value) })}
            className="w-full"
          />
        </div>
        <div>
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Blur</span>
            <span>{settings.blur}px</span>
          </div>
          <input
            type="range"
            min={10}
            max={40}
            step={1}
            value={settings.blur}
            onChange={(e) => update({ blur: Number(e.target.value) })}
            className="w-full"
          />
        </div>
        <div>
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Max intensity</span>
            <span>{settings.maxIntensity.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={0.6}
            max={2.0}
            step={0.1}
            value={settings.maxIntensity}
            onChange={(e) => update({ maxIntensity: Number(e.target.value) })}
            className="w-full"
          />
        </div>
      </div>

      <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
          Density legend
        </div>
        <div className="h-2 w-full rounded-full bg-gradient-to-r from-sky-500 via-emerald-500 via-amber-500 to-red-500" />
        <div className="flex justify-between text-[11px] text-gray-500 dark:text-gray-400 mt-1">
          <span>Cool</span>
          <span>Hot</span>
        </div>
      </div>
    </div>
  )
}
