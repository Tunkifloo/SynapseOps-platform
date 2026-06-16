import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Role } from '../types';

interface User {
  username: string;
  name: string;  // Agregado
  role: Role;
}

// Fase del onboarding guiado (Ticket UX-5). null = aún no consultado al backend.
// Se guarda en el store (persistido) para sobrevivir a la navegación welcome→lienzo→tour.
type OnboardingPhase = 'welcome' | 'tour' | 'done' | null;

interface AppState {
  token: string | null;
  user: User | null;
  currentWorkspace: string; // Agregado
  isAuthenticated: boolean;
  onboardingPhase: OnboardingPhase;
  setAuth: (token: string, user: User) => void;
  setWorkspace: (workspace: string) => void; // Para cambiar de workspace
  setOnboardingPhase: (phase: OnboardingPhase) => void;
  logout: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      currentWorkspace: 'Default Project', // Valor inicial
      isAuthenticated: false,
      onboardingPhase: null,
      setAuth: (token, user) => set({ token, user, isAuthenticated: true }),
      setWorkspace: (name) => set({ currentWorkspace: name }),
      setOnboardingPhase: (phase) => set({ onboardingPhase: phase }),
      logout: () => set({
        token: null,
        user: null,
        currentWorkspace: 'Default Project',
        isAuthenticated: false,
        onboardingPhase: null, // re-consulta el estado en el próximo login
      }),
    }),
    { name: 'app-storage' }
  )
);

