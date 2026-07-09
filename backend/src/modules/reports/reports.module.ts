// backend/src/modules/reports/reports.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ClinicalReport,
  ClinicalReportSchema,
} from './schemas/clinical-report.schema';
import { ReportsService } from './services/reports.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ClinicalReport.name, schema: ClinicalReportSchema },
    ]),
  ],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
