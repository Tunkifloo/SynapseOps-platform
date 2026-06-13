import { type DragEvent } from 'react'

import { NODE_KINDS, type NodeKind } from '@/features/pipelines/nodeKinds'

const onDragStart = (event: DragEvent<HTMLDivElement>, kind: NodeKind) => {
  event.dataTransfer.setData('application/reactflow', kind)
  event.dataTransfer.effectAllowed = 'move'
}

interface NodePaletteProps {
  /** Alta por tap/clic (además del arrastre) — usable en táctil y escritorio. */
  onAdd: (kind: NodeKind) => void
}

/** Paleta de nodos del lienzo (HU-001). Arrastrar o tocar para añadir. */
export function NodePalette({ onAdd }: NodePaletteProps) {
  return (
    <aside className="flex shrink-0 gap-2 overflow-auto rounded-2xl border border-border bg-card/40 p-3 md:w-56 md:flex-col">
      <p className="hidden px-1 pb-1 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase md:block">
        Nodos
      </p>
      {NODE_KINDS.map((node) => (
        <div
          key={node.kind}
          draggable
          role="button"
          tabIndex={0}
          onDragStart={(e) => onDragStart(e, node.kind)}
          onClick={() => onAdd(node.kind)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAdd(node.kind) } }}
          className="flex min-w-[160px] shrink-0 cursor-grab items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-card-foreground outline-none transition-[color,background-color,border-color] duration-150 ease-out-quart hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing md:min-w-0"
          title={`Arrastra o toca para añadir "${node.label}"`}
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
      <p className="mt-auto hidden px-1 pt-2 text-[11px] leading-relaxed text-muted-foreground md:block">
        Arrastra (o toca) un nodo y conéctalos de izquierda a derecha. No se permiten ciclos.
      </p>
    </aside>
  )
}
