'use client'

import { useMemo } from 'react'
import { RadioGroup } from '@headlessui/react'
import type { FilterState, BikeEvent } from '@/types/bikeEvents'

interface FilterPanelProps {
  filters: FilterState
  onFilterChange: (filters: FilterState) => void
  allEvents: BikeEvent[]
  filteredEvents: BikeEvent[]
}

export default function FilterPanel({
  filters,
  onFilterChange,
  allEvents,
  filteredEvents,
}: FilterPanelProps) {
  // Calculate unique values for dropdowns (from all events)
  const uniqueDistricts = useMemo(
    () => [...new Set(allEvents.map((e) => e.district).filter(Boolean))].sort(),
    [allEvents]
  )
  const uniqueCategories = useMemo(
    () =>
      [...new Set(allEvents.map((e) => e.bike_issue_category))].sort().map((cat) => {
        const emoji = allEvents.find((e) => e.bike_issue_category === cat)?.bike_issue_emoji || ''
        return { name: cat, emoji }
      }),
    [allEvents]
  )

  // Calculate status counts based on OTHER active filters (excluding status filter)
  const statusCounts = useMemo(() => {
    // Apply all filters EXCEPT status filter to get the count for each status
    const eventsFilteredWithoutStatus = allEvents.filter((event) => {
      // Apply date range filter
      if (filters.dateRange?.start) {
        const eventDate = new Date(event.requested_at)
        if (eventDate < filters.dateRange.start) return false
      }
      if (filters.dateRange?.end) {
        const eventDate = new Date(event.requested_at)
        if (eventDate > filters.dateRange.end) return false
      }

      // Apply district filter
      if (filters.districts.length > 0 && !filters.districts.includes(event.district || ''))
        return false

      // Apply category filter
      if (filters.categories.length > 0 && !filters.categories.includes(event.bike_issue_category))
        return false

      return true
    })

    const total = eventsFilteredWithoutStatus.length
    const open = eventsFilteredWithoutStatus.filter((e) => e.status === 'open').length
    const closed = eventsFilteredWithoutStatus.filter((e) => e.status === 'closed').length
    return { all: total, open, closed }
  }, [allEvents, filters.dateRange, filters.districts, filters.categories])

  const handleReset = () => {
    onFilterChange({
      dateRange: null,
      status: 'all',
      districts: [],
      categories: [],
      zipCodes: [],
    })
  }

  const handleLastWeek = () => {
    const today = new Date()
    const lastWeek = new Date()
    lastWeek.setDate(today.getDate() - 7)
    onFilterChange({
      ...filters,
      dateRange: { start: lastWeek, end: today },
    })
  }

  const handleLastMonth = () => {
    const today = new Date()
    const lastMonth = new Date()
    lastMonth.setMonth(today.getMonth() - 1)
    onFilterChange({
      ...filters,
      dateRange: { start: lastMonth, end: today },
    })
  }

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filters.dateRange) count++
    if (filters.status !== 'all') count++
    if (filters.districts.length > 0) count++
    if (filters.categories.length > 0) count++
    return count
  }, [filters])

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-6 sticky top-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Filters</h2>
          {activeFilterCount > 0 && (
            <span className="text-xs bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 px-2 py-1 rounded-full">
              {activeFilterCount} active
            </span>
          )}
        </div>
        {activeFilterCount > 0 && (
          <button
            onClick={handleReset}
            className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 underline transition-colors"
            title="Clear all filters"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Date Range Filter */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Date Range
        </label>

        {/* Quick Filter Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleLastWeek}
            className="flex-1 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
          >
            Last Week
          </button>
          <button
            onClick={handleLastMonth}
            className="flex-1 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
          >
            Last Month
          </button>
        </div>

        <div className="space-y-2">
          <input
            type="date"
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            value={filters.dateRange?.start?.toISOString().split('T')[0] || ''}
            onChange={(e) => {
              const date = e.target.value ? new Date(e.target.value) : null
              onFilterChange({
                ...filters,
                dateRange: { start: date, end: filters.dateRange?.end || null },
              })
            }}
            placeholder="Start date"
          />
          <input
            type="date"
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            value={filters.dateRange?.end?.toISOString().split('T')[0] || ''}
            onChange={(e) => {
              const date = e.target.value ? new Date(e.target.value) : null
              onFilterChange({
                ...filters,
                dateRange: { start: filters.dateRange?.start || null, end: date },
              })
            }}
            placeholder="End date"
          />
        </div>
      </div>

      {/* Status Filter */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Status</label>
        <RadioGroup
          value={filters.status}
          onChange={(value) => onFilterChange({ ...filters, status: value })}
          className="space-y-2"
        >
          {(['all', 'open', 'closed'] as const).map((status) => (
            <RadioGroup.Option key={status} value={status} className="cursor-pointer">
              {({ checked }) => (
                <div className="flex items-center space-x-2">
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      checked
                        ? 'border-primary-600 bg-primary-600'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {checked && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                    {status} ({statusCounts[status]})
                  </span>
                </div>
              )}
            </RadioGroup.Option>
          ))}
        </RadioGroup>
      </div>

      {/* Category Filter */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Issue Categories
        </label>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {uniqueCategories.map((cat) => (
            <label key={cat.name} className="flex items-start space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.categories.includes(cat.name)}
                onChange={(e) => {
                  const newCategories = e.target.checked
                    ? [...filters.categories, cat.name]
                    : filters.categories.filter((c) => c !== cat.name)
                  onFilterChange({ ...filters, categories: newCategories })
                }}
                className="mt-1 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">
                {cat.emoji} {cat.name.substring(cat.name.indexOf(' ') + 1)}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* District Filter */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Districts</label>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {uniqueDistricts.map((district) => (
            <label key={district} className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.districts.includes(district as string)}
                onChange={(e) => {
                  const newDistricts = e.target.checked
                    ? [...filters.districts, district as string]
                    : filters.districts.filter((d) => d !== district)
                  onFilterChange({ ...filters, districts: newDistricts })
                }}
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">{district}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
