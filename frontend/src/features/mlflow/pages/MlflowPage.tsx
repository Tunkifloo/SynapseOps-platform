import { RefreshCw, ShieldCheck } from 'lucide-react'

import { MlflowPanel } from '@/features/mlflow/components/MlflowPanel'
import { Button } from '@/shared/components/ui/button'

interface MlflowPageProps {
  token: string
  onAuthError: (error: unknown) => boolean
}

export function MlflowPage({ token, onAuthError }: MlflowPageProps) {
  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            Solo administradores
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50 xl:text-3xl">
            Registro de modelos MLflow
          </h1>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-400 xl:text-base">
            Seguimiento de experimentos, modelos registrados y métricas de entrenamiento desde el servidor MLflow.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="mt-10 h-10 shrink-0 border-blue-500/35 bg-blue-500/5 px-5 text-blue-200 hover:bg-blue-500/10 hover:text-blue-100"
          onClick={() => window.dispatchEvent(new CustomEvent('synapseops:refresh-mlflow'))}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      </section>

      <MlflowPanel token={token} onAuthError={onAuthError} />
    </div>
  )
}
