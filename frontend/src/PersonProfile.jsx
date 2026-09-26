import { t, tv } from './i18n'
import { useApi } from './api'
import { Async, Empty, StatusBadge, RISK_TONE } from './ui'

export default function PersonProfile({ pid, lang, onBack, onOpenCase }) {
  const state = useApi(`/api/persons/${pid}`)

  return (
    <div className="p-6 overflow-y-auto h-full max-w-3xl mx-auto w-full">
      <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-200 mb-4">
        ← {t('back', lang)}
      </button>

      <Async state={state} lang={lang}>
        {(profile) => (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-white">{profile.canonical_name}</h1>
              <p className="num text-xs text-gray-500 mt-1">{profile.pid}</p>
              {profile.cases.length >= 2 && (
                <div className="mt-2">
                  <StatusBadge tone="warn">
                    {t('repeatInvolvement', lang)} {profile.cases.length} {t('casesCount', lang)}
                  </StatusBadge>
                </div>
              )}
            </div>

            {profile.risk && (
              <div className="card-surface rounded-lg p-3 flex items-center gap-8">
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">{t('riskLevel', lang)}</div>
                  <StatusBadge tone={RISK_TONE[profile.risk.risk_level]}>{tv('risk', profile.risk.risk_level, lang)}</StatusBadge>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">{t('connectionsLabel', lang)}</div>
                  <div className="text-sm text-gray-200 tabular-nums">{profile.risk.connections}</div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              {[
                ['aliases', profile.aliases],
                ['knownPhones', profile.phones],
                ['knownVehicles', profile.vehicles],
              ].map(([key, values]) => (
                <div key={key} className="card-surface rounded-lg p-3">
                  <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">{t(key, lang)}</div>
                  <div className="text-sm text-gray-200">{values.join(', ') || '—'}</div>
                </div>
              ))}
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
                {profile.cases.length === 0 && <Empty>{t('noCases', lang)}</Empty>}
              </div>
            </div>
          </div>
        )}
      </Async>
    </div>
  )
}
