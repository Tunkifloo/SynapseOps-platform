export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'

export interface ExecutionSummary {
    idExecution: number
    status: ExecutionStatus
    startedAt: string | null
    finishedAt: string | null
    mlflowRunId: string | null
    pipelineId: number
    modelVersion: string | null
    artifactPath: string | null
    metrics: string | null
}

export interface ExecutionRequest {
    framework: 'tensorflow' | 'pytorch'
    architecture: string
    epochs: number
    batchSize: number
    learningRate: number
    numClasses: number
    modelName: string
    // Parametrización de los nodos Preprocesamiento y Split (opcional).
    preprocessingStrategy?: string
    imageSize?: number
    trainRatio?: number
    // Mejoras de CNN (item 6).
    normalization?: string
    dataAugmentation?: boolean
    optimizer?: string
    batchNorm?: boolean
    earlyStopping?: boolean
    esPatience?: number
    esMonitor?: string
    // Catálogo de Data Augmentation (JSON-string) + balanceo de clases.
    augmentationConfig?: string
    classBalancing?: string
    balanceThreshold?: number
    // Regularización.
    dropout?: number
    l2?: number
    // Transfer Learning (2 fases).
    featureExtractionEpochs?: number
    featureExtractionLr?: number
    finetuningEpochs?: number
    finetuningLr?: number
    unfreezeLayers?: number
    // HPO · optimización automática de hiperparámetros (Fase 4).
    hpo?: boolean
    hpoTrials?: number
    hpoEffort?: string
}

export interface ExecutionFormData {
    framework: 'tensorflow' | 'pytorch'
    architecture: string
    epochs: string
    batchSize: string
    learningRate: string
    numClasses: string
    modelName: string
}

export const defaultExecutionForm = (): ExecutionFormData => ({
    framework: 'tensorflow',
    architecture: 'cnn_adaptive',
    epochs: '5',
    batchSize: '64',
    learningRate: '0.001',
    numClasses: '10',
    modelName: 'mnist_cnn_demo',
})

export const parseMetrics = (metricsJson: string | null): Record<string, number> => {
    if (!metricsJson) return {}
    try {
        return JSON.parse(metricsJson) as Record<string, number>
    } catch {
        return {}
    }
}

// ── Señales de calidad del entrenamiento (overfitting + data drift) ──────────────
export interface OverfitWarning {
    gap: number
    train_accuracy: number
    val_accuracy: number
    severity: 'mild' | 'moderate' | 'high'
    message: string
}

export interface DriftItem {
    drifted: boolean
    severity: 'none' | 'moderate' | 'significant'
    share_drifted: number
    max_psi: number
    drifted_features: string[]
}

export interface QualitySignals {
    overfit?: OverfitWarning
    driftSplit?: DriftItem        // train vs validación (calidad del split)
    driftRetraining?: DriftItem   // dataset actual vs corrida anterior
    primarySplit?: 'test' | 'val'
    primaryAccuracy?: number
}

/** Extrae overfit + drift del blob de métricas (el backend los fusiona ahí). */
export const parseQualitySignals = (metricsJson: string | number | null | undefined): QualitySignals => {
    if (typeof metricsJson !== 'string' || !metricsJson) return {}
    try {
        const m = JSON.parse(metricsJson) as Record<string, unknown>
        const drift = m.drift as { split?: DriftItem; retraining?: DriftItem } | undefined
        return {
            overfit: (m.overfit_warning as OverfitWarning) || undefined,
            driftSplit: drift?.split,
            driftRetraining: drift?.retraining,
            primarySplit: (m.primary_split as 'test' | 'val') || undefined,
            primaryAccuracy: typeof m.primary_accuracy === 'number' ? m.primary_accuracy : undefined,
        }
    } catch {
        return {}
    }
}