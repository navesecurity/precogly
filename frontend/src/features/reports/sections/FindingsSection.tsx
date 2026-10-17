import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import type { ReportData } from '@/features/reports/types/report'
import type { SectionDepth } from '../reportConfig'
import { ReportSection } from '../ReportSection'
import { SEVERITY_TEXT, SEVERITY_TINT } from '@/lib/severity-colors'

interface FindingsSectionProps {
  data: ReportData
  depth: SectionDepth
}

export function FindingsSection({ data, depth }: FindingsSectionProps) {
  const { summaryMetrics, countermeasureSummary } = data

  // Derive findings
  const findings: Array<{
    severity: 'critical' | 'high' | 'medium' | 'info'
    title: string
    detail: string
  }> = []

  // Exposed threats
  const exposedCount = summaryMetrics.threatsByStatus?.exposed || 0
  if (exposedCount > 0) {
    findings.push({
      severity: exposedCount > 5 ? 'critical' : 'high',
      title: `${exposedCount} exposed threat${exposedCount !== 1 ? 's' : ''}`,
      detail: 'Threats with unaddressed countermeasure gaps requiring attention.',
    })
  }

  // Critical gaps
  const criticalGaps = countermeasureSummary.gaps.filter((g) => g.priority === 'critical')
  if (criticalGaps.length > 0) {
    findings.push({
      severity: 'critical',
      title: `${criticalGaps.length} critical-priority gap${criticalGaps.length !== 1 ? 's' : ''}`,
      detail: criticalGaps.map((g) => g.countermeasureName).join(', '),
    })
  }

  // High-risk items
  const highRisks = data.risks.filter((r) => r.residualLevel === 'critical' || r.residualLevel === 'high')
  if (highRisks.length > 0) {
    findings.push({
      severity: 'high',
      title: `${highRisks.length} high/critical residual risk${highRisks.length !== 1 ? 's' : ''}`,
      detail: highRisks.map((r) => r.name).join(', '),
    })
  }

  // Unconfirmed assumptions
  const unconfirmedAssumptions = data.scope.assumptions.filter((a) => a.validity === 'unconfirmed')
  if (unconfirmedAssumptions.length > 0) {
    findings.push({
      severity: 'medium',
      title: `${unconfirmedAssumptions.length} unconfirmed assumption${unconfirmedAssumptions.length !== 1 ? 's' : ''}`,
      detail: 'Assumptions that may affect threat model validity if invalid.',
    })
  }

  // Compliance gaps
  if (depth === 'compliance') {
    const lowCoverageFrameworks = data.compliance.frameworks.filter((fw) => fw.coveragePercentage < 50)
    if (lowCoverageFrameworks.length > 0) {
      findings.push({
        severity: 'high',
        title: `${lowCoverageFrameworks.length} framework${lowCoverageFrameworks.length !== 1 ? 's' : ''} with <50% coverage`,
        detail: lowCoverageFrameworks.map((fw) => `${fw.name} (${fw.coveragePercentage}%)`).join(', '),
      })
    }
  }

  // Waived countermeasures
  if (summaryMetrics.totalWaived > 0) {
    findings.push({
      severity: 'info',
      title: `${summaryMetrics.totalWaived} waived countermeasure${summaryMetrics.totalWaived !== 1 ? 's' : ''}`,
      detail: 'Risk accepted for these countermeasures.',
    })
  }

  // No mitigated threats is a positive finding
  const mitigatedCount = summaryMetrics.threatsByStatus?.mitigated || 0
  if (mitigatedCount > 0) {
    findings.push({
      severity: 'info',
      title: `${mitigatedCount} fully mitigated threat${mitigatedCount !== 1 ? 's' : ''}`,
      detail: 'Threats with all countermeasures verified or at platform level.',
    })
  }

  // Filter based on depth
  const filteredFindings = depth === 'critical'
    ? findings.filter((f) => f.severity === 'critical' || f.severity === 'high')
    : findings

  const SEVERITY_ICONS = {
    critical: <XCircle className={`h-4 w-4 shrink-0 ${SEVERITY_TEXT.critical}`} />,
    high: <AlertTriangle className={`h-4 w-4 shrink-0 ${SEVERITY_TEXT.high}`} />,
    medium: <AlertTriangle className={`h-4 w-4 shrink-0 ${SEVERITY_TEXT.medium}`} />,
    info: <CheckCircle className={`h-4 w-4 shrink-0 ${SEVERITY_TEXT.info}`} />,
  }

  const SEVERITY_BG: Record<string, string> = {
    critical: SEVERITY_TINT.critical,
    high: SEVERITY_TINT.high,
    medium: SEVERITY_TINT.medium,
    info: SEVERITY_TINT.info,
  }

  return (
    <ReportSection title="Findings & Action Items">
      {filteredFindings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No significant findings.</p>
      ) : (
        <div className="space-y-2">
          {filteredFindings.map((finding, index) => (
            <div
              key={index}
              className={`flex items-start gap-3 p-3 rounded border ${SEVERITY_BG[finding.severity] || ''}`}
            >
              {SEVERITY_ICONS[finding.severity]}
              <div>
                <div className="font-medium text-sm">{finding.title}</div>
                <div className="text-xs text-muted-foreground">{finding.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </ReportSection>
  )
}
