import { LANGUAGES, t } from './i18n'

const TABS = [
  { id: 'network', label: 'tabNetwork' },
  { id: 'cases', label: 'tabCases' },
  { id: 'search', label: 'tabSearch' },
  { id: 'hotspots', label: 'tabHotspots' },
  { id: 'timeline', label: 'tabTimeline' },
  { id: 'dashboard', label: 'tabDashboard' },
]

// The one top bar: brand, tabs, and the account/language controls. Every
// screen renders through it, so a control added here exists everywhere.
export default function AppBar({ lang, onLang, tab, tabActive, onTab, investigator, onLogout }) {
  return (
    <header className="border-b border-white/10 px-6 flex items-center gap-8 shrink-0 bg-[var(--bg-panel)]">
      <h1 className="font-mono text-[15px] font-medium tracking-[0.22em] text-white py-3">SURRAG</h1>
      <nav className="flex gap-1 flex-1" aria-label={t('ariaSections', lang)}>
        {TABS.map((item) => (
          <button
            key={item.id}
            onClick={() => onTab(item.id)}
            aria-current={tab === item.id && tabActive ? 'page' : undefined}
            className={`px-4 py-3.5 text-[13px] font-medium border-b-2 transition-colors ${
              tab === item.id && tabActive
                ? 'border-[var(--accent)] text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t(item.label, lang)}
          </button>
        ))}
      </nav>
      <div className="flex items-center gap-3 shrink-0 text-sm">
        <span className="text-gray-300 hidden sm:block">{investigator}</span>
        <button onClick={onLogout} className="text-gray-400 hover:text-[var(--accent-ink)]">
          {t('logout', lang)}
        </button>
        <select
          value={lang}
          onChange={(e) => onLang(e.target.value)}
          aria-label={t('ariaLanguage', lang)}
          className="bg-transparent border border-white/10 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code} className="bg-[var(--bg-panel)]">
              {l.label}
            </option>
          ))}
        </select>
      </div>
    </header>
  )
}
