'use client'

import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Tooltip } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { divIcon, type LatLngExpression } from 'leaflet'
import type { BacklogFilters, BikeEvent } from '@/types/bikeEvents'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface BacklogConfidenceMapProps {
  events: BikeEvent[]
  onMarkerClick: (event: BikeEvent) => void
  filters: BacklogFilters
}

const BUCKET_SIZES: Record<BikeEvent['backlog_bucket'], number> = {
  '0–7d': 26,
  '7–14d': 30,
  '14–30d': 34,
  '30d+': 38,
  closed: 22,
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const confidenceColor = (value: number) => {
  const t = clamp(value, 0, 1)
  const r = Math.round(239 + (34 - 239) * t)
  const g = Math.round(68 + (197 - 68) * t)
  const b = Math.round(68 + (94 - 68) * t)
  return `rgb(${r}, ${g}, ${b})`
}

export default function BacklogConfidenceMap({ events, onMarkerClick, filters }: BacklogConfidenceMapProps) {
  const cologneCenter: LatLngExpression = [50.9375, 6.9603]

  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    })
  }, [])

  const filteredEvents = useMemo(
    () => events.filter((event) => Number.isFinite(event.lat) && Number.isFinite(event.lon)),
    [events]
  )

  const createConfidenceIcon = (event: BikeEvent) => {
    const size = BUCKET_SIZES[event.backlog_bucket]
    const confidenceValue = Number(event[filters.confidenceMetric] ?? 0)
    const color = confidenceColor(confidenceValue)
    const borderColor = event.status === 'open' ? '#22c55e' : '#ef4444'
    const emoji = event.bike_issue_emoji || '🚲'

    return divIcon({
      html: `
        <div style="background-color: ${color}; width: ${size}px; height: ${size}px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid ${borderColor}; box-shadow: 0 3px 8px rgba(0,0,0,0.28);">
          <span style="font-size: ${Math.max(12, size * 0.45)}px;">${emoji}</span>
        </div>
      `,
      className: '',
      iconSize: [size, size],
      iconAnchor: [size / 2, size],
      popupAnchor: [0, -size],
    })
  }

  return (
    <div className="h-[420px] md:h-[620px] w-full rounded-lg overflow-hidden shadow-lg">
      <MapContainer
        center={cologneCenter}
        zoom={12}
        minZoom={10}
        maxZoom={18}
        className="h-full w-full"
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MarkerClusterGroup chunkedLoading maxClusterRadius={60} showCoverageOnHover={false}>
          {filteredEvents.map((event) => (
            <Marker
              key={event.service_request_id}
              position={[event.lat, event.lon]}
              icon={createConfidenceIcon(event)}
              eventHandlers={{
                click: () => onMarkerClick(event),
              }}
            >
              <Tooltip direction="top" offset={[0, -18]} opacity={0.95}>
                <div className="text-sm max-w-xs">
                  <div className="font-semibold mb-1">
                    {event.bike_issue_category_emoji} {event.title}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">
                    Backlog bucket: <span className="font-semibold">{event.backlog_bucket}</span>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">
                    Confidence: <span className="font-semibold">{Number(event[filters.confidenceMetric]).toFixed(2)}</span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                    Click for full details
                  </div>
                </div>
              </Tooltip>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  )
}
