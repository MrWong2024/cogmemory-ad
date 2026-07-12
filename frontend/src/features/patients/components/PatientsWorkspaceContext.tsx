'use client';

import { createContext, useContext, type ReactNode } from 'react';

import type { AuthUser } from '@/src/features/auth/types/auth';

const PatientsWorkspaceUserContext = createContext<AuthUser | null>(null);

export function PatientsWorkspaceUserProvider({
  children,
  user,
}: {
  children: ReactNode;
  user: AuthUser;
}) {
  return (
    <PatientsWorkspaceUserContext.Provider value={user}>
      {children}
    </PatientsWorkspaceUserContext.Provider>
  );
}

export function usePatientsWorkspaceUser(): AuthUser {
  const user = useContext(PatientsWorkspaceUserContext);
  if (!user) {
    throw new Error(
      'usePatientsWorkspaceUser must be used within PatientsWorkspaceUserProvider',
    );
  }
  return user;
}
