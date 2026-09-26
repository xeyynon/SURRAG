// Chart colours. Two jobs, kept apart:
//   HEAT   - one hue, dark to bright, for "how much" (the India map and the
//            state ranking share it so the legend reads the same everywhere)
//   SERIES - separate hues for "which kind" (crime types), so categories are
//            told apart by colour and never by brightness alone
export const HEAT = ['#5a4a2a', '#7d6230', '#a07a2f', '#c8973a', '#f0cd7f']
export const SERIES = ['#e0b04f', '#5fb3b3', '#a58fd6', '#f43f5e', '#4ade80', '#60a5fa', '#f97316']
export const SELECTED = '#5fb3b3'

// sqrt scaling so one very large state does not flatten the rest into the
// darkest step.
export function heatColor(value, max) {
  if (!value || max <= 0) return HEAT[0]
  const t = Math.sqrt(value / max)
  return HEAT[Math.min(HEAT.length - 1, Math.floor(t * HEAT.length))]
}
