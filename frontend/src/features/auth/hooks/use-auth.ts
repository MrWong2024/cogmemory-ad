// frontend/src/features/auth/hooks/use-auth.ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { getMe, logout } from '@/src/features/auth/api/auth-api';
import type { AuthState } from '@/src/features/auth/types/auth';

const initialAuthState: AuthState = {
  status: 'loading',
  user: null,
  error: null,
};

export function useAuth() {
  const [state, setState] = useState<AuthState>(initialAuthState);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setState(initialAuthState);

    try {
      const response = await getMe();

      if (requestId !== requestIdRef.current) {
        return;
      }

      if (!response) {
        setState({
          status: 'unauthenticated',
          user: null,
          error: null,
        });
        return;
      }

      setState({
        status: 'authenticated',
        user: response.user,
        error: null,
      });
    } catch {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setState({
        status: 'error',
        user: null,
        error: '暂时无法连接认证服务，请稍后再试。',
      });
    }
  }, []);

  const signOut = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    try {
      await logout();
    } catch {
      // Local authentication state must still be cleared if the service fails.
    } finally {
      if (requestId === requestIdRef.current) {
        setState({
          status: 'unauthenticated',
          user: null,
          error: null,
        });
      }
    }
  }, []);

  useEffect(() => {
    void refresh();

    return () => {
      requestIdRef.current += 1;
    };
  }, [refresh]);

  return {
    ...state,
    refresh,
    signOut,
  };
}
