import { lazy, Suspense, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { LANGUAGES, loadLanguage, isRtl } from './i18n'
import { INVESTIGATOR_KEY } from './api'
import { useAnalysis } from './useAnalysis'
import AppBar from './AppBar'
import LoginScreen from './LoginScreen'
import AnalyzeView from './AnalyzeView'
import CasesPanel from './CasesPanel'
import SearchPanel from './SearchPanel'
import TimelinePanel from './TimelinePanel'
import PersonProfile from './PersonProfile'
import CaseWorkspace from './CaseWorkspace'
import DashboardPanel from './DashboardPanel'
import { Loading } from './ui'

// Leaflet is only needed on this tab, so it is fetched on first visit
// instead of being part of the initial bundle.
const HotspotPanel = lazy(() => import('./HotspotPanel'))

// Cross-fade between screens with the browser's own View Transitions API;
// where it is missing the change just happens.
function withTransition(update) {
  if (document.startViewTransition) document.startViewTransition(() => flushSync(update))
  else update()
}

function readInvestigator() {
  try {
    return localStorage.getItem(INVESTIGATOR_KEY) || null
  } catch {
    return null
  }
}

// State placement: user preferences and the analysis in progress live here,
// above the views that unmount each other. Anything derived, measured or
// hover-related stays inside the view that owns it.
export default function App() {
  const [investigator, setInvestigator] = useState(readInvestigator)
  const [lang, setLang] = useState('en')

  // Switching language loads that language's strings first, so the screen
  // never flashes keys. The choice is remembered, and the page direction and
  // language attribute follow it (Urdu and Kashmiri read right to left).
  async function changeLanguage(code) {
    if (!LANGUAGES.some((l) => l.code === code)) return
    if (!(await loadLanguage(code))) return
    setLang(code)
    document.documentElement.lang = code
    document.documentElement.dir = isRtl(code) ? 'rtl' : 'ltr'
    try {
      localStorage.setItem('surrag_lang', code)
    } catch {
      /* preference lasts for this session only */
    }
  }
  useEffect(() => {
    try {
      const saved = localStorage.getItem('surrag_lang')
      if (saved && saved !== 'en') changeLanguage(saved)
    } catch {
      /* no saved preference */
    }
  }, [])
  const [tab, setTab] = useState('network')
  const [openPersonPid, setOpenPersonPid] = useState(null)
  const [openCaseCid, setOpenCaseCid] = useState(null)
  const [casesVersion, setCasesVersion] = useState(0)
  const analysis = useAnalysis({ onSaved: () => setCasesVersion((v) => v + 1) })

  const detailOpen = Boolean(openPersonPid || openCaseCid)

  function goTab(id) {
    withTransition(() => {
      setOpenPersonPid(null)
      setOpenCaseCid(null)
      setTab(id)
    })
  }
  function openPerson(pid) {
    withTransition(() => {
      setOpenCaseCid(null)
      setOpenPersonPid(pid)
    })
  }
  function openCase(cid) {
    withTransition(() => {
      setOpenPersonPid(null)
      setOpenCaseCid(cid)
    })
  }
  function handleLogin(name) {
    try {
      localStorage.setItem(INVESTIGATOR_KEY, name)
    } catch {
      /* storage unavailable: the name lasts for this page load only */
    }
    setInvestigator(name)
  }
  function handleLogout() {
    try {
      localStorage.removeItem(INVESTIGATOR_KEY)
    } catch {
      /* nothing stored to clear */
    }
    setInvestigator(null)
    analysis.clear()
    goTab('network')
  }
  if (!investigator) return <LoginScreen lang={lang} onLogin={handleLogin} />

  let view
  if (openPersonPid) {
    view = (
      <PersonProfile
        key={openPersonPid}
        pid={openPersonPid}
        lang={lang}
        onBack={() => withTransition(() => setOpenPersonPid(null))}
        onOpenCase={openCase}
      />
    )
  } else if (openCaseCid) {
    view = (
      <CaseWorkspace
        key={openCaseCid}
        cid={openCaseCid}
        lang={lang}
        onBack={() => withTransition(() => setOpenCaseCid(null))}
        onOpenPerson={openPerson}
        onOpenCase={openCase}
      />
    )
  } else if (tab === 'dashboard') {
    view = <DashboardPanel lang={lang} refreshKey={casesVersion} />
  } else if (tab === 'hotspots') {
    view = (
      <Suspense fallback={<div className="p-6"><Loading lang={lang} /></div>}>
        <HotspotPanel lang={lang} />
      </Suspense>
    )
  } else if (tab === 'cases') {
    view = <CasesPanel lang={lang} refreshKey={casesVersion} onOpenWorkspace={openCase} />
  } else if (tab === 'search') {
    view = <SearchPanel lang={lang} onOpenPerson={openPerson} onOpenCase={openCase} />
  } else if (tab === 'timeline') {
    view = <TimelinePanel lang={lang} onOpenCase={openCase} />
  } else {
    view = <AnalyzeView analysis={analysis} lang={lang} onOpenPerson={openPerson} onOpenCase={openCase} />
  }

  return (
    <div className="h-screen text-gray-100 flex flex-col overflow-hidden bg-[var(--bg-canvas)]">
      <AppBar
        lang={lang}
        onLang={changeLanguage}
        tab={tab}
        tabActive={!detailOpen}
        onTab={goTab}
        investigator={investigator}
        onLogout={handleLogout}
      />
      <div className="flex-1 min-h-0">{view}</div>
    </div>
  )
}
