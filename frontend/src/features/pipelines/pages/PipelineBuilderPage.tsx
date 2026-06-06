import { ReactFlowProvider } from 'reactflow'

import { PipelineCanvas } from '@/features/pipelines/components/PipelineCanvas'

/**
 * Página del lienzo low-code (HU-001). El canvas vive dentro de ReactFlowProvider
 * para habilitar drag-drop (screenToFlowPosition) y el control del viewport.
 */
export function PipelineBuilderPage() {
  return (
    <div className="flex h-[calc(100svh-8rem)] min-h-[480px] flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          Lienzo del pipeline
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Arrastra nodos desde la paleta, conéctalos de izquierda a derecha y diseña tu flujo MLOps.
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <ReactFlowProvider>
          <PipelineCanvas />
        </ReactFlowProvider>
      </div>
    </div>
  )
}
