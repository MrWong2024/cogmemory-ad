import type { AuthenticatedUserContext } from '../../auth/types/auth-user-context.type';
import type {
  AssessmentVisitSummary,
  ScaleInstanceSummary,
} from '../../assessments/services/assessments.service';
import type { CognitiveDomainResultSummary } from '../../cognitive-domains/services/cognitive-domains.service';
import type { MediaEvidenceSummary } from '../../media/services/media-evidence.service';
import type { PatientSummary } from '../../patients/services/patients.service';
import type {
  ScaleDefinitionSummary,
  ScaleVersionSummary,
} from '../../scales/services/scales.service';
import type { ScoreResultSummary } from '../../scoring/services/scoring.service';
import type { ReportOperatorRole } from '../schemas/clinical-report.schema';

export type ClinicalReportGenerationActor = {
  id: string;
  name: string;
  role: ReportOperatorRole;
};

export type ClinicalReportSelectedScaleSource = {
  scaleInstance: ScaleInstanceSummary;
  scaleDefinition: ScaleDefinitionSummary;
  scaleVersion: ScaleVersionSummary;
  scoreResult: ScoreResultSummary;
  cognitiveDomainResult: CognitiveDomainResultSummary;
};

export type ClinicalReportDraftBuilderInput = {
  patient: PatientSummary;
  visit: AssessmentVisitSummary;
  selectedScaleSources: ClinicalReportSelectedScaleSource[];
  mediaEvidence: MediaEvidenceSummary[];
  generatedAt: Date;
  actor: ClinicalReportGenerationActor;
};

export type ClinicalReportWorkflowUser = AuthenticatedUserContext | undefined;
