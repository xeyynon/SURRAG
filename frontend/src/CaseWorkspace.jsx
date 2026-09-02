import { useEffect, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { t } from './i18n'

const NODE_COLORS = {
  person: '#f97316',
  location: '#38bdf8',
  phone: '#a78bfa',
  vehicle: '#4ade80',
  case: '#f43f5e',
}

export default function CaseWorkspace({ cid, lang, onBack, onOpenPerson, onOpenCase }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const graphRef = useRef()
  const containerRef = useRef()
  const [dims, setDims] = useState({ width: 400, height: 300 })

  useEffect(() => {
    setData(null)
    setError(null)
    fetch(`/api/cases/${cid}/workspace`)
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .catch(() => setError('Failed to load case workspace'))
  }, [cid])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0) setDims({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [data])

  const graphData = data
    ? {
        nodes: data.subgraph.nodes.map((n) => ({ ...n.data })),
        links: data.subgraph.edges.map((e) => ({ source: e.data.source, target: e.data.target })),
      }
    : { nodes: [], links: [] }

  return (
    <div className="h-full overflow-y-auto p-6 max-w-5xl mx-auto w-full">
      <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-300 mb-4">
        ← {t('back', lang)}
      </button>

      {error && <div className="text-red-400 text-sm">{error}</div>}
      {!data && !error && <div className="text-gray-500 text-sm">{t('loading', lang)}…</div>}

      {data && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-white">{data.case.fir_number}</h1>
            <p className="text-xs text-gray-500 font-mono mt-1">
              {data.case.cid} · {data.case.crime_type} ·{' '}
              {data.case.is_seed ? t('seedTag', lang) : t('submittedTag', lang)}
            </p>
            <p className="text-sm text-gray-300 mt-3 leading-relaxed bg-[#0f2038] border border-white/10 rounded-lg p-3">
              {data.case.narrative}
            </p>
          </div>

          {data.report && (
            <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-lg p-3">
              <h3 className="text-xs uppercase tracking-wide text-emerald-300 font-medium mb-2">
                {t('leadReport', lang)}
                <span className="ml-2 text-[10px] text-gray-600 normal-case">({data.report.source})</span>
              </h3>
              <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                {data.report.narrative}
              </pre>
            </div>
          )}

          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">
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
                    <span className="text-xs text-gray-500 font-mono">{p.pid}</span>
                  </button>
                ))}
                {data.persons.length === 0 && (
                  <div className="text-sm text-gray-600">{t('noPersonsInCase', lang)}</div>
                )}
              </div>

              {data.similar_cases.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs uppercase tracking-wide text-purple-300 font-medium mb-2">
                    {t('similarCases', lang)}
                  </h3>
                  <div className="space-y-1.5">
                    {data.similar_cases.map((c) => (
                      <button
                        key={c.cid}
                        onClick={() => onOpenCase(c.cid)}
                        className="card-surface w-full text-left text-sm rounded-lg p-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-gray-100">{c.fir_number}</span>
                          <span className="text-purple-300 text-xs">{(c.score * 100).toFixed(0)}%</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">
                {t('caseSubgraph', lang)}
              </h3>
              <div
                ref={containerRef}
                className="bg-[#050c1a] border border-white/10 rounded-lg"
                style={{ height: 320 }}
              >
                {dims.width > 0 && (
                  <ForceGraph2D
                    ref={graphRef}
                    graphData={graphData}
                    width={dims.width}
                    height={320}
                    backgroundColor="#050c1a"
                    nodeLabel={(n) => n.label}
                    nodeColor={(n) => NODE_COLORS[n.type] || '#888'}
                    nodeRelSize={4}
                    linkColor={() => 'rgba(255,255,255,0.12)'}
                    onNodeClick={(n) => n.type === 'person' && onOpenPerson(n.domain_id)}
                    cooldownTicks={60}
                    onEngineStop={() => {
                      graphData.nodes.forEach((n) => {
                        n.fx = n.x
                        n.fy = n.y
                      })
                      graphRef.current?.zoomToFit(300, 30)
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
