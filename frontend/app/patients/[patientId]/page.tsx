import type { Metadata } from 'next';
import { Suspense } from 'react';

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/Card';
import { PatientDetailPage } from '@/src/features/patients/components/PatientDetailPage';

export const metadata: Metadata = {
  title: '患者详情 | 智忆评',
};

export default async function PatientPage({
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
            <CardTitle>正在加载患者详情</CardTitle>
            <CardDescription>正在准备患者与访视筛选信息。</CardDescription>
          </CardHeader>
        </Card>
      }
    >
      <PatientDetailPage patientId={patientId} />
    </Suspense>
  );
}
