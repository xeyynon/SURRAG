import { useEffect, useState } from 'react'
import { t } from './i18n'

export default function TimelinePanel({ lang, onOpenCase }) {
  const [events, setEvents] = useState([])

  useEffect(() => {
    fetch('/api/timeline')
      .then((r) => r.json())
      .then((d) => setEvents(d.events))
      .catch(() => {})
  }, [])

  return (
    <div className="p-6 overflow-y-auto h-full max-w-3xl mx-auto w-full">
      <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-1">
        {t('timelineTitle', lang)}
      </h3>
      <p className="text-xs text-gray-600 mb-6">{t('timelineNote', lang)}</p>

      <div className="relative border-l border-white/10 ml-2 space-y-6">
        {events.map((e) => (
          <div key={e.cid} className="pl-6 relative">
            <span
              className={`absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full ${
                e.is_seed ? 'bg-gray-600' : 'bg-[#00AEEF]'
              }`}
            />
            <button
              onClick={() => onOpenCase(e.cid)}
              className="card-surface text-left w-full rounded-lg p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-100">{e.fir_number}</span>
                {e.occurred_on ? (
                  <span className="text-xs text-emerald-400">
                    {new Date(e.occurred_on).toLocaleDateString()} <span className="text-emerald-600">(occurred)</span>
                  </span>
                ) : (
                  <span className="text-xs text-gray-500">
                    {new Date(e.created_at).toLocaleString()} <span className="text-gray-600">(ingested)</span>
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-500">{e.crime_type}</span>
            </button>
          </div>
        ))}
        {events.length === 0 && <div className="text-sm text-gray-600 pl-6">{t('noResults', lang)}</div>}
      </div>
    </div>
  )
}
