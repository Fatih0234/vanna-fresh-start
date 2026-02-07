'use client'

import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet'
import { divIcon, type LatLngExpression } from 'leaflet'
import type { BikeEvent } from '@/types/bikeEvents'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  buildDistrictHotspots,
  markerSizeForCount,
  openShareColor,
  type DistrictHotspot,
} from '@/utils/districtHotspots'

interface DistrictHotspotsMapProps {
  events: BikeEvent[]
  selectedDistrict?: string | null
  selectedCenter?: { lat: number; lon: number } | null
  onSelectDistrict: (district: string, center: { lat: number; lon: number }) => void
}

const DEFAULT_ZOOM = 12
const FOCUS_ZOOM = 14

function PanToSelected({ center }: { center: { lat: number; lon: number } | null }) {
  const map = useMap()

  useEffect(() => {
    if (!center) return
    map.setView([center.lat, center.lon], Math.max(map.getZoom(), FOCUS_ZOOM), { animate: true })
  }, [map, center?.lat, center?.lon])

  return null
}

export default function DistrictHotspotsMap({
  events,
  selectedDistrict,
  selectedCenter,
  onSelectDistrict,
}: DistrictHotspotsMapProps) {
  const cologneCenter: LatLngExpression = [50.9375, 6.9603]

  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    })
  }, [])

  const districts = useMemo(() => {
    const { hotspots } = buildDistrictHotspots(events)
    return hotspots
  }, [events])

  const createIcon = (hotspot: DistrictHotspot) => {
    const size = markerSizeForCount(hotspot.totalCount)
    const bg = openShareColor(hotspot.openShare)
    const isSelected = selectedDistrict === hotspot.district

    const ring = isSelected
      ? '0 0 0 3px rgba(59, 130, 246, 0.65)'
      : '0 0 0 1px rgba(255, 255, 255, 0.8)'

    return divIcon({
      html: `
        <div style="
          width: ${size}px;
          height: ${size}px;
          border-radius: 9999px;
          background: ${bg};
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 900;
          font-size: ${Math.max(11, Math.round(size * 0.30))}px;
          box-shadow: ${ring}, 0 8px 16px rgba(0,0,0,0.20);
          border: 1px solid rgba(0,0,0,0.18);
          letter-spacing: -0.2px;
        ">
          ${hotspot.totalCount}
        </div>
      `,
      className: '',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    })
  }

  return (
    <div className="relative h-[420px] md:h-[620px] w-full rounded-lg overflow-hidden shadow-lg">
      <MapContainer
        center={cologneCenter}
        zoom={DEFAULT_ZOOM}
        minZoom={10}
        maxZoom={18}
        className="h-full w-full"
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <PanToSelected center={selectedCenter ?? null} />

        {districts.map((d) => (
          <Marker
            key={d.district}
            position={[d.center.lat, d.center.lon]}
            icon={createIcon(d)}
            eventHandlers={{
              click: () => onSelectDistrict(d.district, d.center),
            }}
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
              <div className="text-sm max-w-xs">
                <div className="font-semibold mb-1">{d.district}</div>
                <div className="text-xs text-gray-600 dark:text-gray-300">
                  Total: <span className="font-semibold">{d.totalCount}</span>
                  <span className="mx-2">|</span>
                  Open: <span className="font-semibold">{d.openCount}</span>
                  <span className="mx-2">|</span>
                  Closed: <span className="font-semibold">{d.closedCount}</span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                  Open share: <span className="font-semibold">{Math.round(d.openShare * 100)}%</span>
                </div>
                {d.topCategories[0] && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Top category: {d.topCategories[0].category}
                  </div>
                )}
              </div>
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>

      <div className="absolute left-4 bottom-4 z-[500] pointer-events-none">
        <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur rounded-md shadow px-3 py-2">
          <div className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">
            District hotspots
          </div>
          <div className="mt-1 text-[10px] text-gray-600 dark:text-gray-400">Size = event count</div>
          <div className="text-[10px] text-gray-600 dark:text-gray-400">Color = % open</div>
          <div className="mt-2 h-2 w-44 rounded-full bg-gradient-to-r from-emerald-500 to-red-500" />
          <div className="mt-1 flex justify-between text-[10px] text-gray-500 dark:text-gray-400">
            <span>More closed</span>
            <span>More open</span>
          </div>
        </div>
      </div>
    </div>
  )
}

