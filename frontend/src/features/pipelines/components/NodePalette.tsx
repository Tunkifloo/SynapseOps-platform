import { type DragEvent } from 'react'

import { NODE_KINDS, type NodeKind } from '@/features/pipelines/nodeKinds'

const onDragStart = (event: DragEvent<HTMLDivElement>, kind: NodeKind) => {
  event.dataTransfer.setData('application/reactflow', kind)
  event.dataTransfer.effectAllowed = 'move'
}

/** Paleta de nodos arrastrables al lienzo (HU-001). */
export function NodePalette() {
  return (
    <aside className="hidden w-56 shrink-0 flex-col gap-2 overflow-y-auto rounded-2xl border border-border bg-card/40 p-3 md:flex">
      <p className="px-1 pb-1 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        Nodos
      </p>
      {NODE_KINDS.map((node) => (
        <div
          key={node.kind}
          draggable
          onDragStart={(e) => onDragStart(e, node.kind)}
          className="flex cursor-grab items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-card-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 active:cursor-grabbing"
          title={`Arrastra "${node.label}" al lienzo`}
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <node.icon className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{node.label}</p>
            <p className="truncate text-[11px] text-muted-foreground">{node.description}</p>
          </div>
        </div>
      ))}
      <p className="mt-auto px-1 pt-2 text-[11px] leading-relaxed text-muted-foreground">
        Arrastra un nodo al lienzo y conéctalos de izquierda a derecha. No se permiten ciclos.
      </p>
    </aside>
  )
}
