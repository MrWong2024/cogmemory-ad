import { Module } from '@nestjs/common';
import { AssessmentsModule } from '../assessments/assessments.module';
import { AuthModule } from '../auth/auth.module';
import { CognitiveDomainsModule } from '../cognitive-domains/cognitive-domains.module';
import { PatientsModule } from '../patients/patients.module';
import { ReportsModule } from '../reports/reports.module';
import { ScalesModule } from '../scales/scales.module';
import { ScoringModule } from '../scoring/scoring.module';
import { ClinicalHistoryController } from './controllers/clinical-history.controller';
import { ClinicalHistoryQueryService } from './services/clinical-history-query.service';

@Module({
  imports: [
    AuthModule,
    PatientsModule,
    AssessmentsModule,
    ScoringModule,
    CognitiveDomainsModule,
    ReportsModule,
    ScalesModule,
  ],
  controllers: [ClinicalHistoryController],
  providers: [ClinicalHistoryQueryService],
})
export class ClinicalHistoryModule {}
