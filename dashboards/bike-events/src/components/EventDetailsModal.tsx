'use client'

import { Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import type { BikeEvent } from '../types/bikeEvents'
import { format } from 'date-fns'
import { CategoryIcon } from '@/utils/categoryIcons'

interface EventDetailsModalProps {
  event: BikeEvent
  onClose: () => void
}

export default function EventDetailsModal({ event, onClose }: EventDetailsModalProps) {
  const imageUrl = event.media_path
    ? `https://sags-uns.stadt-koeln.de/system/files/${event.media_path}`
    : null
  const eventUrl = `https://sags-uns.stadt-koeln.de/requests/${event.sequence_number}-${event.year}`

  return (
    <Transition show={true} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-[9999]">
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
        </Transition.Child>

        {/* Modal Panel */}
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <Dialog.Panel className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <Dialog.Title className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                    {event.title}
                  </Dialog.Title>
                  <div className="flex items-center space-x-2">
                    <CategoryIcon category={event.bike_issue_category} className="w-8 h-8 text-gray-900 dark:text-gray-100" />
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        event.status === 'open'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      }`}
                    >
                      {event.status.toUpperCase()}
                    </span>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>

              {/* Image Preview */}
              {imageUrl && (
                <div className="mb-6">
                  <img
                    src={imageUrl}
                    alt={event.title}
                    className="w-full h-64 object-cover rounded-lg shadow-md"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                </div>
              )}

              {/* Event Details Grid */}
              <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                    Service ID
                  </p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {event.service_request_id}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                    Reported
                  </p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {format(new Date(event.requested_at), 'PPP')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                    Status
                  </p>
                  <p className="text-sm text-gray-900 dark:text-gray-100 capitalize">
                    {event.status}
                  </p>
                </div>
              </div>

              {/* Description */}
              {event.description && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Description
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                    {event.description}
                  </p>
                </div>
              )}

              {/* Location */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Location
                </h3>
                <p className="text-sm text-gray-900 dark:text-gray-100 mb-2">
                  {event.address_string}
                </p>
                <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 dark:text-gray-400">
                  {event.district && <div>District: {event.district}</div>}
                  {event.zip_code && <div>ZIP: {event.zip_code}</div>}
                  {event.street && <div>Street: {event.street}</div>}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">{event.cat_path}</p>
              </div>

              {/* Actions */}
              <div className="flex space-x-3">
                <a
                  href={eventUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md text-center transition-colors"
                >
                  View on Cologne Website →
                </a>
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
                >
                  Close
                </button>
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  )
}
