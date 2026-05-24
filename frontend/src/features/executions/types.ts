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