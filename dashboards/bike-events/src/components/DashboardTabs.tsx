'use client'

import type { DashboardId } from '@/types/bikeEvents'

interface DashboardTab {
  id: DashboardId
  label: string
  description: string
}

interface DashboardTabsProps {
  activeId: DashboardId
  onChange: (id: DashboardId) => void
  tabs: DashboardTab[]
}

export default function DashboardTabs({ activeId, onChange, tabs }: DashboardTabsProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-2">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={
                `px-4 py-2 rounded-md text-sm font-semibold transition-colors ` +
                (isActive
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700')
              }
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      <div className="mt-3 px-2 text-xs text-gray-500 dark:text-gray-400">
        {tabs.find((tab) => tab.id === activeId)?.description}
      </div>
    </div>
  )
}
