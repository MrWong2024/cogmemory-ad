import { Module } from '@nestjs/common';
import { AssessmentsModule } from '../assessments/assessments.module';
import { AuthModule } from '../auth/auth.module';
import { CognitiveDomainsModule } from '../cognitive-domains/cognitive-domains.module';
import { MediaModule } from '../media/media.module';
import { ReportsModule } from '../reports/reports.module';
import { ScoringModule } from '../scoring/scoring.module';
import { StorageModule } from '../storage/storage.module';
import { ScaleInstanceDeletionController } from './controllers/scale-instance-deletion.controller';
import { ScaleInstanceDeletionService } from './services/scale-instance-deletion.service';

@Module({
  imports: [
    AuthModule,
    AssessmentsModule,
    MediaModule,
    StorageModule,
    ScoringModule,
    CognitiveDomainsModule,
    ReportsModule,
  ],
  controllers: [ScaleInstanceDeletionController],
  providers: [ScaleInstanceDeletionService],
})
export class ScaleInstanceDeletionModule {}
