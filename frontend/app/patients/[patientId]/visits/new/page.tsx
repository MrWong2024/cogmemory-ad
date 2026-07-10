import type { Metadata } from 'next';

import { AssessmentVisitCreateForm } from '@/src/features/patients/components/AssessmentVisitCreateForm';

export const metadata: Metadata = {
  title: '新建评估访视 | 智忆评',
};

export default async function NewAssessmentVisitPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  return <AssessmentVisitCreateForm patientId={patientId} />;
}
