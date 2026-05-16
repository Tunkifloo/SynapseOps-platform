import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function ForbiddenPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050505] px-4 text-slate-300">
      <Card className="w-full max-w-lg border-white/10 bg-black/40 backdrop-blur-md">
        <CardHeader>
          <CardTitle className="text-center text-2xl font-bold text-white">Acceso restringido</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-center">
          <p className="text-sm text-slate-400">Tu perfil no tiene permisos para acceder a este modulo.</p>
          <p className="text-xs uppercase tracking-[0.3em] text-red-400">HTTP 403 Forbidden</p>
        </CardContent>
      </Card>
    </div>
  )
}
