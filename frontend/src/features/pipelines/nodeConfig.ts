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

/** Catálogo granular de Data Augmentation. `param` = clave que espera el ML Engine. */
export interface AugTechnique {
  key: string
  label: string
  param: string
  paramLabel: string
  min: number
  max: number
  step: string
  default: number
}

export const AUG_TECHNIQUES: AugTechnique[] = [
  { key: 'flipH', label: 'Flip horizontal', param: 'prob', paramLabel: 'Probabilidad', min: 0, max: 1, step: '0.05', default: 0.5 },
  { key: 'flipV', label: 'Flip vertical', param: 'prob', paramLabel: 'Probabilidad', min: 0, max: 1, step: '0.05', default: 0.5 },
  { key: 'rotation', label: 'Rotación', param: 'maxDeg', paramLabel: 'Ángulo máx. (°)', min: 0, max: 45, step: '1', default: 15 },
  { key: 'brightness', label: 'Brillo', param: 'factor', paramLabel: 'Factor', min: 0, max: 1, step: '0.05', default: 0.2 },
  { key: 'contrast', label: 'Contraste', param: 'factor', paramLabel: 'Factor', min: 0, max: 1, step: '0.05', default: 0.2 },
  { key: 'saturation', label: 'Saturación', param: 'factor', paramLabel: 'Factor', min: 0, max: 1, step: '0.05', default: 0.3 },
  { key: 'sharpness', label: 'Nitidez', param: 'intensity', paramLabel: 'Intensidad', min: 0, max: 2, step: '0.1', default: 1.0 },
  { key: 'zoom', label: 'Zoom / Crop', param: 'scale', paramLabel: 'Escala', min: 0, max: 0.5, step: '0.05', default: 0.1 },
  { key: 'gaussianNoise', label: 'Ruido gaussiano', param: 'std', paramLabel: 'Desv. estándar', min: 0, max: 0.1, step: '0.01', default: 0.02 },
  { key: 'translation', label: 'Traslación', param: 'fraction', paramLabel: 'Fracción', min: 0, max: 0.3, step: '0.05', default: 0.1 },
]

// Cada técnica → un toggle (on/off) + su parámetro (visible si está activa y el
// augmentation maestro también). Se muestran solo con "Data Augmentation" activado.
const AUG_FIELDS: FieldDef[] = AUG_TECHNIQUES.flatMap((t): FieldDef[] => [
  {
    name: `aug_${t.key}`,
    label: t.label,
    type: 'select',
    options: [
      { value: 'false', label: 'Desactivado' },
      { value: 'true', label: 'Activado' },
    ],
    showIf: (c) => c.dataAugmentation === 'true',
  },
  {
    name: `aug_${t.key}_p`,
    label: `${t.label} · ${t.paramLabel}`,
    type: 'number',
    min: t.min,
    max: t.max,
    step: t.step,
    showIf: (c) => c.dataAugmentation === 'true' && c[`aug_${t.key}`] === 'true',
  },
])

const isCnn = (c: NodeConfig) => (c.architecture ?? 'cnn') === 'cnn'
const isPretrained = (c: NodeConfig) => (c.architecture ?? 'cnn') !== 'cnn'

/** Ensambla el objeto augmentationConfig (JSON) que espera el ML Engine. */
export function buildAugmentationConfig(c: NodeConfig): Record<string, unknown> {
  if (c.dataAugmentation !== 'true') return {}
  const out: Record<string, unknown> = {}
  for (const t of AUG_TECHNIQUES) {
    if (c[`aug_${t.key}`] === 'true') {
      const raw = c[`aug_${t.key}_p`]
      const val = raw === '' || raw === undefined ? t.default : Number(raw)
      out[t.key] = { enabled: true, [t.param]: Number.isNaN(val) ? t.default : val }
    }
  }
  return out
}

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
        { value: 'true', label: 'Activado (selecciona técnicas)' },
      ],
      help: 'Al activarlo, elige individualmente las técnicas y su intensidad.',
    },
    ...AUG_FIELDS,
    {
      name: 'classBalancing',
      label: 'Balanceo de clases',
      type: 'select',
      options: [
        { value: 'off', label: 'Desactivado' },
        { value: 'oversample', label: 'Sobremuestreo (augmentation)' },
        { value: 'undersample', label: 'Submuestreo' },
        { value: 'hybrid', label: 'Combinado (híbrido)' },
      ],
      help: 'Corrige distribuciones de clase asimétricas (solo sobre el train).',
    },
    {
      name: 'balanceThreshold',
      label: 'Umbral de desbalance (%)',
      type: 'number',
      min: 10,
      max: 80,
      help: 'Diferencia tolerada entre clases antes de intervenir.',
      showIf: (c) => c.classBalancing !== undefined && c.classBalancing !== 'off',
    },
    {
      name: 'imageSize',
      label: 'Tamaño de imagen (px)',
      type: 'number',
      min: 16,
      max: 512,
      help: 'Solo para datasets propios; los built-in usan su tamaño nativo. Transfer Learning fuerza 224.',
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
      options: [
        { value: 'cnn', label: 'CNN (adaptativa, desde cero)' },
        { value: 'efficientnet', label: 'EfficientNetB0 (preentrenada)' },
        { value: 'mobilenet', label: 'MobileNetV2 (preentrenada)' },
        { value: 'resnet', label: 'ResNet50 (preentrenada)' },
      ],
      help: 'CNN entrena desde cero; las preentrenadas usan Transfer Learning (ImageNet).',
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
    // CNN desde cero: epochs + learning rate únicos (ocultos en Transfer Learning).
    { name: 'epochs', label: 'Epochs', type: 'number', min: 1, max: 100, showIf: isCnn },
    { name: 'batchSize', label: 'Batch size', type: 'select', options: batchSizes },
    { name: 'learningRate', label: 'Learning rate', type: 'text', placeholder: '0.001', showIf: isCnn },
    // ── Transfer Learning: 2 fases (solo arquitecturas preentrenadas) ─────────
    {
      name: 'featureExtractionEpochs', label: 'Feature Extraction · epochs',
      type: 'number', min: 1, max: 50, showIf: isPretrained,
      help: 'Epochs con el backbone congelado (solo se entrena la cabeza).',
    },
    {
      name: 'featureExtractionLr', label: 'Feature Extraction · learning rate',
      type: 'text', placeholder: '0.001', showIf: isPretrained,
    },
    {
      name: 'finetuningEpochs', label: 'Fine-Tuning · epochs',
      type: 'number', min: 0, max: 100, showIf: isPretrained,
      help: '0 = solo feature extraction (datasets muy pequeños).',
    },
    {
      name: 'finetuningLr', label: 'Fine-Tuning · learning rate',
      type: 'text', placeholder: '0.00001',
      showIf: (c) => isPretrained(c) && Number(c.finetuningEpochs) > 0,
    },
    {
      name: 'unfreezeLayers', label: 'Capas a descongelar',
      type: 'number', min: 1, max: 50,
      showIf: (c) => isPretrained(c) && Number(c.finetuningEpochs) > 0,
    },
    // ── Regularización (aplica a la CNN y a las cabezas preentrenadas) ────────
    { name: 'dropout', label: 'Dropout', type: 'number', min: 0, max: 0.9, step: '0.05' },
    { name: 'l2', label: 'Regularización L2', type: 'number', min: 0, max: 0.1, step: '0.001' },
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
      return {
        normalization: 'minmax',
        dataAugmentation: 'false',
        imageSize: 64,
        classBalancing: 'off',
        balanceThreshold: 40,
        // Técnicas de augmentation: todas desactivadas, con su parámetro por defecto.
        ...Object.fromEntries(
          AUG_TECHNIQUES.flatMap((t) => [
            [`aug_${t.key}`, 'false'],
            [`aug_${t.key}_p`, t.default],
          ])
        ),
      }
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
        // Transfer Learning (defaults sensatos; LR de FT 100x menor que el de FE).
        featureExtractionEpochs: 5,
        featureExtractionLr: '0.001',
        finetuningEpochs: 10,
        finetuningLr: '0.00001',
        unfreezeLayers: 10,
        // Regularización.
        dropout: 0.4,
        l2: 0,
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
