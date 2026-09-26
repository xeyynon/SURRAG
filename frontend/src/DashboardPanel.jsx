import { t, tv } from './i18n'
import { useApi } from './api'
import { Async } from './ui'
import { SERIES } from './chartStyle'
import { NODE_COLORS } from './graphStyle'

// Chart type follows the question each panel answers:
//   which kind is most common      -> horizontal bars, one hue per kind
//   how it changes over time       -> area line
//   what the network is made of    -> donut (parts of a whole)
//   how far cases have progressed  -> one stacked bar (parts of a whole, ordered)
const STATUS_COLORS = {
  Open: '#e0b04f',
  'Under Investigation': '#5fb3b3',
  'Charge-sheeted': '#4ade80',
  Closed: '#6b7580',
}
const STATUS_ORDER = ['Open', 'Under Investigation', 'Charge-sheeted', 'Closed']

function Card({ title, note, children, className = '' }) {
  return (
    <section className={`bg-[var(--bg-panel)] border border-white/[0.08] rounded-[14px] p-5 ${className}`}>
      <h3 className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">{title}</h3>
      {note && <p className="text-xs text-gray-500 mt-1">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

const Empty = () => <div className="text-xs text-gray-500">—</div>

function Stat({ label, value }) {
  return (
    <div className="bg-[var(--bg-panel)] border border-white/[0.08] rounded-[14px] p-5">
      <div className="num text-4xl font-medium text-white">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-gray-400 mt-2">{label}</div>
    </div>
  )
}

function HBars({ rows }) {
  if (!rows.length) return <Empty />
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-gray-200">{r.label}</span>
            <span className="num text-gray-300">{r.count}</span>
          </div>
          <div className="mt-1 h-2 bg-white/[0.05] rounded-full">
            <div
              className="h-2 rounded-full"
              style={{ width: `${(r.count / max) * 100}%`, background: SERIES[i % SERIES.length] }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

function AreaLine({ rows }) {
  if (!rows.length) return <Empty />
  const W = 440, H = 170, pad = { l: 26, r: 30, t: 12, b: 24 }
  const max = Math.max(1, ...rows.map((r) => r.count))
  const x = (i) => pad.l + (rows.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (rows.length - 1)) * (W - pad.l - pad.r))
  const y = (v) => H - pad.b - (v / max) * (H - pad.t - pad.b)
  const pts = rows.map((r, i) => `${x(i)},${y(r.count)}`)
  const area = `${x(0)},${H - pad.b} ${pts.join(' ')} ${x(rows.length - 1)},${H - pad.b}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-44">
      {[0, Math.round(max / 2), max].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--grid-line)" />
          <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="var(--chart-axis)">{v}</text>
        </g>
      ))}
      <polygon points={area} fill={SERIES[1]} opacity="0.16" />
      <polyline points={pts.join(' ')} fill="none" stroke={SERIES[1]} strokeWidth="2" strokeLinejoin="round" />
      {rows.map((r, i) => (
        <g key={r.month}>
          <circle cx={x(i)} cy={y(r.count)} r="3.5" fill={SERIES[1]} />
          <text x={x(i)} y={y(r.count) - 9} textAnchor="middle" fontSize="10" fill="#e5e7eb" className="num">{r.count}</text>
          <text x={x(i)} y={H - 7} textAnchor="middle" fontSize="9" fill="var(--chart-axis)">{r.month}</text>
        </g>
      ))}
    </svg>
  )
}

function Donut({ rows, colorFor, nameOf }) {
  const sum = rows.reduce((a, r) => a + r.count, 0)
  if (!sum) return <Empty />
  const R = 42, C = 2 * Math.PI * R
  let offset = 0
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 120 120" className="w-36 h-36 shrink-0 -rotate-90">
        {rows.map((r) => {
          const len = (r.count / sum) * C
          const el = (
            <circle key={r.label} cx="60" cy="60" r={R} fill="none" stroke={colorFor(r.label)} strokeWidth="16"
              strokeDasharray={`${len - 1.5} ${C - len + 1.5}`} strokeDashoffset={-offset} />
          )
          offset += len
          return el
        })}
      </svg>
      <ul className="space-y-2 text-sm">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-gray-300">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorFor(r.label) }} />
            {nameOf(r.label)}
            <span className="num text-gray-500 text-xs ml-1">{r.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StackedBar({ rows, nameOf }) {
  const sum = rows.reduce((a, r) => a + r.count, 0)
  if (!sum) return <Empty />
  return (
    <div>
      <div className="flex h-4 rounded-full overflow-hidden gap-0.5">
        {rows.map((r) => (
          <div key={r.label} style={{ width: `${(r.count / sum) * 100}%`, background: STATUS_COLORS[r.label] || '#6b7580' }} title={`${r.label}: ${r.count}`} />
        ))}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-gray-300">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLORS[r.label] || '#6b7580' }} />
            {nameOf(r.label)}
            <span className="num text-gray-500 text-xs ml-auto">{r.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function DashboardPanel({ lang, refreshKey }) {
  const state = useApi('/api/dashboard', refreshKey)

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-lg font-medium text-white">{t('dashTitle', lang)}</h2>
        <p className="text-sm text-gray-500 mt-0.5 mb-5">{t('dashSubtitle', lang)}</p>

        <Async state={state} lang={lang}>
          {(d) => {
            const total = d.totals.cases
            const statusRows = [...d.cases_by_status].sort(
              (a, b) => STATUS_ORDER.indexOf(a.label) - STATUS_ORDER.indexOf(b.label)
            )
            const open = d.cases_by_status.filter((r) => r.label !== 'Closed').reduce((a, r) => a + r.count, 0)
            const top = d.cases_by_type[0]
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Stat label={t('casesCount', lang)} value={total} />
                  <Stat label={t('dashOpen', lang)} value={open} />
                  <Stat label={t('people', lang)} value={d.totals.persons} />
                  <Stat label={t('highRiskPersons', lang)} value={d.high_risk_persons} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                  <Card
                    className="lg:col-span-3"
                    title={t('casesByType', lang)}
                    note={top && total ? `${top.label} ${t('dashLeading', lang)} · ${Math.round((top.count / total) * 100)}%` : null}
                  >
                    <HBars rows={d.cases_by_type} />
                  </Card>
                  <Card className="lg:col-span-2" title={t('casesByMonth', lang)}>
                    <AreaLine rows={d.cases_by_month} />
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card title={t('dashEntities', lang)}>
                    <Donut rows={d.entity_composition} nameOf={(l) => tv('type', l.toLowerCase(), lang)} colorFor={(label) => NODE_COLORS[label.toLowerCase()] || '#6b7580'} />
                  </Card>
                  <Card title={t('dashStatus', lang)}>
                    <StackedBar rows={statusRows} nameOf={(l) => tv('status', l, lang)} />
                  </Card>
                </div>
              </div>
            )
          }}
        </Async>
      </div>
    </div>
  )
}
