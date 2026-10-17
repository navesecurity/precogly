import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ReportRisk } from '@/features/reports/types/report'
import type { SectionDepth } from '../reportConfig'
import { ReportSection } from '../ReportSection'
import { SEVERITY_PILL } from '@/lib/severity-colors'

interface RiskSectionProps {
  risks: ReportRisk[]
  depth: SectionDepth
}

const LEVEL_COLORS: Record<string, string> = {
  critical: SEVERITY_PILL.critical,
  high: SEVERITY_PILL.high,
  medium: SEVERITY_PILL.medium,
  low: SEVERITY_PILL.low,
}

function RiskRow({ risk, depth }: { risk: ReportRisk; depth: SectionDepth }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={() => setExpanded(!expanded)}
      >
        <TableCell>
          <div className="flex items-center gap-1">
            {depth === 'full' && (
              expanded
                ? <ChevronDown className="h-3 w-3" />
                : <ChevronRight className="h-3 w-3" />
            )}
            <span className="font-medium">{risk.name}</span>
          </div>
        </TableCell>
        <TableCell>
          <Badge className={LEVEL_COLORS[risk.inherentLevel] || ''} variant="outline">
            {risk.inherentLevel} ({risk.inherentScore})
          </Badge>
        </TableCell>
        <TableCell>
          <Badge className={LEVEL_COLORS[risk.residualLevel] || ''}>
            {risk.residualLevel} ({risk.residualScore})
          </Badge>
        </TableCell>
        <TableCell>{risk.ownerEmail || '—'}</TableCell>
      </TableRow>
      {expanded && depth === 'full' && (
        <TableRow>
          <TableCell colSpan={4} className="bg-muted/30">
            <div className="space-y-2 py-1">
              {risk.description && (
                <p className="text-sm text-muted-foreground">{risk.description}</p>
              )}
              {risk.contributingThreats.length > 0 && (
                <div>
                  <span className="text-xs font-medium">Contributing Threats:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {risk.contributingThreats.map((threat, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {threat.threatName} ({threat.status})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

export function RiskSection({ risks, depth }: RiskSectionProps) {
  if (risks.length === 0) {
    return (
      <ReportSection title="Risk Register">
        <p className="text-sm text-muted-foreground">No risks defined.</p>
      </ReportSection>
    )
  }

  return (
    <ReportSection title={`Risk Register (${risks.length})`}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Risk</TableHead>
            <TableHead>Inherent</TableHead>
            <TableHead>Residual</TableHead>
            <TableHead>Owner</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {risks.map((risk) => (
            <RiskRow key={risk.id} risk={risk} depth={depth} />
          ))}
        </TableBody>
      </Table>
    </ReportSection>
  )
}
