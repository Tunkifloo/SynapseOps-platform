import { Pencil, Power, PowerOff } from 'lucide-react'

import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'

import type { UserSummary } from '../types'

interface UsersTableProps {
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

const initials = (user: UserSummary) =>
  (user.name || user.username || '?').trim().charAt(0).toUpperCase()

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
        <Button variant="outline" size="sm" onClick={() => void onEdit(item.idUser)}>
          <Pencil className="size-3.5" /> Editar
        </Button>
      )}
      <Button
        variant={actionVariant === 'destructive' ? 'destructive' : 'outline'}
        size="sm"
        onClick={() => void onAction(item.idUser)}
      >
        {actionVariant === 'destructive' ? <PowerOff className="size-3.5" /> : <Power className="size-3.5" />}
        {actionLabel}
      </Button>
    </div>
  )
}

function StatusBadge({ enabled }: { enabled: boolean }) {
  return <Badge variant={enabled ? 'success' : 'warning'}>{enabled ? 'Activo' : 'Inhabilitado'}</Badge>
}

export function UsersTable({
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
    <div className="min-w-0">
      {/* Móvil: tarjetas */}
      <div className="space-y-3 lg:hidden">
        {isLoading && (
          <div className="rounded-xl border border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            Cargando usuarios…
          </div>
        )}
        {!isLoading && users.length === 0 && (
          <div className="rounded-xl border border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        )}
        {users.map((item) => {
          const isEditing = editingUserId === item.idUser
          return (
            <article
              key={item.idUser}
              className={`rounded-xl border p-4 transition-colors duration-150 ease-out-quart ${
                isEditing ? 'border-primary/50 bg-primary/5' : 'border-border bg-card'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary-strong">
                    {initials(item)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{item.name || item.username}</p>
                    <p className="truncate text-xs text-muted-foreground">@{item.username}</p>
                  </div>
                </div>
                <StatusBadge enabled={item.enabled} />
              </div>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Código</dt>
                  <dd className="mt-1 break-words text-foreground">{item.studentCode || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Rol</dt>
                  <dd className="mt-1 text-foreground">{item.role === 'COLLABORATOR' ? 'COLABORADOR' : item.role}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Correo</dt>
                  <dd className="mt-1 break-words text-foreground">{item.email}</dd>
                </div>
              </dl>

              <div className="mt-4 border-t border-border pt-4">
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

      {/* Desktop: tabla */}
      <div className="hidden overflow-x-auto rounded-xl border border-border lg:block">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-muted/40 text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Correo</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-muted-foreground">
                  Cargando usuarios…
                </td>
              </tr>
            )}
            {!isLoading && users.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {users.map((item) => {
              const isEditing = editingUserId === item.idUser
              return (
                <tr
                  key={item.idUser}
                  className={`border-t border-border transition-colors duration-150 ease-out-quart ${
                    isEditing ? 'bg-primary/5 ring-1 ring-inset ring-primary/30' : 'hover:bg-accent/40'
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary-strong">
                        {initials(item)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{item.name || item.username}</p>
                        <p className="truncate text-xs text-muted-foreground">@{item.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{item.studentCode || '—'}</td>
                  <td className="px-4 py-3 text-foreground">{item.email}</td>
                  <td className="px-4 py-3 text-foreground">
                    {item.role === 'COLLABORATOR' ? 'COLABORADOR' : item.role}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge enabled={item.enabled} />
                  </td>
                  <td className="px-4 py-3 text-right">
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
