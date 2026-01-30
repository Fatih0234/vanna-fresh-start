'use client'

import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { BikeEvent } from '@/types/bikeEvents'

interface StatsSummaryProps {
  events: BikeEvent[]
}

const COLORS = {
  primary: '#8b5a2b',
  secondary: '#d97706',
  accent: '#dc2626',
  success: '#059669',
  info: '#2563eb',
}

export default function StatsSummary({ events }: StatsSummaryProps) {
  const stats = useMemo(() => {
    const totalEvents = events.length
    const openEvents = events.filter((e) => e.status === 'open').length
    const closedEvents = events.filter((e) => e.status === 'closed').length

    // Category distribution
    const categoryCount = events.reduce(
      (acc, e) => {
        acc[e.bike_issue_category] = (acc[e.bike_issue_category] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )

    const topCategories = Object.entries(categoryCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([category, count]) => ({
        name: category.length > 30 ? category.substring(0, 30) + '...' : category,
        value: count,
        emoji: events.find((e) => e.bike_issue_category === category)?.bike_issue_emoji || '',
      }))

    // District distribution
    const districtCount = events.reduce(
      (acc, e) => {
        if (e.district) {
          acc[e.district] = (acc[e.district] || 0) + 1
        }
        return acc
      },
      {} as Record<string, number>
    )

    const topDistricts = Object.entries(districtCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([district, count]) => ({ district, count }))

    // Subcategory distribution (using subcategory2 field)
    const subcategoryCount = events.reduce(
      (acc, e) => {
        if (e.subcategory2) {
          acc[e.subcategory2] = (acc[e.subcategory2] || 0) + 1
        }
        return acc
      },
      {} as Record<string, number>
    )

    const topSubcategories = Object.entries(subcategoryCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([subcategory, count]) => {
        // Aggressive truncation: max 10 characters for better chart fit
        let displayName = subcategory
        if (subcategory.length > 10) {
          const words = subcategory.split(' ')
          let shortened = ''
          for (const word of words) {
            if ((shortened + word).length <= 10) {
              shortened += (shortened ? ' ' : '') + word
            } else {
              break
            }
          }
          displayName = shortened ? shortened + '...' : subcategory.substring(0, 10) + '...'
        }
        return {
          name: displayName,
          fullName: subcategory, // Keep full name for tooltip
          value: count,
        }
      })

    return { totalEvents, openEvents, closedEvents, topCategories, topDistricts, topSubcategories }
  }, [events])

  const openPercentage = stats.totalEvents
    ? ((stats.openEvents / stats.totalEvents) * 100).toFixed(1)
    : 0
  const closedPercentage = stats.totalEvents
    ? ((stats.closedEvents / stats.totalEvents) * 100).toFixed(1)
    : 0

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Statistics</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Overview Stats */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">Overview</h3>
          <div className="text-4xl font-bold text-gray-900 dark:text-gray-100">
            {stats.totalEvents}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Events</p>

          <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Open</span>
              <span className="font-semibold text-red-600 dark:text-red-400">
                {stats.openEvents} ({openPercentage}%)
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-red-500 h-2 rounded-full"
                style={{ width: `${openPercentage}%` }}
              />
            </div>

            <div className="flex justify-between text-sm mt-3">
              <span className="text-gray-600 dark:text-gray-400">Closed</span>
              <span className="font-semibold text-green-600 dark:text-green-400">
                {stats.closedEvents} ({closedPercentage}%)
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full"
                style={{ width: `${closedPercentage}%` }}
              />
            </div>
          </div>
        </div>

        {/* Card 2: Top Categories */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-4">
            Top Issue Categories
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.topCategories}>
              <XAxis dataKey="emoji" tick={{ fontSize: 18 }} />
              <YAxis hide />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                }}
                formatter={(value: number | undefined, name: string | undefined, props: any) => [value, props.payload.name]}
              />
              <Bar dataKey="value" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Card 3: Top Districts */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-4">
            Top Districts
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.topDistricts}>
              <XAxis dataKey="district" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" />
              <YAxis hide />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                }}
              />
              <Bar dataKey="count" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Card 4: Top Subcategories */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-4">
            Top Subcategories
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.topSubcategories}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
              <YAxis hide />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                }}
                formatter={(value: number | undefined, name: string | undefined, props: any) => [value, props.payload.fullName || props.payload.name]}
              />
              <Bar dataKey="value" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
