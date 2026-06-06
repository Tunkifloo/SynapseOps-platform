import {
  BrainCircuit,
  Database,
  Rocket,
  SlidersHorizontal,
  Split,
  type LucideIcon,
} from 'lucide-react'

export type NodeKind = 'ingest' | 'preprocess' | 'split' | 'train' | 'deploy'

export interface NodeKindConfig {
  kind: NodeKind
  label: string
  icon: LucideIcon
  description: string
}

/** Nodos del pipeline MLOps (alineados con HU-002…HU-005 y HU-028). */
export const NODE_KINDS: NodeKindConfig[] = [
  { kind: 'ingest', label: 'Ingesta', icon: Database, description: 'Cargar dataset' },
  { kind: 'preprocess', label: 'Preprocesamiento', icon: SlidersHorizontal, description: 'Normalizar / redimensionar' },
  { kind: 'split', label: 'Split', icon: Split, description: 'Train / Val / Test' },
  { kind: 'train', label: 'Entrenamiento', icon: BrainCircuit, description: 'CNN · Kafka → ml-engine' },
  { kind: 'deploy', label: 'Despliegue', icon: Rocket, description: 'model-service (Sprint 3)' },
]

export const NODE_KIND_MAP: Record<NodeKind, NodeKindConfig> = Object.fromEntries(
  NODE_KINDS.map((k) => [k.kind, k])
) as Record<NodeKind, NodeKindConfig>
