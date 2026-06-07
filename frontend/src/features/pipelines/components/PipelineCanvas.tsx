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

import { notify } from '@/shared/notify'
import { useAppStore } from '@/store/useAppStore'
import { launchExecution, getExecution } from '@/features/executions/api'
import type { ExecutionRequest } from '@/features/executions/types'
import { NODE_KIND_MAP, type NodeKind } from '@/features/pipelines/nodeKinds'
import { defaultConfig, validateConfig, type NodeConfig } from '@/features/pipelines/nodeConfig'
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
  const [saving, setSaving] = useState(false)
  const [flowRunning, setFlowRunning] = useState(false)
  const [activeExecutionId, setActiveExecutionId] = useState<number | null>(null)
  const [dirty, setDirty] = useState(false)       // cambios del lienzo sin guardar (item 3)
  const loadedRef = useRef(false)                 // evita marcar dirty durante la carga inicial
  const baselineRef = useRef<string>('')          // snapshot del último estado guardado/cargado
  const { screenToFlowPosition } = useReactFlow()

  // Claves de persistencia local por pipeline (items 3 y 4).
  const draftKey = pipelineId ? `synapseops:canvas-draft:${workspace?.idWorkspace}:${pipelineId}` : null
  const execKey  = pipelineId ? `synapseops:active-exec:${workspace?.idWorkspace}:${pipelineId}` : null

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
  const storeWorkspace = useAppStore((s) => s.currentWorkspace)
  const projectName = workspace?.name ?? storeWorkspace

  // Contexto para el nodo de Ingesta (HU-002): asigna dataset al workspace vinculado.
  const ingestContext =
    token && workspace
      ? {
          token,
          workspaceId: workspace.idWorkspace,
          onAssigned: (descriptor: string) => {
            setNodes((nds) =>
              nds.map((n) =>
                n.id === selectedNodeId
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        status: 'success' as const,
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
        architecture: 'cnn',
        epochs: Number(cfg.epochs) || 5,
        batchSize: Number(cfg.batchSize) || 32,
        learningRate: Number(cfg.learningRate) || 0.001,
        numClasses: 10, // el ml-engine autodetecta el real
        modelName: String(cfg.modelName || 'modelo'),
      }

      void (async () => {
        let executionId: number
        try {
          const exec = await launchExecution(token, wsId, pipelineId, payload)
          executionId = exec.idExecution
          setActiveExecutionId(executionId) // abre la consola SSE (HU-023)
          notify.info('Entrenamiento iniciado', { description: `Ejecución #${executionId}` })
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
    const wsId = workspace.idWorkspace
    const trainNode = nodes.find((n) => n.data.kind === 'train')
    const preprocessNode = nodes.find((n) => n.data.kind === 'preprocess')
    const splitNode = nodes.find((n) => n.data.kind === 'split')
    const cfg: NodeConfig = { ...defaultConfig('train'), ...(trainNode?.data.config ?? {}) }
    const preCfg: NodeConfig = preprocessNode
      ? { ...defaultConfig('preprocess'), ...(preprocessNode.data.config ?? {}) } : {}
    const splitCfg: NodeConfig = splitNode
      ? { ...defaultConfig('split'), ...(splitNode.data.config ?? {}) } : {}

    setFlowRunning(true)
    // Reinicia estados y arranca por Ingesta; el resto se anima por fases SSE.
    setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, status: 'idle' as const, error: undefined } })))
    setStatusByKind(['ingest'], 'running')

    const payload: ExecutionRequest = {
      framework: (cfg.framework as 'tensorflow' | 'pytorch') ?? 'tensorflow',
      architecture: 'cnn',
      epochs: Number(cfg.epochs) || 5,
      batchSize: Number(cfg.batchSize) || 32,
      learningRate: Number(cfg.learningRate) || 0.001,
      numClasses: 10, // autodetectado por el ml-engine; placeholder ignorado
      modelName: String(cfg.modelName || 'modelo'),
      optimizer: String(cfg.optimizer ?? 'adam'),
      batchNorm: cfg.batchNorm === 'true',
      earlyStopping: cfg.earlyStopping === 'true',
      esPatience: Number(cfg.esPatience) || undefined,
      esMonitor: String(cfg.esMonitor ?? 'val_loss'),
      // Nodos Preprocesamiento y Split (parametrización real en el ml-engine).
      normalization: preprocessNode ? String(preCfg.normalization ?? 'minmax') : undefined,
      dataAugmentation: preprocessNode ? preCfg.dataAugmentation === 'true' : undefined,
      imageSize: preprocessNode ? Number(preCfg.imageSize) || undefined : undefined,
      trainRatio: splitNode ? Number(splitCfg.trainRatio) || undefined : undefined,
    }

    void (async () => {
      let executionId: number
      try {
        const exec = await launchExecution(token, wsId, pipelineId, payload)
        executionId = exec.idExecution
        setActiveExecution(executionId)
        notify.info('Flujo iniciado', { description: `Ejecución #${executionId}` })
      } catch (err) {
        setStatusByKind(['ingest'], 'error', err instanceof Error ? err.message : 'No se pudo iniciar el flujo.')
        setFlowRunning(false)
        return
      }

      let attempts = 0
      const MAX_ATTEMPTS = 120
      const poll = async () => {
        attempts += 1
        try {
          const exec = await getExecution(token, wsId, pipelineId, executionId)
          if (exec.status === 'COMPLETED') {
            setStatusByKind(['ingest', 'preprocess', 'split'], 'success')
            setNodes((nds) => nds.map((n) => n.data.kind === 'train'
              ? { ...n, data: { ...n.data, status: 'success', error: undefined,
                  config: { ...n.data.config, runId: exec.mlflowRunId ?? '', modelVersion: exec.modelVersion ?? '', metrics: exec.metrics ?? '' } } }
              : n))
            notify.success('Flujo completado', { description: exec.mlflowRunId ? `Run ${exec.mlflowRunId}` : undefined })
            setFlowRunning(false)
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
        if (attempts < MAX_ATTEMPTS) window.setTimeout(() => void poll(), 3000)
        else { setFlowRunning(false); notify.warning('Tiempo de espera agotado consultando el estado.') }
      }
      window.setTimeout(() => void poll(), 3000)
    })()
  }, [token, workspace, pipelineId, nodes, validateFlow, setNodes, setStatusByKind])

  // Mapea las fases reales del ml-engine (SSE) a los estados de los nodos.
  // El evento `terminal` reconcilia el estado final también al reconectar (replay),
  // evitando que un nodo quede "running" tras volver a la vista (item 1).
  const onFlowLogEvent = useCallback((level: string, message: string, terminal: boolean) => {
    const m = message.toLowerCase()
    if (terminal) {
      const failed = level === 'ERROR' || m.includes('fallid') || m.includes('error')
      if (failed) {
        setNodes((nds) => nds.map((n) => n.data.status === 'running'
          ? { ...n, data: { ...n.data, status: 'error', error: 'El flujo falló (revisa la consola).' } }
          : n))
      } else {
        setStatusByKind(['ingest', 'preprocess', 'split', 'train'], 'success')
      }
      setFlowRunning(false)
      return
    }
    if (m.includes('cargando dataset')) {
      setStatusByKind(['ingest'], 'running')
    } else if (m.includes('dataset listo')) {
      setStatusByKind(['ingest'], 'success')
      setStatusByKind(['preprocess'], 'running')
    } else if (m.includes('preprocesamiento')) {
      setStatusByKind(['ingest', 'preprocess'], 'success')
      setStatusByKind(['split'], 'running')
    } else if (m.includes('split')) {
      setStatusByKind(['ingest', 'preprocess', 'split'], 'success')
    } else if (m.includes('entrenamiento') || m.includes('entrenando') || m.startsWith('epoch')) {
      setStatusByKind(['ingest', 'preprocess', 'split'], 'success')
      setStatusByKind(['train'], 'running')
    } else if (m.includes('registro')) {
      setStatusByKind(['train'], 'running')
    }
  }, [setStatusByKind, setNodes])

  // Contexto para el Nodo de Despliegue (HU-028): modelos del workspace + handoff.
  const deployContext =
    token && workspace
      ? {
          token,
          workspaceId: workspace.idWorkspace,
          pipelineId: pipelineId ?? null,
          projectName,
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
    setNodes([])
    setEdges([])
    setSelectedNodeId(null)
  }, [setNodes, setEdges])

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
        // Estado del nodo (running/success) es transitorio → se reinicia a idle al
        // cargar; el estado en vivo lo reconstruye el replay SSE (item 1).
        const idle = (ns: Node<PipelineNodeData>[]) =>
          ns.map((n) => ({ ...n, data: { ...n.data, status: 'idle' as const, error: undefined } }))

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
                setNodes(idle(draft.nodes)); setEdges(draft.edges)
                restored = true
                notify.warning('Borrador restaurado', {
                  description: 'Tienes cambios del lienzo sin guardar. Pulsa "Guardar" para confirmarlos.',
                })
              }
            }
          } catch { /* borrador corrupto: se ignora */ }
        }
        if (!restored) { setNodes(idle(canvas.nodes as Node<PipelineNodeData>[])); setEdges(canvas.edges) }
        setSelectedNodeId(null)

        // Reanuda la consola de la última ejecución (replay del backend).
        if (execKey) {
          const saved = localStorage.getItem(execKey)
          if (saved) setActiveExecutionId(Number(saved))
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

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      const node: Node<PipelineNodeData> = {
        id: nextId(),
        type: 'pipelineNode',
        position,
        data: { label: config.label, kind, config: defaultConfig(kind) },
      }
      setNodes((nds) => nds.concat(node))
    },
    [screenToFlowPosition, setNodes]
  )

  // Alta por tap/clic desde la paleta (táctil/escritorio): posición escalonada.
  const addNode = useCallback(
    (kind: NodeKind) => {
      const config = NODE_KIND_MAP[kind]
      if (!config) return
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
    [setNodes]
  )

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
        <NodePalette onAdd={addNode} />
        <div
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
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          onPaneClick={() => setSelectedNodeId(null)}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={{ animated: true }}
          fitView
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
              onClose={() => setSelectedNodeId(null)}
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
        />
      )}
    </div>
  )
}
