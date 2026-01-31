import { useState, useMemo, useEffect } from 'react'
import type { BikeEvent, FilterState } from '../types/bikeEvents'
import BikeEventsMap from './BikeEventsMap'
import FilterPanel from './FilterPanel'
import StatsSummary from './StatsSummary'
import EventDetailsModal from './EventDetailsModal'

export default function BikeEventsDashboard() {
  const [events, setEvents] = useState<BikeEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>({
    dateRange: null,
    status: 'all',
    districts: [],
    categories: [],
    zipCodes: [],
  })
  const [selectedEvent, setSelectedEvent] = useState<BikeEvent | null>(null)

  // Fetch data from FastAPI endpoint
  useEffect(() => {
    const controller = new AbortController()

    async function fetchData() {
      try {
        const response = await fetch('/api/dashboards/bike-events/data', {
          signal: controller.signal,
          credentials: 'include'
        })

        if (response.status === 401) {
          window.location.href = '/'
          return
        }

        if (!response.ok) {
          throw new Error('Failed to fetch bike events')
        }

        const data = await response.json()
        setEvents(data.data)
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('Failed to fetch bike events:', error)
          setError('Failed to load dashboard data')
        }
      } finally {
        setLoading(false)
      }
    }

    fetchData()

    return () => controller.abort()
  }, [])

  // Filter events based on current filter state
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      // Apply date range filter
      if (filters.dateRange?.start) {
        const eventDate = new Date(event.requested_at)
        if (eventDate < filters.dateRange.start) return false
      }
      if (filters.dateRange?.end) {
        const eventDate = new Date(event.requested_at)
        if (eventDate > filters.dateRange.end) return false
      }

      // Apply status filter
      if (filters.status !== 'all' && event.status !== filters.status) return false

      // Apply district filter
      if (filters.districts.length > 0 && !filters.districts.includes(event.district || ''))
        return false

      // Apply category filter
      if (filters.categories.length > 0 && !filters.categories.includes(event.bike_issue_category))
        return false

      return true
    })
  }, [events, filters])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-0 h-full">
        {/* Filter Panel - Sidebar */}
        <div className="lg:col-span-1 px-6 py-6 bg-gray-50 dark:bg-gray-900 overflow-y-auto">
          <FilterPanel
            filters={filters}
            onFilterChange={setFilters}
            allEvents={events}
            filteredEvents={filteredEvents}
          />
        </div>

        {/* Map and Stats - Main Area */}
        <div className="lg:col-span-4 px-6 py-6 overflow-y-auto">
          {/* Map */}
          <div className="relative">
            <BikeEventsMap events={filteredEvents} onMarkerClick={setSelectedEvent} />
          </div>

          {/* Statistics Summary - Right below map */}
          <div className="mt-8">
            <StatsSummary events={filteredEvents} />
          </div>
        </div>
      </div>

      {/* Event Details Modal */}
      {selectedEvent && (
        <EventDetailsModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  )
}
