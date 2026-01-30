export interface BikeEvent {
  service_request_id: string
  requested_at: string // ISO timestamp
  status: 'open' | 'closed'
  category: string
  subcategory: string
  subcategory2: string | null
  service_name: string
  district: string | null
  zip_code: string | null
  city: string | null
  street: string | null
  house_number: string | null
  address_string: string
  title: string
  description: string | null
  media_path: string | null
  lat: number
  lon: number
  bike_confidence: number | null
  bike_issue_category: string
  bike_issue_confidence: number | null
  year: number
  sequence_number: number
  // Derived columns from view
  day: string
  week: string
  month: string
  cat_path: string
  backlog_bucket: '0–7d' | '7–14d' | '14–30d' | '30d+' | 'closed'
  bike_issue_category_emoji: string
  bike_issue_emoji: string
}

export interface FilterState {
  dateRange: {
    start: Date | null
    end: Date | null
  } | null
  status: 'all' | 'open' | 'closed'
  districts: string[]
  categories: string[]
  zipCodes: string[]
}

export interface CategoryStats {
  category: string
  count: number
  percentage: number
  emoji: string
}

export interface DistrictStats {
  district: string
  count: number
  openCount: number
  closedCount: number
}
