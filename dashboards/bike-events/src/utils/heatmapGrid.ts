import type { BikeEvent } from '@/types/bikeEvents'

const EARTH_RADIUS_METERS = 6378137

const degToRad = (deg: number) => (deg * Math.PI) / 180
const radToDeg = (rad: number) => (rad * 180) / Math.PI

// Lightweight Web Mercator helpers (meters in EPSG:3857) for stable bucketing.
const toWebMercatorMeters = (lat: number, lon: number) => {
  const x = EARTH_RADIUS_METERS * degToRad(lon)
  const y = EARTH_RADIUS_METERS * Math.log(Math.tan(Math.PI / 4 + degToRad(lat) / 2))
  return { x, y }
}

const fromWebMercatorMeters = (x: number, y: number) => {
  const lon = radToDeg(x / EARTH_RADIUS_METERS)
  const lat = radToDeg(2 * Math.atan(Math.exp(y / EARTH_RADIUS_METERS)) - Math.PI / 2)
  return { lat, lon }
}

export interface HeatmapCell {
  key: string
  count: number
  center: { lat: number; lon: number }
}

export function buildHeatmapGrid(events: BikeEvent[], cellSizeMeters: number): HeatmapCell[] {
  const cells = new Map<string, { xi: number; yi: number; count: number }>()

  for (const event of events) {
    if (!Number.isFinite(event.lat) || !Number.isFinite(event.lon)) continue

    const { x, y } = toWebMercatorMeters(event.lat, event.lon)
    const xi = Math.floor(x / cellSizeMeters)
    const yi = Math.floor(y / cellSizeMeters)
    const key = `${xi}:${yi}`

    const current = cells.get(key)
    if (current) {
      current.count += 1
    } else {
      cells.set(key, { xi, yi, count: 1 })
    }
  }

  return Array.from(cells.entries()).map(([key, cell]) => {
    const centerX = (cell.xi + 0.5) * cellSizeMeters
    const centerY = (cell.yi + 0.5) * cellSizeMeters
    const center = fromWebMercatorMeters(centerX, centerY)
    return { key, count: cell.count, center }
  })
}

export function percentileCount(counts: number[], percentile: number): number {
  if (!counts.length) return 0
  const sorted = [...counts].sort((a, b) => a - b)
  const p = Math.min(1, Math.max(0, percentile))
  const idx = Math.floor(p * (sorted.length - 1))
  return sorted[idx] ?? 0
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

