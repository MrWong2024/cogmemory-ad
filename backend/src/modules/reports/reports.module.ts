// backend/src/modules/reports/reports.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AssessmentsModule } from '../assessments/assessments.module';
import { AuthModule } from '../auth/auth.module';
import { CognitiveDomainsModule } from '../cognitive-domains/cognitive-domains.module';
import { MediaModule } from '../media/media.module';
import { PatientsModule } from '../patients/patients.module';
import { ScalesModule } from '../scales/scales.module';
import { ScoringModule } from '../scoring/scoring.module';
import { ClinicalReportsController } from './controllers/clinical-reports.controller';
import {
  ClinicalReport,
  ClinicalReportSchema,
} from './schemas/clinical-report.schema';
import { ReportsService } from './services/reports.service';
import { ClinicalReportGenerationWorkflowService } from './services/clinical-report-generation-workflow.service';
import { ClinicalReportLockWorkflowService } from './services/clinical-report-lock-workflow.service';
import { ClinicalReportPublicMapper } from './services/clinical-report-public.mapper';
import { ClinicalReportReviewWorkflowService } from './services/clinical-report-review-workflow.service';
import { ClinicalReportSourceFreezeWorkflowService } from './services/clinical-report-source-freeze-workflow.service';

@Module({
  imports: [
    AuthModule,
    PatientsModule,
    AssessmentsModule,
    ScalesModule,
    ScoringModule,
    CognitiveDomainsModule,
    MediaModule,
    MongooseModule.forFeature([
      { name: ClinicalReport.name, schema: ClinicalReportSchema },
    ]),
  ],
  controllers: [ClinicalReportsController],
  providers: [
    ReportsService,
    ClinicalReportGenerationWorkflowService,
    ClinicalReportPublicMapper,
    ClinicalReportReviewWorkflowService,
    ClinicalReportLockWorkflowService,
    ClinicalReportSourceFreezeWorkflowService,
  ],
  exports: [ReportsService],
})
export class ReportsModule {}
