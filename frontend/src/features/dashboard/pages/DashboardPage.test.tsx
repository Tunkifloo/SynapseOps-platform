import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { DashboardPage } from './DashboardPage'
import type { WorkspaceSummary } from '@/features/workspaces/types'

// Mock de las capas de datos: el dashboard no debe llamar a la red real.
const listMyWorkspaces = vi.fn()
const listWorkspaceModels = vi.fn()

vi.mock('@/features/workspaces/api', () => ({
  listMyWorkspaces: (...args: unknown[]) => listMyWorkspaces(...args),
}))
vi.mock('@/features/mlflow/api', () => ({
  listWorkspaceModels: (...args: unknown[]) => listWorkspaceModels(...args),
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
    listWorkspaceModels.mockReset()
  })

  it('muestra el estado vacío con CTA cuando no hay proyectos', async () => {
    listMyWorkspaces.mockResolvedValue([])
    listWorkspaceModels.mockResolvedValue([])

    renderDashboard()

    expect(await screen.findByText('Aún no tienes proyectos')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /crear primer proyecto/i })).toBeInTheDocument()
  })

  it('lista los proyectos recientes y el conteo de modelos registrados', async () => {
    listMyWorkspaces.mockResolvedValue([workspace()])
    listWorkspaceModels.mockResolvedValue([{ name: 'mnist_cnn' }, { name: 'mnist_cnn_v2' }])

    renderDashboard()

    // Nombre del proyecto (puede aparecer en KPIs + tarjeta).
    expect(await screen.findByText('Proyecto MNIST')).toBeInTheDocument()
    // Badge con el conteo real de modelos del workspace.
    expect(await screen.findByText(/2 modelos/i)).toBeInTheDocument()
  })
})
