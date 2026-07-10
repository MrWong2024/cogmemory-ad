import type { Metadata } from 'next';

import { PatientCreateForm } from '@/src/features/patients/components/PatientCreateForm';

export const metadata: Metadata = {
  title: '新建患者 | 智忆评',
};

export default function NewPatientPage() {
  return <PatientCreateForm />;
}
