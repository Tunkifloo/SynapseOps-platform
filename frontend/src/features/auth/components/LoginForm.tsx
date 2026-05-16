import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

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
    <div className="flex min-h-screen items-center justify-center bg-[#050505] px-4">
      <Card className="w-full max-w-md border-white/10 bg-black/40 backdrop-blur-md">
        <CardHeader>
          <CardTitle className="text-center text-2xl font-bold italic text-white">
            Synapse<span className="text-blue-500">Ops</span>
          </CardTitle>
          <p className="mt-2 text-center text-[10px] uppercase tracking-[0.3em] text-slate-500">Secure Access Gateway</p>
        </CardHeader>

        <form onSubmit={(event) => void onSubmit(event)}>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-400">Usuario</label>
              <Input
                className="border-white/10 bg-white/5 text-white focus:ring-blue-500/50"
                type="text"
                value={credential}
                onChange={onCredentialChange}
                placeholder="superadmin"
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-400">Password</label>
              <div className="relative">
                <Input
                  className="border-white/10 bg-white/5 pr-10 text-white focus:ring-blue-500/50"
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
          </CardContent>

          <CardFooter className="pb-6 pt-8">
            <Button type="submit" className="h-11 w-full bg-blue-600 font-bold text-white hover:bg-blue-500" disabled={isLoading}>
              {isLoading ? 'Authenticating...' : 'Access System'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
