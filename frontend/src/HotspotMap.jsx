import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from './i18n'
import { HEAT, SELECTED, heatColor } from './chartStyle'
import STATES from './indiaStates.json'

// India only: drawn from state outlines (census-based open boundary data,
// districts merged to states, simplified), so no world tiles and no
// neighbouring countries. Boundaries are indicative, not authoritative.
const LON0 = 68.0
const LAT1 = 37.4
const K = Math.cos((22.5 * Math.PI) / 180)
const FULL = { x: 0, y: 0, w: (97.6 - LON0) * K, h: LAT1 - 6.2 }

// NCRB 2014 state names -> boundary-file names. Ladakh had no separate NCRB
// count (it was part of J&K), so it takes J&K's value; the two Union
// Territories that merged are summed.
const NCRB_TO_GEO = {
  'A&N Islands': ['Andaman and Nicobar Islands'],
  'D&N Haveli': ['Dadra and Nagar Haveli and Daman and Diu'],
  'Daman & Diu': ['Dadra and Nagar Haveli and Daman and Diu'],
  'Delhi UT': ['Delhi'],
  'Jammu & Kashmir': ['Jammu and Kashmir', 'Ladakh'],
}

const project = ([lon, lat]) => [(lon - LON0) * K, LAT1 - lat]

const SHAPES = Object.entries(STATES).map(([name, rings]) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const d = rings
    .map((ring) =>
      ring
        .map((pt, i) => {
          const [x, y] = project(pt)
          minX = Math.min(minX, x)
          maxX = Math.max(maxX, x)
          minY = Math.min(minY, y)
          maxY = Math.max(maxY, y)
          return `${i ? 'L' : 'M'}${x.toFixed(3)} ${y.toFixed(3)}`
        })
        .join('') + 'Z'
    )
    .join('')
  return { name, d, bbox: { minX, minY, maxX, maxY } }
})

function useTweenedView(target) {
  const [view, setView] = useState(FULL)
  const current = useRef(FULL)
  useEffect(() => {
    const from = current.current
    const start = performance.now()
    let raf
    function step(now) {
      const p = Math.min(1, (now - start) / 380)
      const e = 1 - (1 - p) ** 3
      const next = {
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        w: from.w + (target.w - from.w) * e,
        h: from.h + (target.h - from.h) * e,
      }
      current.current = next
      setView(next)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target.x, target.y, target.w, target.h])
  return view
}

export default function HotspotMap({ state, lang, results, error, onSelectState }) {
  const [hover, setHover] = useState(null)
  const box = useRef()

  // boundary-file name -> { count, ncrb (state name used for filtering) }
  const values = useMemo(() => {
    const out = {}
    results.forEach((r) => {
      ;(NCRB_TO_GEO[r.state] || [r.state]).forEach((g) => {
        out[g] = { count: (out[g]?.count || 0) + r.count, ncrb: out[g]?.ncrb || r.state }
      })
    })
    return out
  }, [results])
  const max = Math.max(1, ...Object.values(values).map((v) => v.count))
  const ranked = useMemo(() => [...results].sort((a, b) => b.count - a.count).map((r) => r.state), [results])

  const selectedGeo = state ? NCRB_TO_GEO[state] || [state] : []
  const target = useMemo(() => {
    const picked = SHAPES.filter((s) => selectedGeo.includes(s.name))
    if (!picked.length) return FULL
    const minX = Math.min(...picked.map((s) => s.bbox.minX))
    const maxX = Math.max(...picked.map((s) => s.bbox.maxX))
    const minY = Math.min(...picked.map((s) => s.bbox.minY))
    const maxY = Math.max(...picked.map((s) => s.bbox.maxY))
    const pad = Math.max(maxX - minX, maxY - minY) * 0.7 + 1
    return { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])
  const view = useTweenedView(target)
  const stroke = Math.max(view.w, view.h) / 700

  function onMove(e, shape) {
    const rect = box.current.getBoundingClientRect()
    setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, name: shape.name })
  }
  const hovered = hover && values[hover.name]

  return (
    <div
      className="absolute inset-y-0 left-[calc(max(260px,20%)+24px)] right-[calc(max(280px,20%)+24px)] py-6"
      ref={box}
    >
      <svg
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        className="w-full h-full overflow-visible"
        role="img"
        aria-label={t('hotspotMapTitle', lang)}
      >
        {SHAPES.map((s) => {
          const v = values[s.name]
          const isSelected = selectedGeo.includes(s.name)
          return (
            <path
              key={s.name}
              d={s.d}
              fill={isSelected ? SELECTED : v ? heatColor(v.count, max) : '#343a41'}
              fillOpacity={isSelected ? 0.85 : 1}
              stroke={hover?.name === s.name ? '#ffffff' : '#22252a'}
              strokeWidth={hover?.name === s.name ? stroke * 2.2 : stroke * 1.4}
              strokeLinejoin="round"
              className="cursor-pointer"
              onMouseMove={(e) => onMove(e, s)}
              onMouseLeave={() => setHover(null)}
              onClick={() => v && onSelectState?.(v.ncrb === state ? '' : v.ncrb)}
            />
          )
        })}
      </svg>

      {hover && (
        <div
          className="absolute pointer-events-none z-10 bg-[var(--bg-panel)] border border-white/10 rounded-xl px-3 py-2 text-xs"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          <div className="text-white">{hover.name}</div>
          <div className="num text-gray-300 mt-0.5">
            {hovered ? `${hovered.count.toLocaleString()} · #${ranked.indexOf(hovered.ncrb) + 1}` : '—'}
          </div>
        </div>
      )}

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[var(--bg-panel)] border border-white/10 rounded-full px-4 py-2 text-[11px] text-gray-400">
        <span>{t('legendFewer', lang)}</span>
        {HEAT.map((c) => (
          <span key={c} className="w-5 h-2.5 rounded-sm" style={{ background: c }} />
        ))}
        <span>{t('legendMore', lang)}</span>
        <span className="num text-gray-300 ml-1">{max.toLocaleString()}</span>
      </div>

      <p className="absolute bottom-1 left-0 text-[10px] text-gray-500">{t('mapBoundaryNote', lang)}</p>
      {error && (
        <span className="absolute top-2 left-0 text-[11px] text-red-300 bg-[var(--bg-panel)] border border-red-900 rounded-lg px-2 py-1">
          {error}
        </span>
      )}
    </div>
  )
}
