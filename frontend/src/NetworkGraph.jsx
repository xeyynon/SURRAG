import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { t } from './i18n'
import { NODE_COLORS, TYPE_LABELS, GRAPH } from './graphStyle'
import { tracePath, svgPoints } from './graphShapes'

const SMALL_GRAPH = 28 // up to this many nodes, every node is labelled
const MAX_LABEL = 24

const clip = (s) => (s.length > MAX_LABEL ? `${s.slice(0, MAX_LABEL - 1)}…` : s)

// The one graph renderer, used by the analysis view and the case workspace.
//
// `graphData` MUST be memoised by the caller (keyed on the record it was
// built from). A fresh object per render makes react-force-graph restart its
// simulation, which showed up as nodes drifting on hover/scroll and drags
// that would not stick.
export default function NetworkGraph({ graphData, alwaysLabelIds, onNodeClick, layoutKey, lang, pinnedIds }) {
  const graphRef = useRef()
  const containerRef = useRef()
  const [dims, setDims] = useState({ width: 0, height: 0 })
  const [hoveredId, setHoveredId] = useState(null)

  // Who is connected to whom, captured before the simulation replaces the
  // link ends with node objects. Hovering a node brightens it and its
  // neighbours and dims everything else.
  const neighbours = useMemo(() => {
    const map = new Map()
    graphData.links.forEach((l) => {
      const a = l.source.id ?? l.source
      const b = l.target.id ?? l.target
      if (!map.has(a)) map.set(a, new Set())
      if (!map.has(b)) map.set(b, new Set())
      map.get(a).add(b)
      map.get(b).add(a)
    })
    return map
  }, [graphData])
  // Items pinned from outside (hovering a linked case in the results panel)
  // light up the same way hovering a node does.
  const pinnedNodeIds = useMemo(
    () =>
      pinnedIds && pinnedIds.size
        ? new Set(graphData.nodes.filter((nd) => pinnedIds.has(nd.domain_id)).map((nd) => nd.id))
        : null,
    [graphData, pinnedIds]
  )
  const focus = hoveredId ? new Set([hoveredId, ...(neighbours.get(hoveredId) || [])]) : pinnedNodeIds
  const labelAll = graphData.nodes.length <= SMALL_GRAPH

  // Measured directly rather than via ResizeObserver, which did not fire
  // reliably for CSS-only layout changes such as the sidebar collapsing.
  useEffect(() => {
    function measure() {
      const el = containerRef.current
      if (!el) return
      const { width, height } = el.getBoundingClientRect()
      if (width > 0 && height > 0) setDims({ width, height })
    }
    measure()
    const id = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('resize', measure)
    }
  }, [layoutKey])

  useEffect(() => {
    // Wider spacing than the library default so nodes do not pile up.
    const fg = graphRef.current
    if (!fg) return
    fg.d3Force('charge')?.strength(-260)
    fg.d3Force('link')?.distance(100)
    fg.d3ReheatSimulation()
    // The graph mounts only once the container has been measured, so this
    // must re-run then; running on graphData alone hit a null ref and the
    // layout stayed at the library's tight defaults.
  }, [graphData, dims.width > 0])

  useEffect(() => {
    const id = setTimeout(() => graphRef.current?.zoomToFit(400, 90), 50)
    return () => clearTimeout(id)
  }, [graphData, dims.width, dims.height])

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {dims.width > 0 && (
        <>
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            width={dims.width}
            height={dims.height}
            backgroundColor={GRAPH.background}
            nodeLabel={() => ''}
            linkColor={(l) => {
              const a = l.source.id ?? l.source
              const b = l.target.id ?? l.target
              if (focus) return focus.has(a) && focus.has(b) && (!hoveredId || a === hoveredId || b === hoveredId) ? 'rgba(224,176,79,0.75)' : 'rgba(255,255,255,0.04)'
              return l.weight > 1 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.10)'
            }}
            linkWidth={(l) => {
              const a = l.source.id ?? l.source
              const b = l.target.id ?? l.target
              if (hoveredId && (a === hoveredId || b === hoveredId)) return 1.6
              return Math.min(0.6 + (l.weight || 1) * 0.5, 3)
            }}
            onNodeClick={onNodeClick}
            onNodeHover={(node) => setHoveredId(node ? node.id : null)}
            nodeRelSize={4}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const r = 5 + Math.min(node.degree, 10) * 1.1
              const dimmed = focus && !focus.has(node.id)
              const isHovered = node.id === hoveredId
              const color = NODE_COLORS[node.type] || '#888888'

              ctx.globalAlpha = dimmed ? 0.18 : 1

              // New-FIR entities get an amber ring around their own colour and
              // shape, so what they are stays readable.
              if (node.highlight) {
                tracePath(ctx, node.type, node.x, node.y, r + 4.5 / globalScale + 2)
                ctx.lineWidth = 2 / globalScale
                ctx.strokeStyle = GRAPH.highlightFill
                ctx.stroke()
              }

              tracePath(ctx, node.type, node.x, node.y, r)
              ctx.fillStyle = color
              ctx.fill()
              ctx.lineWidth = 1.6 / globalScale
              ctx.strokeStyle = isHovered ? GRAPH.hoverRing : GRAPH.background
              ctx.stroke()

              const showLabel =
                isHovered ||
                (focus && focus.has(node.id)) ||
                labelAll ||
                alwaysLabelIds.has(node.id) ||
                globalScale > 1.8
              if (showLabel) {
                const text = clip(node.label)
                const fontSize = Math.max(9, Math.min(12, 11 / globalScale))
                ctx.font = `${node.type === 'person' || node.highlight ? '600 ' : ''}${fontSize}px Inter, 'Segoe UI', sans-serif`
                const w = ctx.measureText(text).width
                const padX = 5 / globalScale
                const padY = 2.5 / globalScale
                const boxY = node.y + r + 4 / globalScale
                ctx.fillStyle = GRAPH.labelBackground
                ctx.beginPath()
                if (ctx.roundRect) ctx.roundRect(node.x - w / 2 - padX, boxY, w + padX * 2, fontSize + padY * 2, 3 / globalScale)
                else ctx.rect(node.x - w / 2 - padX, boxY, w + padX * 2, fontSize + padY * 2)
                ctx.fill()
                ctx.fillStyle = node.highlight ? GRAPH.labelTextHighlight : GRAPH.labelText
                ctx.textAlign = 'center'
                ctx.textBaseline = 'top'
                ctx.fillText(text, node.x, boxY + padY)
              }
              ctx.globalAlpha = 1
            }}
            nodePointerAreaPaint={undefined}
            cooldownTicks={100}
            onEngineStop={() => {
              // Freeze the settled layout; otherwise scroll/drag can wake the
              // physics back up and nodes drift while the user only wants to
              // zoom or pan.
              graphData.nodes.forEach((n) => {
                n.fx = n.x
                n.fy = n.y
              })
              graphRef.current?.zoomToFit(400, 90)
            }}
          />
          <div className="absolute bottom-4 right-4 flex flex-col gap-1">
            {[
              [() => graphRef.current?.zoom(graphRef.current.zoom() * 1.4, 250), '+', 'zoomIn'],
              [() => graphRef.current?.zoom(graphRef.current.zoom() / 1.4, 250), '−', 'zoomOut'],
              [() => graphRef.current?.zoomToFit(400, 90), '⤢', 'fitView'],
            ].map(([action, glyph, key]) => (
              <button
                key={key}
                onClick={action}
                className="w-8 h-8 flex items-center justify-center bg-[var(--bg-panel)] border border-white/10 rounded-lg text-gray-300 text-sm hover:bg-[var(--bg-hover)]"
                title={t(key, lang)}
                aria-label={t(key, lang)}
              >
                {glyph}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ShapeIcon({ type }) {
  const pts = svgPoints(type, 12)
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      {pts ? <polygon points={pts} fill={NODE_COLORS[type]} /> : <circle cx="6" cy="6" r="4.6" fill={NODE_COLORS[type]} />}
    </svg>
  )
}

export function GraphLegend({ counts = {}, lang }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-gray-300">
      {Object.keys(TYPE_LABELS).map((type) => (
        <div key={type} className="flex items-center gap-1.5">
          <ShapeIcon type={type} />
          {t(`type_${type}`, lang)}
          {counts[type] != null && <span className="num text-gray-500">{counts[type]}</span>}
        </div>
      ))}
      <span className="flex items-center gap-1.5 text-gray-400">
        <span className="w-3 h-3 rounded-full border-2 border-[#fbbf24]" aria-hidden="true" />
        {t('legendNewInFir', lang)}
      </span>
    </div>
  )
}
