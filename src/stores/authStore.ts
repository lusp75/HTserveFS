/**
 * Auth Store
 * Gestisce lo stato di autenticazione dell'applicazione
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  username: string;
  role: 'admin' | 'read-only' | 'read-write';
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  verifyToken: () => Promise<boolean>;
  clearError: () => void;
}

const API_BASE = '/api';

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
          });
          
          const data = await response.json();
          
          if (data.success) {
            set({
              user: data.user,
              token: data.token,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });
            return true;
          } else {
            set({
              error: data.message || 'Login failed',
              isLoading: false,
            });
            return false;
          }
        } catch (error) {
          set({
            error: 'Network error. Please try again.',
            isLoading: false,
          });
          return false;
        }
      },

      logout: async () => {
        const { token } = get();
        
        // Call logout endpoint if token exists
        if (token) {
          try {
            await fetch(`${API_BASE}/auth/logout`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
              },
            });
          } catch (error) {
            console.warn('Logout request failed:', error);
          }
        }
        
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null,
        });
      },

      verifyToken: async () => {
        const { token } = get();
        
        if (!token) {
          set({ isAuthenticated: false });
          return false;
        }
        
        try {
          const response = await fetch(`${API_BASE}/auth/verify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token }),
          });
          
          const data = await response.json();
          
          if (data.success && data.valid) {
            set({
              user: data.user,
              isAuthenticated: true,
            });
            return true;
          } else {
            set({
              user: null,
              token: null,
              isAuthenticated: false,
            });
            return false;
          }
        } catch (error) {
          set({
            user: null,
            token: null,
            isAuthenticated: false,
          });
          return false;
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'htservefs-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);