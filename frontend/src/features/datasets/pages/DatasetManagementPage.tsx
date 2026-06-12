import { Database } from 'lucide-react'

import { PageHeader } from '@/shared/components/PageHeader'
import { DatasetManagement } from '@/features/datasets/components/DatasetManagement'

interface DatasetManagementPageProps {
  token: string
  searchQuery: string
  onAuthError: (error: unknown) => boolean
}

export function DatasetManagementPage({ token }: DatasetManagementPageProps) {
  return (
    <div className="w-full space-y-5">
      <PageHeader
        icon={Database}
        title="Gestión de Dataset"
        subtitle="Asigna, reemplaza, visualiza y elimina los datasets de tus proyectos. El límite por archivo lo define el servidor."
      />
      <DatasetManagement token={token} />
    </div>
  )
}
