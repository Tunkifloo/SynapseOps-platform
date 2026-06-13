import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { Eye, EyeOff, KeyRound, Loader2, Mail, ShieldCheck, UserRound } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Badge } from '@/shared/components/ui/badge'
import { PageHeader } from '@/shared/components/PageHeader'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { notify } from '@/shared/notify'
import { isApiError } from '@/shared/api/client'
import { getMyProfile, updateMyPassword, updateMyProfile } from '@/features/admin/api'
import type { UserProfileUpdatePayload, UserSummary } from '@/features/admin/types'
import { validateConfirm, validatePassword, validatePhone, validateRequired } from '@/features/auth/validation'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'

interface ProfilePageProps {
  token: string
  onAuthError: (error: unknown) => boolean
}

const MIN_NEW_PASSWORD = 6

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
  const [initial, setInitial] = useState<UserProfileUpdatePayload>(emptyProfileForm())
  const [touched, setTouched] = useState<Partial<Record<keyof UserProfileUpdatePayload, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  // Modal de cambio de contraseña (operación crítica).
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwdTouched, setPwdTouched] = useState({ current: false, next: false, confirm: false })
  const [pwdSubmitted, setPwdSubmitted] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const [isSavingPassword, setIsSavingPassword] = useState(false)

  const loadProfile = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getMyProfile(token)
      setProfile(data)
      const next: UserProfileUpdatePayload = {
        name: data.name ?? '',
        paternalSurname: data.paternalSurname ?? '',
        maternalSurname: data.maternalSurname ?? '',
        phone: data.phone ?? '',
      }
      setForm(next)
      setInitial(next)
      setTouched({})
      setSubmitted(false)
    } catch (err) {
      if (!onAuthError(err)) notify.error('No se pudo cargar tu perfil.')
    } finally {
      setIsLoading(false)
    }
  }, [token, onAuthError])

  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    void loadProfile()
  }, [token])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  // ── Validación + detección de cambios (datos personales) ──────────────────
  const profileErrors = {
    name: validateRequired(form.name, 'El nombre'),
    paternalSurname: validateRequired(form.paternalSurname, 'El apellido paterno'),
    phone: validatePhone(form.phone ?? ''),
  }
  const hasProfileErrors = Object.values(profileErrors).some(Boolean)
  const isDirty = useMemo(
    () => (Object.keys(form) as (keyof UserProfileUpdatePayload)[]).some((k) => form[k] !== initial[k]),
    [form, initial]
  )
  const pErr = (k: keyof typeof profileErrors) => ((submitted || touched[k]) && profileErrors[k]) || null

  const onField = (field: keyof UserProfileUpdatePayload) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [field]: event.target.value }))
  const blurField = (field: keyof UserProfileUpdatePayload) => () =>
    setTouched((t) => ({ ...t, [field]: true }))

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)
    if (hasProfileErrors) return
    setIsSavingProfile(true)
    try {
      const updated = await updateMyProfile(token, form)
      setProfile(updated)
      setInitial({
        name: updated.name ?? '',
        paternalSurname: updated.paternalSurname ?? '',
        maternalSurname: updated.maternalSurname ?? '',
        phone: updated.phone ?? '',
      })
      setSubmitted(false)
      setTouched({})
      if (storeToken) {
        setAuth(storeToken, { username: updated.username, name: updated.name, role: updated.role })
      }
      notify.success('Perfil actualizado', { description: 'Tus datos se guardaron correctamente.' })
    } catch (err) {
      if (!onAuthError(err)) notify.error(isApiError(err) ? err.message : 'No se pudo actualizar el perfil.')
    } finally {
      setIsSavingProfile(false)
    }
  }

  // ── Validación de contraseña ──────────────────────────────────────────────
  const pwdErrors = {
    current: validateRequired(currentPassword, 'La contraseña actual'),
    next: validatePassword(newPassword, MIN_NEW_PASSWORD),
    confirm: validateConfirm(newPassword, confirmPassword),
  }
  const hasPwdErrors = Object.values(pwdErrors).some(Boolean)
  const pwdErr = (k: keyof typeof pwdErrors, t: boolean) => ((pwdSubmitted || t) && pwdErrors[k]) || null

  const openPasswordModal = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPwdTouched({ current: false, next: false, confirm: false })
    setPwdSubmitted(false)
    setShowPwd(false)
    setShowPasswordModal(true)
  }

  const handleSavePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPwdSubmitted(true)
    if (hasPwdErrors) return
    setIsSavingPassword(true)
    try {
      await updateMyPassword(token, { currentPassword, newPassword })
      setShowPasswordModal(false)
      notify.success('Contraseña actualizada', { description: 'Usa la nueva contraseña la próxima vez.' })
    } catch (err) {
      if (!onAuthError(err)) notify.error(isApiError(err) ? err.message : 'No se pudo cambiar la contraseña.')
    } finally {
      setIsSavingPassword(false)
    }
  }

  const fullName = profile
    ? [profile.name, profile.paternalSurname, profile.maternalSurname].filter(Boolean).join(' ')
    : ''
  const avatarLetter = (profile?.name || profile?.username || 'U').charAt(0).toUpperCase()

  const pwdInputCls = (e: string | null) =>
    cn('h-10 pr-10', e && 'border-destructive focus-visible:ring-destructive/30')

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Mi perfil"
        subtitle="Consulta y actualiza tus datos personales y tu contraseña."
      />

      {isLoading ? (
        <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> Cargando perfil…
        </div>
      ) : (
        <>
          {/* Identidad (solo lectura) */}
          <Card className="py-0">
            <CardContent className="flex flex-wrap items-center gap-4 p-5">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xl font-bold text-primary-strong ring-1 ring-primary/25">
                {avatarLetter}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold text-foreground">{fullName || profile?.username}</p>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                  <Mail className="size-3.5" /> {profile?.email ?? '—'}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">@{profile?.username}</p>
              </div>
              <Badge variant={profile?.role === 'ADMIN' ? 'info' : 'secondary'} className="gap-1.5">
                <ShieldCheck className="size-3.5" /> {profile?.role}
              </Badge>
            </CardContent>
          </Card>

          {/* Datos personales (editable) */}
          <Card className="py-0">
            <CardHeader className="px-5 pt-5">
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserRound className="size-4 text-primary" /> Datos personales
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-3">
              <form onSubmit={handleSaveProfile} noValidate className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Nombres</Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={onField('name')}
                      onBlur={blurField('name')}
                      aria-invalid={pErr('name') ? true : undefined}
                      className={cn('h-10', pErr('name') && 'border-destructive focus-visible:ring-destructive/30')}
                    />
                    {pErr('name') && <p className="text-xs font-medium text-destructive-strong">{pErr('name')}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">
                      Teléfono <span className="font-normal text-muted-foreground">(opcional)</span>
                    </Label>
                    <Input
                      id="phone"
                      value={form.phone}
                      onChange={onField('phone')}
                      onBlur={blurField('phone')}
                      inputMode="numeric"
                      placeholder="9 dígitos"
                      aria-invalid={pErr('phone') ? true : undefined}
                      className={cn('h-10', pErr('phone') && 'border-destructive focus-visible:ring-destructive/30')}
                    />
                    {pErr('phone') && <p className="text-xs font-medium text-destructive-strong">{pErr('phone')}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="paternalSurname">Apellido paterno</Label>
                    <Input
                      id="paternalSurname"
                      value={form.paternalSurname}
                      onChange={onField('paternalSurname')}
                      onBlur={blurField('paternalSurname')}
                      aria-invalid={pErr('paternalSurname') ? true : undefined}
                      className={cn('h-10', pErr('paternalSurname') && 'border-destructive focus-visible:ring-destructive/30')}
                    />
                    {pErr('paternalSurname') && (
                      <p className="text-xs font-medium text-destructive-strong">{pErr('paternalSurname')}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="maternalSurname">
                      Apellido materno <span className="font-normal text-muted-foreground">(opcional)</span>
                    </Label>
                    <Input
                      id="maternalSurname"
                      value={form.maternalSurname}
                      onChange={onField('maternalSurname')}
                      className="h-10"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Correo electrónico</Label>
                  <Input value={profile?.email ?? ''} disabled readOnly className="h-10" />
                  <p className="text-xs text-muted-foreground">
                    El correo y el rol están vinculados a tu identidad y no son editables aquí.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3">
                  {isDirty && <span className="text-xs text-muted-foreground">Tienes cambios sin guardar.</span>}
                  <Button
                    type="submit"
                    variant="cta"
                    loading={isSavingProfile}
                    disabled={!isDirty || (submitted && hasProfileErrors)}
                  >
                    Guardar cambios
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Seguridad → cambio de contraseña en modal */}
          <Card className="py-0">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-cta/10 text-cta">
                  <KeyRound className="size-5" />
                </div>
                <div>
                  <p className="font-heading text-base font-semibold text-foreground">Contraseña</p>
                  <p className="text-sm text-muted-foreground">
                    Cámbiala periódicamente para mantener tu cuenta segura.
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={openPasswordModal}>
                <KeyRound className="size-4" /> Cambiar contraseña
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {/* Modal de cambio de contraseña */}
      <Dialog open={showPasswordModal} onOpenChange={(open) => { if (!open) setShowPasswordModal(false) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar contraseña</DialogTitle>
            <DialogDescription>Operación crítica: confirma tu contraseña actual.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSavePassword} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">Contraseña actual</Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  onBlur={() => setPwdTouched((t) => ({ ...t, current: true }))}
                  aria-invalid={pwdErr('current', pwdTouched.current) ? true : undefined}
                  className={pwdInputCls(pwdErr('current', pwdTouched.current))}
                />
              </div>
              {pwdErr('current', pwdTouched.current) && (
                <p className="text-xs font-medium text-destructive-strong">{pwdErr('current', pwdTouched.current)}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="newPassword">Nueva contraseña</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onBlur={() => setPwdTouched((t) => ({ ...t, next: true }))}
                  aria-invalid={pwdErr('next', pwdTouched.next) ? true : undefined}
                  className={pwdInputCls(pwdErr('next', pwdTouched.next))}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors duration-150 ease-out-quart hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  aria-label={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={showPwd}
                >
                  {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {pwdErr('next', pwdTouched.next) && (
                <p className="text-xs font-medium text-destructive-strong">{pwdErr('next', pwdTouched.next)}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirmar nueva contraseña</Label>
              <Input
                id="confirmPassword"
                type={showPwd ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() => setPwdTouched((t) => ({ ...t, confirm: true }))}
                aria-invalid={pwdErr('confirm', pwdTouched.confirm) ? true : undefined}
                className={cn('h-10', pwdErr('confirm', pwdTouched.confirm) && 'border-destructive focus-visible:ring-destructive/30')}
              />
              {pwdErr('confirm', pwdTouched.confirm) && (
                <p className="text-xs font-medium text-destructive-strong">{pwdErr('confirm', pwdTouched.confirm)}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setShowPasswordModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="cta" loading={isSavingPassword} disabled={pwdSubmitted && hasPwdErrors}>
                Actualizar contraseña
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
