import { create } from 'zustand';
import { Role, type User } from '../types'; 

interface AppState {
  user: User | null;
  currentWorkspace: string;
  setUser: (user: User) => void;
  setWorkspace: (name: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: {
    idUser: 1,
    username: 'alfrog7',
    role: Role.COLLABORATOR,
    name: 'Alfredo Guzman',
    email: 'roermoscol30@gmail.com' // Correo actualizado
  },
  currentWorkspace: 'SynapseOps_Main_Core',
  
  setUser: (user) => set({ user }),
  setWorkspace: (name) => set({ currentWorkspace: name }),
}));