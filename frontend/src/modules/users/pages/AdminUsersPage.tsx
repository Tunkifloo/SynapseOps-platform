import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import {
  createStudent,
  getUserById,
  listCollaborators,
  listDisabledUsers,
  setUserStatus,
  updateUserByAdmin,
} from '@/features/admin-users/api'
import { CreateStudentForm } from '@/features/admin-users/components/CreateStudentForm'
import { EditStudentForm } from '@/features/admin-users/components/EditStudentForm'
import { UsersTable } from '@/features/admin-users/components/UsersTable'
import {
  emptyStudentForm,
  emptyUserUpdatePayload,
  type CreateStudentFormData,
  type UserSummary,
  type UserUpdatePayload,
} from '@/features/admin-users/types'
import { SectionTitle } from '@/shared/components/SectionTitle'

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <Card className="bg-white/[0.03] border-white/5 backdrop-blur-xl hover:bg-white/[0.05] transition-all">
      <CardContent className="pt-6">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{title}</p>
        <div className="mt-2 text-2xl font-bold tracking-tight text-white">{value}</div>
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

  const filteredActiveUsers = searchQuery
    ? activeUsers.filter((u) =>
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : activeUsers

  const filteredDisabledUsers = searchQuery
    ? disabledUsers.filter((u) =>
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : disabledUsers
  const [form, setForm] = useState<CreateStudentFormData>(emptyStudentForm())
  const [editingUserId, setEditingUserId] = useState<number | null>(null)
  const [editingUsername, setEditingUsername] = useState('')
  const [editForm, setEditForm] = useState<UserUpdatePayload>(emptyUserUpdatePayload())
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

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

  const handleCreateStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setNotice(null)

    try {
      await createStudent(token, form)
      setForm(emptyStudentForm())
      setNotice('Student account created successfully.')
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

  const handleEditFieldChange = (field: keyof UserUpdatePayload) => (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    setEditForm((current) => ({
      ...current,
      [field]: event.target.value,
    }))
  }

  const resetEditState = () => {
    setEditingUserId(null)
    setEditingUsername('')
    setEditForm(emptyUserUpdatePayload())
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
      setEditingUsername(user.username)
      setEditForm({
        name: user.name,
        paternalSurname: user.paternalSurname,
        maternalSurname: user.maternalSurname,
        dni: '',
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
        ...editForm,
        maternalSurname: editForm.maternalSurname,
        dni: editForm.dni,
        phone: editForm.phone,
        role: 'COLLABORATOR',
      })

      setNotice('Student account updated successfully.')
      setError(null)
      resetEditState()
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
      const activeUser = activeUsers.find((u) => u.idUser === userId)
      const disabledUser = disabledUsers.find((u) => u.idUser === userId)
      const target = activeUser ?? disabledUser
      if (!target) return

      const nextEnabled = !target.enabled
      await setUserStatus(token, userId, nextEnabled)
      const toggled = { ...target, enabled: nextEnabled }

      if (target.enabled) {
        setActiveUsers((prev) => prev.filter((u) => u.idUser !== userId))
        setDisabledUsers((prev) => [toggled, ...prev])
      } else {
        setDisabledUsers((prev) => prev.filter((u) => u.idUser !== userId))
        setActiveUsers((prev) => [toggled, ...prev])
      }

      setNotice('User status updated successfully.')
      setError(null)
    } catch (error) {
      if (onAuthError(error)) return
      setError(error instanceof Error ? error.message : 'No se pudo actualizar el estado del usuario.')
    }
  }

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="HU-013" title="Administrative User Management" description="Gestiona cuentas de estudiantes desde una tabla administrativa, crea nuevas cuentas colaboradoras y aplica desactivación lógica sin eliminar registros." />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <StatCard title="Active Students" value={isLoading ? '...' : String(activeUsers.length)} />
        <StatCard title="Disabled Accounts" value={isLoading ? '...' : String(disabledUsers.length)} />
        <StatCard title="Admin Scope" value="Students" />
      </div>

      {(error || notice) && (
        <Card className={`border-white/5 ${error ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
          <CardContent className="pt-6 text-sm text-white">
            {error ?? notice}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1.6fr]">
        <div className="space-y-6">
          <Card className="border-white/5 bg-white/[0.03]">
            <CardContent className="pt-6">
              <CreateStudentForm form={form} isSubmitting={isSubmitting} onChange={handleFieldChange} onSubmit={handleCreateStudent} />
            </CardContent>
          </Card>

          {editingUserId && (
            <Card className="border-white/5 bg-white/[0.03]">
              <CardContent className="pt-6">
                <EditStudentForm
                  form={editForm}
                  isSubmitting={isSubmitting}
                  username={editingUsername}
                  onChange={handleEditFieldChange}
                  onSubmit={handleUpdateStudent}
                  onCancel={resetEditState}
                />
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="border-white/5 bg-white/[0.03]">
            <CardContent className="pt-6">
              <UsersTable
                title="Active Student Accounts"
                users={filteredActiveUsers}
                isLoading={isLoading}
                emptyMessage="No active student accounts available."
                actionLabel="Disable"
                actionVariant="destructive"
                showEdit
                onEdit={handleStartEdit}
                onAction={handleToggleStatus}
              />
            </CardContent>
          </Card>

          <Card className="border-white/5 bg-white/[0.03]">
            <CardContent className="pt-6">
              <UsersTable
                title="Soft Deleted Student Accounts"
                users={filteredDisabledUsers}
                isLoading={isLoading}
                emptyMessage="No disabled student accounts."
                actionLabel="Reactivate"
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
