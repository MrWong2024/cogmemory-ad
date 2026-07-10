// backend/src/modules/assessments/assessments.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { PatientsModule } from '../patients/patients.module';
import { ScalesModule } from '../scales/scales.module';
import { AssessmentExecutionController } from './controllers/assessment-execution.controller';
import { AssessmentVisitsController } from './controllers/assessment-visits.controller';
import { ScaleInstanceSubmissionController } from './controllers/scale-instance-submission.controller';
import {
  AssessmentVisit,
  AssessmentVisitSchema,
} from './schemas/assessment-visit.schema';
import {
  ItemResponse,
  ItemResponseSchema,
} from './schemas/item-response.schema';
import {
  ScaleInstance,
  ScaleInstanceSchema,
} from './schemas/scale-instance.schema';
import { AssessmentExecutionService } from './services/assessment-execution.service';
import { AssessmentExecutionDetailService } from './services/assessment-execution-detail.service';
import { AssessmentScaleWorkflowService } from './services/assessment-scale-workflow.service';
import { AssessmentsService } from './services/assessments.service';
import { ItemResponseDraftService } from './services/item-response-draft.service';
import { ScaleInstanceSubmissionService } from './services/scale-instance-submission.service';

@Module({
  imports: [
    AuthModule,
    PatientsModule,
    ScalesModule,
    MongooseModule.forFeature([
      { name: AssessmentVisit.name, schema: AssessmentVisitSchema },
      { name: ScaleInstance.name, schema: ScaleInstanceSchema },
      { name: ItemResponse.name, schema: ItemResponseSchema },
    ]),
  ],
  controllers: [
    AssessmentVisitsController,
    AssessmentExecutionController,
    ScaleInstanceSubmissionController,
  ],
  providers: [
    AssessmentsService,
    AssessmentExecutionService,
    AssessmentScaleWorkflowService,
    AssessmentExecutionDetailService,
    ItemResponseDraftService,
    ScaleInstanceSubmissionService,
  ],
  exports: [
    AssessmentsService,
    AssessmentExecutionService,
    AssessmentExecutionDetailService,
    ItemResponseDraftService,
  ],
})
export class AssessmentsModule {}
