import type { Metadata } from 'next';
import { Suspense } from 'react';

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/Card';
import { PatientAssessmentHistoryPage } from '@/src/features/patients/components/PatientAssessmentHistoryPage';

export const metadata: Metadata = {
  title: '患者评估历史 | 智忆评',
};

export default async function PatientHistoryRoute({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;

  return (
    <Suspense
      fallback={
        <Card aria-live="polite" role="status">
          <CardHeader>
            <CardTitle>正在准备评估历史页面</CardTitle>
            <CardDescription>正在恢复 URL 筛选条件。</CardDescription>
          </CardHeader>
        </Card>
      }
    >
      <PatientAssessmentHistoryPage patientId={patientId} />
    </Suspense>
  );
}
