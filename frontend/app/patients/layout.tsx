import type { ReactNode } from 'react';

import { PatientsWorkspaceShell } from '@/src/features/patients/components/PatientsWorkspaceShell';

export default function PatientsLayout({ children }: { children: ReactNode }) {
  return <PatientsWorkspaceShell>{children}</PatientsWorkspaceShell>;
}
