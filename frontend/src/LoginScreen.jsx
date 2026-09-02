import { useState } from 'react'
import { t } from './i18n'

export default function LoginScreen({ lang, onLogin }) {
  const [name, setName] = useState('')

  function submit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onLogin(trimmed)
  }

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--navy-950)' }}>
      <div style={{ background: 'var(--police-blue)' }} className="px-6 py-1.5 text-center">
        <span className="text-[11px] tracking-wide text-blue-100">
          {t('orgLine1', lang)} &middot; {t('orgLine2', lang)}
        </span>
      </div>
      <div className="cyber-rule" />

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div
            className="border rounded-sm"
            style={{ background: 'var(--navy-800)', borderColor: 'rgba(255,255,255,0.1)' }}
          >
            <div className="px-6 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <h1 className="text-lg font-semibold text-white">CrimeLink</h1>
              <p className="text-xs text-gray-500 mt-0.5">{t('loginSubtitle', lang)}</p>
            </div>

            <form onSubmit={submit} className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs text-gray-400 font-medium">
                  {t('investigatorName', lang)}
                </label>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('investigatorNamePlaceholder', lang)}
                  className="mt-1.5 w-full rounded-sm px-3 py-2 text-sm text-gray-200 focus:outline-none"
                  style={{ background: 'var(--navy-700)', border: '1px solid rgba(255,255,255,0.12)' }}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--cyber-blue)')}
                  onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
                />
              </div>

              <button
                type="submit"
                disabled={!name.trim()}
                className="w-full text-sm font-medium py-2 rounded-sm transition-colors disabled:cursor-not-allowed"
                style={{
                  background: name.trim() ? 'var(--cyber-blue)' : 'var(--navy-700)',
                  color: name.trim() ? '#ffffff' : '#6b7280',
                }}
              >
                {t('loginButton', lang)}
              </button>
            </form>

            <div
              className="px-6 py-2.5 border-t text-[11px] text-gray-500 leading-relaxed"
              style={{ borderColor: 'rgba(255,255,255,0.08)' }}
            >
              {t('loginNote', lang)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
