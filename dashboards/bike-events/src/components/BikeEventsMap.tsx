'use client'

import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Tooltip } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { divIcon, type LatLngExpression } from 'leaflet'
import type { BikeEvent } from '@/types/bikeEvents'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { CategoryIcon, getCategoryIconMarkup } from '@/utils/categoryIcons'

interface BikeEventsMapProps {
  events: BikeEvent[]
  onMarkerClick: (event: BikeEvent) => void
}

// Category color mapping (matching vintage theme)
const CATEGORY_COLORS: Record<string, string> = {
  'Oberflächenqualität / Schäden': '#8b5a2b', // brown
  'Hindernisse & Blockaden (inkl. Parken & Baustelle)': '#d97706', // amber
  'Müll / Scherben / Splitter (Sharp objects & debris)': '#65a30d', // lime
  'Markierungen & Beschilderung': '#dc2626', // red
  'Ampeln & Signale (inkl. bike-specific Licht)': '#2563eb', // blue
  'Sicherheit & Komfort (Geometrie/Führung)': '#7c3aed', // purple
  'Vegetation & Sichtbehinderung': '#059669', // emerald
  'Wasser / Eis / Entwässerung': '#0891b2', // cyan
  'Other / Unklar': '#6b7280', // gray
}

export default function BikeEventsMap({ events, onMarkerClick }: BikeEventsMapProps) {
  const cologneCenter: LatLngExpression = [50.9375, 6.9603]

  // Fix Leaflet default marker icon issue in Next.js
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    })
  }, [])

  // Create custom marker icon for each event
  const createCustomIcon = (event: BikeEvent) => {
    const color = CATEGORY_COLORS[event.bike_issue_category] || CATEGORY_COLORS['Other / Unklar']
    const borderColor = event.status === 'open' ? '#22c55e' : '#ef4444' // green for open, red for closed
    return divIcon({
      html: `
        <div class="custom-marker" style="background-color: ${color}; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid ${borderColor}; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
          ${getCategoryIconMarkup(event.bike_issue_category, 'w-6 h-6 text-white')}
        </div>
      `,
      className: '',
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      popupAnchor: [0, -40],
    })
  }

  const imageUrl = (mediaPath: string | null) =>
    mediaPath ? `https://sags-uns.stadt-koeln.de/system/files/${mediaPath}` : null

  const eventUrl = (event: BikeEvent) =>
    `https://sags-uns.stadt-koeln.de/requests/${event.sequence_number}-${event.year}`

  return (
    <div className="h-[400px] md:h-[600px] w-full rounded-lg overflow-hidden shadow-lg">
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

        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={60}
          showCoverageOnHover={false}
        >
          {events.map((event) => (
            <Marker
              key={event.service_request_id}
              position={[event.lat, event.lon]}
              icon={createCustomIcon(event)}
              eventHandlers={{
                click: () => onMarkerClick(event),
              }}
            >
              <Tooltip direction="top" offset={[0, -20]} opacity={0.95}>
                <div className="text-sm max-w-xs">
                  <div className="font-semibold mb-1 flex items-center gap-2">
                    <CategoryIcon category={event.bike_issue_category} className="w-4 h-4" />
                    <span>{event.title}</span>
                  </div>
                  {event.description && (
                    <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">
                      {event.description.slice(0, 150)}
                      {event.description.length > 150 ? '...' : ''}
                    </div>
                  )}
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
