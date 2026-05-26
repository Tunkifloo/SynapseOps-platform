import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'

interface LoginFormProps {
  credential: string
  password: string
  error: string
  isLoading: boolean
  onCredentialChange: (event: ChangeEvent<HTMLInputElement>) => void
  onPasswordChange: (event: ChangeEvent<HTMLInputElement>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
}

export function LoginForm({
  credential,
  password,
  error,
  isLoading,
  onCredentialChange,
  onPasswordChange,
  onSubmit,
}: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070B12] px-4 py-10">
      <div className="pointer-events-none absolute inset-0 opacity-45 bg-[linear-gradient(to_right,rgba(51,65,85,0.16)_1px,transparent_1px),linear-gradient(to_bottom,rgba(51,65,85,0.13)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/14 blur-3xl" />

      <Card className="relative w-full max-w-[720px] rounded-[2rem] border border-slate-700/75 bg-[rgba(8,13,22,0.88)] px-6 py-10 shadow-2xl shadow-black/35 backdrop-blur-xl sm:px-12 md:px-16">
        <CardHeader className="px-0 pb-10 text-center">
          <CardTitle className="text-5xl font-bold italic tracking-tight text-slate-50 drop-shadow-sm">
            Synapse<span className="text-blue-500">Ops</span>
          </CardTitle>
          <p className="mt-8 text-sm font-medium uppercase tracking-[0.42em] text-slate-400">
            Secure Access Gateway
          </p>
        </CardHeader>

        <form onSubmit={(event) => void onSubmit(event)}>
          <CardContent className="space-y-8 px-0">
            <div className="space-y-3">
              <label className="text-sm font-bold uppercase tracking-wide text-slate-300">Usuario</label>
              <Input
                className="h-16 rounded-full border-slate-700/80 bg-slate-950/45 px-7 text-xl text-slate-100 placeholder:text-slate-500 focus-visible:border-blue-500/60 focus-visible:ring-blue-500/20"
                type="text"
                value={credential}
                onChange={onCredentialChange}
                placeholder="superadmin"
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-bold uppercase tracking-wide text-slate-300">Contraseña</label>
              <div className="relative">
                <Input
                  className="h-16 rounded-full border-slate-700/80 bg-slate-950/45 px-7 pr-16 text-xl text-slate-100 placeholder:text-slate-500 focus-visible:border-blue-500/60 focus-visible:ring-blue-500/20"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={onPasswordChange}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-200"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-6 w-6" /> : <Eye className="h-6 w-6" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="animate-pulse rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm font-semibold text-red-300">
                {error}
              </p>
            )}
          </CardContent>

          <CardFooter className="px-0 pb-0 pt-10">
            <Button
              type="submit"
              className="h-16 w-full rounded-2xl bg-blue-600 text-xl font-semibold text-white shadow-lg shadow-blue-950/40 hover:bg-blue-500"
              disabled={isLoading}
            >
              {isLoading ? 'Autenticando...' : 'Iniciar sesión'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
