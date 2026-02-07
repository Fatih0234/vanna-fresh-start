'use client'

import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import type { LatLngExpression } from 'leaflet'
import type { BikeEvent } from '@/types/bikeEvents'
import HeatmapLayer from './HeatmapLayer'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { buildHeatmapGrid, clamp, percentileCount } from '@/utils/heatmapGrid'

interface HeatmapMapProps {
  events: BikeEvent[]
  onReady?: (api: { panTo: (center: { lat: number; lon: number }, zoom?: number) => void }) => void
}

const HEATMAP_GRADIENT = {
  0.2: '#0ea5e9',
  0.4: '#22c55e',
  0.6: '#f59e0b',
  0.9: '#ef4444',
}

const DEFAULT_RADIUS = 28
const DEFAULT_BLUR = 20
const HOTSPOT_CELL_METERS = 250
const HOTSPOT_ZOOM = 15

function MapApiBridge({
  onReady,
}: {
  onReady?: (api: { panTo: (center: { lat: number; lon: number }, zoom?: number) => void }) => void
}) {
  const map = useMap()

  useEffect(() => {
    if (!onReady) return
    onReady({
      panTo: (center, zoom = HOTSPOT_ZOOM) => {
        map.setView([center.lat, center.lon], zoom, { animate: true })
      },
    })
  }, [map, onReady])

  return null
}

export default function HeatmapMap({ events, onReady }: HeatmapMapProps) {
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
    return clamp(p95 || 3, 3, 50)
  }, [filteredEvents])

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

        <MapApiBridge onReady={onReady} />

        {heatPoints.length > 0 && (
          <HeatmapLayer
            points={heatPoints}
            radius={DEFAULT_RADIUS}
            blur={DEFAULT_BLUR}
            max={maxIntensity}
            gradient={HEATMAP_GRADIENT}
          />
        )}
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
