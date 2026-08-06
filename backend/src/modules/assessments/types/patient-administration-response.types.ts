import type { IncomingHttpHeaders } from 'node:http';
import type {
  PatientAdministrationAdvanceBy,
  PatientAdministrationResponseMode,
} from '../../scales/schemas/scale-version.schema';
import type { AssessmentOperatorRole } from '../schemas/assessment-visit.schema';
import type {
  PatientAdministrationImpactFactorCode,
  PatientAdministrationStatus,
} from '../patient-administration.constants';

export type PatientAdministrationOperatorResponse = {
  operatorId: string | null;
  operatorName?: string;
  operatorRole?: AssessmentOperatorRole;
};

export type PatientAdministrationSessionSummaryResponse = {
  id: string;
  status: PatientAdministrationStatus;
  currentStepKey: string;
  revision: number;
  expiresAt: Date;
  entryCodeExpiresAt: Date | null;
  hasPatientCredential: boolean;
  preparationConfirmedAt: Date | null;
  preparationConfirmedBy: PatientAdministrationOperatorResponse | null;
  impactFactorCodes: PatientAdministrationImpactFactorCode[];
  impactFactorNote?: string;
  createdBy: PatientAdministrationOperatorResponse;
  startedAt: Date | null;
  pausedAt: Date | null;
  completedAt: Date | null;
  terminatedAt: Date | null;
  expiredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PatientAdministrationEntryCodeResponse =
  PatientAdministrationSessionSummaryResponse & {
    entryCode: string;
    entryCodeExpiresAt: Date;
  };

export type PatientAdministrationCredentialResponse = {
  status: PatientAdministrationStatus;
  revision: number;
  expiresAt: Date;
};

export type PatientAdministrationCurrentStepResponse = {
  stepKey: string;
  order: number;
  patientText?: string;
  responseMode: PatientAdministrationResponseMode;
  advanceBy: PatientAdministrationAdvanceBy;
  assetKeys: string[];
};

export type PatientAdministrationCurrentResponse = {
  status: PatientAdministrationStatus;
  revision: number;
  expiresAt: Date;
  currentStep: PatientAdministrationCurrentStepResponse | null;
};

export type PatientAdministrationRequestContext = {
  sessionId: string;
  sessionTokenHash: string;
  revision: number;
};

export type PatientAdministrationHttpRequest = {
  cookies?: Record<string, string | undefined>;
  headers?: IncomingHttpHeaders;
  ip?: string;
  socket?: { remoteAddress?: string };
  patientAdministration?: PatientAdministrationRequestContext;
};
