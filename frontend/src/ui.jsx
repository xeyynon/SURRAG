import { useEffect } from 'react'
import { t } from './i18n'

// The three kinds of "nothing to show", kept visibly different because they
// mean different things to an officer:
//   Loading  - the answer has not arrived yet
//   ErrorNote - the request failed (says why, offers a retry)
//   Empty    - the request worked and the honest answer is "none"

export function Loading({ lang }) {
  return <div className="text-sm text-gray-500">{t('loading', lang)}…</div>
}

export function ErrorNote({ message, onRetry, lang }) {
  return (
    <div role="alert" className="text-sm text-red-300 bg-red-950/40 border border-red-900 rounded-lg p-3 flex items-center justify-between gap-3">
      <span>{t(message, lang)}</span>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 text-xs text-[var(--accent-ink)] hover:text-[var(--accent-ink-hover)]">
          {t('retry', lang)}
        </button>
      )}
    </div>
  )
}

export function Empty({ children }) {
  return <div className="text-sm text-gray-500">{children}</div>
}

// Renders exactly one of loading / error / children, so a panel cannot
// forget one of the three states.
export function Async({ state, lang, children }) {
  if (state.loading) return <Loading lang={lang} />
  if (state.error) return <ErrorNote message={state.error} onRetry={state.reload} lang={lang} />
  return children(state.data)
}

// Status as a small dot plus plain text. Deliberately not a filled, bordered,
// uppercase pill: a row of pills pulls the eye away from the data they
// describe. The tone dot carries the state; the word carries the meaning.
const TONE_DOT = {
  ok: 'bg-emerald-400',
  warn: 'bg-[var(--accent)]',
  alert: 'bg-red-400',
  info: 'bg-[var(--accent-ink)]',
  neutral: 'bg-gray-500',
}

export function StatusBadge({ tone = 'neutral', children }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-300 whitespace-nowrap">
      <span className={`w-[7px] h-[7px] rounded-full shrink-0 ${TONE_DOT[tone]}`} aria-hidden="true" />
      {children}
    </span>
  )
}

export const STATUS_TONE = {
  Open: 'info',
  'Under Investigation': 'warn',
  'Charge-sheeted': 'ok',
  Closed: 'neutral',
}
export const PRIORITY_TONE = { Low: 'neutral', Medium: 'neutral', High: 'warn', Critical: 'alert' }
export const RISK_TONE = { High: 'alert', Medium: 'warn', Low: 'neutral' }

// A popup for detail an officer sometimes needs but should not have to scroll
// past: closes on Esc, on the backdrop and on the close button.
export function Modal({ title, onClose, children, closeLabel = 'Close' }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-[var(--bg-panel)] border border-white/10 rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
          <h2 className="text-sm font-medium text-white">{title}</h2>
          <button onClick={onClose} className="text-xs text-gray-400 hover:text-white">
            {closeLabel} ✕
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

// Floating side cards: solid (not translucent, which reads as glassy over a
// busy map), rounded, inset from the edges, sized to their content up to the
// height of the stage. Left and right are each about 20% wide.
const FLOAT_BASE =
  'absolute z-[1000] top-3 max-h-[calc(100%-1.5rem)] overflow-y-auto bg-[var(--bg-panel)] border border-white/10 rounded-[14px] p-4'
export const FLOAT_LEFT = `${FLOAT_BASE} left-3 w-[20%] min-w-[260px] max-w-[440px]`
export const FLOAT_RIGHT = `${FLOAT_BASE} right-3 w-[20%] min-w-[280px] max-w-[440px]`

// Analyze page: input and results stacked as two floating cards down the left
// side, leaving the rest of the width to the graph.
export const LEFT_STACK =
  'absolute z-[1000] left-3 top-3 bottom-3 w-[22%] min-w-[280px] max-w-[440px] flex flex-col gap-3 overflow-y-auto'
export const CARD = 'bg-[var(--bg-panel)] border border-white/10 rounded-[14px] p-4 shrink-0'
