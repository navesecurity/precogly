import { useState, useEffect } from 'react'
import {
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { usePackOverlays } from '@/features/libraries/api/packs'
import type { UnifiedPack } from './unified-pack'

export function ImportPackDialog({
  pack,
  open,
  onOpenChange,
  onConfirm,
}: {
  pack: UnifiedPack | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (pack: UnifiedPack, selectedOverlays: string[] | null) => void
}) {
  const { data: overlaysData, isLoading: loadingOverlays } = usePackOverlays(
    pack?.relativePath ?? null
  )
  const [selectedOverlays, setSelectedOverlays] = useState<Set<string>>(new Set())
  const isReimport = pack?.isImported ?? false

  // Reset selection when pack changes
  useEffect(() => {
    if (overlaysData?.overlays) {
      // Default: select all overlays that have their framework installed
      const availableOverlays = overlaysData.overlays
        .filter((o) => o.frameworkExists)
        .map((o) => o.frameworkId)
      setSelectedOverlays(new Set(availableOverlays))
    }
  }, [overlaysData])

  const toggleOverlay = (frameworkId: string) => {
    setSelectedOverlays((prev) => {
      const next = new Set(prev)
      if (next.has(frameworkId)) {
        next.delete(frameworkId)
      } else {
        next.add(frameworkId)
      }
      return next
    })
  }

  const handleImport = () => {
    if (!pack) return
    // If there are no overlays, pass null to load all (default behavior)
    // If there are overlays, pass the selected list
    const overlays =
      (overlaysData?.overlays.length ?? 0) > 0
        ? Array.from(selectedOverlays)
        : null
    onConfirm(pack, overlays)
  }

  const hasOverlays = (overlaysData?.overlays.length ?? 0) > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isReimport ? `Update ${pack?.name}` : `Import ${pack?.name}`}</DialogTitle>
          <DialogDescription>
            {hasOverlays
              ? 'Select which compliance framework overlays to include with this pack.'
              : isReimport
                ? `Reimport ${pack?.name} to pull in the latest changes from source.`
                : `Import ${pack?.name} to make its content available.`}
          </DialogDescription>
        </DialogHeader>

        {isReimport && (
          <div className="flex items-start gap-2 rounded-md border border-amber-600/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              This pack is already imported. Reimporting updates its content in place and
              can affect any live threat model currently using it — components, threats,
              or countermeasures removed upstream may be removed from those models too.
              Double-check before proceeding, especially against an active engagement.
            </p>
          </div>
        )}

        {(pack?.dependsOn?.length ?? 0) > 0 && (
          <div className="space-y-2 py-2">
            <p className="text-sm font-medium">Required taxonomy packs</p>
            <div className="space-y-1.5">
              {pack!.dependsOn.map((dep) => (
                <div key={dep.slug} className="flex items-center gap-2 text-sm">
                  {dep.isImported ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                  )}
                  <span>{dep.name}</span>
                  {!dep.isImported && (
                    <span className="text-xs text-amber-600">(not imported)</span>
                  )}
                </div>
              ))}
            </div>
            {pack!.dependsOn.some((d) => !d.isImported) && (
              <p className="text-xs text-amber-600">
                Import missing taxonomy packs first for full taxonomy linking.
              </p>
            )}
          </div>
        )}

        {loadingOverlays ? (
          <div className="py-4 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : hasOverlays ? (
          <div className="space-y-2 py-2">
            <p className="text-sm font-medium">Compliance mappings <span className="font-normal text-muted-foreground">— uncheck to unmap</span></p>
            {overlaysData?.overlays.some((o) => !o.frameworkExists) && (
              <p className="text-xs text-amber-600">
                Some frameworks are not imported yet. Import them first to enable their mappings.
              </p>
            )}
            <div className="space-y-3">
              {overlaysData?.overlays.map((overlay) => (
                <div
                  key={overlay.frameworkId}
                  className="flex items-start gap-3"
                >
                  <Checkbox
                    id={overlay.frameworkId}
                    checked={selectedOverlays.has(overlay.frameworkId)}
                    onCheckedChange={() => toggleOverlay(overlay.frameworkId)}
                    disabled={!overlay.frameworkExists}
                  />
                  <div className="flex-1">
                    <Label
                      htmlFor={overlay.frameworkId}
                      className={
                        !overlay.frameworkExists
                          ? 'text-muted-foreground'
                          : ''
                      }
                    >
                      {overlay.frameworkName}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {overlay.mappingCount} mappings
                      {!overlay.frameworkExists && (
                        <span className="ml-2 text-amber-600">
                          (framework not imported)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-2">
            <p className="text-sm text-muted-foreground">
              This pack includes {pack?.componentCount ?? 0} components and{' '}
              {pack?.threatCount ?? 0} threats.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport} variant={isReimport ? 'destructive' : 'default'}>
            {isReimport ? (
              <RefreshCw className="mr-2 h-4 w-4" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {isReimport ? 'Reimport' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
