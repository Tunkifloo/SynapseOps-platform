import { Button } from '@/shared/components/ui/button'

import type { WorkspaceSummary } from '../types'

interface WorkspacesTableProps {
  workspaces: WorkspaceSummary[]
  selectedWorkspaceId: number | null
  isLoading: boolean
  onSelect: (workspace: WorkspaceSummary) => void
  onEdit: (workspace: WorkspaceSummary) => void
  onDelete: (workspaceId: number) => Promise<void>
}

export function WorkspacesTable({ workspaces, selectedWorkspaceId, isLoading, onSelect, onEdit, onDelete }: WorkspacesTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm text-slate-300">
        <thead className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
          <tr>
            <th className="pb-3">Project</th>
            <th className="pb-3">Description</th>
            <th className="pb-3">Dataset</th>
            <th className="pb-3">Created</th>
            <th className="pb-3">Status</th>
            <th className="pb-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-slate-500">Loading projects...</td>
            </tr>
          )}
          {!isLoading && workspaces.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-slate-500">No projects created yet.</td>
            </tr>
          )}
          {workspaces.map((item) => {
            const isSelected = item.idWorkspace === selectedWorkspaceId

            return (
              <tr key={item.idWorkspace} className={`border-t border-white/5 ${isSelected ? 'bg-blue-500/10' : ''}`}>
                <td className="py-4">
                  <button type="button" className="text-left" onClick={() => onSelect(item)}>
                    <p className="font-semibold text-white">{item.name}</p>
                    <p className="text-xs text-slate-500">ID #{item.idWorkspace}</p>
                  </button>
                </td>
                <td className="py-4 text-slate-400">{item.description || 'No description available.'}</td>
                <td className="py-4 text-slate-400">{item.datasetPath ? 'Attached' : 'Pending'}</td>
                <td className="py-4 text-slate-400">{new Date(item.createdAt).toLocaleDateString()}</td>
                <td className={`py-4 ${isSelected ? 'text-blue-400' : 'text-slate-500'}`}>{isSelected ? 'Active' : 'Idle'}</td>
                <td className="py-4">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => onSelect(item)}>
                      Open
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => onEdit(item)}>
                      Edit
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => void onDelete(item.idWorkspace)}>
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
