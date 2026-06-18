import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import ReactFlow, {
  addEdge,
  Background,
  BackgroundVariant,
  MiniMap,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { useNavigate } from 'react-router-dom'

import { notify } from '@/shared/notify'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { useAppStore } from '@/store/useAppStore'
import { launchExecution, getExecution } from '@/features/executions/api'
import { deployModel } from '@/features/deployments/api'
import type { ExecutionRequest } from '@/features/executions/types'
import { NODE_KIND_MAP, type NodeKind } from '@/features/pipelines/nodeKinds'
import { buildAugmentationConfig, defaultConfig, validateConfig, type NodeConfig } from '@/features/pipelines/nodeConfig'
import { loadCanvas, saveCanvas } from '@/features/pipelines/canvasApi'
import { PipelineNode, type PipelineNodeData, type PipelineNodeStatus } from './PipelineNode'
import { NodePalette } from './NodePalette'
import { NodeConfigPanel } from './NodeConfigPanel'
import { CanvasToolbar } from './CanvasToolbar'
import { LogConsole } from './LogConsole'

const nodeTypes = { pipelineNode: PipelineNode }

let idCounter = 0
const nextId = () => `n_${Date.now().toString(36)}_${idCounter++}`

/**
 * Campos de entrenamiento del payload a partir del config del nodo `train`.
 * CNN → epochs/learningRate propios. Transfer Learning → epochs/LR por fase
 * (el `epochs`/`learningRate` base se derivan para satisfacer la validación REST).
 */
function buildTrainFields(cfg: NodeConfig): {
  architecture: string
  optimizer: string
  dropout: number
  l2: number
  epochs: number
  learningRate: number
  featureExtractionEpochs?: number
  featureExtractionLr?: number
  finetuningEpochs?: number
  finetuningLr?: number
  unfreezeLayers?: number
} {
  const arch = String(cfg.architecture ?? 'cnn')
  const pretrained = arch !== 'cnn'
  const feEpochs = Number(cfg.featureExtractionEpochs) || 5
  const ftEpochs = Number.isFinite(Number(cfg.finetuningEpochs)) ? Number(cfg.finetuningEpochs) : 10
  return {
    architecture: arch,
    optimizer: String(cfg.optimizer ?? 'adam'),
    dropout: Number(cfg.dropout ?? 0.4),
    l2: Number(cfg.l2 ?? 0),
    // En TL el ML Engine ignora este `epochs` (usa fe+ft); se capea a 100 solo para
    // satisfacer la validación REST del orquestador.
    epochs: pretrained ? Math.min(feEpochs + ftEpochs, 100) : Number(cfg.epochs) || 5,
    learningRate: pretrained ? Number(cfg.featureExtractionLr) || 0.001 : Number(cfg.learningRate) || 0.001,
    ...(pretrained
      ? {
          featureExtractionEpochs: feEpochs,
          featureExtractionLr: Number(cfg.featureExtractionLr) || 0.001,
          finetuningEpochs: ftEpochs,
          finetuningLr: Number(cfg.finetuningLr) || 0.00001,
          unfreezeLayers: Number(cfg.unfreezeLayers) || 10,
        }
      : {}),
  }
}

/**
 * ¿Agregar la arista source→target cerraría un ciclo?
 * Hay ciclo si `source` ya es alcanzable partiendo de `target` con las aristas actuales.
 */
function wouldCreateCycle(edges: Edge[], source: string, target: string): boolean {
  if (source === target) return true
  const adjacency = new Map<string, string[]>()
  for (const edge of edges) {
    const list = adjacency.get(edge.source) ?? []
    list.push(edge.target)
    adjacency.set(edge.source, list)
  }
  const stack = [target]
  const visited = new Set<string>()
  while (stack.length) {
    const current = stack.pop() as string
    if (current === source) return true
    if (visited.has(current)) continue
    visited.add(current)
    for (const neighbour of adjacency.get(current) ?? []) stack.push(neighbour)
  }
  return false
}

/** ¿Existe una ruta dirigida source → target con las aristas actuales? (BFS) */
function isReachable(edges: Edge[], source: string, target: string): boolean {
  if (source === target) return true
  const adjacency = new Map<string, string[]>()
  for (const edge of edges) {
    const list = adjacency.get(edge.source) ?? []
    list.push(edge.target)
    adjacency.set(edge.source, list)
  }
  const queue = [source]
  const visited = new Set<string>()
  while (queue.length) {
    const current = queue.shift() as string
    if (current === target) return true
    if (visited.has(current)) continue
    visited.add(current)
    for (const neighbour of adjacency.get(current) ?? []) queue.push(neighbour)
  }
  return false
}

/**
 * Snapshot estable del lienzo (topología + config) para detectar cambios sin
 * guardar. Excluye campos transitorios (estado/error del nodo y datos de la
 * ejecución) para que ejecutar un flujo NO marque el lienzo como "sin guardar".
 */
function snapshot(nodes: Node<PipelineNodeData>[], edges: Edge[]): string {
  return JSON.stringify({
    nodes: nodes.map((n) => {
      const cfg = { ...(n.data.config ?? {}) }
      delete cfg.runId
      delete cfg.modelVersion
      delete cfg.metrics
      delete cfg.endpoint
      return { id: n.id, type: n.type, position: n.position, label: n.data.label, kind: n.data.kind, config: cfg }
    }),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  })
}

export interface CanvasWorkspace {
  idWorkspace: number
  name: string
  datasetPath?: string | null
}

interface PipelineCanvasProps {
  token?: string
  workspace?: CanvasWorkspace | null
  pipelineId?: number | null
  onWorkspaceRefresh?: () => void
  onAuthError?: (error: unknown) => boolean
}

export function PipelineCanvas({
  token,
  workspace,
  pipelineId,
  onWorkspaceRefresh,
  onAuthError,
}: PipelineCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<PipelineNodeData>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [nodeDirty, setNodeDirty] = useState(false)  // cambios sin guardar en el panel del nodo
  const [saving, setSaving] = useState(false)
  const [flowRunning, setFlowRunning] = useState(false)
  const [activeExecutionId, setActiveExecutionId] = useState<number | null>(null)
  // Señal para cerrar el stream SSE limpiamente cuando el ciclo termina sin despliegue
  // (el evento de entrenamiento ya no es terminal, así que no se autocierra).
  const [logCloseSignal, setLogCloseSignal] = useState(0)
  const [dirty, setDirty] = useState(false)       // cambios del lienzo sin guardar (item 3)
  // Confirmación de acciones críticas (limpiar / eliminar nodo / iniciar flujo).
  const [confirm, setConfirm] = useState<{
    title: string
    description: string
    confirmLabel: string
    cancelLabel?: string
    tone: 'destructive' | 'default'
    onConfirm: () => void | Promise<void>
  } | null>(null)
  const loadedRef = useRef(false)                 // evita marcar dirty durante la carga inicial
  const baselineRef = useRef<string>('')          // snapshot del último estado guardado/cargado
  // True cuando se reabre el lienzo sobre una ejecución YA TERMINADA: el replay SSE no debe
  // re-marcar nodos como 'running' (el entrenamiento es no-terminal → nunca reconciliaría a
  // success y el nodo quedaría "En ejecución" para siempre). Se baja al iniciar un flujo nuevo.
  const replayFinishedRef = useRef(false)
  const { screenToFlowPosition, setViewport, fitView } = useReactFlow()
  const navigate = useNavigate()

  // Claves de persistencia local por (workspace, pipeline). Requieren AMBOS ids: con un
  // workspace `undefined` la clave colisionaría entre proyectos distintos.
  const wsId = workspace?.idWorkspace
  const keyOk = wsId != null && pipelineId != null
  const draftKey    = keyOk ? `synapseops:canvas-draft:${wsId}:${pipelineId}` : null
  const execKey     = keyOk ? `synapseops:active-exec:${wsId}:${pipelineId}` : null
  const statusKey   = keyOk ? `synapseops:canvas-status:${wsId}:${pipelineId}` : null
  const viewportKey = keyOk ? `synapseops:canvas-viewport:${wsId}:${pipelineId}` : null

  // Persiste la ejecución activa para reanudar la consola al volver (item 4-frontend).
  const setActiveExecution = useCallback((id: number | null) => {
    setActiveExecutionId(id)
    if (execKey) {
      try {
        if (id == null) localStorage.removeItem(execKey)
        else localStorage.setItem(execKey, String(id))
      } catch { /* almacenamiento no disponible */ }
    }
  }, [execKey])

  // Difunde la ejecución activa a la campana global (AppShell) para que notifique
  // ingesta/entrenamiento/despliegue aunque el usuario esté en otro módulo. NO se
  // emite null al desmontar el lienzo: la campana debe permanecer suscrita.
  useEffect(() => {
    if (activeExecutionId == null || !workspace || !pipelineId) return
    window.dispatchEvent(new CustomEvent('synapseops:active-execution', {
      detail: { executionId: activeExecutionId, workspaceId: workspace.idWorkspace, pipelineId },
    }))
  }, [activeExecutionId, workspace, pipelineId])

  const storeWorkspace = useAppStore((s) => s.currentWorkspace)
  const projectName = workspace?.name ?? storeWorkspace

  // Contexto para el nodo de Ingesta (HU-002): asigna dataset al workspace vinculado.
  const ingestContext =
    token && workspace
      ? {
          token,
          workspaceId: workspace.idWorkspace,
          datasetPath: workspace.datasetPath,
          onAssigned: (descriptor: string) => {
            const dsLabel = workspace.datasetPath?.split(/[/\\]/).pop() || descriptor
            setNodes((nds) =>
              nds.map((n) =>
                n.id === selectedNodeId
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        status: 'success' as const,
                        datasetDescriptor: dsLabel,
                        config: { ...n.data.config, dataset: descriptor },
                      },
                    }
                  : n
              )
            )
            onWorkspaceRefresh?.()
          },
        }
      : undefined

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null

  // HU-005: lanza la ejecución real y refleja el estado en vivo (polling).
  const runTraining = useCallback(
    (nodeId: string, cfg: NodeConfig) => {
      if (!token || !workspace || !pipelineId) return
      const wsId = workspace.idWorkspace

      const patchNode = (
        status: PipelineNodeStatus,
        error?: string,
        extra?: Record<string, string>
      ) =>
        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    status,
                    error,
                    config: extra ? { ...n.data.config, ...extra } : n.data.config,
                  },
                }
              : n
          )
        )

      patchNode('running')

      const payload: ExecutionRequest = {
        framework: (cfg.framework as 'tensorflow' | 'pytorch') ?? 'tensorflow',
        batchSize: Number(cfg.batchSize) || 32,
        numClasses: 10, // el ml-engine autodetecta el real
        modelName: String(cfg.modelName || 'modelo'),
        batchNorm: cfg.batchNorm === 'true',
        earlyStopping: cfg.earlyStopping === 'true',
        esPatience: Number(cfg.esPatience) || undefined,
        esMonitor: String(cfg.esMonitor ?? 'val_loss'),
        ...buildTrainFields(cfg),
      }

      void (async () => {
        let executionId: number
        try {
          const exec = await launchExecution(token, wsId, pipelineId, payload)
          executionId = exec.idExecution
          setActiveExecutionId(executionId) // abre la consola SSE (HU-023)
          notify.info('Entrenamiento en curso', {
            description: `Ejecución #${executionId} · puede tardar varios minutos. Te notificaremos cuando esté listo.`,
          })
        } catch (err) {
          patchNode('error', err instanceof Error ? err.message : 'No se pudo lanzar el entrenamiento.')
          return
        }

        let attempts = 0
        const MAX_ATTEMPTS = 120 // ~6 min a 3s
        const poll = async () => {
          attempts += 1
          try {
            const exec = await getExecution(token, wsId, pipelineId, executionId)
            if (exec.status === 'COMPLETED') {
              patchNode('success', undefined, {
                runId: exec.mlflowRunId ?? '',
                modelVersion: exec.modelVersion ?? '',
                metrics: exec.metrics ?? '',
              })
              notify.success('Entrenamiento completado', {
                description: exec.mlflowRunId ? `Run ${exec.mlflowRunId}` : undefined,
              })
              return
            }
            if (exec.status === 'FAILED') {
              patchNode('error', 'El entrenamiento falló (revisa MLflow / logs).')
              return
            }
          } catch {
            // Error transitorio al consultar: se reintenta.
          }
          if (attempts < MAX_ATTEMPTS) {
            window.setTimeout(() => void poll(), 3000)
          } else {
            patchNode('error', 'Tiempo de espera agotado consultando el estado.')
          }
        }
        window.setTimeout(() => void poll(), 3000)
      })()
    },
    [token, workspace, pipelineId, setNodes]
  )

  const trainContext =
    token && workspace && pipelineId
      ? {
          canRun: !!workspace.datasetPath,
          onExecute: (cfg: NodeConfig) => {
            if (selectedNodeId) runTraining(selectedNodeId, cfg)
          },
          token,
          workspaceId: workspace.idWorkspace,
          onAuthError: onAuthError ?? (() => false),
        }
      : undefined

  // ── T-D.2: "Iniciar Flujo" — valida el grafo y ejecuta TODO el flujo ──────────
  const setStatusByKind = useCallback(
    (kinds: NodeKind[], status: PipelineNodeStatus, error?: string) =>
      setNodes((nds) => nds.map((n) =>
        kinds.includes(n.data.kind)
          ? { ...n, data: { ...n.data, status, error } }
          : n)),
    [setNodes]
  )

  const validateFlow = useCallback((): string[] => {
    const errors: string[] = []
    if (nodes.length === 0) return ['El lienzo está vacío: arrastra al menos Ingesta y Entrenamiento.']

    const ingest = nodes.find((n) => n.data.kind === 'ingest')
    const train = nodes.find((n) => n.data.kind === 'train')
    if (!ingest) errors.push('Falta el nodo de Ingesta.')
    if (!train) errors.push('Falta el nodo de Entrenamiento.')

    // Sin duplicados: un nodo por tipo (evita redundancias en el flujo).
    const KIND_ORDER: Record<NodeKind, number> = { ingest: 0, preprocess: 1, split: 2, train: 3, deploy: 4 }
    const counts = new Map<NodeKind, number>()
    for (const n of nodes) counts.set(n.data.kind, (counts.get(n.data.kind) ?? 0) + 1)
    for (const [kind, count] of counts) {
      if (count > 1) errors.push(`Hay ${count} nodos de "${NODE_KIND_MAP[kind].label}": usa solo uno por tipo.`)
    }

    // Conectados en orden canónico: cada arista debe ir hacia adelante.
    const kindOf = new Map(nodes.map((n) => [n.id, n.data.kind]))
    for (const edge of edges) {
      const s = kindOf.get(edge.source)
      const t = kindOf.get(edge.target)
      if (s && t && KIND_ORDER[s] >= KIND_ORDER[t]) {
        errors.push(`Conexión fuera de orden: ${NODE_KIND_MAP[s].label} → ${NODE_KIND_MAP[t].label}. El flujo va Ingesta → Preproc → Split → Entrenamiento → Despliegue.`)
        break
      }
    }

    if (ingest && train && !isReachable(edges, ingest.id, train.id)) {
      errors.push('Conecta el flujo: Ingesta → … → Entrenamiento (no hay ruta entre ellos).')
    }
    for (const n of nodes) {
      const err = validateConfig(n.data.kind, { ...defaultConfig(n.data.kind), ...(n.data.config ?? {}) })
      if (err) errors.push(`${NODE_KIND_MAP[n.data.kind].label}: ${err}`)
    }
    if (!workspace?.datasetPath) {
      errors.push('Asigna un dataset al proyecto desde el nodo de Ingesta antes de ejecutar.')
    }
    return errors
  }, [nodes, edges, workspace])

  // Despliegue del model-service. Unifica la transición de estado del nodo Despliegue
  // (running → success/error) y guarda el endpoint en su config. Lo usan tanto el
  // auto-despliegue (al terminar el flujo) como el botón manual del panel (handoff de
  // "Mis modelos" o reintento tras error).
  const deployFlowModel = useCallback(async (runId: string, deployNodeId: string) => {
    if (!token || !runId) return
    setFlowRunning(true)
    setNodes((nds) => nds.map((n) => (n.id === deployNodeId
      ? { ...n, data: { ...n.data, status: 'running' as const, error: undefined } } : n)))
    notify.info('Desplegando el modelo…', {
      description: 'Construyendo el model-service; puede tardar varios minutos.',
    })
    try {
      const res = await deployModel(token, runId)
      const ok = res.status === 'RUNNING'
      setNodes((nds) => nds.map((n) => (n.id === deployNodeId
        ? { ...n, data: { ...n.data, status: ok ? ('success' as const) : ('error' as const),
            error: ok ? undefined : 'El model-service no pasó el health check.',
            config: { ...n.data.config, endpoint: ok ? (res.endpoint ?? '') : '' } } } : n)))
      if (ok) {
        notify.success('model-service desplegado', { description: res.endpoint ?? 'Gestiónalo en "Despliegues".' })
        // Caso A: el nodo de Despliegue estaba presente y el model-service pasó el health
        // check (200) → modal de éxito con acceso directo al módulo de Despliegues.
        setConfirm({
          title: 'Modelo desplegado',
          description: 'El model-service pasó el health check y su endpoint /predict ya está '
            + 'disponible. Puedes probarlo y gestionarlo desde el módulo de Despliegues.',
          confirmLabel: 'Ir a mis despliegues',
          cancelLabel: 'Cerrar',
          tone: 'default',
          onConfirm: () => navigate('/deployments'),
        })
      } else {
        notify.error('El despliegue no pasó el health check del model-service')
      }
    } catch (err) {
      setNodes((nds) => nds.map((n) => (n.id === deployNodeId
        ? { ...n, data: { ...n.data, status: 'error' as const,
            error: err instanceof Error ? err.message : 'No se pudo desplegar.' } } : n)))
      if (!onAuthError?.(err)) {
        notify.error('No se pudo desplegar', { description: err instanceof Error ? err.message : undefined })
      }
    } finally {
      setFlowRunning(false)
    }
  }, [token, setNodes, onAuthError, navigate])

  const executeFlow = useCallback(() => {
    if (!token || !workspace || !pipelineId) return
    const wsId = workspace.idWorkspace
    const trainNode = nodes.find((n) => n.data.kind === 'train')
    const preprocessNode = nodes.find((n) => n.data.kind === 'preprocess')
    const splitNode = nodes.find((n) => n.data.kind === 'split')
    const cfg: NodeConfig = { ...defaultConfig('train'), ...(trainNode?.data.config ?? {}) }
    const preCfg: NodeConfig = preprocessNode
      ? { ...defaultConfig('preprocess'), ...(preprocessNode.data.config ?? {}) } : {}
    const splitCfg: NodeConfig = splitNode
      ? { ...defaultConfig('split'), ...(splitNode.data.config ?? {}) } : {}

    // Topología fija del flujo (capturada al inicio): evita que el nodo de Despliegue
    // se "pierda" si el estado cambia durante el sondeo largo.
    const deployNodeAtStart = nodes.find((n) => n.data.kind === 'deploy')
    const deployConnectedAtStart =
      !!deployNodeAtStart && edges.some((e) => e.target === deployNodeAtStart.id)

    setFlowRunning(true)
    // Flujo NUEVO en vivo → el replay-guard se desactiva (sí queremos animar 'running').
    replayFinishedRef.current = false
    // Reinicia estados Y limpia la config runtime del flujo ANTERIOR (runId, versión,
    // métricas, endpoint): así, tras re-entrenar v2 no se sigue mostrando la v1 stale.
    setNodes((nds) => nds.map((n) => {
      const cfg = { ...n.data.config }
      delete cfg.runId; delete cfg.modelVersion; delete cfg.metrics; delete cfg.endpoint
      return { ...n, data: { ...n.data, status: 'idle' as const, error: undefined, config: cfg } }
    }))
    setStatusByKind(['ingest'], 'running')

    const payload: ExecutionRequest = {
      framework: (cfg.framework as 'tensorflow' | 'pytorch') ?? 'tensorflow',
      batchSize: Number(cfg.batchSize) || 32,
      numClasses: 10, // autodetectado por el ml-engine; placeholder ignorado
      modelName: String(cfg.modelName || 'modelo'),
      batchNorm: cfg.batchNorm === 'true',
      earlyStopping: cfg.earlyStopping === 'true',
      esPatience: Number(cfg.esPatience) || undefined,
      esMonitor: String(cfg.esMonitor ?? 'val_loss'),
      ...buildTrainFields(cfg),
      // Nodos Preprocesamiento y Split (parametrización real en el ml-engine).
      normalization: preprocessNode ? String(preCfg.normalization ?? 'minmax') : undefined,
      dataAugmentation: preprocessNode ? preCfg.dataAugmentation === 'true' : undefined,
      augmentationConfig: preprocessNode
        ? JSON.stringify(buildAugmentationConfig(preCfg))
        : undefined,
      classBalancing: preprocessNode ? String(preCfg.classBalancing ?? 'off') : undefined,
      balanceThreshold: preprocessNode ? Number(preCfg.balanceThreshold) || undefined : undefined,
      imageSize: preprocessNode ? Number(preCfg.imageSize) || undefined : undefined,
      trainRatio: splitNode ? Number(splitCfg.trainRatio) || undefined : undefined,
    }

    void (async () => {
      let executionId: number
      try {
        const exec = await launchExecution(token, wsId, pipelineId, payload)
        executionId = exec.idExecution
        setActiveExecution(executionId)
        notify.info('Flujo en curso', {
          description: `Ejecución #${executionId} · puede tardar varios minutos. Te notificaremos cuando esté listo.`,
        })
      } catch (err) {
        setStatusByKind(['ingest'], 'error', err instanceof Error ? err.message : 'No se pudo iniciar el flujo.')
        setFlowRunning(false)
        return
      }

      // Entrenamientos LARGOS: sondea hasta ~60 min. Los logs por época siguen
      // llegando en vivo por SSE; este poll solo detecta COMPLETED/FAILED y dispara
      // el auto-despliegue. (Antes: 6 min → daba "timeout" falso en flujos largos.)
      let attempts = 0
      const POLL_INTERVAL_MS = 5000
      const MAX_ATTEMPTS = 720   // 720 × 5 s ≈ 60 min
      const poll = async () => {
        attempts += 1
        try {
          const exec = await getExecution(token, wsId, pipelineId, executionId)
          if (exec.status === 'COMPLETED') {
            setStatusByKind(['ingest', 'preprocess', 'split'], 'success')
            const runId = exec.mlflowRunId ?? ''
            setNodes((nds) => nds.map((n) => n.data.kind === 'train'
              ? { ...n, data: { ...n.data, status: 'success', error: undefined,
                  config: { ...n.data.config, runId, modelVersion: exec.modelVersion ?? '', metrics: exec.metrics ?? '' } } }
              : n))
            notify.success('Flujo completado', { description: exec.mlflowRunId ? `Run ${exec.mlflowRunId}` : undefined })
            // Auto-despliegue si el nodo Despliegue está presente y conectado al flujo.
            if (deployNodeAtStart && deployConnectedAtStart && runId) {
              void deployFlowModel(runId, deployNodeAtStart.id)
            } else {
              // Caso B · Sin nodo de Despliegue (o sin conectar): el ciclo termina en el
              // entrenamiento — es válido (el usuario puede querer solo entrenar). Modal
              // que recuerda cómo desplegar después, con acceso directo a Mis modelos.
              setLogCloseSignal((s) => s + 1)
              setFlowRunning(false)
              setConfirm({
                title: 'Modelo entrenado y registrado',
                description: 'El entrenamiento terminó y el modelo quedó versionado en MLflow. '
                  + 'Recuerda que puedes desplegarlo en Mis modelos → detalles del modelo → Desplegar.',
                confirmLabel: 'Ir a detalles del modelo',
                cancelLabel: 'Cerrar',
                tone: 'default',
                onConfirm: () => navigate('/models'),
              })
            }
            return
          }
          if (exec.status === 'FAILED') {
            // Marca el nodo en ejecución como error (el resto conserva su estado).
            setNodes((nds) => nds.map((n) => n.data.status === 'running'
              ? { ...n, data: { ...n.data, status: 'error', error: 'El flujo falló (revisa la consola / MLflow).' } }
              : n))
            notify.error('El flujo falló', { description: 'Revisa la consola de logs.' })
            setFlowRunning(false)
            return
          }
        } catch { /* transitorio: reintenta */ }
        if (attempts < MAX_ATTEMPTS) window.setTimeout(() => void poll(), POLL_INTERVAL_MS)
        else {
          setFlowRunning(false)
          notify.info('El flujo sigue en curso', {
            description: 'Lleva más de 60 min. El entrenamiento continúa en segundo plano; '
              + 'revisa la consola de logs o MLflow para el resultado.',
          })
        }
      }
      window.setTimeout(() => void poll(), POLL_INTERVAL_MS)
    })()
  }, [token, workspace, pipelineId, nodes, edges, setNodes, setStatusByKind, setActiveExecution, deployFlowModel, navigate])

  // "Iniciar flujo": valida y pide confirmación (acción crítica) antes de ejecutar.
  const runFlow = useCallback(() => {
    if (!token || !workspace || !pipelineId) {
      notify.warning('Selecciona un proyecto y un pipeline para ejecutar el flujo.')
      return
    }
    const errors = validateFlow()
    if (errors.length > 0) {
      notify.error('No se puede iniciar el flujo', { description: errors[0] })
      return
    }
    setConfirm({
      title: 'Iniciar flujo',
      description:
        'Se ejecutará el entrenamiento completo (ingesta → preprocesamiento → split → entrenamiento). Puede tardar varios minutos.',
      confirmLabel: 'Iniciar flujo',
      tone: 'default',
      onConfirm: executeFlow,
    })
  }, [token, workspace, pipelineId, validateFlow, executeFlow])

  // Mapea las fases reales del ml-engine (SSE) a los estados de los nodos.
  // El evento `terminal` reconcilia el estado final también al reconectar (replay),
  // evitando que un nodo quede "running" tras volver a la vista (item 1).
  const onFlowLogEvent = useCallback((level: string, message: string, terminal: boolean) => {
    const m = message.toLowerCase()
    if (terminal) {
      const failed = level === 'ERROR' || m.includes('fallid') || m.includes('error')
      if (failed) {
        // El flujo falló → marca el nodo en ejecución como error; si no hay ninguno
        // (p. ej. fallo temprano en ingesta), marca el primer nodo no completado.
        setNodes((nds) => {
          const hasRunning = nds.some((n) => n.data.status === 'running')
          const next = nds.map((n) =>
            n.data.status === 'running'
              ? { ...n, data: { ...n.data, status: 'error' as const, error: message } }
              : n
          )
          if (!hasRunning) {
            const idx = next.findIndex((n) => n.data.status !== 'success')
            if (idx >= 0) {
              next[idx] = { ...next[idx], data: { ...next[idx].data, status: 'error', error: message } }
            }
          }
          return next
        })
      } else {
        setStatusByKind(['ingest', 'preprocess', 'split', 'train'], 'success')
      }
      setFlowRunning(false)
      return
    }
    // Replay de una ejecución YA TERMINADA (al reabrir el lienzo): NO re-marcar 'running'.
    // Los nodos ya están reconciliados (overlay / fetch del estado real); los logs siguen
    // mostrándose en la consola. Sin esto, los eventos de época re-marcaban el train como
    // "En ejecución" y, al ser no-terminal, nunca volvía a success (bug del nodo colgado).
    if (replayFinishedRef.current) return
    // Secuencia real: ingesta → preprocesamiento → split → entrenamiento.
    // Se evalúa del paso MÁS avanzado al más temprano; cada etapa marca 'success'
    // las anteriores y 'running' la suya. El kickoff ("Job publicado … entrenamiento
    // en curso") NO debe disparar el entrenamiento (solo arranca la ingesta).
    if (m.startsWith('epoch') || m.includes('entrenando') || m.includes('val_accuracy')
        || m.includes('registro') || m.includes('registrando')) {
      setStatusByKind(['ingest', 'preprocess', 'split'], 'success')
      setStatusByKind(['train'], 'running')
    } else if (m.includes('split')) {
      setStatusByKind(['ingest', 'preprocess'], 'success')
      setStatusByKind(['split'], 'running')
    } else if (m.includes('preprocesamiento')) {
      setStatusByKind(['ingest'], 'success')
      setStatusByKind(['preprocess'], 'running')
    } else if (m.includes('dataset listo')) {
      setStatusByKind(['ingest'], 'success')
      setStatusByKind(['preprocess'], 'running')
    } else if (m.includes('cargando dataset') || m.includes('job publicado')) {
      setStatusByKind(['ingest'], 'running')
    }
  }, [setStatusByKind, setNodes])

  // Contexto para el Nodo de Despliegue: estado del entrenamiento (origen del modelo)
  // + estado/endpoint EN VIVO del propio nodo de despliegue + disparador manual.
  const deployTrainNode = nodes.find((n) => n.data.kind === 'train')
  const deployNodeForCtx = nodes.find((n) => n.data.kind === 'deploy')
  const deployContext =
    token && workspace
      ? {
          token,
          flowRunId: String(deployTrainNode?.data.config?.runId ?? ''),
          flowModelVersion: String(deployTrainNode?.data.config?.modelVersion ?? ''),
          flowMetrics: String(deployTrainNode?.data.config?.metrics ?? ''),
          trainStatus: deployTrainNode?.data.status ?? 'idle',
          deployStatus: deployNodeForCtx?.data.status ?? 'idle',
          deployEndpoint: String(deployNodeForCtx?.data.config?.endpoint ?? ''),
          onDeploy: (runId: string) => {
            if (deployNodeForCtx) void deployFlowModel(runId, deployNodeForCtx.id)
          },
          onAuthError: onAuthError ?? (() => false),
        }
      : undefined

  // Aristas coloreadas según el estado del nodo origen (HU-019):
  // success → verde, running → azul animado, error → rojo.
  const displayEdges = useMemo(() => {
    const statusOf = new Map(nodes.map((n) => [n.id, n.data.status]))
    return edges.map((edge) => {
      const status = statusOf.get(edge.source)
      if (status === 'success')
        return { ...edge, animated: false, style: { stroke: 'var(--success)', strokeWidth: 2 } }
      if (status === 'running')
        return { ...edge, animated: true, style: { stroke: 'var(--info)', strokeWidth: 2 } }
      if (status === 'error')
        return { ...edge, animated: false, style: { stroke: 'var(--destructive)', strokeWidth: 2 } }
      return edge
    })
  }, [edges, nodes])

  const handleClear = useCallback(() => {
    if (nodes.length === 0) return
    setConfirm({
      title: 'Limpiar lienzo',
      description: 'Se quitarán todos los nodos y conexiones. Guarda antes si deseas conservarlos.',
      confirmLabel: 'Limpiar',
      tone: 'destructive',
      onConfirm: () => {
        setNodes([])
        setEdges([])
        setSelectedNodeId(null)
        notify.success('Lienzo limpiado')
      },
    })
  }, [nodes.length, setNodes, setEdges])

  // Cierre del panel del nodo con guarda de cambios sin guardar (modal estilizado).
  const requestCloseNode = useCallback(() => {
    if (!selectedNodeId) return
    if (nodeDirty) {
      setConfirm({
        title: 'Cambios sin guardar',
        description: 'Tienes cambios sin guardar en el nodo. ¿Descartarlos?',
        confirmLabel: 'Descartar cambios',
        tone: 'destructive',
        onConfirm: () => {
          setNodeDirty(false)
          setSelectedNodeId(null)
        },
      })
    } else {
      setSelectedNodeId(null)
    }
  }, [selectedNodeId, nodeDirty])

  // Cambio a otro nodo: si hay cambios sin guardar, confirma antes de cambiar.
  const requestSelectNode = useCallback(
    (id: string) => {
      if (id === selectedNodeId) return
      if (selectedNodeId && nodeDirty) {
        setConfirm({
          title: 'Cambios sin guardar',
          description: 'Tienes cambios sin guardar en el nodo. ¿Descartarlos y cambiar de nodo?',
          confirmLabel: 'Descartar y cambiar',
          tone: 'destructive',
          onConfirm: () => {
            setNodeDirty(false)
            setSelectedNodeId(id)
          },
        })
      } else {
        setSelectedNodeId(id)
      }
    },
    [selectedNodeId, nodeDirty]
  )

  // Eliminar el nodo seleccionado (acción crítica → confirmación + toast).
  const requestDeleteNode = useCallback(() => {
    const node = nodes.find((n) => n.id === selectedNodeId)
    if (!node) return
    setConfirm({
      title: 'Eliminar nodo',
      description: `Se eliminará el nodo "${node.data.label}" y sus conexiones.`,
      confirmLabel: 'Eliminar nodo',
      tone: 'destructive',
      onConfirm: () => {
        setNodes((nds) => nds.filter((n) => n.id !== node.id))
        setEdges((eds) => eds.filter((e) => e.source !== node.id && e.target !== node.id))
        setSelectedNodeId(null)
        notify.success('Nodo eliminado', { description: node.data.label })
      },
    })
  }, [nodes, selectedNodeId, setNodes, setEdges])

  // HU-024: persiste la topología en el backend (vinculada al pipeline).
  const handleSavePipeline = useCallback(async () => {
    if (!token || !workspace || !pipelineId) {
      notify.warning('Selecciona un proyecto y un pipeline para guardar.')
      return
    }
    setSaving(true)
    try {
      await saveCanvas(token, workspace.idWorkspace, pipelineId, { nodes, edges })
      // Sincronizado: el estado actual pasa a ser la línea base; se descarta el borrador.
      baselineRef.current = snapshot(nodes, edges)
      setDirty(false)
      if (draftKey) {
        try { localStorage.removeItem(draftKey) } catch { /* noop */ }
      }
      notify.success('Pipeline guardado', { description: 'Topología persistida en el servidor.' })
    } catch {
      notify.error('No se pudo guardar el pipeline.')
    } finally {
      setSaving(false)
    }
  }, [token, workspace, pipelineId, nodes, edges, draftKey])

  // HU-024: carga la topología guardada al abrir/cambiar de pipeline; restaura
  // borrador local sin guardar (item 3) y la ejecución activa para la consola (item 4).
  useEffect(() => {
    if (!token || !workspace || !pipelineId) return
    const wsId = workspace.idWorkspace
    let cancelled = false
    loadedRef.current = false
    setDirty(false)
    void (async () => {
      try {
        const dsLabel = workspace?.datasetPath?.split(/[/\\]/).pop()

        // Overlay de estados persistido (checks verdes): restaura success/error al volver
        // al lienzo. 'running' se baja a idle (lo redrive el replay SSE de la ejecución
        // activa), evitando que un nodo quede "corriendo" indefinidamente.
        let overlay: Record<string, { status: PipelineNodeStatus; error?: string; config?: Record<string, string | number> }> = {}
        if (statusKey) {
          try {
            const raw = localStorage.getItem(statusKey)
            if (raw) overlay = JSON.parse(raw)
          } catch { /* overlay corrupto: se ignora */ }
        }
        const applyState = (ns: Node<PipelineNodeData>[]) =>
          ns.map((n) => {
            const o = overlay[n.id]
            const restore = !!o && (o.status === 'success' || o.status === 'error')
            return {
              ...n,
              data: {
                ...n.data,
                status: restore ? o.status : ('idle' as const),
                error: restore ? o.error : undefined,
                config: restore && o.config ? { ...n.data.config, ...o.config } : n.data.config,
                ...(n.data.kind === 'ingest' && dsLabel ? { datasetDescriptor: dsLabel } : {}),
              },
            }
          })

        const canvas = await loadCanvas(token, wsId, pipelineId)
        if (cancelled) return
        baselineRef.current = snapshot(canvas.nodes as Node<PipelineNodeData>[], canvas.edges)

        // ¿Hay un borrador local más reciente y distinto? → restaurar y avisar.
        let restored = false
        if (draftKey) {
          try {
            const raw = localStorage.getItem(draftKey)
            if (raw) {
              const draft = JSON.parse(raw) as { nodes: Node<PipelineNodeData>[]; edges: Edge[] }
              if (snapshot(draft.nodes, draft.edges) !== baselineRef.current) {
                setNodes(applyState(draft.nodes)); setEdges(draft.edges)
                restored = true
                notify.warning('Borrador restaurado', {
                  description: 'Tienes cambios del lienzo sin guardar. Pulsa "Guardar" para confirmarlos.',
                })
              }
            }
          } catch { /* borrador corrupto: se ignora */ }
        }
        if (!restored) { setNodes(applyState(canvas.nodes as Node<PipelineNodeData>[])); setEdges(canvas.edges) }
        setSelectedNodeId(null)

        // Restaura el viewport (pan/zoom) en el que estaba el usuario; si no hay uno
        // guardado, encuadra el flujo. Se difiere para que React Flow registre los nodos.
        const vpRaw = viewportKey ? localStorage.getItem(viewportKey) : null
        window.setTimeout(() => {
          if (cancelled) return
          if (vpRaw) {
            try { setViewport(JSON.parse(vpRaw)) } catch { fitView({ padding: 0.2 }) }
          } else {
            fitView({ padding: 0.2 })
          }
        }, 60)

        // Reanuda la consola de la última ejecución (replay del backend). ANTES de reabrir
        // el SSE consulta el estado REAL: si la ejecución ya terminó, activa el guard para
        // que el replay no re-marque nodos como 'running' (bug del nodo colgado en RUNNING)
        // y reconcilia los estados/métricas de forma autoritativa.
        if (execKey) {
          const saved = localStorage.getItem(execKey)
          if (saved && wsId != null && pipelineId != null) {
            const eid = Number(saved)
            try {
              const exec = await getExecution(token, wsId, pipelineId, eid)
              if (exec.status === 'COMPLETED' || exec.status === 'FAILED') {
                replayFinishedRef.current = true
                if (exec.status === 'COMPLETED' && !cancelled) {
                  setStatusByKind(['ingest', 'preprocess', 'split'], 'success')
                  setNodes((nds) => nds.map((n) => n.data.kind === 'train'
                    ? { ...n, data: { ...n.data, status: 'success', error: undefined,
                        config: { ...n.data.config,
                          runId: exec.mlflowRunId ?? n.data.config?.runId ?? '',
                          modelVersion: exec.modelVersion ?? n.data.config?.modelVersion ?? '',
                          metrics: exec.metrics ?? n.data.config?.metrics ?? '' } } }
                    : n))
                }
              }
            } catch { /* sin estado disponible → se confía en el overlay restaurado */ }
            if (!cancelled) setActiveExecutionId(eid)
          }
        }
        // Permite marcar dirty a partir de aquí (la carga no cuenta como edición).
        window.setTimeout(() => { loadedRef.current = true }, 0)
      } catch {
        // Error de red ya notificado por el cliente HTTP; se deja el lienzo actual.
      }
    })()
    return () => {
      cancelled = true
    }
    // Solo recarga al cambiar de pipeline/workspace (no en cada refresh de objeto).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, workspace?.idWorkspace, pipelineId])

  // Autosave de borrador + flag de cambios sin guardar (item 3).
  useEffect(() => {
    if (!loadedRef.current) return
    const cur = snapshot(nodes, edges)
    const isDirty = cur !== baselineRef.current
    setDirty(isDirty)
    if (draftKey) {
      try {
        if (isDirty) localStorage.setItem(draftKey, JSON.stringify({ nodes, edges }))
        else localStorage.removeItem(draftKey)
      } catch { /* almacenamiento no disponible */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges])

  // Persiste los estados terminales de los nodos (success/error) + su config runtime
  // (runId, endpoint, …) para restaurarlos al volver al lienzo desde otro módulo.
  useEffect(() => {
    if (!loadedRef.current || !statusKey) return
    const overlay: Record<string, { status: PipelineNodeStatus; error?: string; config?: Record<string, string | number> }> = {}
    for (const n of nodes) {
      if (n.data.status && n.data.status !== 'idle') {
        const c = n.data.config ?? {}
        overlay[n.id] = {
          status: n.data.status,
          error: n.data.error,
          config: {
            ...(c.runId ? { runId: c.runId } : {}),
            ...(c.modelVersion ? { modelVersion: c.modelVersion } : {}),
            ...(c.metrics ? { metrics: c.metrics } : {}),
            ...(c.endpoint ? { endpoint: c.endpoint } : {}),
          },
        }
      }
    }
    try {
      if (Object.keys(overlay).length) localStorage.setItem(statusKey, JSON.stringify(overlay))
      else localStorage.removeItem(statusKey)
    } catch { /* almacenamiento no disponible */ }
  }, [nodes, statusKey])

  // Aviso del navegador al cerrar/refrescar con cambios sin guardar (item 3).
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const handleSaveConfig = useCallback(
    (label: string, config: NodeConfig, status: PipelineNodeStatus, error?: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedNodeId
            ? { ...n, data: { ...n.data, label, config, status, error } }
            : n
        )
      )
      notify.success('Configuración guardada', { description: 'Aplicada al nodo del lienzo.' })
    },
    [selectedNodeId, setNodes]
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      if (wouldCreateCycle(edges, connection.source, connection.target)) {
        notify.warning('Conexión no permitida', {
          description: 'Crearía un ciclo en el pipeline.',
        })
        return
      }
      setEdges((eds) => addEdge({ ...connection, animated: true }, eds))
    },
    [edges, setEdges]
  )

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      const kind = event.dataTransfer.getData('application/reactflow') as NodeKind
      const config = NODE_KIND_MAP[kind]
      if (!config) return
      if (nodes.some((n) => n.data.kind === kind)) {
        notify.warning('Solo un nodo por tipo', {
          description: `Ya existe un nodo de "${config.label}". No se admiten múltiples flujos por proyecto.`,
        })
        return
      }

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      const dsLabel = kind === 'ingest' ? workspace?.datasetPath?.split(/[/\\]/).pop() : undefined
      const node: Node<PipelineNodeData> = {
        id: nextId(),
        type: 'pipelineNode',
        position,
        data: {
          label: config.label,
          kind,
          config: defaultConfig(kind),
          ...(dsLabel ? { datasetDescriptor: dsLabel } : {}),
        },
      }
      setNodes((nds) => nds.concat(node))
    },
    [nodes, screenToFlowPosition, setNodes]
  )

  // Alta por tap/clic desde la paleta (táctil/escritorio): posición escalonada.
  const addNode = useCallback(
    (kind: NodeKind) => {
      const config = NODE_KIND_MAP[kind]
      if (!config) return
      if (nodes.some((n) => n.data.kind === kind)) {
        notify.warning('Solo un nodo por tipo', {
          description: `Ya existe un nodo de "${config.label}". No se admiten múltiples flujos por proyecto.`,
        })
        return
      }
      setNodes((nds) => {
        const offset = (nds.length % 6) * 48
        return nds.concat({
          id: nextId(),
          type: 'pipelineNode',
          position: { x: 80 + offset, y: 80 + offset },
          data: { label: config.label, kind, config: defaultConfig(kind) },
        })
      })
    },
    [nodes, setNodes]
  )

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
        <NodePalette onAdd={addNode} />
        <div
          data-tour="canvas"
          className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card/20"
          onDrop={onDrop}
          onDragOver={onDragOver}
        >
        <ReactFlow
          nodes={nodes}
          edges={displayEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => requestSelectNode(node.id)}
          onPaneClick={() => requestCloseNode()}
          onMoveEnd={(_, vp) => {
            // Recuerda pan/zoom para restaurar el mismo espacio al volver al lienzo.
            if (viewportKey) {
              try { localStorage.setItem(viewportKey, JSON.stringify(vp)) } catch { /* noop */ }
            }
          }}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={{ animated: true }}
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
          <CanvasToolbar
            projectName={projectName}
            nodeCount={nodes.length}
            saving={saving}
            dirty={dirty}
            flowRunning={flowRunning}
            canRunFlow={!!token && !!workspace && !!pipelineId}
            onClear={handleClear}
            onSave={() => void handleSavePipeline()}
            onStartFlow={runFlow}
          />
          <MiniMap
            pannable
            zoomable
            className="!hidden rounded-lg !border !border-border !bg-card/80 sm:!block"
            maskColor="color-mix(in oklch, var(--background) 70%, transparent)"
            nodeColor="var(--primary)"
          />
        </ReactFlow>

          {selectedNode && (
            <NodeConfigPanel
              key={selectedNode.id}
              data={selectedNode.data}
              ingest={ingestContext}
              train={trainContext}
              deploy={deployContext}
              onSave={handleSaveConfig}
              onDelete={requestDeleteNode}
              onRequestClose={requestCloseNode}
              onDirtyChange={setNodeDirty}
            />
          )}
        </div>
      </div>

      {token && workspace && pipelineId && (
        <LogConsole
          token={token}
          workspaceId={workspace.idWorkspace}
          pipelineId={pipelineId}
          executionId={activeExecutionId}
          onLogEvent={onFlowLogEvent}
          closeSignal={logCloseSignal}
        />
      )}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(open) => { if (!open) setConfirm(null) }}
        title={confirm?.title ?? ''}
        description={confirm?.description ?? ''}
        confirmLabel={confirm?.confirmLabel}
        cancelLabel={confirm?.cancelLabel}
        tone={confirm?.tone}
        onConfirm={async () => { await confirm?.onConfirm() }}
      />
    </div>
  )
}
