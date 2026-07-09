// backend/src/modules/scoring/scoring.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScoreResult, ScoreResultSchema } from './schemas/score-result.schema';
import { ScoringService } from './services/scoring.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ScoreResult.name, schema: ScoreResultSchema },
    ]),
  ],
  providers: [ScoringService],
  exports: [ScoringService],
})
export class ScoringModule {}
