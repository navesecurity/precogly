import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { ReportData } from '@/features/reports/types/report'
import { ReportSection } from '../ReportSection'
import { SEVERITY_PILL } from '@/lib/severity-colors'

interface ExecutiveSummaryProps {
  data: ReportData
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: SEVERITY_PILL.critical,
  high: SEVERITY_PILL.high,
  medium: SEVERITY_PILL.medium,
  low: SEVERITY_PILL.low,
}

const STATUS_COLORS: Record<string, string> = {
  exposed: 'bg-red-100 text-red-700',
  addressable: 'bg-yellow-100 text-yellow-700',
  mitigated: 'bg-green-100 text-green-700',
}

export function ExecutiveSummary({ data }: ExecutiveSummaryProps) {
  const { metadata, summaryMetrics } = data

  return (
    <ReportSection title="Executive Summary">
      <div className="space-y-6">
        {/* Model info */}
        <div className="flex flex-wrap gap-2">
          <Badge className={SEVERITY_COLORS[metadata.criticality] || ''}>
            {metadata.criticality} criticality
          </Badge>
          {metadata.frameworks.map((fw) => (
            <Badge key={fw.slug} variant="secondary">{fw.name}</Badge>
          ))}
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{summaryMetrics.totalActiveThreats}</div>
              <div className="text-sm text-muted-foreground">Active Threats</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{summaryMetrics.totalCountermeasures}</div>
              <div className="text-sm text-muted-foreground">Countermeasures</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-red-600">{summaryMetrics.totalGaps}</div>
              <div className="text-sm text-muted-foreground">Open Gaps</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{summaryMetrics.totalRisks}</div>
              <div className="text-sm text-muted-foreground">Risks</div>
            </CardContent>
          </Card>
        </div>

        {/* Threat status breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium mb-2">Threats by Status</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(summaryMetrics.threatsByStatus).map(([status, count]) => (
                <Badge key={status} className={STATUS_COLORS[status] || 'bg-gray-100 text-gray-700'}>
                  {status}: {count}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <h4 className="font-medium mb-2">Risks by Level</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(summaryMetrics.risksByLevel).map(([level, count]) => (
                <Badge key={level} className={SEVERITY_COLORS[level] || 'bg-gray-100 text-gray-700'}>
                  {level}: {count}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>
    </ReportSection>
  )
}
