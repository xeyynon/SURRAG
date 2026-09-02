import { useState } from 'react'
import { t } from './i18n'

const TYPE_COLORS = { person: '#f97316', location: '#38bdf8', phone: '#a78bfa', vehicle: '#4ade80' }

export default function SearchPanel({ lang, onOpenPerson, onOpenCase }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function runSearch(e) {
    e.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`)
      if (!res.ok) throw new Error(`Server error: ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResults(data)
    } catch (err) {
      setError(err.message || 'Search failed')
      setResults(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 overflow-y-auto h-full max-w-3xl mx-auto w-full">
      <form onSubmit={runSearch} className="flex gap-2 mb-6">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder', lang)}
          className="flex-1 bg-[#0f2038] border border-white/10 rounded-lg p-3 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-[#0066B3]"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-[#0066B3] hover:bg-[#0078d1] disabled:bg-gray-700 text-black font-semibold px-5 rounded-lg transition-colors flex items-center justify-center min-w-[90px]"
        >
          {loading ? <span className="spinner" /> : t('searchButton', lang)}
        </button>
      </form>

      {error && (
        <div className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      {results && (
        <div className="space-y-6">
          {results.persons.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">
                {t('people', lang)}
              </h3>
              <div className="space-y-2">
                {results.persons.map((p) => (
                  <button
                    key={p.pid}
                    onClick={() => onOpenPerson(p.pid)}
                    className="card-surface w-full text-left rounded-lg p-3 flex items-center justify-between"
                  >
                    <span className="text-gray-100 text-sm">
                      <span style={{ color: TYPE_COLORS.person }}>●</span> {p.canonical_name}
                    </span>
                    <span className="text-xs text-gray-500 font-mono">{p.pid}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {results.entities.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">
                {t('locationsPhonesVehicles', lang)}
              </h3>
              <div className="flex flex-wrap gap-2">
                {results.entities.map((e) => (
                  <span
                    key={e.id}
                    className="card-surface text-sm rounded-full px-3 py-1"
                  >
                    <span style={{ color: TYPE_COLORS[e.type] }}>●</span> {e.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {results.cases.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">
                {t('cases', lang)}
              </h3>
              <div className="space-y-2">
                {results.cases.map((c) => (
                  <button
                    key={c.cid}
                    onClick={() => onOpenCase(c.cid)}
                    className="card-surface w-full text-left rounded-lg p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-100">{c.fir_number}</span>
                      <span className="text-xs text-gray-500">{c.crime_type}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{c.narrative}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {results.persons.length === 0 && results.entities.length === 0 && results.cases.length === 0 && (
            <div className="text-sm text-gray-600">{t('noResults', lang)}</div>
          )}
        </div>
      )}
    </div>
  )
}
