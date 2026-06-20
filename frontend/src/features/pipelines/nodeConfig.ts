import type { NodeKind } from '@/features/pipelines/nodeKinds'

export type FieldType = 'text' | 'number' | 'select' | 'info'
export type NodeConfig = Record<string, string | number>

export interface FieldDef {
  name: string
  label: string
  type: FieldType
  /** Texto fijo a mostrar cuando type === 'info' (campo de solo lectura, no editable). */
  text?: string
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
  /** Qué hace la técnica y cuándo conviene (ayuda contextual en el panel). */
  help: string
}

export const AUG_TECHNIQUES: AugTechnique[] = [
  { key: 'flipH', label: 'Flip horizontal', param: 'prob', paramLabel: 'Probabilidad', min: 0, max: 1, step: '0.05', default: 0.5,
    help: 'Voltea la imagen de izquierda a derecha. Útil casi siempre; evítalo si la orientación importa (texto, señales).' },
  { key: 'flipV', label: 'Flip vertical', param: 'prob', paramLabel: 'Probabilidad', min: 0, max: 1, step: '0.05', default: 0.5,
    help: 'Voltea la imagen de arriba a abajo. Útil en imágenes aéreas/satelitales; perjudicial en rostros u objetos con “arriba/abajo” claro.' },
  { key: 'rotation', label: 'Rotación', param: 'maxDeg', paramLabel: 'Ángulo máx. (°)', min: 0, max: 45, step: '1', default: 15,
    help: 'Gira la imagen un ángulo aleatorio hasta ±este valor. Da robustez a la orientación; ángulos muy grandes pueden distorsionar.' },
  { key: 'brightness', label: 'Brillo', param: 'factor', paramLabel: 'Factor', min: 0, max: 1, step: '0.05', default: 0.2,
    help: 'Aclara u oscurece aleatoriamente. Simula distintas condiciones de luz.' },
  { key: 'contrast', label: 'Contraste', param: 'factor', paramLabel: 'Factor', min: 0, max: 1, step: '0.05', default: 0.2,
    help: 'Varía el contraste (diferencia entre claros y oscuros). Robustez ante cámaras/exposiciones distintas.' },
  { key: 'saturation', label: 'Saturación', param: 'factor', paramLabel: 'Factor', min: 0, max: 1, step: '0.05', default: 0.3,
    help: 'Varía la intensidad del color. Solo aplica a imágenes a color (3 canales); se omite en escala de grises.' },
  { key: 'sharpness', label: 'Nitidez', param: 'intensity', paramLabel: 'Intensidad', min: 0, max: 2, step: '0.1', default: 1.0,
    help: 'Enfoca (>1) o difumina (<1) la imagen. 1.0 = sin cambio.' },
  { key: 'zoom', label: 'Zoom / Crop', param: 'scale', paramLabel: 'Escala', min: 0, max: 0.5, step: '0.05', default: 0.1,
    help: 'Acerca y recorta una región aleatoria. Enseña al modelo a reconocer el objeto a distintas escalas/encuadres.' },
  { key: 'gaussianNoise', label: 'Ruido gaussiano', param: 'std', paramLabel: 'Desv. estándar', min: 0, max: 0.1, step: '0.01', default: 0.02,
    help: 'Añade ruido aleatorio leve. Robustez ante sensores ruidosos; valores altos degradan la imagen.' },
  { key: 'translation', label: 'Traslación', param: 'fraction', paramLabel: 'Fracción', min: 0, max: 0.3, step: '0.05', default: 0.1,
    help: 'Desplaza la imagen en X/Y una fracción de su tamaño. Robustez ante objetos no centrados.' },
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
    help: t.help,
    showIf: (c) => c.dataAugmentation === 'true',
  },
  {
    name: `aug_${t.key}_p`,
    label: `${t.label} · ${t.paramLabel}`,
    type: 'number',
    min: t.min,
    max: t.max,
    step: t.step,
    help: `Rango ${t.min}–${t.max} (recomendado ${t.default}).`,
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
      type: 'info',
      text: 'Min-Max [0,1] (automática)',
      help: 'Los píxeles se escalan a [0,1]. Es la normalización óptima para las CNN y la que esperan los modelos preentrenados (EfficientNet/MobileNet/ResNet), que traen su propio preprocesamiento.',
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
      help: 'Corrige clases desbalanceadas (solo en el train). Sobremuestreo: genera variantes augmentadas de las clases minoritarias. Submuestreo: reduce las mayoritarias. Híbrido: ambas, hacia la media.',
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
      help: 'Resolución de entrada (solo datasets propios; los built-in usan su tamaño nativo). '
        + 'Transfer Learning admite 96–224: 224 = máxima calidad, 160 ≈ mitad de memoria (punto '
        + 'equilibrado), 128 = más ligero. Valores < 96 con backbone usan 224 automáticamente.',
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
      help: 'CNN: red entrenada desde cero, ideal para datasets simples. EfficientNet/MobileNet/ResNet: preentrenadas en ImageNet (Transfer Learning), mejores para datasets reales pequeños o medianos.',
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
      help: 'Learning rate de la Fase 1 (cabeza nueva sobre backbone congelado). Relativamente alto (p. ej. 0.001) para converger rápido.',
    },
    {
      name: 'finetuningEpochs', label: 'Fine-Tuning · epochs',
      type: 'number', min: 0, max: 100, showIf: isPretrained,
      help: '0 = solo feature extraction (datasets muy pequeños).',
    },
    {
      name: 'finetuningLr', label: 'Fine-Tuning · learning rate',
      type: 'text', placeholder: '0.00001',
      help: 'Learning rate de la Fase 2 (fine-tuning). Muy bajo (p. ej. 0.00001) para no destruir lo aprendido en ImageNet.',
      showIf: (c) => isPretrained(c) && Number(c.finetuningEpochs) > 0,
    },
    {
      name: 'unfreezeLayers', label: 'Capas a descongelar',
      type: 'number', min: 1, max: 50,
      help: 'Cuántas de las últimas capas del backbone se reentrenan en el fine-tuning. Más capas = más adaptación al dominio, pero más riesgo de sobreajuste.',
      showIf: (c) => isPretrained(c) && Number(c.finetuningEpochs) > 0,
    },
    // ── Regularización (aplica a la CNN y a las cabezas preentrenadas) ────────
    { name: 'dropout', label: 'Dropout', type: 'number', min: 0, max: 0.9, step: '0.05',
      help: 'Apaga aleatoriamente una fracción de neuronas en cada paso para reducir el sobreajuste. Típico 0.3–0.5; 0 = desactivado.' },
    { name: 'l2', label: 'Regularización L2', type: 'number', min: 0, max: 0.1, step: '0.001',
      help: 'Penaliza pesos grandes (weight decay) para reducir el sobreajuste. Típico 0.0001–0.001; 0 = desactivado.' },
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
        { value: 'both', label: 'Ambas (val_loss mín + val_accuracy máx)' },
      ],
      help: '"Ambas" detiene solo cuando ni la pérdida ni la precisión mejoran.',
      showIf: (c) => c.earlyStopping === 'true',
    },
    // El modelo (nuevo vs re-entrenar existente) se gestiona en TrainModelSource.
  ],
  deploy: [],
}

/**
 * Errores de validación POR CAMPO (clave = nombre del campo). Permite el resaltado
 * en tiempo real del campo concreto que falla (Ticket UX-2). Solo evalúa campos visibles.
 */
export function fieldErrors(kind: NodeKind, config: NodeConfig): Record<string, string> {
  const errors: Record<string, string> = {}

  // El nombre/modelo del entrenamiento se gestiona aparte (nuevo o existente).
  if (kind === 'train' && String(config.modelName ?? '').trim() === '') {
    errors.modelName = config.modelMode === 'existing'
      ? 'Modelo: selecciona un modelo existente para re-entrenar.'
      : 'Modelo: ingresa un nombre para el nuevo modelo.'
  }

  for (const field of NODE_FIELDS[kind]) {
    if (field.showIf && !field.showIf(config)) continue
    const value = config[field.name]

    if (field.type === 'number') {
      const n = Number(value)
      if (value === '' || value === undefined || Number.isNaN(n)) {
        errors[field.name] = `${field.label}: ingresa un valor numérico.`
      } else if (field.min !== undefined && n < field.min) {
        errors[field.name] = `${field.label}: mínimo ${field.min}.`
      } else if (field.max !== undefined && n > field.max) {
        errors[field.name] = `${field.label}: máximo ${field.max}.`
      }
    } else if (field.type === 'select') {
      if (value === undefined || value === '') {
        errors[field.name] = `${field.label}: selecciona una opción.`
      }
    } else {
      if (value === undefined || String(value).trim() === '') {
        errors[field.name] = `${field.label}: este campo es obligatorio.`
      } else if (
        (field.name === 'learningRate' || field.name.endsWith('Lr'))
        && Number.isNaN(Number(value))
      ) {
        errors[field.name] = `${field.label}: debe ser un número (p. ej. 0.001).`
      }
    }
  }
  return errors
}

/**
 * Valida la configuración de un nodo según su esquema (HU-003/HU-004/HU-005).
 * Devuelve el primer mensaje de error, o `null` si es válida.
 */
export function validateConfig(kind: NodeKind, config: NodeConfig): string | null {
  return Object.values(fieldErrors(kind, config))[0] ?? null
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
