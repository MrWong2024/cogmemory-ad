import { ClinicalReportNarrative } from '@/src/features/assessments/components/ClinicalReportNarrative';
import { ClinicalReportSnapshotSummary } from '@/src/features/assessments/components/ClinicalReportSnapshotSummary';
import type { ClinicalReport } from '@/src/features/assessments/types/clinical-report';

export function ClinicalReportReadOnlyContent({
  report,
}: {
  report: ClinicalReport;
}) {
  return (
    <>
      <ClinicalReportSnapshotSummary report={report} />
      <ClinicalReportNarrative
        narrative={report.narrative}
        status={report.status}
      />
    </>
  );
}
