// backend/src/modules/assessments/assessments.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { PatientsModule } from '../patients/patients.module';
import { ScalesModule } from '../scales/scales.module';
import { AssessmentExecutionController } from './controllers/assessment-execution.controller';
import { AssessmentVisitsController } from './controllers/assessment-visits.controller';
import { PatientAdministrationController } from './controllers/patient-administration.controller';
import { PatientAdministrationStaffController } from './controllers/patient-administration-staff.controller';
import { ScaleInstanceSubmissionController } from './controllers/scale-instance-submission.controller';
import { PatientAdministrationSessionGuard } from './guards/patient-administration-session.guard';
import {
  AssessmentVisit,
  AssessmentVisitSchema,
} from './schemas/assessment-visit.schema';
import {
  ItemResponse,
  ItemResponseSchema,
} from './schemas/item-response.schema';
import {
  PatientAdministrationSession,
  PatientAdministrationSessionSchema,
} from './schemas/patient-administration-session.schema';
import {
  ScaleInstance,
  ScaleInstanceSchema,
} from './schemas/scale-instance.schema';
import { AssessmentExecutionService } from './services/assessment-execution.service';
import { AssessmentExecutionDetailService } from './services/assessment-execution-detail.service';
import { AssessmentScaleWorkflowService } from './services/assessment-scale-workflow.service';
import { AssessmentsService } from './services/assessments.service';
import { ItemResponseDraftService } from './services/item-response-draft.service';
import { PatientAdministrationSessionService } from './services/patient-administration-session.service';
import { ScaleInstanceSubmissionService } from './services/scale-instance-submission.service';
import { ScaleInstanceSubmissionBarrierService } from './services/scale-instance-submission-barrier.service';

@Module({
  imports: [
    AuthModule,
    PatientsModule,
    ScalesModule,
    MongooseModule.forFeature([
      { name: AssessmentVisit.name, schema: AssessmentVisitSchema },
      { name: ScaleInstance.name, schema: ScaleInstanceSchema },
      { name: ItemResponse.name, schema: ItemResponseSchema },
      {
        name: PatientAdministrationSession.name,
        schema: PatientAdministrationSessionSchema,
      },
    ]),
  ],
  controllers: [
    AssessmentVisitsController,
    AssessmentExecutionController,
    ScaleInstanceSubmissionController,
    PatientAdministrationStaffController,
    PatientAdministrationController,
  ],
  providers: [
    AssessmentsService,
    AssessmentExecutionService,
    AssessmentScaleWorkflowService,
    AssessmentExecutionDetailService,
    ItemResponseDraftService,
    ScaleInstanceSubmissionBarrierService,
    ScaleInstanceSubmissionService,
    PatientAdministrationSessionService,
    PatientAdministrationSessionGuard,
  ],
  exports: [
    AssessmentsService,
    AssessmentExecutionService,
    AssessmentExecutionDetailService,
    ItemResponseDraftService,
  ],
})
export class AssessmentsModule {}
