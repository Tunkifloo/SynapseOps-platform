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
    <div className="relative flex min-h-[100svh] items-center justify-center overflow-x-hidden overflow-y-auto bg-[#070B12] px-3 py-6 sm:px-4 sm:py-8 lg:py-10">
      <div className="pointer-events-none absolute inset-0 opacity-40 bg-[linear-gradient(to_right,rgba(51,65,85,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(51,65,85,0.12)_1px,transparent_1px)] bg-[size:48px_48px] sm:bg-[size:56px_56px] lg:bg-[size:64px_64px]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[360px] w-[92vw] max-w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/14 blur-3xl sm:h-[460px] lg:h-[560px]" />

      <Card className="relative w-[92vw] max-w-[650px] rounded-[1.5rem] border border-slate-700/75 bg-[rgba(8,13,22,0.88)] px-5 py-7 shadow-2xl shadow-black/35 backdrop-blur-xl sm:max-w-[520px] sm:rounded-[1.75rem] sm:px-8 sm:py-8 md:max-w-[620px] md:px-12 md:py-10 lg:max-w-[660px] lg:rounded-[2rem] lg:px-14">
        <CardHeader className="px-0 pb-7 text-center sm:pb-8 lg:pb-10">
          <CardTitle className="text-3xl font-bold italic tracking-tight text-slate-50 drop-shadow-sm sm:text-4xl lg:text-5xl">
            Synapse<span className="text-blue-500">Ops</span>
          </CardTitle>
          <p className="mt-5 text-[11px] font-medium uppercase tracking-[0.32em] text-slate-400 sm:mt-6 sm:text-xs sm:tracking-[0.38em] lg:mt-8 lg:text-sm lg:tracking-[0.42em]">
            Secure Access Gateway
          </p>
        </CardHeader>

        <form onSubmit={(event) => void onSubmit(event)}>
          <CardContent className="space-y-5 px-0 sm:space-y-6 lg:space-y-8">
            <div className="space-y-2.5 sm:space-y-3">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-300 sm:text-sm">Usuario</label>
              <Input
                className="h-12 rounded-full border-slate-700/80 bg-slate-950/45 px-5 text-base text-slate-100 placeholder:text-slate-500 focus-visible:border-blue-500/60 focus-visible:ring-blue-500/20 sm:h-14 sm:px-6 sm:text-lg lg:h-16 lg:px-7 lg:text-xl"
                type="text"
                value={credential}
                onChange={onCredentialChange}
                placeholder="superadmin"
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-2.5 sm:space-y-3">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-300 sm:text-sm">Contraseña</label>
              <div className="relative">
                <Input
                  className="h-12 rounded-full border-slate-700/80 bg-slate-950/45 px-5 pr-12 text-base text-slate-100 placeholder:text-slate-500 focus-visible:border-blue-500/60 focus-visible:ring-blue-500/20 sm:h-14 sm:px-6 sm:pr-14 sm:text-lg lg:h-16 lg:px-7 lg:pr-16 lg:text-xl"
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
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-200 sm:right-6"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-5 w-5 sm:h-6 sm:w-6" /> : <Eye className="h-5 w-5 sm:h-6 sm:w-6" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="animate-pulse rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm font-semibold text-red-300">
                {error}
              </p>
            )}
          </CardContent>

          <CardFooter className="px-0 pb-0 pt-7 sm:pt-8 lg:pt-10">
            <Button
              type="submit"
              className="h-12 w-full rounded-2xl bg-blue-600 text-base font-semibold text-white shadow-lg shadow-blue-950/40 hover:bg-blue-500 sm:h-14 sm:text-lg lg:h-16 lg:text-xl"
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
