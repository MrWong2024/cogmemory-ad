import type { Metadata } from 'next';

import { AssessmentVisitExecutionPage } from '@/src/features/assessments/components/AssessmentVisitExecutionPage';

export const metadata: Metadata = {
  title: '访视详情与量表初始化 | 智忆评',
};

export default async function AssessmentVisitPage({
  params,
}: {
  params: Promise<{ patientId: string; visitId: string }>;
}) {
  const { patientId, visitId } = await params;

  return (
    <AssessmentVisitExecutionPage
      key={`${patientId}:${visitId}`}
      patientId={patientId}
      visitId={visitId}
    />
  );
}
