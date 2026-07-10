import { Badge, type BadgeTone } from '@/src/components/ui/Badge';
import { patientStatusLabels } from '@/src/features/patients/lib/patient-display';
import type { PatientStatus } from '@/src/features/patients/types/patient';

const patientStatusTones: Record<PatientStatus, BadgeTone> = {
  active: 'success',
  inactive: 'warning',
  archived: 'neutral',
};

export function PatientStatusBadge({ status }: { status: PatientStatus }) {
  return (
    <Badge tone={patientStatusTones[status]}>
      {patientStatusLabels[status]}
    </Badge>
  );
}
