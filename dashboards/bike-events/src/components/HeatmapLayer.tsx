'use client'

import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.heat'

interface HeatmapLayerProps {
  points: Array<[number, number, number]>
  radius: number
  blur: number
  max: number
  gradient?: Record<number, string>
}

export default function HeatmapLayer({ points, radius, blur, max, gradient }: HeatmapLayerProps) {
  const map = useMap()

  useEffect(() => {
    if (!points.length) return

    const heatLayer = (L as any).heatLayer(points, {
      radius,
      blur,
      max,
      gradient,
    })

    heatLayer.addTo(map)

    return () => {
      map.removeLayer(heatLayer)
    }
  }, [map, points, radius, blur, max, gradient])

  return null
}
