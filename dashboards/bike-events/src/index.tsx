import React from 'react'
import { createRoot } from 'react-dom/client'
import BikeEventsDashboard from './components/BikeEventsDashboard'
import './index.css'

// Load dashboard CSS (Tailwind styles)
const dashboardCSS = document.createElement('link')
dashboardCSS.rel = 'stylesheet'
dashboardCSS.href = '/dashboards/bike-events/dist/bike-events.css'
document.head.appendChild(dashboardCSS)

// Load Leaflet CSS from CDN
const leafletCSS = document.createElement('link')
leafletCSS.rel = 'stylesheet'
leafletCSS.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
leafletCSS.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='
leafletCSS.crossOrigin = ''
document.head.appendChild(leafletCSS)

// Load custom Leaflet CSS
const customCSS = document.createElement('link')
customCSS.rel = 'stylesheet'
customCSS.href = '/dashboards/bike-events/static/leaflet-custom.css'
document.head.appendChild(customCSS)

export function renderBikeEventsDashboard(container: HTMLElement) {
  const root = createRoot(container)

  root.render(
    <React.StrictMode>
      <div className="dashboard-wrapper" style={{ isolation: 'isolate' }}>
        <BikeEventsDashboard />
      </div>
    </React.StrictMode>
  )

  return root
}

// Auto-mount if container exists
if (typeof window !== 'undefined') {
  const container = document.getElementById('bike-events-root')
  if (container) {
    renderBikeEventsDashboard(container)
  }
}
