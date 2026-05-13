import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../components/ui/card';

const AUTH_BASE_URL = 'http://localhost:8080/api/v1/auth';

interface JwtClaims {
  sub?: string;
  role?: string;
}

interface LoginResponse {
  token: string;
}

interface ProblemDetail {
  detail?: string;
}

const parseJwtClaims = (token: string): JwtClaims => {
  const [, payload] = token.split('.');

  if (!payload) {
    throw new Error('Invalid token payload');
  }

  const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
  const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, '=');

  return JSON.parse(atob(paddedPayload)) as JwtClaims;
};

const resolveRole = (role?: string) => role === 'ADMIN' ? 'ADMIN' : 'COLLABORATOR';

export const LoginPage = () => {
  const [credential, setCredential] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const navigate = useNavigate();
  const setAuth = useAppStore((state) => state.setAuth);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${AUTH_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: credential.trim(), password }),
      });

      if (!response.ok) {
        const problem = await response.json().catch(() => null) as ProblemDetail | null;
        throw new Error(problem?.detail ?? 'No se pudo iniciar sesión con las credenciales ingresadas.');
      }

      const data = await response.json() as LoginResponse;
      const claims = parseJwtClaims(data.token);
      
      setAuth(data.token, { 
        username: claims.sub ?? credential,
        name: claims.sub ?? credential,
        role: resolveRole(claims.role),
      });
      
      navigate('/dashboard');
    } catch (err) { 
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#050505] px-4">
      <Card className="w-full max-w-md border-white/10 bg-black/40 backdrop-blur-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center text-white italic">
            Synapse<span className="text-blue-500">Ops</span>
          </CardTitle>
          <p className="text-center text-[10px] text-slate-500 uppercase tracking-[0.3em] mt-2">Secure Access Gateway</p>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase">Usuario</label>
              <Input 
                className="bg-white/5 border-white/10 text-white focus:ring-blue-500/50"
                type="text"
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
                placeholder="superadmin"
                autoComplete="username"
                required 
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase">Password</label>
              <Input 
                className="bg-white/5 border-white/10 text-white focus:ring-blue-500/50"
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required 
              />
            </div>
            {error && (
              <p className="text-[10px] font-bold text-red-400 bg-red-400/10 p-2.5 rounded border border-red-400/20 animate-pulse">
                {error}
              </p>
            )}
          </CardContent>
          {/* pt-8 para separar el botón de los inputs */}
          <CardFooter className="pt-8 pb-6">
            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold h-11" disabled={isLoading}>
              {isLoading ? 'Authenticating...' : 'Access System'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};
