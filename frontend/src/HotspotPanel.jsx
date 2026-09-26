import { useState } from 'react'
import { t } from './i18n'
import { useApi } from './api'
import { Async, Empty, FLOAT_LEFT, FLOAT_RIGHT } from './ui'
import { heatColor, SELECTED } from './chartStyle'
import HotspotMap from './HotspotMap'

const selectClass =
  'mt-1.5 w-full bg-[var(--bg-raised)] border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 focus:outline-none'
const labelClass = 'block text-xs uppercase tracking-wide text-gray-500 font-medium'
const panelTitle = 'text-xs uppercase tracking-wide text-gray-400 font-medium mb-3'

function RankedBars({ rows, getKey, getLabel, getSub, selectedKey, onPick, max: fixedMax }) {
  const max = fixedMax || Math.max(1, ...rows.map((r) => r.count))
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const key = getKey(r)
        const selected = key === selectedKey
        const Row = onPick ? 'button' : 'div'
        return (
          <li key={key}>
            <Row
              onClick={onPick ? () => onPick(r) : undefined}
              className="w-full text-left"
            >
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className={`truncate ${selected ? 'text-white' : 'text-gray-300'}`}>
                  {getLabel(r)}
                  {getSub && <span className="text-gray-500"> · {getSub(r)}</span>}
                </span>
                <span className="text-gray-200 tabular-nums">{r.count}</span>
              </div>
              <div className="mt-1 h-1.5 bg-white/5 rounded-sm">
                <div
                  className="h-1.5 rounded-sm"
                  style={{ width: `${(r.count / max) * 100}%`, background: selected ? SELECTED : heatColor(r.count, max) }}
                />
              </div>
            </Row>
          </li>
        )
      })}
    </ul>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-xl font-semibold text-white tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}

// Three columns, 20 / 60 / 20: filters and districts on the left, the map
// in the middle, the state-level analysis on the right. The side panels are
// solid, not translucent: translucency reads as "glassy" over a busy map.
export default function HotspotPanel({ lang }) {
  const [state, setState] = useState('')
  const [crimeType, setCrimeType] = useState('Murder')

  // The first request also supplies the dropdown options, so it stays
  // separate from the filtered one.
  const meta = useApi('/api/hotspots?crime_type=Murder&top_n=10')
  const params = new URLSearchParams({ crime_type: crimeType, top_n: '10' })
  if (state) params.set('state', state)
  const districts = useApi(`/api/hotspots?${params.toString()}`)
  const byState = useApi(`/api/hotspots/by_state?crime_type=${encodeURIComponent(crimeType)}`)

  const states = meta.data?.states || []
  const crimeTypes = meta.data?.crime_types || []
  const stateRows = [...(byState.data?.results || [])].sort((a, b) => b.count - a.count)
  const national = stateRows.reduce((sum, r) => sum + r.count, 0)
  const selectedRow = stateRows.find((r) => r.state === state)
  const selectedRank = selectedRow ? stateRows.indexOf(selectedRow) + 1 : null

  return (
    <div className="relative h-full overflow-hidden bg-[var(--bg-graph)]">
      <div className="absolute inset-0">
        <HotspotMap
          crimeType={crimeType}
          state={state}
          lang={lang}
          results={stateRows}
          error={byState.error}
          onSelectState={setState}
        />
      </div>

      <aside className={`${FLOAT_LEFT} space-y-5`}>
        <div>
          <label htmlFor="hs-state" className={labelClass}>{t('hotspotState', lang)}</label>
          <select id="hs-state" value={state} onChange={(e) => setState(e.target.value)} className={selectClass}>
            <option value="">{t('hotspotAllStates', lang)}</option>
            {states.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="hs-crime" className={labelClass}>{t('hotspotCrimeType', lang)}</label>
          <select id="hs-crime" value={crimeType} onChange={(e) => setCrimeType(e.target.value)} className={selectClass}>
            {crimeTypes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <h3 className={panelTitle}>{t('hotspotTitle', lang)}</h3>
          <Async state={districts} lang={lang}>
            {({ results }) =>
              results.length === 0 ? (
                <Empty>{t('noResults', lang)}</Empty>
              ) : (
                <RankedBars
                  rows={results}
                  getKey={(r) => `${r.state}-${r.district}`}
                  getLabel={(r) => r.district}
                  getSub={(r) => r.state}
                />
              )
            }
          </Async>
        </div>
      </aside>

      <aside className={`${FLOAT_RIGHT} space-y-5`}>
        <Async state={byState} lang={lang}>
          {() => (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Stat label={t('hotspotNational', lang)} value={national.toLocaleString()} />
                {selectedRow ? (
                  <Stat label={`${state} · #${selectedRank}`} value={selectedRow.count.toLocaleString()} />
                ) : (
                  <Stat label={t('hotspotTopState', lang)} value={stateRows[0]?.state || '—'} />
                )}
              </div>
              {selectedRow && national > 0 && (
                <p className="text-xs text-gray-400">
                  {((selectedRow.count / national) * 100).toFixed(1)}% {t('hotspotShare', lang)}
                </p>
              )}

              {national > 0 && (
                <p className="text-xs text-gray-400">
                  <span className="num text-gray-200">
                    {((stateRows.slice(0, 5).reduce((sum, r) => sum + r.count, 0) / national) * 100).toFixed(0)}%
                  </span>{' '}
                  {t('hotspotConcentration', lang)}
                </p>
              )}

              <div>
                <h3 className={panelTitle}>{t('hotspotTopStates', lang)}</h3>
                <RankedBars
                  rows={stateRows.slice(0, 10)}
                  max={stateRows[0]?.count}
                  getKey={(r) => r.state}
                  getLabel={(r) => r.state}
                  selectedKey={state}
                  onPick={(r) => setState(r.state === state ? '' : r.state)}
                />
              </div>
            </>
          )}
        </Async>
        <p className="text-[11px] text-gray-500 border-t border-white/10 pt-3">{t('hotspotSource', lang)}</p>
      </aside>
    </div>
  )
}
