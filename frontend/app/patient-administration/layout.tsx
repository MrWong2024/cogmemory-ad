import type { ReactNode } from 'react';

import { PatientAdministrationShell } from '@/src/features/patient-administration/components/PatientAdministrationShell';

export default function PatientAdministrationLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <PatientAdministrationShell>{children}</PatientAdministrationShell>;
}
