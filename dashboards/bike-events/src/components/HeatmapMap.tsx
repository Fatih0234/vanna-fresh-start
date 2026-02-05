'use client'

import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Tooltip } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { divIcon, type LatLngExpression } from 'leaflet'
import type { BikeEvent, HeatmapSettings } from '@/types/bikeEvents'
import HeatmapLayer from './HeatmapLayer'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { CategoryIcon, getCategoryIconMarkup } from '@/utils/categoryIcons'

interface HeatmapMapProps {
  events: BikeEvent[]
  onMarkerClick: (event: BikeEvent) => void
  settings: HeatmapSettings
}

const CATEGORY_COLORS: Record<string, string> = {
  'Oberflächenqualität / Schäden': '#8b5a2b',
  'Hindernisse & Blockaden (inkl. Parken & Baustelle)': '#d97706',
  'Müll / Scherben / Splitter (Sharp objects & debris)': '#65a30d',
  'Markierungen & Beschilderung': '#dc2626',
  'Ampeln & Signale (inkl. bike-specific Licht)': '#2563eb',
  'Sicherheit & Komfort (Geometrie/Führung)': '#7c3aed',
  'Vegetation & Sichtbehinderung': '#059669',
  'Wasser / Eis / Entwässerung': '#0891b2',
  'Other / Unklar': '#6b7280',
}

const HEATMAP_GRADIENT = {
  0.2: '#0ea5e9',
  0.4: '#22c55e',
  0.6: '#f59e0b',
  0.9: '#ef4444',
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const getWeight = (event: BikeEvent, weightBy: HeatmapSettings['weightBy']) => {
  if (weightBy === 'count') return 1
  if (weightBy === 'bike_confidence') {
    return Number(event.bike_confidence ?? 0)
  }
  return Number(event.bike_issue_confidence ?? 0)
}

export default function HeatmapMap({ events, onMarkerClick, settings }: HeatmapMapProps) {
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

  const heatPoints = useMemo(() => {
    return filteredEvents.map((event) => {
      const weight = getWeight(event, settings.weightBy)
      const normalized = settings.weightBy === 'count' ? 1 : clamp(weight, 0.1, 1)
      return [event.lat, event.lon, normalized] as [number, number, number]
    })
  }, [filteredEvents, settings.weightBy])

  const createClusterIcon = (event: BikeEvent) => {
    const color = CATEGORY_COLORS[event.bike_issue_category] || CATEGORY_COLORS['Other / Unklar']
    const borderColor = event.status === 'open' ? '#22c55e' : '#ef4444'
    return divIcon({
      html: `
        <div class="custom-marker" style="background-color: ${color}; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid ${borderColor}; box-shadow: 0 2px 6px rgba(0,0,0,0.25);">
          ${getCategoryIconMarkup(event.bike_issue_category, 'w-4 h-4 text-white')}
        </div>
      `,
      className: '',
      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -30],
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

        {settings.showHeatmap && heatPoints.length > 0 && (
          <HeatmapLayer
            points={heatPoints}
            radius={settings.radius}
            blur={settings.blur}
            max={settings.maxIntensity}
            gradient={HEATMAP_GRADIENT}
          />
        )}

        {settings.showClusters && (
          <MarkerClusterGroup chunkedLoading maxClusterRadius={55} showCoverageOnHover={false}>
            {filteredEvents.map((event) => (
              <Marker
                key={event.service_request_id}
                position={[event.lat, event.lon]}
                icon={createClusterIcon(event)}
                eventHandlers={{
                  click: () => onMarkerClick(event),
                }}
              >
                <Tooltip direction="top" offset={[0, -18]} opacity={0.95}>
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
        )}
      </MapContainer>
    </div>
  )
}
