import { useEffect, useState } from 'react'
import { t } from './i18n'

export default function PersonProfile({ pid, lang, onBack, onOpenCase }) {
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    setProfile(null)
    setError(null)
    fetch(`/api/persons/${pid}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error)
        else setProfile(d)
      })
      .catch(() => setError('Failed to load profile'))
  }, [pid])

  return (
    <div className="p-6 overflow-y-auto h-full max-w-3xl mx-auto w-full">
      <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-300 mb-4">
        ← {t('back', lang)}
      </button>

      {error && <div className="text-red-400 text-sm">{error}</div>}
      {!profile && !error && <div className="text-gray-500 text-sm">{t('loading', lang)}…</div>}

      {profile && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-white">{profile.canonical_name}</h1>
            <p className="text-xs text-gray-500 font-mono mt-1">{profile.pid}</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="card-surface rounded-lg p-3">
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">{t('aliases', lang)}</div>
              <div className="text-sm text-gray-200">{profile.aliases.join(', ') || '—'}</div>
            </div>
            <div className="card-surface rounded-lg p-3">
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">{t('knownPhones', lang)}</div>
              <div className="text-sm text-gray-200">{profile.phones.join(', ') || '—'}</div>
            </div>
            <div className="card-surface rounded-lg p-3">
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">{t('knownVehicles', lang)}</div>
              <div className="text-sm text-gray-200">{profile.vehicles.join(', ') || '—'}</div>
            </div>
          </div>

          <div>
            <h2 className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">
              {t('caseHistory', lang)} ({profile.cases.length})
            </h2>
            <div className="space-y-2">
              {profile.cases.map((c) => (
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
              {profile.cases.length === 0 && (
                <div className="text-sm text-gray-600">{t('noCases', lang)}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
