import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { STATE_CENTROIDS } from './stateCentroids'

const INDIA_CENTER = [22.5, 80]
const INDIA_ZOOM = 4.3
const STATE_ZOOM = 6.5

// Imperative map control (flyTo) has to live inside <MapContainer>, where
// react-leaflet's useMap() hook is valid — MapContainer itself doesn't
// re-center on prop changes after first render.
function FlyToState({ state }) {
  const map = useMap()
  useEffect(() => {
    const coords = state ? STATE_CENTROIDS[state] : null
    if (coords) {
      map.flyTo(coords, STATE_ZOOM, { duration: 0.8 })
    } else {
      map.flyTo(INDIA_CENTER, INDIA_ZOOM, { duration: 0.8 })
    }
  }, [state, map])
  return null
}

export default function HotspotMap({ crimeType, state }) {
  const [results, setResults] = useState([])

  useEffect(() => {
    fetch(`/api/hotspots/by_state?crime_type=${encodeURIComponent(crimeType)}`)
      .then((r) => r.json())
      .then((d) => setResults(d.results))
      .catch(() => {})
  }, [crimeType])

  const maxCount = Math.max(1, ...results.map((r) => r.count))

  return (
    <div className="rounded-lg overflow-hidden border border-white/10" style={{ height: 420 }}>
      <MapContainer center={INDIA_CENTER} zoom={INDIA_ZOOM} style={{ height: '100%', width: '100%', background: '#0a0c10' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />
        <FlyToState state={state} />
        {results.map((r) => {
          const coords = STATE_CENTROIDS[r.state]
          if (!coords) return null
          const isSelected = state && r.state === state
          const radius = 4 + (r.count / maxCount) * 26
          return (
            <CircleMarker
              key={r.state}
              center={coords}
              radius={radius}
              pathOptions={{
                color: isSelected ? '#fbbf24' : '#f97316',
                fillColor: isSelected ? '#fbbf24' : '#f97316',
                fillOpacity: isSelected ? 0.8 : 0.5,
                weight: isSelected ? 2 : 1,
              }}
            >
              <Tooltip>
                {r.state}: {r.count}
              </Tooltip>
            </CircleMarker>
          )
        })}
      </MapContainer>
    </div>
  )
}
