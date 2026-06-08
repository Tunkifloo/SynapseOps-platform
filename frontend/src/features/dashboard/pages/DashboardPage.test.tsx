import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { DashboardPage } from './DashboardPage'
import type { WorkspaceSummary } from '@/features/workspaces/types'

// Mock de las capas de datos: el dashboard no debe llamar a la red real.
const listMyWorkspaces = vi.fn()
const listWorkspacePipelines = vi.fn()
const listWorkspaceModels = vi.fn()
const getWorkspaceModelVersions = vi.fn()
const listExecutions = vi.fn()

vi.mock('@/features/workspaces/api', () => ({
  listMyWorkspaces: (...args: unknown[]) => listMyWorkspaces(...args),
  listWorkspacePipelines: (...args: unknown[]) => listWorkspacePipelines(...args),
}))
vi.mock('@/features/mlflow/api', () => ({
  listWorkspaceModels: (...args: unknown[]) => listWorkspaceModels(...args),
  getWorkspaceModelVersions: (...args: unknown[]) => getWorkspaceModelVersions(...args),
}))
vi.mock('@/features/executions/api', () => ({
  listExecutions: (...args: unknown[]) => listExecutions(...args),
}))
// recharts usa ResponsiveContainer (mide el DOM): lo simplificamos en pruebas.
vi.mock('@/features/dashboard/components/ExecutionsActivityChart', () => ({
  ExecutionsActivityChart: () => null,
}))

const workspace = (over: Partial<WorkspaceSummary> = {}): WorkspaceSummary => ({
  idWorkspace: 1,
  name: 'Proyecto MNIST',
  description: 'Clasificación de dígitos',
  createdAt: '2026-01-10T12:00:00Z',
  idUser: 1,
  ownerUsername: 'student_one',
  datasetPath: '/storage/1/mnist.zip',
  ...over,
})

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage
        token="t"
        currentWorkspace="Default Project"
        searchQuery=""
        onAuthError={() => false}
      />
    </MemoryRouter>,
  )
}

describe('DashboardPage (HU-018)', () => {
  beforeEach(() => {
    listMyWorkspaces.mockReset()
    listWorkspacePipelines.mockReset()
    listWorkspaceModels.mockReset()
    getWorkspaceModelVersions.mockReset()
    listExecutions.mockReset()
    listWorkspacePipelines.mockResolvedValue([])
    listWorkspaceModels.mockResolvedValue([])
    getWorkspaceModelVersions.mockResolvedValue([])
    listExecutions.mockResolvedValue([])
  })

  it('muestra el estado vacío con CTA cuando no hay proyectos', async () => {
    listMyWorkspaces.mockResolvedValue([])

    renderDashboard()

    expect(await screen.findByText('Aún no tienes proyectos')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /crear primer proyecto/i })).toBeInTheDocument()
  })

  it('lista los proyectos recientes con su estado de dataset', async () => {
    listMyWorkspaces.mockResolvedValue([workspace()])
    listWorkspaceModels.mockResolvedValue([{ name: 'mnist_cnn' }, { name: 'mnist_cnn_v2' }])

    renderDashboard()

    // Nombre del proyecto en el feed de recientes.
    expect(await screen.findByText('Proyecto MNIST')).toBeInTheDocument()
    // Badge de dataset listo del proyecto.
    expect(await screen.findByText('Dataset listo')).toBeInTheDocument()
  })
})
