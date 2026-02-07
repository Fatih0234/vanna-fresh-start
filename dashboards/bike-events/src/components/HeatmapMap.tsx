'use client'

import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Tooltip } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { divIcon, type LatLngExpression } from 'leaflet'
import type { BikeEvent } from '@/types/bikeEvents'
import HeatmapLayer from './HeatmapLayer'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { buildHeatmapGrid, clamp, percentileCount } from '@/utils/heatmapGrid'
import { CategoryIcon, getCategoryIconMarkup } from '@/utils/categoryIcons'

interface HeatmapMapProps {
  events: BikeEvent[]
  onMarkerClick?: (event: BikeEvent) => void
}

const HEATMAP_GRADIENT = {
  0.2: '#0ea5e9',
  0.4: '#22c55e',
  0.6: '#f59e0b',
  0.9: '#ef4444',
}

// Tuned defaults for "corridor-level vs neighborhood density" without any UI controls.
const DEFAULT_RADIUS = 35
const DEFAULT_BLUR = 22
const HOTSPOT_CELL_METERS = 250

// Category color mapping (matching the vintage theme used elsewhere).
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

export default function HeatmapMap({ events, onMarkerClick }: HeatmapMapProps) {
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

  const heatPoints = useMemo(
    () => filteredEvents.map((event) => [event.lat, event.lon, 1] as [number, number, number]),
    [filteredEvents]
  )

  const maxIntensity = useMemo(() => {
    const grid = buildHeatmapGrid(filteredEvents, HOTSPOT_CELL_METERS)
    const counts = grid.map((cell) => cell.count)
    const p95 = percentileCount(counts, 0.95)
    // leaflet.heat normalizes each point's weight by `max`.
    // Our weights are always 1 (event count). If `max` is too large (e.g. 20-50),
    // individual points become too "cool" and the map looks uniformly blue/green.
    // Map grid-count p95 into a small, heat-friendly range near 1.
    const scaled = (p95 || 1) / 3
    return clamp(scaled, 0.8, 1.4)
  }, [filteredEvents])

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
    <div className="relative h-[420px] md:h-[620px] w-full rounded-lg overflow-hidden shadow-lg">
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

        {heatPoints.length > 0 && (
          <HeatmapLayer
            points={heatPoints}
            radius={DEFAULT_RADIUS}
            blur={DEFAULT_BLUR}
            max={maxIntensity}
            gradient={HEATMAP_GRADIENT}
          />
        )}

        <MarkerClusterGroup chunkedLoading maxClusterRadius={55} showCoverageOnHover={false}>
          {filteredEvents.map((event) => (
            <Marker
              key={event.service_request_id}
              position={[event.lat, event.lon]}
              icon={createClusterIcon(event)}
              eventHandlers={{
                click: () => onMarkerClick?.(event),
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
      </MapContainer>

      {/* On-map density legend overlay (no scrolling). */}
      <div className="absolute left-4 bottom-4 z-[500] pointer-events-none">
        <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur rounded-md shadow px-3 py-2">
          <div className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">
            Density
          </div>
          <div className="mt-1 h-2 w-44 rounded-full bg-gradient-to-r from-sky-500 via-emerald-500 via-amber-500 to-red-500" />
          <div className="mt-1 flex justify-between text-[10px] text-gray-500 dark:text-gray-400">
            <span>Cool</span>
            <span>Hot</span>
          </div>
        </div>
      </div>
    </div>
  )
}
