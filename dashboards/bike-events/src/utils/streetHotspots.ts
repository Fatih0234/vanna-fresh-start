import type { BikeEvent } from '@/types/bikeEvents'

export interface StreetCategoryCount {
  category: string
  count: number
}

export interface StreetHotspot {
  street: string
  center: { lat: number; lon: number }
  totalCount: number
  openCount: number
  closedCount: number
  openShare: number
  topCategories: StreetCategoryCount[]
  // Full list for street details panel (already filtered by global filters).
  events: BikeEvent[]
}

export interface StreetHotspotsResult {
  hotspots: StreetHotspot[] // sorted desc by totalCount
  excludedNoStreetCount: number
}

const normalizeStreet = (street: string | null) => {
  if (!street) return null
  const trimmed = street.trim()
  if (!trimmed) return null
  return trimmed
}

const safeParseDate = (value: string) => {
  const d = new Date(value)
  return Number.isFinite(d.getTime()) ? d : null
}

export function buildStreetHotspots(events: BikeEvent[]): StreetHotspotsResult {
  const byStreet = new Map<string, BikeEvent[]>()
  let excludedNoStreetCount = 0

  for (const event of events) {
    const street = normalizeStreet(event.street)
    if (!street) {
      excludedNoStreetCount += 1
      continue
    }
    const list = byStreet.get(street)
    if (list) list.push(event)
    else byStreet.set(street, [event])
  }

  const hotspots: StreetHotspot[] = []

  for (const [street, streetEvents] of byStreet.entries()) {
    let sumLat = 0
    let sumLon = 0
    let n = 0
    let openCount = 0
    let closedCount = 0

    const categoryCounts = streetEvents.reduce((acc, e) => {
      const key = e.bike_issue_category?.trim() ? e.bike_issue_category.trim() : 'Unknown'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    for (const event of streetEvents) {
      if (Number.isFinite(event.lat) && Number.isFinite(event.lon)) {
        sumLat += event.lat
        sumLon += event.lon
        n += 1
      }
      if (event.status === 'open') openCount += 1
      if (event.status === 'closed') closedCount += 1
    }

    // Some streets might have malformed coords in edge cases; skip those from the map.
    if (n === 0) continue

    const totalCount = streetEvents.length
    const openShare = totalCount ? openCount / totalCount : 0

    const topCategories = Object.entries(categoryCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([category, count]) => ({ category, count }))

    hotspots.push({
      street,
      center: { lat: sumLat / n, lon: sumLon / n },
      totalCount,
      openCount,
      closedCount,
      openShare,
      topCategories,
      events: [...streetEvents].sort((a, b) => {
        const da = safeParseDate(a.requested_at)?.getTime() ?? 0
        const db = safeParseDate(b.requested_at)?.getTime() ?? 0
        return db - da
      }),
    })
  }

  hotspots.sort((a, b) => b.totalCount - a.totalCount)
  return { hotspots, excludedNoStreetCount }
}

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export function markerSizeForCount(count: number) {
  // sqrt keeps large streets from dominating while still showing meaningful differences.
  return clamp(18 + Math.sqrt(Math.max(1, count)) * 5, 18, 56)
}

export function openShareColor(openShare: number) {
  // 0 => green (mostly closed), 1 => red (mostly open)
  const t = clamp(openShare, 0, 1)
  const r = Math.round(34 + (239 - 34) * t)
  const g = Math.round(197 + (68 - 197) * t)
  const b = Math.round(94 + (68 - 94) * t)
  return `rgb(${r}, ${g}, ${b})`
}

