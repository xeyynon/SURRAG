import { useEffect, useState } from 'react'
import { t } from './i18n'
import HotspotMap from './HotspotMap'

export default function HotspotPanel({ lang }) {
  const [meta, setMeta] = useState({ states: [], crime_types: [] })
  const [state, setState] = useState('')
  const [crimeType, setCrimeType] = useState('Murder')
  const [results, setResults] = useState([])
  const [source, setSource] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/hotspots?crime_type=Murder&top_n=10')
      .then((r) => r.json())
      .then((d) => {
        setMeta({ states: d.states, crime_types: d.crime_types })
        setResults(d.results)
        setSource(d.source)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ crime_type: crimeType, top_n: '10' })
    if (state) params.set('state', state)
    fetch(`/api/hotspots?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setResults(d.results)
        setSource(d.source)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [state, crimeType])

  const maxCount = Math.max(1, ...results.map((r) => r.count))

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="text-xs uppercase tracking-wide text-gray-500 font-medium">
            {t('hotspotState', lang)}
          </label>
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="mt-2 bg-[#0f2038] border border-white/10 rounded-lg p-2 text-sm text-gray-200 focus:outline-none min-w-[180px]"
          >
            <option value="">{t('hotspotAllStates', lang)}</option>
            {meta.states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-gray-500 font-medium">
            {t('hotspotCrimeType', lang)}
          </label>
          <select
            value={crimeType}
            onChange={(e) => setCrimeType(e.target.value)}
            className="mt-2 bg-[#0f2038] border border-white/10 rounded-lg p-2 text-sm text-gray-200 focus:outline-none min-w-[220px]"
          >
            {meta.crime_types.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <h3 className="text-sm uppercase tracking-wide text-gray-400 font-medium mb-4">
          {t('hotspotMapTitle', lang)} — {crimeType}
        </h3>
        <HotspotMap crimeType={crimeType} state={state} />
        <p className="text-[11px] text-gray-600 mt-2">{t('mapApproxNote', lang)}</p>
      </div>

      <div>
        <h3 className="text-sm uppercase tracking-wide text-gray-400 font-medium mb-4">
          {t('hotspotTitle', lang)} — {crimeType}
        </h3>
        <div className={`space-y-2.5 ${loading ? 'opacity-50' : ''}`}>
          {results.map((r) => (
            <div key={`${r.state}-${r.district}`} className="flex items-center gap-3">
              <div className="w-40 shrink-0 text-sm text-gray-300 truncate">
                {r.district}
                <span className="text-gray-600 text-xs block">{r.state}</span>
              </div>
              <div className="flex-1 bg-white/5 rounded h-6 relative overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-500/70 to-red-500/70 rounded"
                  style={{ width: `${(r.count / maxCount) * 100}%` }}
                />
              </div>
              <div className="w-14 text-right text-sm text-gray-200 font-medium">{r.count}</div>
            </div>
          ))}
          {results.length === 0 && !loading && (
            <div className="text-sm text-gray-600">No data for this selection.</div>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-600 border-t border-white/10 pt-4">{t('hotspotSource', lang)}</p>
    </div>
  )
}
