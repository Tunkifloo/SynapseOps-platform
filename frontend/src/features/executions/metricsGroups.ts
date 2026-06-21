/**
 * Agrupación de métricas de un Run por split (Entrenamiento / Validación / Test /
 * Drift) con color semántico y orden lógico — Ticket UX-3.
 *
 * Reglas:
 *  - Sin prefijo (accuracy, loss, train_*) → Entrenamiento.
 *  - val_*  → Validación · test_* → Test · drift_* → Drift.
 *  - Orden interno: accuracy → loss → precision → recall → f1 → roc_auc.
 *  - Se excluyen claves meta/duplicadas (primary_*, final_*).
 */
export type SplitKey = 'train' | 'val' | 'test' | 'drift'

export interface MetricGroup {
  key: SplitKey
  title: string
  /** Clase de color del valor numérico (token oficial del design system). */
  valueClass: string
  /** [etiqueta visible, valor] ya ordenado. */
  entries: [string, number][]
}

const META = new Set(['primary_accuracy', 'primary_split', 'final_accuracy', 'final_loss'])
const ORDER = ['accuracy', 'loss', 'precision', 'recall', 'f1', 'roc_auc']

const baseMetric = (k: string) => k.replace(/^(val_|test_|train_|drift_)/, '')
const orderIdx = (k: string) => {
  const i = ORDER.indexOf(baseMetric(k))
  return i < 0 ? 99 : i
}

export function groupMetricsBySplit(metrics: Record<string, number | string>): MetricGroup[] {
  const num = Object.entries(metrics).filter(
    ([k, v]) => typeof v === 'number' && Number.isFinite(v) && !META.has(k)
  ) as [string, number][]

  const buckets: Record<SplitKey, [string, number][]> = { train: [], val: [], test: [], drift: [] }
  for (const [k, v] of num) {
    if (k.startsWith('val_')) buckets.val.push([k, v])
    else if (k.startsWith('test_')) buckets.test.push([k, v])
    else if (k.startsWith('drift_')) buckets.drift.push([k, v])
    else buckets.train.push([k, v]) // accuracy, loss, train_*
  }

  const sortPerf = (a: [string, number], b: [string, number]) => orderIdx(a[0]) - orderIdx(b[0])
  buckets.train.sort(sortPerf)
  buckets.val.sort(sortPerf)
  buckets.test.sort(sortPerf)

  // Las métricas de train sin prefijo se muestran como "train accuracy"/"train loss".
  const trainLabel = (k: string) =>
    k === 'accuracy' ? 'train accuracy' : k === 'loss' ? 'train loss' : k.replace(/_/g, ' ')
  const spaced = (k: string) => k.replace(/_/g, ' ')

  const groups: MetricGroup[] = [
    { key: 'train', title: 'Entrenamiento', valueClass: 'text-primary-strong',
      entries: buckets.train.map(([k, v]) => [trainLabel(k), v]) },
    { key: 'val', title: 'Validación', valueClass: 'text-cta-strong',
      entries: buckets.val.map(([k, v]) => [spaced(k), v]) },
    { key: 'test', title: 'Test', valueClass: 'text-success-strong',
      entries: buckets.test.map(([k, v]) => [spaced(k), v]) },
    { key: 'drift', title: 'Drift / Calidad de datos', valueClass: 'text-warning-strong',
      entries: buckets.drift.map(([k, v]) => [spaced(k), v]) },
  ]
  return groups.filter((g) => g.entries.length > 0)
}

/** Formato: % para accuracy, 4 decimales para el resto. */
export const formatMetric = (label: string, value: number) =>
  /acc/i.test(label) ? `${(value * 100).toFixed(1)}%` : value.toFixed(4)

/**
 * Glosario de métricas para los usuarios menos experimentados (se muestra en el «?» junto
 * a cada métrica, igual en el nodo de Entrenamiento y en el detalle del modelo). Se resuelve
 * por palabra clave en la etiqueta, así sirve para "train precision", "val_loss", "split max psi", etc.
 */
const METRIC_HELP: { test: RegExp; help: string }[] = [
  { test: /acc/i, help: 'Accuracy (exactitud): porcentaje de imágenes clasificadas correctamente. Fácil de leer, pero puede engañar si las clases están desbalanceadas.' },
  { test: /loss/i, help: 'Loss (pérdida): qué tan lejos están las predicciones de lo correcto. Más baja es mejor; sirve para comparar epochs y detectar sobreajuste (cuando la val_loss empieza a subir).' },
  { test: /precision/i, help: 'Precisión: de lo que el modelo marcó como una clase, qué fracción acertó. Alta = pocos falsos positivos.' },
  { test: /recall/i, help: 'Recall (sensibilidad): de todos los casos reales de una clase, qué fracción detectó. Alto = pocos falsos negativos.' },
  { test: /f1/i, help: 'F1: combina precisión y recall en un solo número (media armónica). Buen resumen cuando las clases están desbalanceadas.' },
  { test: /(roc|auc)/i, help: 'ROC AUC: capacidad del modelo de separar las clases en todos los umbrales (0.5 = azar, 1.0 = perfecto). Robusta al desbalance.' },
  { test: /psi/i, help: 'PSI (Population Stability Index): mide cuánto cambió la distribución de los datos. < 0.10 = estable · 0.10–0.25 = deriva moderada · ≥ 0.25 = deriva significativa (conviene revisar el dataset o reentrenar).' },
  { test: /share|fracc|deriv/i, help: 'Fracción de características cuya distribución cambió de forma significativa (PSI ≥ 0.25). Cuanto mayor, más cambió el conjunto de datos.' },
]

/** Ayuda contextual de una métrica por su etiqueta (o undefined si no se reconoce). */
export const metricHelp = (label: string): string | undefined =>
  METRIC_HELP.find((m) => m.test.test(label))?.help
