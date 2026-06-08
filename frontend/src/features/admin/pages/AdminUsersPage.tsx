import { useCallback, useEffect, useState, type ChangeEvent, type ComponentType, type FormEvent } from 'react'
import { UserCheck, UserPlus, UserX } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { Card, CardContent } from '@/shared/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import {
  createStudent,
  getUserById,
  listCollaborators,
  listDisabledUsers,
  setUserStatus,
  updateUserByAdmin,
} from '@/features/admin/api'
import { CreateStudentForm } from '@/features/admin/components/CreateStudentForm'
import { UsersTable } from '@/features/admin/components/UsersTable'
import { emptyStudentForm, type CreateStudentFormData, type UserSummary } from '@/features/admin/types'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { notify } from '@/shared/notify'
import { cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: string
  icon: ComponentType<{ className?: string }>
  accent: string
}

function StatCard({ title, value, icon: Icon, accent }: StatCardProps) {
  return (
    <Card className="min-w-0">
      <CardContent className="flex min-w-0 items-center gap-4">
        <div className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', accent)}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{title}</p>
          <div className="mt-0.5 truncate font-heading text-2xl font-bold tracking-tight text-foreground">
            {value}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

type Tab = 'active' | 'disabled'

interface AdminUsersPageProps {
  token: string
  searchQuery: string
  onAuthError: (error: unknown) => boolean
}

export function AdminUsersPage({ token, searchQuery, onAuthError }: AdminUsersPageProps) {
  const [activeUsers, setActiveUsers] = useState<UserSummary[]>([])
  const [disabledUsers, setDisabledUsers] = useState<UserSummary[]>([])
  const [tab, setTab] = useState<Tab>('active')
  const [form, setForm] = useState<CreateStudentFormData>(emptyStudentForm())
  const [editingUserId, setEditingUserId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{
    title: string
    description: string
    confirmLabel: string
    tone: 'destructive' | 'default'
    onConfirm: () => Promise<void>
  } | null>(null)

  const isEditing = editingUserId !== null

  const matches = (user: UserSummary) =>
    !searchQuery ||
    user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.name.toLowerCase().includes(searchQuery.toLowerCase())

  const filteredActive = activeUsers.filter(matches)
  const filteredDisabled = disabledUsers.filter(matches)

  const loadUsers = useCallback(async () => {
    setIsLoading(true)
    try {
      const [enabled, disabled] = await Promise.all([listCollaborators(token), listDisabledUsers(token)])
      setActiveUsers(enabled)
      setDisabledUsers(disabled)
      setError(null)
    } catch (error) {
      if (onAuthError(error)) return
      setError(error instanceof Error ? error.message : 'No se pudieron cargar los usuarios.')
    } finally {
      setIsLoading(false)
    }
  }, [onAuthError, token])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      if (!cancelled) void loadUsers()
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [loadUsers])

  const handleFieldChange =
    (field: keyof CreateStudentFormData) => (event: ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [field]: event.target.value }))

  const closeForm = () => {
    setShowForm(false)
    setEditingUserId(null)
    setForm(emptyStudentForm())
  }

  const openCreate = () => {
    setEditingUserId(null)
    setForm(emptyStudentForm())
    setShowForm(true)
  }

  const handleCreateStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    try {
      await createStudent(token, form)
      closeForm()
      notify.success('Estudiante creado', { description: 'La cuenta se registró correctamente.' })
      await loadUsers()
    } catch (error) {
      if (onAuthError(error)) return
      notify.error(error instanceof Error ? error.message : 'No se pudo crear el estudiante.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleStartEdit = async (userId: number) => {
    try {
      const user = await getUserById(token, userId)
      if (user.role !== 'COLLABORATOR') {
        notify.error('Solo se permite editar cuentas de estudiantes/colaboradores.')
        return
      }
      setEditingUserId(user.idUser)
      setForm({
        username: user.username,
        password: '********',
        name: user.name,
        paternalSurname: user.paternalSurname,
        maternalSurname: user.maternalSurname,
        email: user.email,
        phone: user.phone ?? '',
        role: 'COLLABORATOR',
        studentCode: user.studentCode ?? '',
        career: user.career ?? '',
      })
      setShowForm(true)
    } catch (error) {
      if (onAuthError(error)) return
      notify.error(error instanceof Error ? error.message : 'No se pudo cargar el detalle del usuario.')
    }
  }

  const handleUpdateStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingUserId) return
    setIsSubmitting(true)
    try {
      await updateUserByAdmin(token, editingUserId, {
        name: form.name,
        paternalSurname: form.paternalSurname,
        maternalSurname: form.maternalSurname,
        dni: '',
        email: form.email,
        phone: form.phone,
        role: 'COLLABORATOR',
        studentCode: form.studentCode,
        career: form.career,
      })
      notify.success('Cambios guardados', { description: 'Los datos del estudiante se actualizaron.' })
      closeForm()
      await loadUsers()
    } catch (error) {
      if (onAuthError(error)) return
      notify.error(error instanceof Error ? error.message : 'No se pudo actualizar el estudiante.')
    } finally {
      setIsSubmitting(false)
    }
  }

  /** Ejecuta el cambio de estado (tras confirmar). */
  const performToggle = async (user: UserSummary) => {
    try {
      const nextEnabled = !user.enabled
      await setUserStatus(token, user.idUser, nextEnabled)
      const toggled = { ...user, enabled: nextEnabled }
      if (user.enabled) {
        setActiveUsers((prev) => prev.filter((u) => u.idUser !== user.idUser))
        setDisabledUsers((prev) => [toggled, ...prev])
        if (editingUserId === user.idUser) closeForm()
      } else {
        setDisabledUsers((prev) => prev.filter((u) => u.idUser !== user.idUser))
        setActiveUsers((prev) => [toggled, ...prev])
      }
      notify.success(nextEnabled ? 'Cuenta reactivada' : 'Cuenta inhabilitada', {
        description: `${user.name || user.username} · estado actualizado.`,
      })
    } catch (error) {
      if (onAuthError(error)) return
      notify.error(error instanceof Error ? error.message : 'No se pudo actualizar el estado del usuario.')
    }
  }

  /** Abre el modal de confirmación según el estado actual del usuario. */
  const askToggleStatus = async (userId: number) => {
    const user = activeUsers.find((u) => u.idUser === userId) ?? disabledUsers.find((u) => u.idUser === userId)
    if (!user) return
    const target = user.name || user.username
    setConfirm(
      user.enabled
        ? {
            title: 'Inhabilitar cuenta',
            description: `Se revocará el acceso de "${target}". Podrás reactivarla más adelante.`,
            confirmLabel: 'Inhabilitar',
            tone: 'destructive',
            onConfirm: () => performToggle(user),
          }
        : {
            title: 'Reactivar cuenta',
            description: `Se restaurará el acceso de "${target}" a la plataforma.`,
            confirmLabel: 'Reactivar',
            tone: 'default',
            onConfirm: () => performToggle(user),
          }
    )
  }

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'active', label: 'Activos', count: activeUsers.length },
    { key: 'disabled', label: 'Inhabilitados', count: disabledUsers.length },
  ]

  return (
    <div className="w-full space-y-5">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground xl:text-3xl">
            Gestión de usuarios
          </h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground">
            Administra las cuentas de estudiantes: crea, edita y habilita o inhabilita su acceso.
          </p>
        </div>
        <Button variant="cta" size="lg" onClick={openCreate} className="shrink-0">
          <UserPlus />
          Crear usuario
        </Button>
      </section>

      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard
          title="Estudiantes activos"
          value={isLoading ? '…' : String(activeUsers.length)}
          icon={UserCheck}
          accent="bg-success/10 text-success"
        />
        <StatCard
          title="Cuentas inhabilitadas"
          value={isLoading ? '…' : String(disabledUsers.length)}
          icon={UserX}
          accent="bg-warning/10 text-warning"
        />
        <StatCard
          title="Total de cuentas"
          value={isLoading ? '…' : String(activeUsers.length + disabledUsers.length)}
          icon={UserCheck}
          accent="bg-primary/10 text-primary"
        />
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? 'true' : undefined}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors',
              tab === t.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {t.label}
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                tab === t.key ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
              )}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <Card className="py-0">
        <CardContent className="p-4 sm:p-5">
          {tab === 'active' ? (
            <UsersTable
              users={filteredActive}
              isLoading={isLoading}
              emptyMessage="No hay cuentas activas de estudiantes."
              actionLabel="Inhabilitar"
              actionVariant="destructive"
              showEdit
              editingUserId={editingUserId}
              onEdit={handleStartEdit}
              onAction={askToggleStatus}
            />
          ) : (
            <UsersTable
              users={filteredDisabled}
              isLoading={isLoading}
              emptyMessage="No hay cuentas inhabilitadas."
              actionLabel="Reactivar"
              actionVariant="outline"
              onAction={askToggleStatus}
            />
          )}
        </CardContent>
      </Card>

      {/* Modal crear/editar */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) closeForm() }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Editar estudiante' : 'Crear usuario'}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Actualiza los datos del estudiante seleccionado.'
                : 'Registra una nueva cuenta de estudiante/colaborador.'}
            </DialogDescription>
          </DialogHeader>
          <CreateStudentForm
            form={form}
            isEditing={isEditing}
            isSubmitting={isSubmitting}
            onChange={handleFieldChange}
            onSubmit={isEditing ? handleUpdateStudent : handleCreateStudent}
            onCancel={closeForm}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(open) => { if (!open) setConfirm(null) }}
        title={confirm?.title ?? ''}
        description={confirm?.description ?? ''}
        confirmLabel={confirm?.confirmLabel}
        tone={confirm?.tone}
        onConfirm={async () => { await confirm?.onConfirm() }}
      />
    </div>
  )
}
