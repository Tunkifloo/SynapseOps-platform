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
      name: 'normalization',
      label: 'Normalización',
      type: 'select',
      options: [
        { value: 'minmax', label: 'Min-Max [0,1]' },
        { value: 'zscore', label: 'Z-score (media/σ)' },
        { value: 'rescale', label: 'Rescale [-1,1]' },
      ],
      help: 'Escalado de los píxeles antes de entrenar.',
    },
    {
      name: 'dataAugmentation',
      label: 'Data Augmentation',
      type: 'select',
      options: [
        { value: 'false', label: 'Desactivado' },
        { value: 'true', label: 'Activado (flip/rotación/zoom)' },
      ],
    },
    {
      name: 'imageSize',
      label: 'Tamaño de imagen (px)',
      type: 'number',
      min: 16,
      max: 512,
      help: 'Solo para datasets propios; los built-in usan su tamaño nativo.',
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
    {
      name: 'optimizer',
      label: 'Optimizador',
      type: 'select',
      options: [
        { value: 'adam', label: 'Adam' },
        { value: 'adamw', label: 'AdamW' },
        { value: 'sgd', label: 'SGD (momentum)' },
        { value: 'rmsprop', label: 'RMSprop' },
      ],
    },
    { name: 'epochs', label: 'Epochs', type: 'number', min: 1, max: 100 },
    { name: 'batchSize', label: 'Batch size', type: 'select', options: batchSizes },
    { name: 'learningRate', label: 'Learning rate', type: 'text', placeholder: '0.001' },
    {
      name: 'batchNorm',
      label: 'Batch Normalization',
      type: 'select',
      options: [
        { value: 'false', label: 'Desactivado' },
        { value: 'true', label: 'Activado' },
      ],
    },
    {
      name: 'earlyStopping',
      label: 'Early Stopping',
      type: 'select',
      options: [
        { value: 'false', label: 'Desactivado' },
        { value: 'true', label: 'Activado' },
      ],
    },
    {
      name: 'esPatience',
      label: 'Paciencia (epochs)',
      type: 'number',
      min: 1,
      max: 50,
      showIf: (c) => c.earlyStopping === 'true',
    },
    {
      name: 'esMonitor',
      label: 'Monitorizar',
      type: 'select',
      options: [
        { value: 'val_loss', label: 'val_loss (mín)' },
        { value: 'val_accuracy', label: 'val_accuracy (máx)' },
      ],
      showIf: (c) => c.earlyStopping === 'true',
    },
    // El modelo (nuevo vs re-entrenar existente) se gestiona en TrainModelSource.
  ],
  deploy: [],
}

/**
 * Valida la configuración de un nodo según su esquema (HU-003/HU-004/HU-005).
 * Devuelve el primer mensaje de error, o `null` si es válida.
 */
export function validateConfig(kind: NodeKind, config: NodeConfig): string | null {
  // El nombre/modelo del entrenamiento se gestiona aparte (nuevo o existente).
  if (kind === 'train' && String(config.modelName ?? '').trim() === '') {
    return config.modelMode === 'existing'
      ? 'Modelo: selecciona un modelo existente para re-entrenar.'
      : 'Modelo: ingresa un nombre para el nuevo modelo.'
  }
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
      return { normalization: 'minmax', dataAugmentation: 'false', imageSize: 64 }
    case 'split':
      return { trainRatio: 80 }
    case 'train':
      return {
        framework: 'tensorflow',
        architecture: 'cnn',
        optimizer: 'adam',
        epochs: 5,
        batchSize: '32',
        learningRate: '0.001',
        batchNorm: 'false',
        earlyStopping: 'false',
        esPatience: 3,
        esMonitor: 'val_loss',
        modelMode: 'new',
        modelName: '',
      }
    case 'deploy':
      return {}
  }
}
