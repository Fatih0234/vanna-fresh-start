# Bike Events Dashboard Integration

## Overview

This document describes the integration of a React-based Bike Events Dashboard into the Vanna AI chat application. The dashboard visualizes bike infrastructure issues from Cologne, Germany, using data from the Supabase `v_bike_events` view.

## Architecture

### Hybrid Approach

The integration uses a **hybrid architecture** that combines:
- **React 19** for the dashboard components (modern, component-based UI)
- **Lit web components** for the existing Vanna AI chat interface
- **FastAPI** backend serving both the chat API and dashboard data

This approach was chosen to:
- Minimize changes to existing dashboard code
- Avoid rewriting components from React to Lit
- Maintain clear separation between chat and dashboard functionality
- Enable future dashboard additions without architectural changes

### Technical Stack

**Frontend:**
- React 19 with TypeScript
- Leaflet for interactive maps with marker clustering
- Recharts for data visualization
- Tailwind CSS v3 for styling
- Headless UI for accessible components

**Backend:**
- FastAPI (Python) for API routes
- PostgreSQL via Supabase for data storage
- JWT-based session authentication

**Build System:**
- Vite for React component bundling
- ES modules for browser compatibility
- PostCSS with Tailwind for CSS processing

## Directory Structure

```
/Volumes/T7/vanna-ai-events/
├── dashboards/                          # New dashboard directory
│   └── bike-events/
│       ├── src/
│       │   ├── components/
│       │   │   ├── BikeEventsDashboard.tsx    # Main container
│       │   │   ├── BikeEventsMap.tsx          # Leaflet map with clustering
│       │   │   ├── FilterPanel.tsx            # Multi-criteria filters
│       │   │   ├── StatsSummary.tsx           # Charts and statistics
│       │   │   └── EventDetailsModal.tsx      # Event detail popup
│       │   ├── types/
│       │   │   └── bikeEvents.ts              # TypeScript interfaces
│       │   ├── index.tsx                      # Dashboard entry point
│       │   └── index.css                      # Tailwind imports
│       ├── static/
│       │   └── leaflet-custom.css             # Custom Leaflet styles
│       ├── dist/                              # Build output (gitignored)
│       │   ├── bike-events.js                 # Bundled JavaScript (~2MB)
│       │   └── bike-events.css                # Bundled styles (~32KB)
│       ├── package.json                       # Node dependencies
│       ├── vite.config.ts                     # Build configuration
│       ├── tsconfig.json                      # TypeScript config
│       ├── tailwind.config.js                 # Tailwind config
│       └── postcss.config.js                  # PostCSS config
└── vanna_web_server.py                        # Modified for dashboard routes
```

## Key Components

### 1. BikeEventsDashboard.tsx

Main container component that:
- Fetches event data from `/api/dashboards/bike-events/data`
- Manages filter state (date range, status, district, category)
- Applies filters to events
- Renders map, filters, and statistics

**Key Changes from Source:**
- Removed `VannaChatDrawer` component (chat integration)
- Removed `initialData` prop, added internal state + API fetching
- Added loading and error states
- Changed from Next.js dynamic imports to regular imports

### 2. BikeEventsMap.tsx

Interactive Leaflet map with:
- Custom bike emoji markers (🚴)
- Marker clustering for performance (2,045+ events)
- Click handlers to open event details modal
- Responsive to filter changes

**No changes from source** - works as-is.

### 3. FilterPanel.tsx

Multi-criteria filtering UI with:
- **Date Range Filter**: Start/end date inputs
- **Quick Filters**: "Last Week" and "Last Month" buttons
- **Status Filter**: Radio buttons for All/Open/Closed
- **Category Filter**: Checkboxes for issue types (bike racks, lanes, etc.)
- **District Filter**: Checkboxes for Cologne districts
- **Clear All**: Prominent button in header (shows when filters active)

**Recent Changes:**
- Added `handleLastWeek()` and `handleLastMonth()` functions
- Added quick filter buttons in UI
- Moved "Clear all" button to header next to filter count badge
- Made clear button conditional (only shows when filters active)

### 4. StatsSummary.tsx

Data visualization with Recharts:
- Overview statistics (total events, open/closed counts)
- Category distribution bar chart
- District distribution bar chart
- Subcategory breakdown

**Minor Changes:**
- Fixed TypeScript types for Recharts formatters (made params optional)

### 5. EventDetailsModal.tsx

Headless UI modal showing:
- Event title and description
- Location details (address, district, zip code)
- Status and category information
- Timestamps (requested, updated, expected completion)
- Media attachments (if available)

**Minor Changes:**
- Removed `next/image` import (not used in template)

## Backend Integration

### API Routes

Added to `vanna_web_server.py`:

#### 1. Get All Events
```python
@app.get("/api/dashboards/bike-events/data")
async def get_bike_events_data(request: Request):
    """Fetch all bike events from v_bike_events view."""
```

**Authentication:** Requires valid JWT session cookie

**Response:**
```json
{
  "data": [
    {
      "service_request_id": "...",
      "requested_at": "2024-01-15T10:30:00",
      "status": "open",
      "district": "Innenstadt",
      "bike_issue_category": "🚲 Bike Racks",
      "latitude": 50.9375,
      "longitude": 6.9603,
      // ... 28 more fields
    }
  ],
  "count": 2045
}
```

#### 2. Get Single Event (Optional)
```python
@app.get("/api/dashboards/bike-events/event/{service_request_id}")
async def get_bike_event_by_id(service_request_id: str, request: Request):
    """Fetch single event by ID."""
```

Currently unused but available for future detail views.

### Static File Serving

Added static mount for dashboard assets:
```python
dashboard_dist = os.path.join(os.path.dirname(__file__), "dashboards")
if os.path.exists(dashboard_dist):
    app.mount("/dashboards", StaticFiles(directory=dashboard_dist), name="dashboards")
```

**Important:** Uses `/dashboards` path (not `/static/dashboards`) to avoid conflict with existing `/static` mount.

## Frontend Integration

### Navigation UI

Added to `vanna_web_server.py` HTML template:

#### 1. Rail Button
```html
<button class="rail-btn" id="rail-dashboards" title="Dashboards">
    <svg><!-- Dashboard grid icon --></svg>
</button>
```

Located in left sidebar rail between chat and other buttons.

#### 2. Dashboard Sidebar
```html
<div id="dashboard-sidebar" class="sidebar collapsed">
    <div class="sidebar-header">
        <div class="sidebar-title">Dashboards</div>
    </div>
    <div class="dashboard-list">
        <div class="dashboard-card" data-dashboard="bike-events">
            <div class="dashboard-icon">🚴</div>
            <div class="dashboard-info">
                <div class="dashboard-name">Bike Events</div>
                <div class="dashboard-desc">Cologne infrastructure issues</div>
            </div>
        </div>
    </div>
</div>
```

Expandable sidebar showing available dashboards as cards.

#### 3. JavaScript Integration

**State Management:**
```javascript
let currentView = 'chat';        // or 'dashboard'
let currentDashboard = null;     // 'bike-events' or null
let dashboardRoot = null;        // React root instance
```

**Load Dashboard Function:**
```javascript
async function loadDashboard(dashboardId) {
    currentView = 'dashboard';
    currentDashboard = dashboardId;

    // Unmount previous dashboard
    if (dashboardRoot) {
        dashboardRoot.unmount();
        dashboardRoot = null;
    }

    // Clear chat wrapper and create dashboard container
    const wrapper = document.getElementById('chat-wrapper');
    wrapper.innerHTML = '<div id="dashboard-root"></div>';

    // Dynamically import and mount dashboard
    if (dashboardId === 'bike-events') {
        const module = await import('/dashboards/bike-events/dist/bike-events.js');
        dashboardRoot = module.renderBikeEventsDashboard(
            document.getElementById('dashboard-root')
        );
    }
}
```

**Navigation:**
- Click dashboard rail button → toggle dashboard sidebar
- Click dashboard card → load dashboard
- Click chat rail button → return to chat view
- Supports browser back/forward (via URL hash)

## Build Process

### Initial Setup
```bash
cd /Volumes/T7/vanna-ai-events/dashboards/bike-events
npm install
```

### Development Build
```bash
npm run dev
```
Starts Vite dev server with hot module replacement.

### Production Build
```bash
npm run build
```

**Build Steps:**
1. TypeScript compilation (`tsc`)
2. Vite bundling (ES modules)
3. Tailwind CSS processing
4. Minification with esbuild

**Output:**
- `dist/bike-events.js` (~2MB gzipped to ~473KB)
- `dist/bike-events.css` (~32KB gzipped to ~10KB)

### Build Configuration

**vite.config.ts:**
```typescript
export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': {}  // Fix for browser compatibility
  },
  build: {
    outDir: 'dist',
    lib: {
      entry: path.resolve(__dirname, 'src/index.tsx'),
      name: 'BikeEventsDashboard',
      formats: ['es'],
      fileName: () => 'bike-events.js'
    },
    cssCodeSplit: false,
    minify: 'esbuild'
  }
})
```

**Key Points:**
- Library mode (not SPA)
- ES modules for browser import
- Single CSS file (no code splitting)
- `process.env` polyfill for browser

## Data Model

### BikeEvent Interface

```typescript
export interface BikeEvent {
  service_request_id: string
  requested_at: string
  updated_at: string | null
  expected_at: string | null
  status: 'open' | 'closed'
  status_notes: string | null
  service_name: string
  service_code: string
  description: string | null
  agency_responsible: string | null
  service_notice: string | null
  address: string | null
  zipcode: string | null
  latitude: number
  longitude: number
  media_url: string | null
  district: string | null
  bike_issue_category: string
  bike_issue_subcategory: string | null
  bike_issue_emoji: string
  // ... additional fields
}
```

### FilterState Interface

```typescript
export interface FilterState {
  dateRange: { start: Date | null; end: Date | null } | null
  status: 'all' | 'open' | 'closed'
  districts: string[]
  categories: string[]
  zipCodes: string[]
}
```

## CSS Strategy

### Tailwind CSS v3

**Why v3 instead of v4:**
- Tailwind v4's PostCSS plugin (`@tailwindcss/postcss`) has compatibility issues with Vite library mode
- v3 generates complete utility set by default
- v4 only generated minimal utilities in library builds

**Configuration:**
```javascript
// tailwind.config.js
export default {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          // ... full color scale
        }
      }
    }
  }
}
```

### CSS Loading

**Problem:** Vite library mode doesn't auto-inject CSS

**Solution:** Manual CSS loading in entry point (`src/index.tsx`):
```typescript
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
```

### CSS Isolation

Dashboard wrapped in isolated container:
```tsx
<div className="dashboard-wrapper" style={{ isolation: 'isolate' }}>
  <BikeEventsDashboard />
</div>
```

Prevents style conflicts with existing Vanna AI CSS.

## Authentication

Dashboard routes use the same JWT session authentication as chat:

```python
token = request.cookies.get("session")
if not token or not verify_jwt(token):
    raise HTTPException(status_code=401, detail="Unauthorized")
```

**User Flow:**
1. User logs in to Vanna AI
2. JWT token stored in session cookie
3. Dashboard API requests include cookie automatically
4. Backend verifies JWT before returning data
5. If unauthorized (401), dashboard redirects to login

## Features

### 1. Interactive Map
- 2,045+ bike infrastructure issue markers
- Marker clustering for performance
- Custom bike emoji markers (🚴)
- Click to view event details
- Responsive to filter changes

### 2. Multi-Criteria Filtering
- **Date Range:** Filter by request date
- **Quick Filters:** Last Week, Last Month buttons
- **Status:** All, Open, or Closed events
- **District:** Multiple Cologne districts
- **Category:** Issue types (bike racks, lanes, parking, etc.)
- **Real-time:** Filters update map and charts immediately

### 3. Statistics & Charts
- Total event count
- Open vs. closed breakdown
- Category distribution (bar chart)
- District distribution (bar chart)
- Subcategory analysis

### 4. Event Details
- Full event information in modal
- Location details (address, district, zip)
- Status tracking
- Expected completion dates
- Media attachments (if available)

### 5. User Experience
- Prominent "Clear all" button in filter header
- Active filter count badge
- Loading states during data fetch
- Error handling with user-friendly messages
- Responsive design (mobile-friendly)
- Dark mode support (via Tailwind classes)

## Troubleshooting

### Issue: Dashboard JS file returns 404

**Symptom:** `GET /static/dashboards/bike-events/dist/bike-events.js 404`

**Cause:** Path conflict with existing `/static` mount

**Solution:** Changed static mount from `/static/dashboards` to `/dashboards`

### Issue: "process is not defined" error

**Symptom:** `ReferenceError: process is not defined` in browser console

**Cause:** Node.js-specific code in bundled JavaScript

**Solution:** Added `define: { 'process.env': {} }` to vite.config.ts

### Issue: Missing or broken styling

**Symptom:** Dashboard renders but everything stacks vertically, no styling

**Cause:** Tailwind v4 only generates minimal utilities in library mode

**Solution:**
1. Downgraded to Tailwind v3: `npm install -D tailwindcss@3.4.16`
2. Updated postcss.config.js to use `tailwindcss: {}`
3. Added explicit CSS loading in index.tsx

### Issue: CSS file not loading

**Symptom:** Built CSS exists but styles not applied

**Cause:** Vite library mode doesn't auto-inject CSS

**Solution:** Manually load CSS via link elements in entry point

### Issue: TypeScript compilation errors

**Symptom:** Build fails with module not found or type errors

**Common Fixes:**
- Remove `next/image` imports if present
- Change import paths from `@/types/...` to `../types/...`
- Make Recharts formatter parameters optional

## Future Enhancements

### Potential Additions:
1. **More Dashboards:** Crime stats, weather data, public transport
2. **Export Features:** Download filtered data as CSV/JSON
3. **Share Links:** Generate shareable URLs with filter state
4. **Real-time Updates:** WebSocket connection for live event updates
5. **User Preferences:** Save favorite filters, dashboard layouts
6. **Mobile App:** React Native version using same components
7. **Offline Support:** Service worker for offline map viewing

### Technical Improvements:
1. **Code Splitting:** Lazy load dashboard components
2. **Caching:** Add Redis cache for dashboard API responses
3. **Pagination:** Server-side pagination for large datasets
4. **Search:** Full-text search across event descriptions
5. **Analytics:** Track dashboard usage, popular filters
6. **Testing:** Unit tests for components, E2E tests for flows

## Git History

**Branch:** `feature/dashboard-integration` (merged to `main`)

**Commit:** `b8e509d` - Add Bike Events Dashboard integration

**Files Changed:**
- 17 files added (dashboard components, config, server integration)
- 6,589 lines added

**Key Changes:**
- Created `dashboards/bike-events/` directory structure
- Modified `vanna_web_server.py` for API routes and navigation UI
- Added `.gitignore` entries for `node_modules/` and `dist/`

## Maintenance

### Updating the Dashboard

1. Make changes to React components in `dashboards/bike-events/src/`
2. Rebuild: `cd dashboards/bike-events && npm run build`
3. Restart FastAPI server to serve new files

### Adding a New Dashboard

1. Create new directory: `dashboards/new-dashboard/`
2. Copy build config from `bike-events/` (vite.config.ts, etc.)
3. Create React components
4. Add API route in `vanna_web_server.py`
5. Add dashboard card to sidebar HTML
6. Update `loadDashboard()` function with new case

### Dependencies

**Update React/Recharts:**
```bash
cd dashboards/bike-events
npm update react react-dom recharts
npm run build
```

**Update Leaflet:**
```bash
npm update leaflet react-leaflet react-leaflet-cluster
npm run build
```

**Update Tailwind:**
```bash
npm update tailwindcss postcss autoprefixer
npm run build
```

## Performance

### Metrics (Production Build):
- **JavaScript:** 2,018 KB (473 KB gzipped)
- **CSS:** 32 KB (10 KB gzipped)
- **Initial Load:** < 3 seconds on 4G
- **Map Render:** < 1 second for 2,045 markers (with clustering)
- **Filter Apply:** < 100ms for all filter combinations

### Optimization Techniques:
- Marker clustering (react-leaflet-cluster)
- Memoized filter calculations (useMemo)
- Single CSS bundle (no code splitting)
- ES module tree-shaking
- Esbuild minification
- Gzip compression

## Contact & Support

For questions or issues with the dashboard integration:
1. Check this documentation first
2. Review git commit history: `git log --follow vanna_web_server.py`
3. Check build output: `cd dashboards/bike-events && npm run build`
4. Verify API response: `curl -H "Cookie: session=..." http://localhost:8000/api/dashboards/bike-events/data`

## References

- [Vite Library Mode](https://vitejs.dev/guide/build.html#library-mode)
- [React 19 Documentation](https://react.dev)
- [Leaflet Documentation](https://leafletjs.com)
- [Recharts Documentation](https://recharts.org)
- [Tailwind CSS v3](https://v3.tailwindcss.com)
- [FastAPI Static Files](https://fastapi.tiangolo.com/tutorial/static-files/)
