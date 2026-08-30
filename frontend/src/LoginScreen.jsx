import { useState } from 'react'
import { motion } from 'motion/react'
import { t } from './i18n'

function ShieldIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path
        d="M12 2.5 4 5.5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10v-6L12 2.5Z"
        strokeLinejoin="round"
      />
      <path d="M8.5 12.2 11 14.7l4.5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function LoginScreen({ lang, onLogin }) {
  const [name, setName] = useState('')

  function submit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onLogin(trimmed)
  }

  return (
    <div
      className="h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--navy-950)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        <div className="tricolor-rule rounded-t-md" />
        <div
          className="border border-t-0 rounded-b-md px-8 py-9"
          style={{ background: 'var(--navy-900)', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <div className="flex items-center gap-3 mb-1">
            <span
              className="flex items-center justify-center w-11 h-11 rounded-md shrink-0"
              style={{ background: 'var(--navy-800)', color: 'var(--saffron)', border: '1px solid rgba(255,153,51,0.35)' }}
            >
              <ShieldIcon />
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-white">CrimeLink</h1>
              <p className="text-xs text-gray-500">{t('orgLine1', lang)}</p>
            </div>
          </div>

          <p className="text-sm text-gray-400 mt-5 mb-6">{t('loginSubtitle', lang)}</p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-gray-500 font-medium">
                {t('investigatorName', lang)}
              </label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('investigatorNamePlaceholder', lang)}
                className="mt-2 w-full rounded-md p-2.5 text-sm text-gray-200 focus:outline-none focus:ring-1 transition-shadow"
                style={{
                  background: 'var(--navy-800)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
                onFocus={(e) => (e.target.style.boxShadow = '0 0 0 1px var(--saffron)')}
                onBlur={(e) => (e.target.style.boxShadow = 'none')}
              />
            </div>

            <button
              type="submit"
              disabled={!name.trim()}
              className="w-full font-semibold py-2.5 rounded-md transition-colors disabled:cursor-not-allowed"
              style={{
                background: name.trim() ? 'var(--saffron)' : 'var(--navy-700)',
                color: name.trim() ? '#1a1206' : '#6b7280',
              }}
            >
              {t('loginButton', lang)}
            </button>
          </form>

          <div
            className="mt-6 text-xs text-gray-500 rounded-md px-3 py-2.5 leading-relaxed"
            style={{ background: 'var(--navy-800)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            {t('loginNote', lang)}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
