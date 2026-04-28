import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Loader2, BarChart3, Code, Shield, FileText, Download, ChevronDown } from 'lucide-react'
import { useReport } from '@/features/reports/api/reports'
import type { ReportType, ReportData } from '@/features/reports/types/report'
import { getSectionsForType } from './reportConfig'
import { ExecutiveSummary } from './sections/ExecutiveSummary'
import { ScopeSection } from './sections/ScopeSection'
import { ArchitectureSection } from './sections/ArchitectureSection'
import { DataAssetsSection } from './sections/DataAssetsSection'
import { ComponentInventory } from './sections/ComponentInventory'
import { StrideSummary } from './sections/StrideSummary'
import { ThreatAnalysisSection } from './sections/ThreatAnalysisSection'
import { DismissedThreatsSection } from './sections/DismissedThreatsSection'
import { CountermeasureSection } from './sections/CountermeasureSection'
import { RiskSection } from './sections/RiskSection'
import { ComplianceSection } from './sections/ComplianceSection'
import { AssumptionsReviewSection } from './sections/AssumptionsReviewSection'
import { FindingsSection } from './sections/FindingsSection'
import { ProgressChecklistSection } from './sections/ProgressChecklistSection'
import {
  exportThreatsCSV,
  exportCountermeasuresCSV,
  exportRisksCSV,
  exportComplianceCSV,
} from './utils/csvExport'
import { exportWordDoc } from './utils/wordExport'

interface ReportViewProps {
  threatModelId: string
}

const REPORT_TYPES: Array<{
  type: ReportType
  label: string
  description: string
  icon: React.ReactNode
}> = [
  {
    type: 'executive',
    label: 'Executive',
    description: 'High-level overview for leadership',
    icon: <BarChart3 className="h-5 w-5" />,
  },
  {
    type: 'technical',
    label: 'Technical',
    description: 'Detailed analysis for engineers',
    icon: <Code className="h-5 w-5" />,
  },
  {
    type: 'compliance',
    label: 'Compliance',
    description: 'Framework coverage and gaps',
    icon: <Shield className="h-5 w-5" />,
  },
  {
    type: 'full',
    label: 'Full Report',
    description: 'Complete threat model report',
    icon: <FileText className="h-5 w-5" />,
  },
]

function renderSection(sectionId: string, depth: string, data: ReportData) {
  switch (sectionId) {
    case 'executiveSummary':
      return <ExecutiveSummary data={data} />
    case 'scope':
      return <ScopeSection scope={data.scope} depth={depth as any} />
    case 'architecture':
      return <ArchitectureSection architecture={data.architecture} />
    case 'dataAssets':
      return <DataAssetsSection dataAssets={data.dataAssets} depth={depth as any} />
    case 'components':
      return <ComponentInventory components={data.components} dataFlows={data.dataFlows} />
    case 'strideSummary':
      return <StrideSummary threatAnalysis={data.threatAnalysis} />
    case 'threatDetail':
      return <ThreatAnalysisSection threatAnalysis={data.threatAnalysis} />
    case 'dismissedThreats':
      return <DismissedThreatsSection dismissedThreats={data.threatAnalysis.dismissedThreats} />
    case 'countermeasureStatus':
    case 'gaps':
    case 'waived':
    case 'inherited':
      return (
        <CountermeasureSection
          summary={data.countermeasureSummary}
          depth={depth as any}
          sectionId={sectionId}
        />
      )
    case 'risks':
      return <RiskSection risks={data.risks} depth={depth as any} />
    case 'compliance':
      return <ComplianceSection compliance={data.compliance} depth={depth as any} />
    case 'assumptions':
      return <AssumptionsReviewSection scope={data.scope} depth={depth as any} />
    case 'findings':
      return <FindingsSection data={data} depth={depth as any} />
    case 'progressChecklist':
      return <ProgressChecklistSection progressChecklist={data.progressChecklist} />
    default:
      return null
  }
}

export function ReportView({ threatModelId }: ReportViewProps) {
  const [reportType, setReportType] = useState<ReportType>('executive')
  const { data, isLoading, error } = useReport(threatModelId)
  const sections = getSectionsForType(reportType)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 p-4 border-b">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {REPORT_TYPES.map((rt) => (
            <Card
              key={rt.type}
              className={`cursor-pointer transition-colors ${
                reportType === rt.type
                  ? 'ring-2 ring-primary bg-primary/5'
                  : 'hover:bg-muted/50'
              }`}
              onClick={() => setReportType(rt.type)}
            >
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  {rt.icon}
                  <span className="font-medium text-sm">{rt.label}</span>
                </div>
                <p className="text-xs text-muted-foreground">{rt.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading report data...</span>
          </div>
        )}
        {error && (
          <div className="text-center py-12">
            <p className="text-destructive">Failed to load report data.</p>
            <p className="text-sm text-muted-foreground mt-1">
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        )}
        {data && (
          <div className="space-y-4 max-w-5xl mx-auto">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{data.metadata.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-muted-foreground">
                    {REPORT_TYPES.find((rt) => rt.type === reportType)?.label} Report
                  </span>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Download className="h-4 w-4" />
                    Export CSV
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => exportThreatsCSV(data, data.metadata.name)}>
                    Threats
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportCountermeasuresCSV(data, data.metadata.name)}>
                    Countermeasures
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportRisksCSV(data, data.metadata.name)}>
                    Risks
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportComplianceCSV(data, data.metadata.name)}>
                    Compliance Coverage
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportWordDoc(data, data.metadata.name)}>
                    Full Report (Word)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {sections.map((section) => (
              <div key={section.id}>
                {renderSection(section.id, section.depth, data)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
