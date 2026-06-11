import { DatasetManagement } from '@/features/datasets/components/DatasetManagement'

interface DatasetManagementPageProps {
  token: string
  searchQuery: string
  onAuthError: (error: unknown) => boolean
}

export function DatasetManagementPage({ token }: DatasetManagementPageProps) {
  return (
    <div className="w-full space-y-5">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground xl:text-3xl">
            Gestión de Dataset
          </h1>
          <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
            Administra los datasets de tus proyectos: asigna, reemplaza, visualiza y elimina archivos. Límite de 500 MB por archivo.
          </p>
        </div>
      </section>
      <DatasetManagement token={token} />
    </div>
  )
}
