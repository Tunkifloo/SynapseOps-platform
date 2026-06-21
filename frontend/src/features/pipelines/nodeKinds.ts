import {
  BrainCircuit,
  Database,
  Rocket,
  Settings2,
  SlidersHorizontal,
  Split,
  type LucideIcon,
} from 'lucide-react'

export type NodeKind = 'ingest' | 'preprocess' | 'split' | 'hparams' | 'train' | 'deploy'

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
  { kind: 'hparams', label: 'Hiperparámetros', icon: Settings2, description: 'Arquitectura · HPO / manual' },
  { kind: 'train', label: 'Entrenamiento', icon: BrainCircuit, description: 'Ejecuta · Kafka → ml-engine' },
  { kind: 'deploy', label: 'Despliegue', icon: Rocket, description: 'Modelo versionado · puerto auto' },
]

export const NODE_KIND_MAP: Record<NodeKind, NodeKindConfig> = Object.fromEntries(
  NODE_KINDS.map((k) => [k.kind, k])
) as Record<NodeKind, NodeKindConfig>
