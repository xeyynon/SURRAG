import { useState } from 'react'
import { t, tv } from './i18n'
import { useApi } from './api'
import { Async, Empty, StatusBadge, STATUS_TONE, PRIORITY_TONE } from './ui'

const COLUMNS = 'grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_150px_90px_90px_80px] items-center gap-4'

function matches(c, q) {
  if (!q) return true
  const hay = `${c.fir_number} ${c.crime_type} ${c.status} ${c.priority}`.toLowerCase()
  return hay.includes(q.toLowerCase())
}

export default function CasesPanel({ lang, refreshKey, onOpenWorkspace }) {
  const [expanded, setExpanded] = useState(null)
  const [filter, setFilter] = useState('')
  const state = useApi('/api/cases', refreshKey)

  return (
    <div className="p-6 overflow-y-auto h-full max-w-6xl mx-auto w-full">
      <Async state={state} lang={lang}>
        {({ cases }) => {
          const shown = cases.filter((c) => matches(c, filter))
          return (
            <>
              <div className="flex items-end justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-lg font-medium text-white">{t('caseRegistry', lang)}</h2>
                  <p className="text-xs text-gray-500 mt-0.5 num">
                    {shown.length === cases.length ? cases.length : `${shown.length} / ${cases.length}`} {t('casesCount', lang)}
                  </p>
                </div>
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={t('filterCases', lang)}
                  aria-label={t('filterCases', lang)}
                  className="w-80 bg-[var(--bg-panel)] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />
              </div>

              <div className={`${COLUMNS} px-4 pb-2 text-[10px] uppercase tracking-wider text-gray-500`}>
                <span>{t('colFir', lang)}</span>
                <span>{t('crimeType', lang)}</span>
                <span>{t('colStatus', lang)}</span>
                <span>{t('colPriority', lang)}</span>
                <span>{t('colDate', lang)}</span>
                <span />
              </div>

              <div className="space-y-1.5">
                {shown.map((c) => (
                  <div key={c.cid} className="card-surface rounded-lg">
                    <button
                      onClick={() => setExpanded(expanded === c.cid ? null : c.cid)}
                      className={`${COLUMNS} w-full text-left px-4 py-3`}
                      aria-expanded={expanded === c.cid}
                    >
                      <span className="num text-sm text-white truncate">{c.fir_number}</span>
                      <span className="text-sm text-gray-300 truncate">{c.crime_type}</span>
                      <StatusBadge tone={STATUS_TONE[c.status] || 'neutral'}>{tv('status', c.status, lang)}</StatusBadge>
                      <StatusBadge tone={PRIORITY_TONE[c.priority] || 'neutral'}>{tv('priority', c.priority, lang)}</StatusBadge>
                      <span className="num text-xs text-gray-400">
                        {new Date(c.occurred_on || c.created_at).toLocaleDateString()}
                      </span>
                      <span className="text-xs text-gray-500 text-right">
                        {c.is_seed ? t('seedTag', lang) : t('submittedTag', lang)}
                      </span>
                    </button>
                    {expanded === c.cid && (
                      <div className="px-4 pb-3 pt-3 border-t border-white/10 text-sm text-gray-300 leading-relaxed">
                        {c.narrative}
                        <div className="mt-3">
                          <button
                            onClick={() => onOpenWorkspace(c.cid)}
                            className="text-xs text-[var(--accent-ink)] hover:text-[var(--accent-ink-hover)]"
                          >
                            {t('openWorkspace', lang)} →
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {shown.length === 0 && <Empty>{t('noResults', lang)}</Empty>}
              </div>
            </>
          )
        }}
      </Async>
    </div>
  )
}
