import { useState, useMemo, useEffect } from 'react'
import type {
  BikeEvent,
  FilterState,
  DashboardId,
  HeatmapSettings,
  BacklogFilters,
} from '../types/bikeEvents'
import BikeEventsMap from './BikeEventsMap'
import HeatmapMap from './HeatmapMap'
import BacklogConfidenceMap from './BacklogConfidenceMap'
import FilterPanel from './FilterPanel'
import HeatmapControls from './HeatmapControls'
import BacklogFiltersPanel from './BacklogFiltersPanel'
import StatsSummary from './StatsSummary'
import HeatmapSummary from './HeatmapSummary'
import BacklogSummary from './BacklogSummary'
import DashboardTabs from './DashboardTabs'
import EventDetailsModal from './EventDetailsModal'

const DASHBOARD_TABS: Array<{ id: DashboardId; label: string; description: string }> = [
  {
    id: 'overview',
    label: 'Clustered Overview',
    description: 'Spot the latest bike issues with clustered markers and citywide stats.',
  },
  {
    id: 'heatmap',
    label: 'Heatmap + Clusters',
    description: 'Layer density heatmaps on top of clusters to reveal corridors and hotspots.',
  },
  {
    id: 'backlog',
    label: 'Backlog & Confidence',
    description: 'Surface backlog pressure with size-encoded markers and confidence filters.',
  },
]

const DEFAULT_BACKLOG_BUCKETS: BacklogFilters['buckets'] = ['0–7d', '7–14d', '14–30d', '30d+', 'closed']

export default function BikeEventsDashboard() {
  const [events, setEvents] = useState<BikeEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeDashboard, setActiveDashboard] = useState<DashboardId>('overview')
  const [filters, setFilters] = useState<FilterState>({
    dateRange: null,
    status: 'all',
    districts: [],
    categories: [],
    zipCodes: [],
  })
  const [heatmapSettings, setHeatmapSettings] = useState<HeatmapSettings>({
    showHeatmap: true,
    showClusters: true,
    radius: 35,
    blur: 22,
    maxIntensity: 1.1,
    weightBy: 'count',
  })
  const [backlogFilters, setBacklogFilters] = useState<BacklogFilters>({
    buckets: DEFAULT_BACKLOG_BUCKETS,
    confidenceMin: 0,
    confidenceMax: 1,
    confidenceMetric: 'bike_issue_confidence',
  })
  const [selectedEvent, setSelectedEvent] = useState<BikeEvent | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function fetchData() {
      try {
        const response = await fetch('/api/dashboards/bike-events/data', {
          signal: controller.signal,
          credentials: 'include',
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

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (filters.dateRange?.start) {
        const eventDate = new Date(event.requested_at)
        if (eventDate < filters.dateRange.start) return false
      }
      if (filters.dateRange?.end) {
        const eventDate = new Date(event.requested_at)
        if (eventDate > filters.dateRange.end) return false
      }

      if (filters.status !== 'all' && event.status !== filters.status) return false

      if (filters.districts.length > 0 && !filters.districts.includes(event.district || ''))
        return false

      if (filters.categories.length > 0 && !filters.categories.includes(event.bike_issue_category))
        return false

      return true
    })
  }, [events, filters])

  const backlogEvents = useMemo(() => {
    return filteredEvents.filter((event) => {
      if (!backlogFilters.buckets.includes(event.backlog_bucket)) return false
      const confidenceValue = Number(event[backlogFilters.confidenceMetric] ?? 0)
      if (confidenceValue < backlogFilters.confidenceMin) return false
      if (confidenceValue > backlogFilters.confidenceMax) return false
      return true
    })
  }, [filteredEvents, backlogFilters])

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
    <div className="h-full w-full flex flex-col">
      <div className="px-6 pt-6">
        <DashboardTabs
          activeId={activeDashboard}
          onChange={setActiveDashboard}
          tabs={DASHBOARD_TABS}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-0 flex-1">
        <div className="lg:col-span-1 px-6 py-6 bg-gray-50 dark:bg-gray-900 overflow-y-auto space-y-6">
          <FilterPanel
            filters={filters}
            onFilterChange={setFilters}
            allEvents={events}
            filteredEvents={filteredEvents}
          />
          {activeDashboard === 'heatmap' && (
            <HeatmapControls
              settings={heatmapSettings}
              onChange={setHeatmapSettings}
              eventCount={filteredEvents.length}
            />
          )}
          {activeDashboard === 'backlog' && (
            <BacklogFiltersPanel
              filters={backlogFilters}
              onChange={setBacklogFilters}
              events={filteredEvents}
            />
          )}
        </div>

        <div className="lg:col-span-4 px-6 py-6 overflow-y-auto space-y-8">
          {activeDashboard === 'overview' && (
            <>
              <BikeEventsMap events={filteredEvents} onMarkerClick={setSelectedEvent} />
              <StatsSummary events={filteredEvents} />
            </>
          )}

          {activeDashboard === 'heatmap' && (
            <>
              <HeatmapMap
                events={filteredEvents}
              />
              <HeatmapSummary events={filteredEvents} settings={heatmapSettings} />
            </>
          )}

          {activeDashboard === 'backlog' && (
            <>
              <BacklogConfidenceMap
                events={backlogEvents}
                onMarkerClick={setSelectedEvent}
                filters={backlogFilters}
              />
              <BacklogSummary events={backlogEvents} filters={backlogFilters} />
            </>
          )}
        </div>
      </div>

      {selectedEvent && (
        <EventDetailsModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  )
}
