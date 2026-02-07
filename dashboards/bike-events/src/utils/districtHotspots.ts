import type { BikeEvent } from '@/types/bikeEvents'

export interface DistrictCategoryCount {
  category: string
  count: number
}

export interface DistrictHotspot {
  district: string
  center: { lat: number; lon: number }
  totalCount: number
  openCount: number
  closedCount: number
  openShare: number
  topCategories: DistrictCategoryCount[]
  events: BikeEvent[]
}

export interface DistrictHotspotsResult {
  hotspots: DistrictHotspot[] // sorted desc by totalCount
  excludedNoDistrictCount: number
}

const normalizeDistrict = (district: string | null) => {
  if (!district) return null
  const trimmed = district.trim()
  if (!trimmed) return null
  return trimmed
}

const safeParseDate = (value: string) => {
  const d = new Date(value)
  return Number.isFinite(d.getTime()) ? d : null
}

export function buildDistrictHotspots(events: BikeEvent[]): DistrictHotspotsResult {
  const byDistrict = new Map<string, BikeEvent[]>()
  let excludedNoDistrictCount = 0

  for (const event of events) {
    const district = normalizeDistrict(event.district)
    if (!district) {
      excludedNoDistrictCount += 1
      continue
    }
    const list = byDistrict.get(district)
    if (list) list.push(event)
    else byDistrict.set(district, [event])
  }

  const hotspots: DistrictHotspot[] = []

  for (const [district, districtEvents] of byDistrict.entries()) {
    let sumLat = 0
    let sumLon = 0
    let n = 0
    let openCount = 0
    let closedCount = 0

    const categoryCounts = districtEvents.reduce((acc, e) => {
      const key = e.bike_issue_category?.trim() ? e.bike_issue_category.trim() : 'Unknown'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    for (const event of districtEvents) {
      if (Number.isFinite(event.lat) && Number.isFinite(event.lon)) {
        sumLat += event.lat
        sumLon += event.lon
        n += 1
      }
      if (event.status === 'open') openCount += 1
      if (event.status === 'closed') closedCount += 1
    }

    if (n === 0) continue

    const totalCount = districtEvents.length
    const openShare = totalCount ? openCount / totalCount : 0

    const topCategories = Object.entries(categoryCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([category, count]) => ({ category, count }))

    hotspots.push({
      district,
      center: { lat: sumLat / n, lon: sumLon / n },
      totalCount,
      openCount,
      closedCount,
      openShare,
      topCategories,
      events: [...districtEvents].sort((a, b) => {
        const da = safeParseDate(a.requested_at)?.getTime() ?? 0
        const db = safeParseDate(b.requested_at)?.getTime() ?? 0
        return db - da
      }),
    })
  }

  hotspots.sort((a, b) => b.totalCount - a.totalCount)
  return { hotspots, excludedNoDistrictCount }
}

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export function markerSizeForCount(count: number) {
  return clamp(20 + Math.sqrt(Math.max(1, count)) * 6, 20, 64)
}

export function openShareColor(openShare: number) {
  const t = clamp(openShare, 0, 1)
  const r = Math.round(34 + (239 - 34) * t)
  const g = Math.round(197 + (68 - 197) * t)
  const b = Math.round(94 + (68 - 94) * t)
  return `rgb(${r}, ${g}, ${b})`
}

