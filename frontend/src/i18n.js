import en from './locales/en.json'

// One JSON file per language in ./locales, loaded when first chosen so the
// initial bundle carries English only. English is the fallback for any key a
// language does not have yet, and a missing key renders as the key itself
// (which makes a forgotten string visible instead of blank).
//
// Languages are the official languages of the Indian states and union
// territories. The non-English files are machine translations and have not
// been reviewed by native speakers (see MD/RULES.md).
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'mr', label: 'मराठी' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'bn', label: 'বাংলা' },
  { code: 'te', label: 'తెలుగు' },
  { code: 'kn', label: 'ಕನ್ನಡ' },
  { code: 'ml', label: 'മലയാളം' },
  { code: 'gu', label: 'ગુજરાતી' },
  { code: 'pa', label: 'ਪੰਜਾਬੀ' },
  { code: 'or', label: 'ଓଡ଼ିଆ' },
  { code: 'as', label: 'অসমীয়া' },
  { code: 'ur', label: 'اردو', rtl: true },
  { code: 'ne', label: 'नेपाली' },
  { code: 'kok', label: 'कोंकणी' },
  { code: 'mni', label: 'ꯃꯩꯇꯩꯂꯣꯟ' },
  { code: 'brx', label: 'बड़ो' },
  { code: 'ks', label: 'کٲشُر', rtl: true },
  { code: 'doi', label: 'डोगरी' },
  { code: 'lus', label: 'Mizo' },
  { code: 'kha', label: 'Khasi' },
  { code: 'trp', label: 'Kokborok' },
]

const loaders = import.meta.glob(['./locales/*.json', '!./locales/en.json'])
const bundles = { en }

export async function loadLanguage(code) {
  if (bundles[code]) return true
  const load = loaders[`./locales/${code}.json`]
  if (!load) return false
  try {
    bundles[code] = (await load()).default
    return true
  } catch {
    return false
  }
}

export const isRtl = (code) => Boolean(LANGUAGES.find((l) => l.code === code)?.rtl)

export function t(key, lang) {
  return bundles[lang]?.[key] ?? bundles.en[key] ?? key
}

// Translate a value that comes from the data (a status, a priority, an
// entity type) through a prefixed key, and show the raw value if there is no
// translation for it.
export function tv(prefix, value, lang) {
  const key = `${prefix}_${value}`
  const out = t(key, lang)
  return out === key ? value : out
}
