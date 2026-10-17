import { FileText, BarChart3 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DashboardStats } from '@/types'
import { SEVERITY_DOT } from '@/lib/severity-colors'

interface StatsCardsProps {
  stats: DashboardStats
  isLoading?: boolean
}

const statItems = [
  {
    key: 'total' as const,
    title: 'Total Models',
    icon: FileText,
    className: 'text-blue-600',
  },
]

const riskLevelColors = {
  critical: SEVERITY_DOT.critical,
  high: SEVERITY_DOT.high,
  medium: SEVERITY_DOT.medium,
  low: SEVERITY_DOT.low,
}

export function StatsCards({ stats, isLoading }: StatsCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {statItems.map((item) => (
        <Card key={item.key}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{item.title}</CardTitle>
            <item.icon className={`h-4 w-4 ${item.className}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? (
                <span className="animate-pulse bg-muted rounded w-8 h-8 inline-block" />
              ) : (
                stats[item.key]
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Risk Summary Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Risks</CardTitle>
          <BarChart3 className="h-4 w-4 text-purple-600" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <span className="animate-pulse bg-muted rounded w-8 h-8 inline-block" />
          ) : stats.risks ? (
            <>
              <div className="text-2xl font-bold">{stats.risks.total}</div>
              {stats.risks.total > 0 && (
                <div className="flex gap-2 mt-2">
                  {(['critical', 'high', 'medium', 'low'] as const).map(
                    (level) =>
                      stats.risks![level] > 0 && (
                        <div key={level} className="flex items-center gap-1">
                          <span className={`w-2 h-2 rounded-full ${riskLevelColors[level]}`} />
                          <span className="text-xs text-muted-foreground">
                            {stats.risks![level]}
                          </span>
                        </div>
                      )
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-2xl font-bold">0</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
