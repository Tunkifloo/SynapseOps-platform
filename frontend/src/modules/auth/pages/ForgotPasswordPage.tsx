import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'

import { forgotPassword } from '@/features/auth/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

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
    <div className="flex min-h-screen items-center justify-center bg-[#050505] px-4">
      <Card className="w-full max-w-md border-white/10 bg-black/40 backdrop-blur-md">
        <CardHeader>
          <CardTitle className="text-center text-2xl font-bold italic text-white">
            Synapse<span className="text-blue-500">Ops</span>
          </CardTitle>
          <p className="mt-2 text-center text-[10px] uppercase tracking-[0.3em] text-orange-400">
            Restablecer Contraseña
          </p>
        </CardHeader>

        <form onSubmit={(event) => void handleSubmit(event)}>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-400">Usuario</label>
              <Input
                className="border-white/10 bg-white/5 text-white focus:ring-orange-500/50"
                type="text"
                value={username}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                placeholder="superadmin"
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-400">Nueva Contraseña</label>
              <div className="relative">
                <Input
                  className="border-white/10 bg-white/5 pr-10 text-white focus:ring-orange-500/50"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded border border-red-400/20 bg-red-400/10 p-2.5 text-[10px] font-bold text-red-400 animate-pulse">
                {error}
              </p>
            )}

            {success && (
              <p className="rounded border border-green-400/20 bg-green-400/10 p-2.5 text-[10px] font-bold text-green-400">
                {success}
              </p>
            )}
          </CardContent>

          <CardFooter className="flex-col gap-3 pb-6 pt-4">
            <Button
              type="submit"
              className="h-11 w-full bg-orange-600 font-bold text-white hover:bg-orange-500"
              disabled={isLoading}
            >
              {isLoading ? 'Restableciendo...' : 'Confirmar Nueva Contraseña'}
            </Button>

            <Link
              to="/login"
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 hover:text-slate-300 transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Volver al inicio de sesión
            </Link>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
