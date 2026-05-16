import { Button } from '@/components/ui/button'

import type { UserSummary } from '../types'

interface UsersTableProps {
  title: string
  users: UserSummary[]
  isLoading: boolean
  emptyMessage: string
  actionLabel: string
  actionVariant: 'outline' | 'destructive'
  showEdit?: boolean
  onEdit?: (userId: number) => Promise<void>
  onAction: (userId: number) => Promise<void>
}

export function UsersTable({
  title,
  users,
  isLoading,
  emptyMessage,
  actionLabel,
  actionVariant,
  showEdit = false,
  onEdit,
  onAction,
}: UsersTableProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-white">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm text-slate-300">
          <thead className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
            <tr>
              <th className="pb-3">User</th>
              <th className="pb-3">Student Code</th>
              <th className="pb-3">Email</th>
              <th className="pb-3">Role</th>
              <th className="pb-3">Status</th>
              <th className="pb-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-500">Loading users...</td>
              </tr>
            )}
            {!isLoading && users.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-500">{emptyMessage}</td>
              </tr>
            )}
            {users.map((item) => (
              <tr key={item.idUser} className="border-t border-white/5">
                <td className="py-4">
                  <p className="font-semibold text-white">{item.name || item.username}</p>
                  <p className="text-xs text-slate-500">@{item.username}</p>
                </td>
                <td className="py-4 text-slate-400">{item.studentCode || '—'}</td>
                <td className="py-4">{item.email}</td>
                <td className="py-4">{item.role}</td>
                <td className={`py-4 ${item.enabled ? 'text-emerald-400' : 'text-orange-400'}`}>
                  {item.enabled ? 'Enabled' : 'Disabled'}
                </td>
                <td className="py-4 text-right">
                  <div className="flex justify-end gap-2">
                    {showEdit && onEdit && item.enabled && (
                      <Button variant="outline" size="sm" onClick={() => void onEdit(item.idUser)}>
                        Edit
                      </Button>
                    )}
                    <Button variant={actionVariant} size="sm" onClick={() => void onAction(item.idUser)}>
                      {actionLabel}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
