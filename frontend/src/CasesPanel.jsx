import { useEffect, useState } from 'react'
import { t } from './i18n'

export default function CasesPanel({ lang, refreshKey, onOpenWorkspace }) {
  const [cases, setCases] = useState([])
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    fetch('/api/cases')
      .then((r) => r.json())
      .then((d) => setCases(d.cases))
      .catch(() => {})
  }, [refreshKey])

  return (
    <div className="p-6 overflow-y-auto h-full space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm uppercase tracking-wide text-gray-400 font-medium">
          {t('caseRegistry', lang)}
        </h3>
        <span className="text-xs text-gray-600">{cases.length} {t('casesCount', lang)}</span>
      </div>

      <div className="space-y-2">
        {cases.map((c) => (
          <div
            key={c.cid}
            className="card-surface rounded-lg p-3 cursor-pointer"
            onClick={() => setExpanded(expanded === c.cid ? null : c.cid)}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-100 font-medium">{c.fir_number}</span>
                <span className="ml-2 text-xs text-gray-500">{c.crime_type}</span>
                {c.is_seed ? (
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-600 bg-white/5 rounded px-1.5 py-0.5">
                    {t('seedTag', lang)}
                  </span>
                ) : (
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-orange-400/80 bg-orange-950/40 rounded px-1.5 py-0.5">
                    {t('submittedTag', lang)}
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-600 font-mono">{c.cid}</span>
            </div>
            {expanded === c.cid && (
              <div className="mt-2 pt-2 border-t border-white/10 text-sm text-gray-400 leading-relaxed">
                {c.narrative}
                <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
                  <span>
                    {c.occurred_on
                      ? `${new Date(c.occurred_on).toLocaleDateString()} (occurred)`
                      : new Date(c.created_at).toLocaleString()}{' '}
                    · {c.source}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenWorkspace(c.cid)
                    }}
                    className="text-orange-400 hover:text-orange-300"
                  >
                    {t('openWorkspace', lang)} →
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {cases.length === 0 && <div className="text-sm text-gray-600">No cases yet.</div>}
      </div>
    </div>
  )
}
