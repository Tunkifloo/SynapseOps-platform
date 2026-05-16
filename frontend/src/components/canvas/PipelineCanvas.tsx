import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';

// No importamos nada de types/pipeline todavía para evitar errores
const initialNodes = [
  { 
    id: 'node-1', 
    position: { x: 250, y: 150 }, 
    data: { label: 'Data Ingestion (Sprint 1 Base)' },
    style: { 
      background: '#10b981', 
      color: '#fff', 
      borderRadius: '8px',
      padding: '10px',
      fontWeight: 'bold',
      border: 'none'
    } 
  },
];

export const PipelineCanvas = () => {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow nodes={initialNodes} fitView>
        <Background color="#334155" gap={20} />
        <Controls />
      </ReactFlow>
    </div>
  );
};