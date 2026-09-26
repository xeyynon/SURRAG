import { useState } from 'react'
import { t } from './i18n'
import { apiFetch } from './api'
import { NODE_COLORS as TYPE_COLORS } from './graphStyle'
import { ErrorNote, Empty } from './ui'

export default function SearchPanel({ lang, onOpenPerson, onOpenCase }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('keyword')
  const [scope, setScope] = useState('all')

  const inScope = (e) => scope === 'all' || e.type === scope

  async function runSearch(e) {
    e.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      const endpoint = mode === 'semantic' ? '/api/search/semantic' : '/api/search'
      const data = await apiFetch(`${endpoint}?q=${encodeURIComponent(trimmed)}`)
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
      <div className="flex gap-1 mb-3 text-xs">
        {[['keyword', 'keywordSearch'], ['semantic', 'semanticSearch']].map(([id, key]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setMode(id)
              setResults(null)
            }}
            className={`px-3 py-1 rounded border ${
              mode === id ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-white' : 'border-white/10 text-gray-500'
            }`}
          >
            {t(key, lang)}
          </button>
        ))}
      </div>
      <form onSubmit={runSearch} className="flex gap-2 mb-6">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder', lang)}
          className="flex-1 bg-[var(--bg-panel)] border border-white/10 rounded-lg p-3 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:bg-gray-700 text-black font-semibold px-5 rounded-lg transition-colors flex items-center justify-center min-w-[90px]"
        >
          {loading ? <span className="spinner" /> : t('searchButton', lang)}
        </button>
      </form>

      {error && (
        <div className="mb-4">
          <ErrorNote message={error} lang={lang} />
        </div>
      )}

      {results && mode === 'semantic' && (
        <div className="space-y-2">
          {results.results.map((c) => (
            <button
              key={c.cid}
              onClick={() => onOpenCase(c.cid)}
              className="card-surface w-full text-left rounded-lg p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-100">{c.fir_number}</span>
                <span className="text-xs text-gray-500">
                  {c.crime_type} · {c.status} · {c.priority}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{c.narrative_excerpt}</p>
              <p className="mt-2 text-xs text-gray-400">
                <span className="text-gray-500">{t('whyMatched', lang)}: </span>
                {c.reasons.join(' · ')}
              </p>
            </button>
          ))}
          {results.results.length === 0 && <Empty>{t('noResults', lang)}</Empty>}
        </div>
      )}

      {results && mode === 'keyword' && (
        <div className="flex flex-wrap gap-1 mb-4 text-xs" role="group" aria-label={t('searchBy', lang)}>
          <span className="text-gray-500 self-center mr-1">{t('searchBy', lang)}</span>
          {['all', 'person', 'phone', 'vehicle', 'fir'].map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setScope(id)}
              aria-pressed={scope === id}
              className={`px-3 py-1 rounded-lg border ${
                scope === id ? 'border-[var(--accent)] text-white' : 'border-white/10 text-gray-400 hover:text-gray-200'
              }`}
            >
              {t(`scope_${id}`, lang)}
            </button>
          ))}
        </div>
      )}

      {results && mode === 'keyword' && (
        <div className="space-y-6">
          {scope !== 'phone' && scope !== 'vehicle' && scope !== 'fir' && results.persons.length > 0 && (
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
                    <span className="num text-xs text-gray-500">{p.pid}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {scope !== 'person' && scope !== 'fir' && results.entities.some(inScope) && (
            <div>
              <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">
                {t('locationsPhonesVehicles', lang)}
              </h3>
              <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-200">
                {results.entities.filter(inScope).map((e) => (
                  <li key={e.id}>
                    <span style={{ color: TYPE_COLORS[e.type] }}>●</span> {e.label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(scope === 'all' || scope === 'fir') && results.cases.length > 0 && (
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
            <Empty>{t('noResults', lang)}</Empty>
          )}
        </div>
      )}
    </div>
  )
}
