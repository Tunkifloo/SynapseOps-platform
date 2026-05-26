import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'

import { forgotPassword } from '@/features/auth/api'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'

export function ForgotPasswordPage() {
  const [username, setUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const navigate = useNavigate()

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsLoading(true)
    setError('')
    setSuccess('')

    try {
      await forgotPassword(username.trim(), newPassword)
      setSuccess('Contraseña restablecida con éxito.')
      setTimeout(() => navigate('/login'), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo restablecer la contraseña.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070707] px-4 py-10">
      <div className="pointer-events-none absolute inset-0 opacity-35 bg-[linear-gradient(to_right,rgba(51,65,85,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(51,65,85,0.12)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500/12 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_35%,rgba(249,115,22,0.08),transparent_28%),radial-gradient(circle_at_72%_68%,rgba(249,115,22,0.07),transparent_26%)]" />

      <Card className="relative w-full max-w-[650px] rounded-[2rem] border border-slate-700/65 bg-[rgba(8,8,10,0.88)] px-6 py-10 shadow-2xl shadow-black/35 backdrop-blur-xl sm:px-12">
        <CardHeader className="px-0 pb-10 text-center">
          <CardTitle className="text-4xl font-bold italic tracking-tight text-slate-50 drop-shadow-sm">
            Synapse<span className="text-blue-500">Ops</span>
          </CardTitle>
          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.38em] text-orange-500">
            Restablecer contraseña
          </p>
        </CardHeader>

        <form onSubmit={(event) => void handleSubmit(event)}>
          <CardContent className="space-y-8 px-0">
            <div className="space-y-3">
              <label className="text-sm font-bold uppercase tracking-wide text-slate-300">Usuario</label>
              <Input
                className="h-14 rounded-full border-slate-700/80 bg-slate-950/45 px-7 text-lg text-slate-100 placeholder:text-slate-500 focus-visible:border-orange-500/60 focus-visible:ring-orange-500/20"
                type="text"
                value={username}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setUsername(event.target.value)}
                placeholder="superadmin"
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-bold uppercase tracking-wide text-slate-300">Nueva contraseña</label>
              <div className="relative">
                <Input
                  className="h-14 rounded-full border-slate-700/80 bg-slate-950/45 px-7 pr-16 text-lg text-slate-100 placeholder:text-slate-500 focus-visible:border-orange-500/60 focus-visible:ring-orange-500/20"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setNewPassword(event.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-200"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="animate-pulse rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm font-semibold text-red-300">
                {error}
              </p>
            )}

            {success && (
              <p className="rounded-xl border border-green-400/20 bg-green-400/10 p-3 text-sm font-semibold text-green-300">
                {success}
              </p>
            )}
          </CardContent>

          <CardFooter className="flex-col gap-8 px-0 pb-0 pt-10">
            <Button
              type="submit"
              className="h-14 w-full rounded-full bg-orange-600 text-lg font-semibold text-white shadow-lg shadow-orange-950/30 hover:bg-orange-400"
              disabled={isLoading}
            >
              {isLoading ? 'Restableciendo...' : 'Confirmar nueva contraseña'}
            </Button>

            <Link
              to="/login"
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.24em] text-slate-500 transition-colors hover:text-slate-300"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al inicio de sesión
            </Link>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
