import { Button } from '@/shared/components/ui/button'

import type { UserSummary } from '../types'

interface UsersTableProps {
  title: string
  users: UserSummary[]
  isLoading: boolean
  emptyMessage: string
  actionLabel: string
  actionVariant: 'outline' | 'destructive'
  showEdit?: boolean
  editingUserId?: number | null
  onEdit?: (userId: number) => Promise<void>
  onAction: (userId: number) => Promise<void>
}

function ActionButtons({
  item,
  actionLabel,
  actionVariant,
  showEdit,
  onEdit,
  onAction,
}: Pick<UsersTableProps, 'actionLabel' | 'actionVariant' | 'showEdit' | 'onEdit' | 'onAction'> & {
  item: UserSummary
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {showEdit && onEdit && item.enabled && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void onEdit(item.idUser)}
          className="border-slate-700/80 bg-slate-900/60 text-slate-100 hover:bg-slate-800"
        >
          Editar
        </Button>
      )}
      <Button
        variant={actionVariant}
        size="sm"
        onClick={() => void onAction(item.idUser)}
        className={actionVariant === 'destructive'
          ? 'border border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/15'
          : 'border-slate-700/80 bg-slate-900/60 text-slate-100 hover:bg-slate-800'}
      >
        {actionLabel}
      </Button>
    </div>
  )
}

export function UsersTable({
  title,
  users,
  isLoading,
  emptyMessage,
  actionLabel,
  actionVariant,
  showEdit = false,
  editingUserId = null,
  onEdit,
  onAction,
}: UsersTableProps) {
  return (
    <div className="min-w-0 space-y-4">
      <h3 className="text-base font-semibold text-slate-50">{title}</h3>

      <div className="space-y-3 lg:hidden">
        {isLoading && (
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/25 px-4 py-8 text-center text-sm text-slate-500">
            Cargando usuarios...
          </div>
        )}
        {!isLoading && users.length === 0 && (
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/25 px-4 py-8 text-center text-sm text-slate-500">
            {emptyMessage}
          </div>
        )}
        {users.map((item) => {
          const isEditing = editingUserId === item.idUser
          return (
            <article
              key={item.idUser}
              className={`rounded-xl border bg-slate-950/25 p-4 transition-colors ${
                isEditing ? 'border-blue-500/50 bg-blue-500/10' : 'border-slate-800/80'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-semibold text-slate-50">{item.name || item.username}</p>
                  <p className="mt-0.5 break-words text-xs text-slate-500">@{item.username}</p>
                </div>
                <span className={`shrink-0 text-xs font-semibold ${item.enabled ? 'text-emerald-400' : 'text-orange-400'}`}>
                  {item.enabled ? 'Habilitado' : 'Deshabilitado'}
                </span>
              </div>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Código</dt>
                  <dd className="mt-1 break-words text-slate-300">{item.studentCode || '-'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Rol</dt>
                  <dd className="mt-1 text-slate-300">{item.role === 'COLLABORATOR' ? 'COLABORADOR' : item.role}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Correo</dt>
                  <dd className="mt-1 break-words text-slate-300">{item.email}</dd>
                </div>
              </dl>

              <div className="mt-4 border-t border-slate-800/80 pt-4">
                <ActionButtons
                  item={item}
                  actionLabel={actionLabel}
                  actionVariant={actionVariant}
                  showEdit={showEdit}
                  onEdit={onEdit}
                  onAction={onAction}
                />
              </div>
            </article>
          )
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-slate-800/80 lg:block">
        <table className="w-full min-w-[760px] text-left text-sm text-slate-300">
          <thead className="bg-slate-950/35 text-[10px] uppercase tracking-[0.16em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Código estudiante</th>
              <th className="px-4 py-3">Correo electrónico</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-500">Cargando usuarios...</td>
              </tr>
            )}
            {!isLoading && users.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-500">{emptyMessage}</td>
              </tr>
            )}
            {users.map((item) => {
              const isEditing = editingUserId === item.idUser
              return (
                <tr
                  key={item.idUser}
                  className={`border-t border-slate-800/80 transition-colors ${
                    isEditing ? 'bg-blue-500/10 ring-1 ring-inset ring-blue-500/35' : 'hover:bg-slate-900/35'
                  }`}
                >
                  <td className="px-4 py-4">
                    <p className="font-semibold text-slate-50">{item.name || item.username}</p>
                    <p className="text-xs text-slate-500">@{item.username}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-400">{item.studentCode || '-'}</td>
                  <td className="px-4 py-4">{item.email}</td>
                  <td className="px-4 py-4">{item.role === 'COLLABORATOR' ? 'COLABORADOR' : item.role}</td>
                  <td className={`px-4 py-4 ${item.enabled ? 'text-emerald-400' : 'text-orange-400'}`}>
                    {item.enabled ? 'Habilitado' : 'Deshabilitado'}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <ActionButtons
                      item={item}
                      actionLabel={actionLabel}
                      actionVariant={actionVariant}
                      showEdit={showEdit}
                      onEdit={onEdit}
                      onAction={onAction}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
