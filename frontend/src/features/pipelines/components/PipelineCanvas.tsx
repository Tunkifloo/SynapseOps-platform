import { useCallback, useMemo, useState, type DragEvent } from 'react'
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
import { defaultConfig, type NodeConfig } from '@/features/pipelines/nodeConfig'
import { PipelineNode, type PipelineNodeData, type PipelineNodeStatus } from './PipelineNode'
import { NodePalette } from './NodePalette'
import { NodeConfigPanel } from './NodeConfigPanel'
import { CanvasToolbar } from './CanvasToolbar'

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
}

export function PipelineCanvas({
  token,
  workspace,
  pipelineId,
  onWorkspaceRefresh,
}: PipelineCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<PipelineNodeData>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const { screenToFlowPosition } = useReactFlow()
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

  const handleSavePipeline = useCallback(() => {
    try {
      localStorage.setItem(
        `synapseops:canvas:${projectName}`,
        JSON.stringify({ nodes, edges })
      )
      notify.success('Pipeline guardado', {
        description: 'Borrador local — la persistencia en servidor llega en HU-024.',
      })
    } catch {
      notify.error('No se pudo guardar el borrador local.')
    }
  }, [nodes, edges, projectName])

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

  return (
    <div className="flex h-full min-h-0 gap-3">
      <NodePalette />
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
            onClear={handleClear}
            onSave={handleSavePipeline}
          />
          <MiniMap pannable zoomable />
        </ReactFlow>

        {selectedNode && (
          <NodeConfigPanel
            key={selectedNode.id}
            data={selectedNode.data}
            ingest={ingestContext}
            train={trainContext}
            onSave={handleSaveConfig}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>
    </div>
  )
}
