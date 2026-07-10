import type { Metadata } from 'next';
import { Suspense } from 'react';

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/Card';
import { PatientsListPage } from '@/src/features/patients/components/PatientsListPage';

export const metadata: Metadata = {
  title: '患者档案 | 智忆评',
};

export default function PatientsPage() {
  return (
    <Suspense
      fallback={
        <Card aria-live="polite" role="status">
          <CardHeader>
            <CardTitle>正在加载患者档案</CardTitle>
            <CardDescription>正在准备筛选条件，请稍候。</CardDescription>
          </CardHeader>
        </Card>
      }
    >
      <PatientsListPage />
    </Suspense>
  );
}
