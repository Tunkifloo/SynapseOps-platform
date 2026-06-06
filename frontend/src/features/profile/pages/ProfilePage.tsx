import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { KeyRound, Loader2, Mail, ShieldCheck, UserRound } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Badge } from '@/shared/components/ui/badge'
import { notify } from '@/shared/notify'
import { isApiError } from '@/shared/api/client'
import { getMyProfile, updateMyPassword, updateMyProfile } from '@/features/admin/api'
import type { UserProfileUpdatePayload, UserSummary } from '@/features/admin/types'
import { useAppStore } from '@/store/useAppStore'

interface ProfilePageProps {
  token: string
  onAuthError: (error: unknown) => boolean
}

const emptyProfileForm = (): UserProfileUpdatePayload => ({
  name: '',
  paternalSurname: '',
  maternalSurname: '',
  phone: '',
})

export function ProfilePage({ token, onAuthError }: ProfilePageProps) {
  const setAuth = useAppStore((state) => state.setAuth)
  const storeToken = useAppStore((state) => state.token)

  const [profile, setProfile] = useState<UserSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [form, setForm] = useState<UserProfileUpdatePayload>(emptyProfileForm())
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const loadProfile = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getMyProfile(token)
      setProfile(data)
      setForm({
        name: data.name ?? '',
        paternalSurname: data.paternalSurname ?? '',
        maternalSurname: data.maternalSurname ?? '',
        phone: data.phone ?? '',
      })
    } catch (err) {
      if (!onAuthError(err)) notify.error('No se pudo cargar tu perfil.')
    } finally {
      setIsLoading(false)
    }
  }, [token, onAuthError])

  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => { void loadProfile() }, [token])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (form.phone && !/^\d{9}$/.test(form.phone)) {
      notify.warning('El teléfono debe tener exactamente 9 dígitos.')
      return
    }
    setIsSavingProfile(true)
    try {
      const updated = await updateMyProfile(token, form)
      setProfile(updated)
      // Refleja el nuevo nombre en el encabezado (store de sesión).
      if (storeToken) {
        setAuth(storeToken, {
          username: updated.username,
          name: updated.name,
          role: updated.role,
        })
      }
      notify.success('Perfil actualizado correctamente.')
    } catch (err) {
      if (!onAuthError(err)) {
        notify.error(isApiError(err) ? err.message : 'No se pudo actualizar el perfil.')
      }
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handleSavePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPasswordError(null)
    if (newPassword.length < 6) {
      setPasswordError('La nueva contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('La confirmación no coincide con la nueva contraseña.')
      return
    }
    setIsSavingPassword(true)
    try {
      await updateMyPassword(token, { currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      notify.success('Contraseña actualizada correctamente.')
    } catch (err) {
      if (!onAuthError(err)) {
        const message = isApiError(err) ? err.message : 'No se pudo cambiar la contraseña.'
        setPasswordError(message)
        notify.error(message)
      }
    } finally {
      setIsSavingPassword(false)
    }
  }

  const onField = (field: keyof UserProfileUpdatePayload) =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [field]: event.target.value }))

  const fullName = profile
    ? [profile.name, profile.paternalSurname, profile.maternalSurname].filter(Boolean).join(' ')
    : ''
  const avatarLetter = (profile?.name || profile?.username || 'U').charAt(0).toUpperCase()

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50 xl:text-3xl">Mi perfil</h1>
        <p className="mt-1.5 text-sm leading-6 text-slate-400">
          Consulta y actualiza tus datos personales y tu contraseña.
        </p>
      </section>

      {isLoading ? (
        <div className="flex min-h-48 items-center justify-center text-sm text-slate-500">
          <Loader2 className="mr-2 size-4 animate-spin" /> Cargando perfil…
        </div>
      ) : (
        <>
          {/* Identidad (solo lectura) */}
          <Card className="rounded-2xl border border-slate-800/90 bg-slate-900/55 py-0 shadow-sm shadow-black/20">
            <CardContent className="flex flex-wrap items-center gap-4 p-5">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xl font-semibold text-primary ring-1 ring-primary/25">
                {avatarLetter}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold text-slate-50">{fullName || profile?.username}</p>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-slate-400">
                  <Mail className="size-3.5" /> {profile?.email ?? '—'}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">@{profile?.username}</p>
              </div>
              <Badge variant={profile?.role === 'ADMIN' ? 'info' : 'secondary'} className="gap-1.5">
                <ShieldCheck className="size-3.5" /> {profile?.role}
              </Badge>
            </CardContent>
          </Card>

          {/* Datos personales (editable) */}
          <Card className="rounded-2xl border border-slate-800/90 bg-slate-900/55 py-0 shadow-sm shadow-black/20">
            <CardHeader className="px-5 pt-5">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-50">
                <UserRound className="size-4 text-blue-400" /> Datos personales
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-3">
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Nombres</Label>
                    <Input id="name" value={form.name} onChange={onField('name')} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Teléfono</Label>
                    <Input
                      id="phone"
                      value={form.phone}
                      onChange={onField('phone')}
                      inputMode="numeric"
                      placeholder="9 dígitos"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="paternalSurname">Apellido paterno</Label>
                    <Input id="paternalSurname" value={form.paternalSurname} onChange={onField('paternalSurname')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="maternalSurname">Apellido materno</Label>
                    <Input id="maternalSurname" value={form.maternalSurname} onChange={onField('maternalSurname')} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Correo electrónico</Label>
                  <Input value={profile?.email ?? ''} disabled readOnly />
                  <p className="text-xs text-slate-500">
                    El correo y el rol están vinculados a tu identidad y no son editables aquí.
                  </p>
                </div>

                <div className="flex justify-end">
                  <Button type="submit" variant="cta" disabled={isSavingProfile} loading={isSavingProfile}>
                    Guardar cambios
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Cambiar contraseña */}
          <Card className="rounded-2xl border border-slate-800/90 bg-slate-900/55 py-0 shadow-sm shadow-black/20">
            <CardHeader className="px-5 pt-5">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-50">
                <KeyRound className="size-4 text-amber-400" /> Cambiar contraseña
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-3">
              <form onSubmit={handleSavePassword} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="currentPassword">Contraseña actual</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="newPassword">Nueva contraseña</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="confirmPassword">Confirmar nueva contraseña</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {passwordError && (
                  <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {passwordError}
                  </p>
                )}

                <div className="flex justify-end">
                  <Button type="submit" disabled={isSavingPassword} loading={isSavingPassword}>
                    Actualizar contraseña
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
