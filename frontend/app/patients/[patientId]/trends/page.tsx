import type { Metadata } from 'next';
import { Suspense } from 'react';

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/Card';
import { PatientFollowUpTrendPage } from '@/src/features/patients/components/PatientFollowUpTrendPage';

export const metadata: Metadata = {
  title: '患者随访趋势 | 智忆评',
};

export default async function PatientTrendsRoute({
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
            <CardTitle>正在准备随访趋势页面</CardTitle>
            <CardDescription>正在恢复 URL 查询条件。</CardDescription>
          </CardHeader>
        </Card>
      }
    >
      <PatientFollowUpTrendPage patientId={patientId} />
    </Suspense>
  );
}
