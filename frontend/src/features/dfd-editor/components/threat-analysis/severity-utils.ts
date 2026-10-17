import { SEVERITY_PILL } from '@/lib/severity-colors'

export const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  none: { label: 'None', color: 'bg-gray-100 text-gray-600' },
  low: { label: 'Low', color: SEVERITY_PILL.low },
  medium: { label: 'Medium', color: SEVERITY_PILL.medium },
  high: { label: 'High', color: SEVERITY_PILL.high },
  critical: { label: 'Critical', color: SEVERITY_PILL.critical },
}

export const LIKELIHOOD_OPTIONS = [
  { value: 'rare', label: 'Rare' },
  { value: 'unlikely', label: 'Unlikely' },
  { value: 'possible', label: 'Possible' },
  { value: 'likely', label: 'Likely' },
  { value: 'certain', label: 'Certain' },
] as const

export const IMPACT_OPTIONS = [
  { value: 'negligible', label: 'Negligible' },
  { value: 'minor', label: 'Minor' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'major', label: 'Major' },
  { value: 'severe', label: 'Severe' },
] as const

const LIKELIHOOD_VALUES: Record<string, number> = { rare: 1, unlikely: 2, possible: 3, likely: 4, certain: 5 }
const IMPACT_VALUES: Record<string, number> = { negligible: 1, minor: 2, moderate: 3, major: 4, severe: 5 }

export function computeSeverity(likelihood: string, impact: string): string {
  const likelihoodVal = LIKELIHOOD_VALUES[likelihood]
  const impactVal = IMPACT_VALUES[impact]
  if (!likelihoodVal || !impactVal) return 'medium'
  const normalized = Math.round((likelihoodVal * impactVal) / 25 * 100)
  if (normalized <= 25) return 'low'
  if (normalized <= 50) return 'medium'
  if (normalized <= 75) return 'high'
  return 'critical'
}

export const SEVERITY_COLORS: Record<string, string> = {
  low: SEVERITY_PILL.low,
  medium: SEVERITY_PILL.medium,
  high: SEVERITY_PILL.high,
  critical: SEVERITY_PILL.critical,
}
