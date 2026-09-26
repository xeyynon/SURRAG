import { useMemo, useState } from 'react'
import { t, tv } from './i18n'
import { apiFetch, useApi } from './api'
import { NODE_COLORS } from './graphStyle'
import { buildGraphData } from './graphData'
import NetworkGraph from './NetworkGraph'
import { reportProvenance } from './AnalysisResults'
import { Async, Empty, ErrorNote, StatusBadge, STATUS_TONE, PRIORITY_TONE } from './ui'

const STATUSES = ['Open', 'Under Investigation', 'Charge-sheeted', 'Closed']
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical']

const sectionTitle = 'text-xs uppercase tracking-wide text-gray-500 font-medium mb-2'

function Workspace({ cid, data, lang, onOpenPerson, onOpenCase }) {
  const evidence = useApi(`/api/evidence?cid=${cid}`)
  const [caseRecord, setCaseRecord] = useState(data.case)
  const [updateError, setUpdateError] = useState(null)

  // Memoised on the loaded record; see NetworkGraph for why this matters.
  const personPids = data.persons.map((p) => p.pid)
  const { graphData, alwaysLabelIds } = useMemo(
    () => buildGraphData(data.subgraph, personPids),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data]
  )

  async function updateCase(patch) {
    setUpdateError(null)
    try {
      const updated = await apiFetch(`/api/cases/${cid}/status`, { method: 'PATCH', json: patch })
      setCaseRecord((c) => ({ ...c, status: updated.status, priority: updated.priority }))
    } catch (e) {
      setUpdateError(e.message)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="num text-2xl font-medium text-white">{caseRecord.fir_number}</h1>
            <p className="text-xs text-gray-400 mt-1">
              {caseRecord.crime_type} · {caseRecord.is_seed ? t('seedTag', lang) : t('submittedTag', lang)}
              {caseRecord.submitted_by && ` · ${t('registeredBy', lang)} ${caseRecord.submitted_by}`}
              {' · '}
              {new Date(caseRecord.occurred_on || caseRecord.created_at).toLocaleDateString()}
            </p>
          </div>
          <button
            onClick={() => window.print()}
            className="no-print shrink-0 text-xs text-gray-300 hover:text-white border border-white/15 rounded-lg px-3 py-1.5"
          >
            {t('printReport', lang)}
          </button>
        </div>
        <p className="print-only text-xs mt-2">
          {t('printStamp', lang)} · {new Date().toLocaleString()}
        </p>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 mt-4 no-print">
          <div className="flex items-center gap-1.5" role="group" aria-label={t('statusLabel', lang)}>
            {STATUSES.map((s, i) => {
              const current = STATUSES.indexOf(caseRecord.status)
              const reached = i <= current
              return (
                <div key={s} className="flex items-center gap-1.5">
                  {i > 0 && <span className={`w-5 h-px ${i <= current ? 'bg-[var(--accent)]' : 'bg-white/15'}`} />}
                  <button
                    onClick={() => updateCase({ status: s })}
                    aria-pressed={i === current}
                    className={`flex items-center gap-1.5 text-xs rounded-lg px-2 py-1 hover:bg-[var(--bg-hover)] ${
                      i === current ? 'text-white font-medium' : reached ? 'text-gray-300' : 'text-gray-500'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${reached ? 'bg-[var(--accent)]' : 'border border-gray-500'}`}
                      aria-hidden="true"
                    />
                    {tv('status', s, lang)}
                  </button>
                </div>
              )
            })}
          </div>
          <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
            <StatusBadge tone={PRIORITY_TONE[caseRecord.priority] || 'neutral'}>{t('priorityLabel', lang)}</StatusBadge>
            <select
              value={caseRecord.priority}
              onChange={(e) => updateCase({ priority: e.target.value })}
              className="bg-[var(--bg-raised)] border border-white/10 rounded-lg px-2 py-1 text-sm normal-case text-gray-200"
            >
              {PRIORITIES.map((o) => (
                <option key={o} value={o}>{tv('priority', o, lang)}</option>
              ))}
            </select>
          </label>
        </div>
        {updateError && (
          <div className="mt-3">
            <ErrorNote message={updateError} lang={lang} />
          </div>
        )}
        <p className="text-sm text-gray-300 mt-3 leading-relaxed bg-[var(--bg-panel)] border border-white/10 rounded-lg p-3">
          {caseRecord.narrative}
        </p>
      </div>

      <div>
        <h3 className={sectionTitle}>
          {t('evidenceHeading', lang)}
          {evidence.data ? ` (${evidence.data.evidence.length})` : ''}
        </h3>
        <Async state={evidence} lang={lang}>
          {({ evidence: items }) =>
            items.length === 0 ? (
              <Empty>{t('noEvidence', lang)}</Empty>
            ) : (
              <div className="space-y-1.5">
                {items.map((e) => (
                  <div key={e.evidence_id} className="card-surface rounded-lg p-2.5 text-xs">
                    <div className="flex justify-between text-gray-200">
                      <span>
                        {e.filename}{' '}
                        <span className="text-gray-500">· {e.file_type} · {e.size_bytes} B · {e.extraction_method}</span>
                      </span>
                      <span className="font-mono text-gray-500">{e.evidence_id}</span>
                    </div>
                    <div className="font-mono text-[10px] text-gray-500 mt-1 break-all">SHA-256 {e.sha256}</div>
                  </div>
                ))}
              </div>
            )
          }
        </Async>
      </div>

      {data.report && (
        <details className="border border-white/10 rounded-lg p-3" open>
          <summary className="text-xs uppercase tracking-wide text-gray-400 font-medium cursor-pointer">
            {t('leadReport', lang)}
          </summary>
          <p className="mt-2 text-[11px] text-gray-500">{reportProvenance(data.report.source, lang)}</p>
          <pre className="mt-2 text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
            {data.report.narrative}
          </pre>
        </details>
      )}

      <div className="grid grid-cols-2 gap-6">
        <div>
          <h3 className={sectionTitle}>
            {t('people', lang)} ({data.persons.length})
          </h3>
          <div className="space-y-1.5">
            {data.persons.map((p) => (
              <button
                key={p.pid}
                onClick={() => onOpenPerson(p.pid)}
                className="card-surface w-full text-left text-sm rounded-lg p-2.5 flex items-center justify-between"
              >
                <span className="text-gray-100">
                  <span style={{ color: NODE_COLORS.person }}>●</span> {p.canonical_name}
                </span>
                <span className="num text-xs text-gray-500">{p.pid}</span>
              </button>
            ))}
            {data.persons.length === 0 && <Empty>{t('noPersonsInCase', lang)}</Empty>}
          </div>

          {data.similar_cases.length > 0 && (
            <div className="mt-4">
              <h3 className={sectionTitle}>{t('similarCases', lang)}</h3>
              <div className="space-y-1.5">
                {data.similar_cases.map((c) => (
                  <button
                    key={c.cid}
                    onClick={() => onOpenCase(c.cid)}
                    className="card-surface w-full text-left text-sm rounded-lg p-2.5 flex items-center justify-between"
                  >
                    <span className="text-gray-100">{c.fir_number}</span>
                    <span className="text-gray-400 text-xs tabular-nums" title={t('similarityHint', lang)}>
                      {(c.score * 100).toFixed(0)}%
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <h3 className={sectionTitle}>{t('caseSubgraph', lang)}</h3>
          <div className="border border-white/10 rounded-lg overflow-hidden" style={{ height: 320 }}>
            <NetworkGraph
              graphData={graphData}
              alwaysLabelIds={alwaysLabelIds}
              layoutKey={cid}
              lang={lang}
              onNodeClick={(n) => n.type === 'person' && onOpenPerson(n.domain_id)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CaseWorkspace({ cid, lang, onBack, onOpenPerson, onOpenCase }) {
  const state = useApi(`/api/cases/${cid}/workspace`)

  return (
    <div className="h-full overflow-y-auto p-6 max-w-5xl mx-auto w-full">
      <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-200 mb-4">
        ← {t('back', lang)}
      </button>
      <Async state={state} lang={lang}>
        {(data) => (
          <Workspace cid={cid} data={data} lang={lang} onOpenPerson={onOpenPerson} onOpenCase={onOpenCase} />
        )}
      </Async>
    </div>
  )
}
