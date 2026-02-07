import { useState, useMemo, useEffect } from 'react'
import type {
  BikeEvent,
  FilterState,
  DashboardId,
} from '../types/bikeEvents'
import BikeEventsMap from './BikeEventsMap'
import HeatmapMap from './HeatmapMap'
import StreetHotspotsMap from './StreetHotspotsMap'
import DistrictHotspotsMap from './DistrictHotspotsMap'
import FilterPanel from './FilterPanel'
import StatsSummary from './StatsSummary'
import HeatmapSummary from './HeatmapSummary'
import StreetHotspotsSummary from './StreetHotspotsSummary'
import DistrictHotspotsSummary from './DistrictHotspotsSummary'
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
    label: 'Street Hotspots',
    description: 'Street-level hotspots sized by event volume and colored by open share.',
  },
  {
    id: 'district',
    label: 'District Hotspots',
    description: 'District-level hotspots sized by event volume and colored by open share.',
  },
]

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
  const [selectedEvent, setSelectedEvent] = useState<BikeEvent | null>(null)
  const [selectedStreet, setSelectedStreet] = useState<string | null>(null)
  const [selectedStreetCenter, setSelectedStreetCenter] = useState<{ lat: number; lon: number } | null>(null)
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null)
  const [selectedDistrictCenter, setSelectedDistrictCenter] = useState<{ lat: number; lon: number } | null>(null)

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
                onMarkerClick={setSelectedEvent}
              />
              <HeatmapSummary events={filteredEvents} />
            </>
          )}

          {activeDashboard === 'backlog' && (
            <>
              <StreetHotspotsMap
                events={filteredEvents}
                selectedStreet={selectedStreet}
                selectedCenter={selectedStreetCenter}
                onSelectStreet={(street, center) => {
                  setSelectedStreet(street)
                  setSelectedStreetCenter(center)
                }}
              />
              <StreetHotspotsSummary
                events={filteredEvents}
                selectedStreet={selectedStreet}
                onSelectStreet={(street, center) => {
                  setSelectedStreet(street)
                  setSelectedStreetCenter(center)
                }}
                onSelectEvent={setSelectedEvent}
              />
            </>
          )}

          {activeDashboard === 'district' && (
            <>
              <DistrictHotspotsMap
                events={filteredEvents}
                selectedDistrict={selectedDistrict}
                selectedCenter={selectedDistrictCenter}
                onSelectDistrict={(district, center) => {
                  setSelectedDistrict(district)
                  setSelectedDistrictCenter(center)
                }}
              />
              <DistrictHotspotsSummary
                events={filteredEvents}
                selectedDistrict={selectedDistrict}
                onSelectDistrict={(district, center) => {
                  setSelectedDistrict(district)
                  setSelectedDistrictCenter(center)
                }}
                onSelectEvent={setSelectedEvent}
              />
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
