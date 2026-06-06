import { useCallback, useState, type DragEvent } from 'react'
import ReactFlow, {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
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
import { NODE_KIND_MAP, type NodeKind } from '@/features/pipelines/nodeKinds'
import { defaultConfig, type NodeConfig } from '@/features/pipelines/nodeConfig'
import { PipelineNode, type PipelineNodeData } from './PipelineNode'
import { NodePalette } from './NodePalette'
import { NodeConfigPanel } from './NodeConfigPanel'

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

export function PipelineCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState<PipelineNodeData>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const { screenToFlowPosition } = useReactFlow()

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null

  const handleSaveConfig = useCallback(
    (label: string, config: NodeConfig) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedNodeId ? { ...n, data: { ...n.data, label, config } } : n
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
          edges={edges}
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
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>

        {selectedNode && (
          <NodeConfigPanel
            key={selectedNode.id}
            data={selectedNode.data}
            onSave={handleSaveConfig}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>
    </div>
  )
}
