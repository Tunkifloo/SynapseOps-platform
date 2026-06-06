import type { NodeKind } from '@/features/pipelines/nodeKinds'

export type FieldType = 'text' | 'number' | 'select'
export type NodeConfig = Record<string, string | number>

export interface FieldDef {
  name: string
  label: string
  type: FieldType
  options?: { value: string; label: string }[]
  min?: number
  max?: number
  step?: string
  placeholder?: string
  help?: string
  showIf?: (config: NodeConfig) => boolean
}

const batchSizes = [8, 16, 32, 64, 128, 256].map((v) => ({
  value: String(v),
  label: String(v),
}))

/** Campos de configuración por tipo de nodo (HU-002…HU-005, HU-028). */
export const NODE_FIELDS: Record<NodeKind, FieldDef[]> = {
  ingest: [
    {
      name: 'mode',
      label: 'Origen del dataset',
      type: 'select',
      options: [
        { value: 'keras', label: 'Built-in (Keras)' },
        { value: 'url', label: 'Desde URL (.zip / repo)' },
        { value: 'zip', label: 'Subir .zip' },
      ],
    },
    {
      name: 'kerasDataset',
      label: 'Dataset',
      type: 'select',
      options: [
        { value: 'mnist', label: 'MNIST' },
        { value: 'fashion_mnist', label: 'Fashion-MNIST' },
      ],
      showIf: (c) => c.mode === 'keras',
    },
    {
      name: 'url',
      label: 'URL del dataset',
      type: 'text',
      placeholder: 'https://…/data.zip',
      showIf: (c) => c.mode === 'url',
    },
  ],
  preprocess: [
    {
      name: 'strategy',
      label: 'Estrategia',
      type: 'select',
      options: [
        { value: 'normalization', label: 'Normalización [0,1]' },
        { value: 'resize', label: 'Redimensionar' },
      ],
    },
    {
      name: 'imageSize',
      label: 'Tamaño (px)',
      type: 'number',
      min: 16,
      max: 512,
      showIf: (c) => c.strategy === 'resize',
    },
  ],
  split: [
    {
      name: 'trainRatio',
      label: '% Entrenamiento',
      type: 'number',
      min: 50,
      max: 90,
      help: 'El resto se reparte entre validación y test.',
    },
  ],
  train: [
    {
      name: 'framework',
      label: 'Framework',
      type: 'select',
      options: [
        { value: 'tensorflow', label: 'TensorFlow' },
        { value: 'pytorch', label: 'PyTorch' },
      ],
    },
    {
      name: 'architecture',
      label: 'Arquitectura',
      type: 'select',
      options: [{ value: 'cnn', label: 'CNN (adaptativa)' }],
      help: 'Solo CNN disponible (MobileNet/ResNet en backlog).',
    },
    { name: 'epochs', label: 'Epochs', type: 'number', min: 1, max: 100 },
    { name: 'batchSize', label: 'Batch size', type: 'select', options: batchSizes },
    { name: 'learningRate', label: 'Learning rate', type: 'text', placeholder: '0.001' },
    { name: 'modelName', label: 'Nombre del modelo', type: 'text', placeholder: 'mnist_cnn_demo' },
  ],
  deploy: [],
}

/**
 * Valida la configuración de un nodo según su esquema (HU-003/HU-004/HU-005).
 * Devuelve el primer mensaje de error, o `null` si es válida.
 */
export function validateConfig(kind: NodeKind, config: NodeConfig): string | null {
  for (const field of NODE_FIELDS[kind]) {
    if (field.showIf && !field.showIf(config)) continue
    const value = config[field.name]

    if (field.type === 'number') {
      const n = Number(value)
      if (value === '' || value === undefined || Number.isNaN(n)) {
        return `${field.label}: ingresa un valor numérico.`
      }
      if (field.min !== undefined && n < field.min) return `${field.label}: mínimo ${field.min}.`
      if (field.max !== undefined && n > field.max) return `${field.label}: máximo ${field.max}.`
    } else if (field.type === 'select') {
      if (value === undefined || value === '') return `${field.label}: selecciona una opción.`
    } else {
      if (value === undefined || String(value).trim() === '') {
        return `${field.label}: este campo es obligatorio.`
      }
      if (field.name === 'learningRate' && Number.isNaN(Number(value))) {
        return 'Learning rate: debe ser un número (p. ej. 0.001).'
      }
    }
  }
  return null
}

export const defaultConfig = (kind: NodeKind): NodeConfig => {
  switch (kind) {
    case 'ingest':
      return { mode: 'keras', kerasDataset: 'mnist', url: '' }
    case 'preprocess':
      return { strategy: 'normalization', imageSize: 64 }
    case 'split':
      return { trainRatio: 80 }
    case 'train':
      return {
        framework: 'tensorflow',
        architecture: 'cnn',
        epochs: 5,
        batchSize: '32',
        learningRate: '0.001',
        modelName: '',
      }
    case 'deploy':
      return {}
  }
}
