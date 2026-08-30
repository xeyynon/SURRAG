import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import ForceGraph2D from 'react-force-graph-2d'
import { SEED_CASES } from './seedCases'
import { LANGUAGES, t } from './i18n'
import HotspotPanel from './HotspotPanel'
import CasesPanel from './CasesPanel'
import LoginScreen from './LoginScreen'
import SearchPanel from './SearchPanel'
import TimelinePanel from './TimelinePanel'
import PersonProfile from './PersonProfile'
import CaseWorkspace from './CaseWorkspace'
import CatalogBar from './CatalogBar'

const DEMO_API_KEY = 'demo-investigator-key'
const INVESTIGATOR_KEY = 'crimelink_investigator'

const NODE_COLORS = {
  person: '#f97316',
  location: '#38bdf8',
  phone: '#a78bfa',
  vehicle: '#4ade80',
  case: '#f43f5e',
}

const TYPE_LABELS = {
  person: 'Person',
  location: 'Location',
  phone: 'Phone',
  vehicle: 'Vehicle',
  case: 'Case',
}

function GraphLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-gray-400">
      {Object.entries(TYPE_LABELS).map(([type, label]) => (
        <div key={type} className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full inline-block"
            style={{ background: NODE_COLORS[type] }}
          />
          {label}
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const demoCase = SEED_CASES[SEED_CASES.length - 1]
  const [investigator, setInvestigator] = useState(() => {
    try {
      return localStorage.getItem(INVESTIGATOR_KEY) || null
    } catch {
      return null
    }
  })
  const [lang, setLang] = useState('en')
  const [tab, setTab] = useState('network')
  const [narrative, setNarrative] = useState(demoCase.narrative)
  const [firNumber, setFirNumber] = useState(demoCase.fir_number)
  const [crimeType, setCrimeType] = useState(demoCase.crime_type)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [casesVersion, setCasesVersion] = useState(0)
  const [openPersonPid, setOpenPersonPid] = useState(null)
  const [openCaseCid, setOpenCaseCid] = useState(null)
  const fileInputRef = useRef()
  const graphRef = useRef()
  const containerRef = useRef()
  const [dims, setDims] = useState({ width: 800, height: 600 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0) setDims({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [tab])

  useEffect(() => {
    if (tab === 'network' && result && !openPersonPid && !openCaseCid) {
      const id = setTimeout(() => graphRef.current?.zoomToFit(400, 60), 50)
      return () => clearTimeout(id)
    }
  }, [tab, result, dims.width, dims.height, openPersonPid, openCaseCid])

  function handleLogin(name) {
    try {
      localStorage.setItem(INVESTIGATOR_KEY, name)
    } catch {
      /* ignore storage errors */
    }
    setInvestigator(name)
  }

  function handleLogout() {
    try {
      localStorage.removeItem(INVESTIGATOR_KEY)
    } catch {
      /* ignore storage errors */
    }
    setInvestigator(null)
    setResult(null)
    setOpenPersonPid(null)
    setOpenCaseCid(null)
    setTab('network')
  }

  function openPerson(pid) {
    setOpenCaseCid(null)
    setOpenPersonPid(pid)
  }

  function openCase(cid) {
    setOpenPersonPid(null)
    setOpenCaseCid(cid)
  }

  async function runAnalysis() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': DEMO_API_KEY,
          'X-Investigator-Name': investigator || '',
        },
        body: JSON.stringify({ narrative, fir_number: firNumber, crime_type: crimeType }),
      })
      if (!res.ok) throw new Error(`Server error: ${res.status}`)
      const data = await res.json()
      setResult(data)
      setCasesVersion((v) => v + 1)
    } catch (e) {
      setError(e.message || 'Failed to analyze FIR')
    } finally {
      setLoading(false)
    }
  }

  async function uploadFile(file) {
    setLoading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('fir_number', firNumber)
      form.append('crime_type', crimeType)
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'X-API-Key': DEMO_API_KEY, 'X-Investigator-Name': investigator || '' },
        body: form,
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        return
      }
      setResult(data)
      if (data.narrative) setNarrative(data.narrative)
      setCasesVersion((v) => v + 1)
    } catch (e) {
      setError(e.message || 'Upload failed')
    } finally {
      setLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const graphData = result
    ? {
        nodes: result.graph.nodes.map((n) => ({ ...n.data })),
        links: result.graph.edges.map((e) => ({
          source: e.data.source,
          target: e.data.target,
          weight: e.data.weight,
        })),
      }
    : { nodes: [], links: [] }

  if (!investigator) {
    return <LoginScreen lang={lang} onLogin={handleLogin} />
  }

  return (
    <div className="h-screen text-gray-100 flex flex-col overflow-hidden" style={{ background: 'var(--navy-950)' }}>
      <div className="tricolor-rule shrink-0" />
      <header className="border-b border-white/10 px-8 py-4 flex items-center justify-between gap-4 shrink-0">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-white truncate">
            {t('appTitle', lang)}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5 truncate">{t('tagline', lang)}</p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <span className="text-sm text-gray-400 hidden sm:block">
            {t('loggedInAs', lang)} <span className="text-gray-200">{investigator}</span>
          </span>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 hover:text-orange-400 border border-white/10 rounded-lg px-3 py-1.5 transition-colors"
          >
            {t('logout', lang)}
          </button>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="bg-[#12141a] border border-white/10 rounded-lg px-2 py-1.5 text-sm text-gray-200 focus:outline-none"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <div className="text-xs text-gray-500 text-right hidden md:block">
            <div>{t('orgLine1', lang)}</div>
            <div>{t('orgLine2', lang)}</div>
          </div>
        </div>
      </header>

      <nav className="border-b border-white/10 px-8 flex gap-1 shrink-0">
        {[
          { id: 'network', label: t('tabNetwork', lang) },
          { id: 'search', label: t('tabSearch', lang) },
          { id: 'timeline', label: t('tabTimeline', lang) },
          { id: 'hotspots', label: t('tabHotspots', lang) },
          { id: 'cases', label: t('tabCases', lang) },
        ].map((tabItem) => (
          <button
            key={tabItem.id}
            onClick={() => {
              setOpenPersonPid(null)
              setOpenCaseCid(null)
              setTab(tabItem.id)
            }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === tabItem.id && !openPersonPid && !openCaseCid
                ? 'border-orange-400 text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {tabItem.label}
          </button>
        ))}
      </nav>

      <CatalogBar lang={lang} refreshKey={casesVersion} />

      <AnimatePresence mode="wait">
      <motion.div
        key={openPersonPid ? `person-${openPersonPid}` : openCaseCid ? `case-${openCaseCid}` : tab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="flex-1 min-h-0 flex flex-col"
      >
      {openPersonPid ? (
        <div className="flex-1 min-h-0">
          <PersonProfile
            pid={openPersonPid}
            lang={lang}
            onBack={() => setOpenPersonPid(null)}
            onOpenCase={openCase}
          />
        </div>
      ) : openCaseCid ? (
        <div className="flex-1 min-h-0">
          <CaseWorkspace
            cid={openCaseCid}
            lang={lang}
            onBack={() => setOpenCaseCid(null)}
            onOpenPerson={openPerson}
            onOpenCase={openCase}
          />
        </div>
      ) : tab === 'hotspots' ? (
        <div className="flex-1 min-h-0">
          <HotspotPanel lang={lang} />
        </div>
      ) : tab === 'cases' ? (
        <div className="flex-1 min-h-0">
          <CasesPanel lang={lang} refreshKey={casesVersion} onOpenWorkspace={openCase} />
        </div>
      ) : tab === 'search' ? (
        <div className="flex-1 min-h-0">
          <SearchPanel lang={lang} onOpenPerson={openPerson} onOpenCase={openCase} />
        </div>
      ) : tab === 'timeline' ? (
        <div className="flex-1 min-h-0">
          <TimelinePanel lang={lang} onOpenCase={openCase} />
        </div>
      ) : (
        <div className="grid grid-cols-[380px_1fr] flex-1 min-h-0">
          <aside className="border-r border-white/10 p-6 overflow-y-auto space-y-5">
            <p className="text-xs text-gray-500 bg-white/5 rounded-lg p-3 leading-relaxed">
              {t('illustrativeNote', lang)}
            </p>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs uppercase tracking-wide text-gray-500 font-medium">
                  {t('newFirNarrative', lang)}
                </label>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-orange-400 hover:text-orange-300"
                >
                  {t('uploadFile', lang)}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.pdf,.docx,.doc,.pptx,.xlsx,.xls,.html,.htm,.csv,.json,.xml,.png,.jpg,.jpeg"
                  hidden
                  onChange={(e) => e.target.files[0] && uploadFile(e.target.files[0])}
                />
              </div>
              <textarea
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                rows={10}
                className="mt-2 w-full bg-[#12141a] border border-white/10 rounded-lg p-3 text-sm text-gray-200 resize-none focus:outline-none focus:ring-1 focus:ring-orange-400/50"
                placeholder="Paste or type the FIR narrative text..."
              />
              <p className="text-[11px] text-gray-600 mt-1">{t('uploadNote', lang)}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs uppercase tracking-wide text-gray-500 font-medium">
                  {t('firNumber', lang)}
                </label>
                <input
                  value={firNumber}
                  onChange={(e) => setFirNumber(e.target.value)}
                  className="mt-2 w-full bg-[#12141a] border border-white/10 rounded-lg p-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-orange-400/50"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-gray-500 font-medium">
                  {t('crimeType', lang)}
                </label>
                <input
                  value={crimeType}
                  onChange={(e) => setCrimeType(e.target.value)}
                  className="mt-2 w-full bg-[#12141a] border border-white/10 rounded-lg p-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-orange-400/50"
                />
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide text-gray-500 font-medium">
                {t('loadSample', lang)}
              </label>
              <select
                className="mt-2 w-full bg-[#12141a] border border-white/10 rounded-lg p-2 text-sm text-gray-200 focus:outline-none"
                onChange={(e) => {
                  const c = SEED_CASES.find((c) => c.fir_number === e.target.value)
                  if (c) {
                    setNarrative(c.narrative)
                    setFirNumber(c.fir_number)
                    setCrimeType(c.crime_type)
                  }
                }}
                defaultValue=""
              >
                <option value="" disabled>
                  {t('choosePlaceholder', lang)}
                </option>
                {SEED_CASES.map((c) => (
                  <option key={c.cid} value={c.fir_number}>
                    {c.fir_number} — {c.crime_type}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={runAnalysis}
              disabled={loading || !narrative.trim()}
              className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-gray-700 disabled:text-gray-400 text-black font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading && <span className="spinner" />}
              {loading ? t('analyzing', lang) : t('analyzeBtn', lang)}
            </button>

            {error && (
              <div className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg p-3">
                {error}
              </div>
            )}

            {result && (
              <motion.div
                key={result.cid}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="space-y-4 pt-2"
              >
                {result.report && (
                  <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-lg p-3">
                    <h3 className="text-xs uppercase tracking-wide text-emerald-300 font-medium mb-2">
                      {t('leadReport', lang)}
                      <span className="ml-2 text-[10px] text-gray-600 normal-case">
                        ({result.report.source})
                      </span>
                    </h3>
                    <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                      {result.report.narrative}
                    </pre>
                  </div>
                )}

                <div>
                  <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">
                    {t('extractedEntities', lang)}
                    <span className="ml-2 text-[10px] text-gray-600 normal-case">
                      ({result.extracted_entities.source}
                      {result.extraction_method ? ` · ${result.extraction_method}` : ''})
                    </span>
                  </h3>
                  <div className="space-y-1.5 text-sm">
                    {['persons', 'locations', 'phones', 'vehicles'].map(
                      (k) =>
                        result.extracted_entities[k]?.length > 0 && (
                          <div key={k}>
                            <span className="text-gray-500 capitalize">{k}: </span>
                            <span className="text-gray-200">
                              {result.extracted_entities[k].join(', ')}
                            </span>
                          </div>
                        )
                    )}
                    {['persons', 'locations', 'phones', 'vehicles'].every(
                      (k) => !result.extracted_entities[k]?.length
                    ) && <div className="text-gray-600">No entities detected in this text.</div>}
                  </div>
                </div>

                {result.resolved_persons?.length > 0 && (
                  <div>
                    <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">
                      {t('entityResolution', lang)}
                    </h3>
                    <ul className="text-sm space-y-1">
                      {result.resolved_persons.map((p) => (
                        <li key={p.pid} className="text-gray-200 flex items-center justify-between">
                          <button
                            onClick={() => openPerson(p.pid)}
                            className="hover:text-orange-300 text-left"
                          >
                            {p.name}
                          </button>
                          <span
                            className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${
                              p.is_new
                                ? 'text-gray-500 bg-white/5'
                                : 'text-emerald-400 bg-emerald-950/40'
                            }`}
                          >
                            {p.is_new ? t('newPid', lang) : t('matchedPid', lang)} · {p.pid}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.similar_cases?.length > 0 && (
                  <div className="bg-purple-950/30 border border-purple-900/50 rounded-lg p-3">
                    <h3 className="text-xs uppercase tracking-wide text-purple-300 font-medium mb-2">
                      {t('similarCases', lang)}
                    </h3>
                    <ul className="text-sm space-y-2">
                      {result.similar_cases.map((c) => (
                        <li key={c.cid} className="text-gray-200">
                          <div className="flex items-center justify-between">
                            <button onClick={() => openCase(c.cid)} className="hover:text-purple-300 text-left">
                              {c.fir_number} <span className="text-gray-500">({c.crime_type})</span>
                            </button>
                            <span className="text-purple-300 text-xs">{(c.score * 100).toFixed(0)}%</span>
                          </div>
                          <p className="text-gray-500 text-xs mt-0.5">{c.narrative_excerpt}…</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.hidden_connections.length > 0 && (
                  <div className="bg-orange-950/30 border border-orange-900/50 rounded-lg p-3">
                    <h3 className="text-xs uppercase tracking-wide text-orange-400 font-medium mb-2">
                      {t('hiddenConnections', lang)}
                    </h3>
                    <ul className="text-sm space-y-1">
                      {result.hidden_connections.map((c) => (
                        <li key={c.id} className="text-gray-200">
                          <span style={{ color: NODE_COLORS[c.type] }}>●</span>{' '}
                          {c.type === 'person' ? (
                            <button onClick={() => openPerson(c.id)} className="hover:text-orange-300">
                              {c.label}
                            </button>
                          ) : (
                            c.label
                          )}{' '}
                          <span className="text-gray-500">({TYPE_LABELS[c.type]})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">
                    {t('keyConnectors', lang)}
                  </h3>
                  <ol className="text-sm space-y-1.5">
                    {result.insights.key_connectors.map((n, i) => (
                      <li key={n.id} className="flex items-center justify-between">
                        <span>
                          <span className="text-gray-600 mr-1.5">{i + 1}.</span>
                          <span style={{ color: NODE_COLORS[n.type] }}>●</span> {n.label}
                        </span>
                        <span className="text-gray-500 text-xs">deg {n.degree}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </motion.div>
            )}
          </aside>

          <main className="flex flex-col min-h-0">
            <div className="px-6 pt-4 pb-2 flex items-center justify-between shrink-0">
              <GraphLegend />
              {result && (
                <span className="text-xs text-gray-500">
                  {graphData.nodes.length} {t('entities', lang)} · {graphData.links.length}{' '}
                  {t('connections', lang)}
                </span>
              )}
            </div>
            <div ref={containerRef} className="flex-1 min-h-0 relative">
              {!result && !loading && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm">
                  {t('runAnalysisPrompt', lang)}
                </div>
              )}
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
                  {t('analyzing', lang)}
                </div>
              )}
              {result && dims.width > 0 && (
                <ForceGraph2D
                  ref={graphRef}
                  graphData={graphData}
                  width={dims.width}
                  height={dims.height}
                  backgroundColor="#0a0c10"
                  nodeLabel={(n) => `${n.label} (${TYPE_LABELS[n.type]})`}
                  nodeColor={(n) => (n.highlight ? '#fbbf24' : NODE_COLORS[n.type] || '#888')}
                  nodeRelSize={5}
                  linkColor={() => 'rgba(255,255,255,0.12)'}
                  linkWidth={(l) => Math.min(1 + (l.weight || 1), 4)}
                  nodeCanvasObjectMode={() => 'after'}
                  onNodeClick={(node) => {
                    if (node.type === 'person') openPerson(node.domain_id)
                    else if (node.type === 'case') openCase(node.domain_id)
                  }}
                  nodeCanvasObject={(node, ctx, globalScale) => {
                    const label = node.label
                    const fontSize = 11 / globalScale
                    ctx.font = `${fontSize}px sans-serif`
                    ctx.fillStyle = node.highlight ? '#fde68a' : 'rgba(229,231,235,0.85)'
                    ctx.textAlign = 'center'
                    ctx.fillText(label, node.x, node.y + 10 / globalScale)
                    if (node.highlight) {
                      ctx.beginPath()
                      ctx.arc(node.x, node.y, 8, 0, 2 * Math.PI)
                      ctx.strokeStyle = '#fbbf24'
                      ctx.lineWidth = 1.5
                      ctx.stroke()
                    }
                  }}
                  cooldownTicks={80}
                  onEngineStop={() => graphRef.current?.zoomToFit(400, 60)}
                />
              )}
            </div>
          </main>
        </div>
      )}
      </motion.div>
      </AnimatePresence>
    </div>
  )
}
