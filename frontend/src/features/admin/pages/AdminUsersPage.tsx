import { useCallback, useEffect, useState, type ChangeEvent, type ComponentType, type FormEvent } from 'react'
import { Monitor, UserCheck, UserX } from 'lucide-react'

import { Card, CardContent } from '@/shared/components/ui/card'
import {
  createStudent,
  getUserById,
  listCollaborators,
  listDisabledUsers,
  toggleUserStatus,
  updateUserByAdmin,
} from '@/features/admin/api'
import { CreateStudentForm } from '@/features/admin/components/CreateStudentForm'
import { EditStudentForm } from '@/features/admin/components/EditStudentForm'
import { UsersTable } from '@/features/admin/components/UsersTable'
import {
  emptyStudentForm,
  type CreateStudentFormData,
  type UserSummary,
} from '@/features/admin/types'

interface StatCardProps {
  title: string
  value: string
  icon: ComponentType<{ className?: string }>
}

function StatCard({ title, value, icon: Icon }: StatCardProps) {
  return (
    <Card className="rounded-2xl border border-slate-800/90 bg-slate-900/55 py-0 shadow-sm shadow-black/20">
      <CardContent className="flex items-center gap-4 p-4 xl:p-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-400/15 bg-blue-500/10 text-blue-400 xl:h-12 xl:w-12">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {title}
          </p>
          <div className="mt-1 truncate text-xl font-semibold tracking-tight text-slate-50 xl:text-2xl">
            {value}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface AdminUsersPageProps {
  token: string
  searchQuery: string
  onAuthError: (error: unknown) => boolean
}

export function AdminUsersPage({ token, searchQuery, onAuthError }: AdminUsersPageProps) {
  const [activeUsers, setActiveUsers] = useState<UserSummary[]>([])
  const [disabledUsers, setDisabledUsers] = useState<UserSummary[]>([])
  const [form, setForm] = useState<CreateStudentFormData>(emptyStudentForm())
  const [editingUserId, setEditingUserId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const isEditing = editingUserId !== null

  const filteredActiveUsers = searchQuery
    ? activeUsers.filter((user) =>
        user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : activeUsers

  const filteredDisabledUsers = searchQuery
    ? disabledUsers.filter((user) =>
        user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : disabledUsers

  const loadUsers = useCallback(async () => {
    setIsLoading(true)

    try {
      const [enabled, disabled] = await Promise.all([
        listCollaborators(token),
        listDisabledUsers(token),
      ])

      setActiveUsers(enabled)
      setDisabledUsers(disabled)
      setError(null)
    } catch (error) {
      if (onAuthError(error)) {
        return
      }

      setError(error instanceof Error ? error.message : 'No se pudieron cargar los usuarios.')
    } finally {
      setIsLoading(false)
    }
  }, [onAuthError, token])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      if (!cancelled) {
        void loadUsers()
      }
    }, 0)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [loadUsers])

  const handleFieldChange = (field: keyof CreateStudentFormData) => (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    setForm((current) => ({
      ...current,
      [field]: event.target.value,
    }))
  }

  const resetFormMode = () => {
    setEditingUserId(null)
    setForm(emptyStudentForm())
  }

  const handleCreateStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setNotice(null)

    try {
      await createStudent(token, form)
      resetFormMode()
      setNotice('Estudiante creado correctamente.')
      setError(null)
      await loadUsers()
    } catch (error) {
      if (onAuthError(error)) {
        return
      }

      setError(error instanceof Error ? error.message : 'No se pudo crear el estudiante.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleStartEdit = async (userId: number) => {
    setNotice(null)

    try {
      const user = await getUserById(token, userId)
      if (user.role !== 'COLLABORATOR') {
        setError('Solo se permite editar cuentas de estudiantes/colaboradores.')
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
      setError(null)
    } catch (error) {
      if (onAuthError(error)) {
        return
      }

      setError(error instanceof Error ? error.message : 'No se pudo cargar el detalle del usuario.')
    }
  }

  const handleUpdateStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!editingUserId) {
      return
    }

    setIsSubmitting(true)
    setNotice(null)

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

      setNotice('Cambios guardados correctamente.')
      setError(null)
      resetFormMode()
      await loadUsers()
    } catch (error) {
      if (onAuthError(error)) {
        return
      }

      setError(error instanceof Error ? error.message : 'No se pudo actualizar el estudiante.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleStatus = async (userId: number) => {
    setNotice(null)

    try {
      const activeUser = activeUsers.find((user) => user.idUser === userId)
      const disabledUser = disabledUsers.find((user) => user.idUser === userId)
      const target = activeUser ?? disabledUser
      if (!target) return

      await toggleUserStatus(token, userId)
      const toggled = { ...target, enabled: !target.enabled }

      if (target.enabled) {
        setActiveUsers((prev) => prev.filter((user) => user.idUser !== userId))
        setDisabledUsers((prev) => [toggled, ...prev])
        if (editingUserId === userId) {
          resetFormMode()
        }
      } else {
        setDisabledUsers((prev) => prev.filter((user) => user.idUser !== userId))
        setActiveUsers((prev) => [toggled, ...prev])
      }

      setNotice('Estado del usuario actualizado correctamente.')
      setError(null)
    } catch (error) {
      if (onAuthError(error)) return
      setError(error instanceof Error ? error.message : 'No se pudo actualizar el estado del usuario.')
    }
  }

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50 xl:text-3xl">
          Gestión de usuarios administrativos
        </h1>
        <p className="mt-1.5 max-w-4xl text-sm leading-6 text-slate-400 xl:text-base">
          Gestiona las cuentas de estudiantes desde esta vista administrativa.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard title="Estudiantes activos" value={isLoading ? '...' : String(activeUsers.length)} icon={UserCheck} />
        <StatCard title="Cuentas deshabilitadas" value={isLoading ? '...' : String(disabledUsers.length)} icon={UserX} />
        <StatCard title="Alcance admin" value="Estudiantes" icon={Monitor} />
      </div>

      {(error || notice) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          error
            ? 'border-red-500/20 bg-red-500/10 text-red-300'
            : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
        }`}
        >
          {error ?? notice}
        </div>
      )}

      <div className="grid items-start gap-4 2xl:grid-cols-[0.95fr_1.9fr]">
        <Card className="rounded-2xl border border-slate-800/90 bg-slate-900/55 py-0 shadow-sm shadow-black/20">
          <CardContent className="p-5">
            {isEditing ? (
              <EditStudentForm
                form={form}
                isSubmitting={isSubmitting}
                onChange={handleFieldChange}
                onSubmit={handleUpdateStudent}
                onCancel={resetFormMode}
              />
            ) : (
              <CreateStudentForm
                form={form}
                isEditing={false}
                isSubmitting={isSubmitting}
                onChange={handleFieldChange}
                onSubmit={handleCreateStudent}
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-2xl border border-slate-800/90 bg-slate-900/55 py-0 shadow-sm shadow-black/20">
            <CardContent className="p-5">
              <UsersTable
                title="Cuentas activas de estudiantes"
                users={filteredActiveUsers}
                isLoading={isLoading}
                emptyMessage="No hay cuentas activas de estudiantes."
                actionLabel="Desactivar"
                actionVariant="destructive"
                showEdit
                editingUserId={editingUserId}
                onEdit={handleStartEdit}
                onAction={handleToggleStatus}
              />
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-slate-800/90 bg-slate-900/55 py-0 shadow-sm shadow-black/20">
            <CardContent className="p-5">
              <UsersTable
                title="Cuentas de estudiantes deshabilitadas"
                users={filteredDisabledUsers}
                isLoading={isLoading}
                emptyMessage="No hay cuentas de estudiantes deshabilitadas."
                actionLabel="Reactivar"
                actionVariant="outline"
                onAction={handleToggleStatus}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
