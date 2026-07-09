// backend/src/modules/assessments/assessments.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
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
import { ScalesModule } from '../scales/scales.module';
import { AssessmentExecutionService } from './services/assessment-execution.service';
import { AssessmentsService } from './services/assessments.service';

@Module({
  imports: [
    ScalesModule,
    MongooseModule.forFeature([
      { name: AssessmentVisit.name, schema: AssessmentVisitSchema },
      { name: ScaleInstance.name, schema: ScaleInstanceSchema },
      { name: ItemResponse.name, schema: ItemResponseSchema },
    ]),
  ],
  providers: [AssessmentsService, AssessmentExecutionService],
  exports: [AssessmentsService, AssessmentExecutionService],
})
export class AssessmentsModule {}
