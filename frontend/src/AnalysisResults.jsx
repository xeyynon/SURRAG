import { useState } from 'react'
import { t } from './i18n'
import { NODE_COLORS } from './graphStyle'
import { Empty, Modal, StatusBadge } from './ui'

// What wrote the lead summary is read from the response, never assumed: the
// summary is an LLM output when a model key is set and a fixed template
// otherwise, and the officer should know which they are reading.
export function reportProvenance(source, lang) {
  if (source === 'groq') return t('provAi', lang)
  if (source === 'templated') return t('provTemplate', lang)
  return source ? `${t('provSource', lang)}: ${source}` : t('provUnknown', lang)
}

const STRENGTH_TONE = { strong: 'alert', moderate: 'warn', weak: 'neutral' }
const PREVIEW = 4
const linkClass = 'text-left hover:text-[var(--accent-ink-hover)]'
const heading = 'text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-2'
const moreButton = 'mt-2 text-xs text-[var(--accent-ink)] hover:text-[var(--accent-ink-hover)]'

function EntityList({ items, onOpenPerson, lang }) {
  return (
    <ul className="text-sm space-y-1.5">
      {items.map((c) => (
        <li key={c.id} className="text-gray-200 truncate">
          <span style={{ color: NODE_COLORS[c.type] }}>●</span>{' '}
          {c.type === 'person' ? (
            <button onClick={() => onOpenPerson(c.id)} className={linkClass}>{c.label}</button>
          ) : (
            c.label
          )}{' '}
          <span className="text-gray-500 text-xs">{t(`type_${c.type}`, lang)}</span>
        </li>
      ))}
    </ul>
  )
}

// The answer panel. Its centrepiece is the linked-case list: not just that an
// earlier case is related, but the phone, vehicle, person or place they
// share, and how strong that evidence is. Hovering a row lights up exactly
// those items in the graph.
export default function AnalysisResults({ result, lang, onOpenPerson, onOpenCase, onPin }) {
  const [popup, setPopup] = useState(null)
  const linked = result.linked_cases || []
  const hidden = result.hidden_connections || []
  const similar = result.similar_cases || []
  const people = result.resolved_persons || []
  const strongCount = linked.filter((c) => c.strength === 'strong').length

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        {[
          [linked.length, 'summaryLinked'],
          [strongCount, 'summaryStrong'],
          [people.filter((p) => !p.is_new).length, 'summaryKnown'],
        ].map(([value, key]) => (
          <div key={key} className="bg-[var(--bg-raised)] border border-white/[0.07] rounded-xl px-2.5 py-2">
            <div className={`num text-xl font-medium ${value > 0 ? 'text-white' : 'text-gray-500'}`}>{value}</div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500 leading-tight">{t(key, lang)}</div>
          </div>
        ))}
      </div>

      <div>
        <h3 className={heading}>{t('linkedCases', lang)}</h3>
        {linked.length > 0 ? (
          <>
            <ul className="space-y-2">
              {linked.slice(0, PREVIEW).map((c) => (
                <li key={c.cid}>
                  <button
                    onClick={() => onOpenCase(c.cid)}
                    onMouseEnter={() => onPin(new Set([c.cid, ...c.shared.map((s) => s.id)]))}
                    onMouseLeave={() => onPin(null)}
                    onFocus={() => onPin(new Set([c.cid, ...c.shared.map((s) => s.id)]))}
                    onBlur={() => onPin(null)}
                    className="w-full text-left bg-[var(--bg-raised)] hover:bg-[var(--bg-hover)] border border-white/[0.07] rounded-xl px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="num text-sm text-white truncate">{c.fir_number}</span>
                      <StatusBadge tone={STRENGTH_TONE[c.strength]}>{t(`strength_${c.strength}`, lang)}</StatusBadge>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{c.crime_type}</div>
                    <div className="text-xs text-gray-300 mt-1.5 leading-relaxed">
                      <span className="text-gray-500">{t('sharedVia', lang)}: </span>
                      {c.shared.map((s, i) => (
                        <span key={`${s.type}-${s.id}`}>
                          {i > 0 && ' · '}
                          <span style={{ color: NODE_COLORS[s.type] }}>●</span> <span className="num">{s.label}</span>
                        </span>
                      ))}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            {linked.length > PREVIEW && (
              <button onClick={() => setPopup('linked')} className={moreButton}>
                {t('showAll', lang)} ({linked.length})
              </button>
            )}
          </>
        ) : (
          <Empty>{t('noLinkedCases', lang)}</Empty>
        )}
      </div>

      {people.length > 0 && (
        <div>
          <h3 className={heading}>{t('entityResolution', lang)}</h3>
          <ul className="text-sm space-y-1.5">
            {people.map((p) => (
              <li key={p.pid} className="text-gray-200 flex items-center justify-between gap-2">
                <button onClick={() => onOpenPerson(p.pid)} className={`${linkClass} truncate`}>{p.name}</button>
                <StatusBadge tone={p.is_new ? 'neutral' : 'ok'}>
                  {p.is_new ? t('newPid', lang) : t('matchedPid', lang)}
                </StatusBadge>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {hidden.length > 0 && (
          <button onClick={() => setPopup('entities')} className={moreButton.replace('mt-2', '')}>
            {t('connectedEntities', lang)} ({hidden.length})
          </button>
        )}
        {similar.length > 0 && (
          <button onClick={() => setPopup('similar')} className={moreButton.replace('mt-2', '')}>
            {t('similarCases', lang)} ({similar.length})
          </button>
        )}
      </div>

      {result.report && (
        <button
          onClick={() => setPopup('report')}
          className="w-full text-left bg-[var(--bg-raised)] hover:bg-[var(--bg-hover)] border border-white/[0.07] rounded-xl px-3 py-2.5 text-sm text-gray-200"
        >
          {t('leadReport', lang)} →
        </button>
      )}

      {popup === 'linked' && (
        <Modal title={`${t('linkedCases', lang)} (${linked.length})`} closeLabel={t('close', lang)} onClose={() => setPopup(null)}>
          <ul className="space-y-3">
            {linked.map((c) => (
              <li key={c.cid} className="text-sm">
                <div className="flex items-center justify-between">
                  <button onClick={() => { setPopup(null); onOpenCase(c.cid) }} className={`${linkClass} num text-white`}>
                    {c.fir_number} <span className="text-gray-500 text-xs font-sans">{c.crime_type}</span>
                  </button>
                  <StatusBadge tone={STRENGTH_TONE[c.strength]}>{t(`strength_${c.strength}`, lang)}</StatusBadge>
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {c.shared.map((s) => `${t(`type_${s.type}`, lang)}: ${s.label}`).join(' · ')}
                </div>
              </li>
            ))}
          </ul>
        </Modal>
      )}
      {popup === 'entities' && (
        <Modal title={`${t('connectedEntities', lang)} (${hidden.length})`} closeLabel={t('close', lang)} onClose={() => setPopup(null)}>
          <EntityList items={hidden} lang={lang} onOpenPerson={(pid) => { setPopup(null); onOpenPerson(pid) }} />
        </Modal>
      )}
      {popup === 'similar' && (
        <Modal title={`${t('similarCases', lang)} (${similar.length})`} closeLabel={t('close', lang)} onClose={() => setPopup(null)}>
          <p className="text-xs text-gray-500 mb-3">{t('similarityHint', lang)}</p>
          <ul className="text-sm space-y-2">
            {similar.map((c) => (
              <li key={c.cid} className="flex items-center justify-between text-gray-200">
                <button onClick={() => { setPopup(null); onOpenCase(c.cid) }} className={linkClass}>
                  <span className="num">{c.fir_number}</span> <span className="text-gray-500 text-xs">{c.crime_type}</span>
                </button>
                <span className="num text-gray-400 text-xs">{(c.score * 100).toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </Modal>
      )}
      {popup === 'report' && (
        <Modal title={t('leadReport', lang)} closeLabel={t('close', lang)} onClose={() => setPopup(null)}>
          <p className="text-[11px] text-gray-500 mb-3">{reportProvenance(result.report.source, lang)}</p>
          <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
            {result.report.narrative}
          </pre>
        </Modal>
      )}
    </div>
  )
}
