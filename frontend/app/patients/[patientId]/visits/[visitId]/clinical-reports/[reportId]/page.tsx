import type { Metadata } from 'next';

import { HistoricalClinicalReportDetailPage } from '@/src/features/assessments/components/HistoricalClinicalReportDetailPage';

export const metadata: Metadata = {
  title: '历史报告只读详情 | 智忆评',
};

export default async function HistoricalClinicalReportRoute({
  params,
}: {
  params: Promise<{
    patientId: string;
    visitId: string;
    reportId: string;
  }>;
}) {
  const { patientId, visitId, reportId } = await params;

  return (
    <HistoricalClinicalReportDetailPage
      patientId={patientId}
      reportId={reportId}
      visitId={visitId}
    />
  );
}
