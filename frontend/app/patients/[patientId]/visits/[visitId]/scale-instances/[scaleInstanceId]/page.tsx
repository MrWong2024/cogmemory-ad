import type { Metadata } from 'next';

import { ScaleInstanceExecutionPage } from '@/src/features/assessments/components/ScaleInstanceExecutionPage';

export const metadata: Metadata = {
  title: '量表施测执行 | 智忆评',
};

export default async function ScaleInstancePage({
  params,
}: {
  params: Promise<{
    patientId: string;
    visitId: string;
    scaleInstanceId: string;
  }>;
}) {
  const { patientId, visitId, scaleInstanceId } = await params;

  return (
    <ScaleInstanceExecutionPage
      key={`${patientId}:${visitId}:${scaleInstanceId}`}
      patientId={patientId}
      scaleInstanceId={scaleInstanceId}
      visitId={visitId}
    />
  );
}
