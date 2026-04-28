import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  WidthType,
  ShadingType,
  PageBreak,
  LevelFormat,
} from 'docx'
import type { ReportData, ReportThreat } from '../types/report'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// US Letter, 1" margins — content width 9360 DXA
const CONTENT_WIDTH = 9360
const CELL_BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
const CELL_BORDERS = {
  top: CELL_BORDER,
  bottom: CELL_BORDER,
  left: CELL_BORDER,
  right: CELL_BORDER,
}
const CELL_MARGINS = { top: 80, bottom: 80, left: 120, right: 120 }
const HEADER_FILL = { fill: 'D5E8F0', type: ShadingType.CLEAR }

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

async function downloadDocx(doc: Document, filename: string): Promise<void> {
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

// ---------------------------------------------------------------------------
// Primitive builders
// ---------------------------------------------------------------------------

function h1(text: string): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] })
}

function h2(text: string): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] })
}

function h3(text: string): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] })
}

function para(text: string, options?: { bold?: boolean; italic?: boolean; size?: number }): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: options?.bold,
        italics: options?.italic,
        size: options?.size,
      }),
    ],
  })
}

function placeholder(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: `[${text}]`,
        italics: true,
        color: '888888',
      }),
    ],
  })
}

function spacer(): Paragraph {
  return new Paragraph({ children: [new TextRun('')] })
}

function pageBreak(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] })
}

// ---------------------------------------------------------------------------
// Table builders
// ---------------------------------------------------------------------------

function headerCell(text: string, width: number): TableCell {
  return new TableCell({
    borders: CELL_BORDERS,
    width: { size: width, type: WidthType.DXA },
    shading: HEADER_FILL,
    margins: CELL_MARGINS,
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true })],
      }),
    ],
  })
}

function dataCell(text: string, width: number): TableCell {
  return new TableCell({
    borders: CELL_BORDERS,
    width: { size: width, type: WidthType.DXA },
    margins: CELL_MARGINS,
    children: [new Paragraph({ children: [new TextRun(text ?? '')] })],
  })
}

function buildTable(
  columnWidths: number[],
  headers: string[],
  rows: string[][],
): Table {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths,
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => headerCell(h, columnWidths[i])),
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: row.map((cell, i) => dataCell(cell, columnWidths[i])),
          }),
      ),
    ],
  })
}

// ---------------------------------------------------------------------------
// Flatten helpers (mirrors csvExport.ts)
// ---------------------------------------------------------------------------

type ThreatWithContext = { threat: ReportThreat; context: string }

function flattenThreats(data: ReportData): ThreatWithContext[] {
  const out: ThreatWithContext[] = []
  for (const [context, threats] of Object.entries(data.threatAnalysis.componentThreats)) {
    for (const threat of threats) out.push({ threat, context })
  }
  for (const [context, threats] of Object.entries(data.threatAnalysis.dataFlowThreats)) {
    for (const threat of threats) out.push({ threat, context })
  }
  return out
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildMetadataSection(data: ReportData): (Paragraph | Table)[] {
  const m = data.metadata
  const rows = [
    ['Threat Model Name', m.name],
    ['Criticality', m.criticality],
    ['Risk Scoring Method', m.riskScoringMethod],
    ['Owning Team', m.owningTeam ?? '—'],
    ['Created By', m.createdBy ?? '—'],
    ['Created', m.createdAt ?? '—'],
    ['Last Updated', m.updatedAt ?? '—'],
    ['Frameworks', m.frameworks.map((f) => f.name).join(', ') || '—'],
  ]

  return [
    h1('1. Document Information'),
    spacer(),
    buildTable([3000, 6360], ['Field', 'Value'], rows),
    spacer(),
  ]
}

function buildSummarySection(data: ReportData): (Paragraph | Table)[] {
  const s = data.summaryMetrics
  const statusRows = Object.entries(s.threatsByStatus).map(([k, v]) => [k, String(v)])
  const cmRows = Object.entries(s.countermeasuresByStatus).map(([k, v]) => [k, String(v)])
  const riskRows = Object.entries(s.risksByLevel).map(([k, v]) => [k, String(v)])

  return [
    h1('2. Executive Summary'),
    spacer(),
    h2('2.1 Summary Metrics'),
    spacer(),
    buildTable(
      [4680, 4680],
      ['Metric', 'Count'],
      [
        ['Total Active Threats', String(s.totalActiveThreats)],
        ['Total Dismissed Threats', String(s.totalDismissedThreats)],
        ['Total Countermeasures', String(s.totalCountermeasures)],
        ['Open Gaps', String(s.totalGaps)],
        ['Waived Countermeasures', String(s.totalWaived)],
        ['Inherited Countermeasures', String(s.totalInherited)],
        ['Total Risks', String(s.totalRisks)],
      ],
    ),
    spacer(),
    h2('2.2 Threat Status Breakdown'),
    spacer(),
    buildTable([4680, 4680], ['Status', 'Count'], statusRows),
    spacer(),
    h2('2.3 Countermeasure Status Breakdown'),
    spacer(),
    buildTable([4680, 4680], ['Status', 'Count'], cmRows),
    spacer(),
    ...(riskRows.length > 0
      ? [
          h2('2.4 Risk Level Breakdown') as Paragraph | Table,
          spacer(),
          buildTable([4680, 4680], ['Level', 'Count'], riskRows),
          spacer(),
        ]
      : []),
    h2('2.5 STRIDE Distribution'),
    spacer(),
    buildTable(
      [4680, 4680],
      ['STRIDE Category', 'Count'],
      Object.entries(data.threatAnalysis.strideSummary).map(([k, v]) => [k, String(v)]),
    ),
    spacer(),
  ]
}

function buildScopeSection(data: ReportData): (Paragraph | Table)[] {
  const scope = data.scope
  const children: (Paragraph | Table)[] = [
    h1('3. Scope'),
    spacer(),
    h2('3.1 Scope Description'),
    para(scope.description || '—'),
    spacer(),
  ]

  if (scope.assumptions.length > 0) {
    children.push(
      h2('3.2 Assumptions'),
      spacer(),
      buildTable(
        [4500, 1800, 3060],
        ['Assumption', 'Validity', 'Topics'],
        scope.assumptions.map((a) => [
          a.description,
          a.validity,
          a.topics.join(', '),
        ]),
      ),
      spacer(),
    )
  }

  if (scope.outOfScopeItems.length > 0) {
    children.push(
      h2('3.3 Out of Scope'),
      spacer(),
      buildTable(
        [3120, 6240],
        ['Item', 'Reason'],
        scope.outOfScopeItems.map((i) => [i.name, i.reason]),
      ),
      spacer(),
    )
  }

  return children
}

function buildArchitectureSection(data: ReportData): (Paragraph | Table)[] {
  const arch = data.architecture
  const children: (Paragraph | Table)[] = [h1('4. System Architecture'), spacer()]

  // DFD inventory table
  if (arch.dfds.length > 0) {
    children.push(
      h2('4.1 Data Flow Diagrams'),
      spacer(),
      buildTable(
        [3240, 1800, 720, 720, 2880],
        ['Diagram Name', 'Type', 'Nodes', 'Edges', 'Notes'],
        arch.dfds.map((dfd) => [
          dfd.name,
          dfd.diagramType,
          String(dfd.nodeCount),
          String(dfd.edgeCount),
          dfd.isPrimary ? 'Primary DFD' : 'Reference DFD',
        ]),
      ),
      spacer(),
    )

    // Per-DFD placeholder + node inventory
    arch.dfds.forEach((dfd, idx) => {
      children.push(
        h3(`Figure ${idx + 1}: ${dfd.name}${dfd.isPrimary ? ' (Primary)' : ''}`),
        placeholder(`Insert DFD diagram screenshot here — ${dfd.name}`),
        spacer(),
      )

      // If canvasData has nodes, extract a component inventory
      const nodes = (dfd.canvasData as any)?.nodes
      if (Array.isArray(nodes) && nodes.length > 0) {
        const nodeRows = nodes
          .filter((n: any) => n?.data)
          .map((n: any) => [
            n.data?.label ?? n.data?.name ?? n.id ?? '—',
            n.type ?? '—',
          ])
        if (nodeRows.length > 0) {
          children.push(
            para('Component nodes in this diagram:', { italic: true }),
            buildTable([4680, 4680], ['Node Label', 'Type'], nodeRows),
            spacer(),
          )
        }
      }
    })
  }

  // Trust Zones
  if (arch.trustZones.length > 0) {
    children.push(
      h2('4.2 Trust Zones'),
      spacer(),
      buildTable(
        [2400, 1200, 5760],
        ['Zone Name', 'Trust Level', 'Description'],
        arch.trustZones.map((z) => [z.name, String(z.trustLevel), z.description]),
      ),
      spacer(),
    )
  }

  // Trust Boundaries
  if (arch.trustBoundaries.length > 0) {
    children.push(
      h2('4.3 Trust Boundaries'),
      spacer(),
      buildTable(
        [3120, 3120, 3120],
        ['Boundary', 'Zone A', 'Zone B'],
        arch.trustBoundaries.map((b) => [b.label, b.zoneA, b.zoneB]),
      ),
      spacer(),
    )
  }

  // Reference Images
  if (arch.referenceImages.length > 0) {
    children.push(
      h2('4.4 Reference Images'),
      spacer(),
      buildTable(
        [4680, 4680],
        ['Filename', 'Description'],
        arch.referenceImages.map((img) => [img.filename, img.description]),
      ),
      spacer(),
    )
  }

  return children
}

function buildDataAssetsSection(data: ReportData): (Paragraph | Table)[] {
  if (data.dataAssets.length === 0) return []

  return [
    h1('5. Data Assets'),
    spacer(),
    buildTable(
      [1800, 1440, 1260, 1260, 1260, 2340],
      ['Name', 'Classification', 'Confidentiality', 'Integrity', 'Availability', 'Description'],
      data.dataAssets.map((a) => [
        a.name,
        a.classification,
        a.confidentiality,
        a.integrity,
        a.availability,
        a.description,
      ]),
    ),
    spacer(),
  ]
}

function buildComponentsSection(data: ReportData): (Paragraph | Table)[] {
  const c = data.components
  const allComponents = [
    ...c.processes.map((p) => ({ ...p, _type: 'Process' })),
    ...c.dataStores.map((p) => ({ ...p, _type: 'Data Store' })),
    ...c.humanActors.map((p) => ({ ...p, _type: 'Human Actor' })),
    ...c.systemActors.map((p) => ({ ...p, _type: 'System Actor' })),
  ]

  if (allComponents.length === 0) return []

  return [
    h1('6. Component Inventory'),
    spacer(),
    buildTable(
      [2400, 1440, 1440, 1440, 2640],
      ['Name', 'Type', 'Category', 'Trust Zone', 'Description'],
      allComponents.map((c) => [
        c.name,
        c._type,
        c.category,
        c.trustZone ?? '—',
        c.description,
      ]),
    ),
    spacer(),
  ]
}

function buildThreatAnalysisSection(data: ReportData): (Paragraph | Table)[] {
  const allThreats = flattenThreats(data)
  if (allThreats.length === 0) return []

  const children: (Paragraph | Table)[] = [
    h1('7. Threat Analysis'),
    spacer(),
    para(
      `This section documents ${allThreats.length} identified threats across all system components and data flows.`,
    ),
    spacer(),
    buildTable(
      [3240, 2160, 960, 960, 960, 1080],
      ['Threat Name', 'Component / Data Flow', 'STRIDE', 'Inherent Severity', 'Status', 'CMs'],
      allThreats.map(({ threat, context }) => [
        threat.threatName,
        context,
        threat.strideCategory ?? '—',
        threat.inherentSeverity,
        threat.status,
        String(threat.countermeasures.length),
      ]),
    ),
    spacer(),
  ]

  // Dismissed threats
  if (data.threatAnalysis.dismissedThreats.length > 0) {
    children.push(
      h2('7.1 Dismissed Threats'),
      spacer(),
      buildTable(
        [3240, 2880, 3240],
        ['Threat Name', 'Component / Data Flow', 'Dismissal Reason'],
        data.threatAnalysis.dismissedThreats.map((t) => [
          t.threatName,
          t.componentName ?? t.flowLabel ?? '—',
          t.dismissalReason,
        ]),
      ),
      spacer(),
    )
  }

  return children
}

function buildCountermeasuresSection(data: ReportData): (Paragraph | Table)[] {
  const allThreats = flattenThreats(data)
  const rows: string[][] = []

  for (const { threat, context } of allThreats) {
    for (const cm of threat.countermeasures) {
      rows.push([
        cm.countermeasureName,
        cm.controlType,
        cm.status,
        cm.priority,
        cm.isInherited
          ? `Yes — ${cm.inheritedFromComponentName ?? cm.inheritedFromZoneName ?? ''}`
          : 'No',
        threat.threatName,
        context,
      ])
    }
  }

  if (rows.length === 0) return []

  const children: (Paragraph | Table)[] = [
    h1('8. Countermeasures'),
    spacer(),
    buildTable(
      [2160, 1080, 900, 780, 1440, 1440, 1560],
      ['Countermeasure', 'Control Type', 'Status', 'Priority', 'Inherited', 'Associated Threat', 'Component'],
      rows,
    ),
    spacer(),
  ]

  // Gaps
  if (data.countermeasureSummary.gaps.length > 0) {
    children.push(
      h2('8.1 Open Gaps'),
      spacer(),
      buildTable(
        [3240, 2160, 1440, 2520],
        ['Countermeasure', 'Component / Data Flow', 'Priority', 'Assigned Owner'],
        data.countermeasureSummary.gaps.map((g) => [
          g.countermeasureName,
          g.componentName ?? g.flowLabel ?? '—',
          g.priority,
          g.assignedOwnerEmail ?? 'Unassigned',
        ]),
      ),
      spacer(),
    )
  }

  return children
}

function buildRisksSection(data: ReportData): (Paragraph | Table)[] {
  if (data.risks.length === 0) return []

  return [
    h1('9. Risk Register'),
    spacer(),
    buildTable(
      [2160, 1200, 1200, 1200, 1200, 2400],
      ['Risk Name', 'Inherent Score', 'Inherent Level', 'Residual Score', 'Residual Level', 'Owner'],
      data.risks.map((r) => [
        r.name,
        String(r.inherentScore),
        r.inherentLevel,
        String(r.residualScore),
        r.residualLevel,
        r.ownerEmail ?? 'Unassigned',
      ]),
    ),
    spacer(),
  ]
}

function buildComplianceSection(data: ReportData): (Paragraph | Table)[] {
  if (data.compliance.frameworks.length === 0) return []

  return [
    h1('10. Compliance Coverage'),
    spacer(),
    buildTable(
      [3240, 1680, 1680, 2760],
      ['Framework', 'Total Requirements', 'Covered', 'Coverage %'],
      data.compliance.frameworks.map((fw) => [
        fw.name,
        String(fw.totalRequirements),
        String(fw.coveredRequirements),
        `${fw.coveragePercentage.toFixed(1)}%`,
      ]),
    ),
    spacer(),
  ]
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function exportWordDoc(data: ReportData, modelName: string): Promise<void> {
  const children: (Paragraph | Table)[] = [
    // Title page
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: modelName })],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: 'Cybersecurity Threat Model — Full Report',
          size: 28,
          color: '444444',
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
          size: 24,
          color: '888888',
        }),
      ],
    }),
    spacer(),
    placeholder('This document is auto-generated. Review all sections and insert DFD diagrams before submission.'),
    pageBreak(),

    // Sections
    ...buildMetadataSection(data),
    pageBreak(),
    ...buildSummarySection(data),
    pageBreak(),
    ...buildScopeSection(data),
    pageBreak(),
    ...buildArchitectureSection(data),
    pageBreak(),
    ...buildDataAssetsSection(data),
    pageBreak(),
    ...buildComponentsSection(data),
    pageBreak(),
    ...buildThreatAnalysisSection(data),
    pageBreak(),
    ...buildCountermeasuresSection(data),
    pageBreak(),
    ...buildRisksSection(data),
    pageBreak(),
    ...buildComplianceSection(data),
  ]

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Arial', size: 22 } }, // 11pt
      },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 32, bold: true, font: 'Arial', color: '1F3864' },
          paragraph: { spacing: { before: 360, after: 120 }, outlineLevel: 0 },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 26, bold: true, font: 'Arial', color: '2E74B5' },
          paragraph: { spacing: { before: 240, after: 80 }, outlineLevel: 1 },
        },
        {
          id: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 24, bold: true, font: 'Arial', color: '444444' },
          paragraph: { spacing: { before: 180, after: 60 }, outlineLevel: 2 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: 'bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '\u2022',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children,
      },
    ],
  })

  await downloadDocx(doc, `${slugify(modelName)}-threat-model-report.docx`)
}
