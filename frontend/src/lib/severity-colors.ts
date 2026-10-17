/**
 * Severity colours for every severity, risk and criticality badge, dot and chip (docs/branding.md in the NS3E repo).
 * Word standard-palette fills used in the Nave Security reports; Critical uses the brand red. Text on a fill is white or black,
 * whichever reads better (High is white at 4.0:1 by Qu's choice). Written as literal strings so Tailwind can see them.
 * Re-applied after upstream rebases by patches/apply-severity-colors.py in the precogly-medtech-packs repo.
 */
export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info'

/** Filled pill or badge: fill, text and border. hover keeps the fill steady on shadcn badges. */
export const SEVERITY_PILL: Record<SeverityLevel, string> = {
  critical: 'bg-[#CC0000] text-white border-[#CC0000] hover:bg-[#CC0000]',
  high: 'bg-[#FF0000] text-white border-[#FF0000] hover:bg-[#FF0000]',
  medium: 'bg-[#FFC000] text-black border-[#FFC000] hover:bg-[#FFC000]',
  low: 'bg-[#92D050] text-black border-[#92D050] hover:bg-[#92D050]',
  info: 'bg-[#0070C0] text-white border-[#0070C0] hover:bg-[#0070C0]',
}

/** Small dot or bar: fill only. */
export const SEVERITY_DOT: Record<SeverityLevel, string> = {
  critical: 'bg-[#CC0000]',
  high: 'bg-[#FF0000]',
  medium: 'bg-[#FFC000]',
  low: 'bg-[#92D050]',
  info: 'bg-[#0070C0]',
}

/** Coloured text or icon on the page background: darker ink on light surfaces, lighter on dark (each at least 4.5:1). */
export const SEVERITY_TEXT: Record<SeverityLevel, string> = {
  critical: 'text-[#CC0000] dark:text-[#E04A4A]',
  high: 'text-[#E00000] dark:text-[#FF5C5C]',
  medium: 'text-[#8A6A00] dark:text-[#FFC000]',
  low: 'text-[#3A7D0A] dark:text-[#92D050]',
  info: 'text-[#0070C0] dark:text-[#4DA6FF]',
}

/** Light card tint with a matching border, for finding rows. */
export const SEVERITY_TINT: Record<SeverityLevel, string> = {
  critical: 'border-[#CC0000]/40 bg-[#CC0000]/10',
  high: 'border-[#FF0000]/40 bg-[#FF0000]/10',
  medium: 'border-[#FFC000]/50 bg-[#FFC000]/15',
  low: 'border-[#92D050]/50 bg-[#92D050]/15',
  info: 'border-[#0070C0]/40 bg-[#0070C0]/10',
}
