import { MlflowPanel } from '@/features/mlflow/components/MlflowPanel'
import { SectionTitle } from '@/shared/components/SectionTitle'

interface MlflowPageProps {
    token: string
    onAuthError: (error: unknown) => boolean
}

export function MlflowPage({ token, onAuthError }: MlflowPageProps) {
    return (
        <div className="space-y-6">
            <SectionTitle
                eyebrow="EN-011 · Admin only"
                title="MLflow Model Registry"
                description="Seguimiento de experimentos, modelos registrados y métricas de entrenamiento desde el MLflow Tracking Server integrado."
            />
            <MlflowPanel token={token} onAuthError={onAuthError} />
        </div>
    )
}