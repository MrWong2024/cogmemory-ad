// backend/src/modules/assessments/assessments.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AssessmentVisit,
  AssessmentVisitSchema,
} from './schemas/assessment-visit.schema';
import {
  ScaleInstance,
  ScaleInstanceSchema,
} from './schemas/scale-instance.schema';
import { AssessmentsService } from './services/assessments.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AssessmentVisit.name, schema: AssessmentVisitSchema },
      { name: ScaleInstance.name, schema: ScaleInstanceSchema },
    ]),
  ],
  providers: [AssessmentsService],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
