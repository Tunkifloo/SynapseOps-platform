import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  username: string;
  name: string;  // Agregado
  role: string;  // Agregado
}

interface AppState {
  token: string | null;
  user: User | null;
  currentWorkspace: string; // Agregado
  isAuthenticated: boolean;
  setAuth: (token: string, user: User) => void;
  setWorkspace: (workspace: string) => void; // Para cambiar de workspace
  logout: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      currentWorkspace: 'Default Project', // Valor inicial
      isAuthenticated: false,
      setAuth: (token, user) => set({ token, user, isAuthenticated: true }),
      setWorkspace: (name) => set({ currentWorkspace: name }),
      logout: () => set({ token: null, user: null, isAuthenticated: false }),
    }),
    { name: 'app-storage' }
  )
);

