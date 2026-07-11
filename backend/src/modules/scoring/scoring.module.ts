// backend/src/modules/scoring/scoring.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AssessmentsModule } from '../assessments/assessments.module';
import { PatientsModule } from '../patients/patients.module';
import { ScalesModule } from '../scales/scales.module';
import { ScoringController } from './controllers/scoring.controller';
import { ScoreResult, ScoreResultSchema } from './schemas/score-result.schema';
import { ProvisionalScoringWorkflowService } from './services/provisional-scoring-workflow.service';
import { ScoreResultPublicMapper } from './services/score-result-public.mapper';
import { ScoreReviewWorkflowService } from './services/score-review-workflow.service';
import { ScoringService } from './services/scoring.service';

@Module({
  imports: [
    AuthModule,
    PatientsModule,
    AssessmentsModule,
    ScalesModule,
    MongooseModule.forFeature([
      { name: ScoreResult.name, schema: ScoreResultSchema },
    ]),
  ],
  controllers: [ScoringController],
  providers: [
    ScoringService,
    ProvisionalScoringWorkflowService,
    ScoreResultPublicMapper,
    ScoreReviewWorkflowService,
  ],
  exports: [ScoringService],
})
export class ScoringModule {}
