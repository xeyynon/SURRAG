import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from './i18n'
import { SEED_CASES } from './seedCases'
import { buildGraphData } from './graphData'
import NetworkGraph, { GraphLegend } from './NetworkGraph'
import AnalysisResults from './AnalysisResults'
import { ErrorNote, LEFT_STACK, CARD } from './ui'

const inputClass =
  'mt-1.5 w-full bg-[var(--bg-raised)] border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]'
const labelClass = 'block text-[10px] uppercase tracking-wider text-gray-500 font-medium'
const linkButton = 'text-xs text-[var(--accent-ink)] hover:text-[var(--accent-ink-hover)]'

// Sample FIRs are a demo convenience, so they live in a small menu instead of
// a permanent form field.
function SampleMenu({ analysis, lang }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  useEffect(() => {
    if (!open) return undefined
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className={linkButton} aria-expanded={open}>
        {t('loadSample', lang)} ▾
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-20 w-64 bg-[var(--bg-raised)] border border-white/10 rounded-xl p-1">
          {SEED_CASES.map((c) => (
            <button
              key={c.cid}
              onClick={() => {
                analysis.loadSample(c.fir_number)
                setOpen(false)
              }}
              className="w-full text-left px-2.5 py-1.5 text-sm text-gray-200 hover:bg-[var(--bg-hover)] rounded-lg"
            >
              <span className="num">{c.fir_number}</span> <span className="text-gray-500 text-xs">{c.crime_type}</span>
            </button>
          ))}
          <p className="px-2.5 py-1.5 text-[11px] text-gray-500 border-t border-white/10 mt-1">
            {t('illustrativeNote', lang)}
          </p>
        </div>
      )}
    </div>
  )
}

// A full-size graph stage with two floating, rounded cards stacked down the
// left: the input on top, the answer below. The graph uses the rest of the
// width, so the cards never cover it.
export default function AnalyzeView({ analysis, lang, onOpenPerson, onOpenCase }) {
  const fileInputRef = useRef()
  const [pinned, setPinned] = useState(null)
  const { result } = analysis

  // Memoised on `result` alone; see NetworkGraph.
  const { graphData, alwaysLabelIds } = useMemo(
    () => buildGraphData(result?.graph, (result?.insights?.key_connectors || []).map((k) => k.id)),
    [result]
  )

  const counts = useMemo(() => {
    const out = {}
    graphData.nodes.forEach((n) => {
      out[n.type] = (out[n.type] || 0) + 1
    })
    return out
  }, [graphData])

  return (
    <div className="relative h-full bg-[var(--bg-graph)] overflow-hidden">
      {result && (
        <div className="absolute inset-y-0 left-[calc(max(280px,22%)+24px)] right-0">
          <NetworkGraph
            graphData={graphData}
            alwaysLabelIds={alwaysLabelIds}
            layoutKey="results"
            lang={lang}
            pinnedIds={pinned}
            onNodeClick={(node) => {
              if (node.type === 'person') onOpenPerson(node.domain_id)
              else if (node.type === 'case') onOpenCase(node.domain_id)
            }}
          />
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 w-max max-w-[92%] bg-[var(--bg-panel)] border border-white/10 rounded-xl px-4 py-2">
            <GraphLegend counts={counts} lang={lang} />
          </div>
        </div>
      )}

      {!result && !analysis.loading && (
        <div className="absolute inset-0 flex items-center justify-center pl-[22%] px-8">
          <div className="max-w-md">
            <h2 className="text-lg font-medium text-white">{t('emptyTitle', lang)}</h2>
            <p className="text-sm text-gray-400 mt-1">{t('emptyLead', lang)}</p>
            <ol className="mt-5 space-y-3">
              {['emptyStep1', 'emptyStep2', 'emptyStep3'].map((key, i) => (
                <li key={key} className="flex gap-3 text-sm text-gray-300">
                  <span className="num w-6 h-6 shrink-0 flex items-center justify-center rounded-full border border-white/15 text-xs text-gray-400">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{t(key, lang)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
      {analysis.loading && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
          {t('analyzing', lang)}
        </div>
      )}

      <div className={LEFT_STACK}>
      <aside className={`${CARD} space-y-4`}>
        <div>
          <label htmlFor="fir-narrative" className={labelClass}>{t('newFirNarrative', lang)}</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.pdf,.docx,.doc,.pptx,.xlsx,.xls,.html,.htm,.csv,.json,.xml,.png,.jpg,.jpeg"
            hidden
            onChange={async (e) => {
              const file = e.target.files[0]
              if (file) await analysis.upload(file)
              e.target.value = ''
            }}
          />
          <textarea
            id="fir-narrative"
            value={analysis.narrative}
            onChange={(e) => analysis.editNarrative(e.target.value)}
            rows={6}
            className={`${inputClass} resize-none leading-relaxed`}
            placeholder={t('narrativePlaceholder', lang)}
          />
          <div className="flex items-center justify-between mt-2">
            <button onClick={() => fileInputRef.current?.click()} className={linkButton}>
              {t('uploadFile', lang)}
            </button>
            <SampleMenu analysis={analysis} lang={lang} />
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="fir-number" className={labelClass}>{t('firNumber', lang)}</label>
            <input id="fir-number" value={analysis.firNumber} onChange={(e) => analysis.setFirNumber(e.target.value)} className={`${inputClass} num`} />
          </div>
          <div>
            <label htmlFor="crime-type" className={labelClass}>{t('crimeType', lang)}</label>
            <input id="crime-type" value={analysis.crimeType} onChange={(e) => analysis.setCrimeType(e.target.value)} className={inputClass} />
          </div>
        </div>

        <button
          onClick={analysis.run}
          disabled={analysis.loading || !analysis.narrative.trim()}
          className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:bg-gray-700 disabled:text-gray-400 text-black font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          {analysis.loading && <span className="spinner" />}
          {analysis.loading ? t('analyzing', lang) : t('analyzeBtn', lang)}
        </button>

        {analysis.error && <ErrorNote message={analysis.error} lang={lang} />}
      </aside>

      {result && (
        <aside className={CARD}>
          <AnalysisResults result={result} lang={lang} onOpenPerson={onOpenPerson} onOpenCase={onOpenCase} onPin={setPinned} />
        </aside>
      )}
      </div>
    </div>
  )
}
