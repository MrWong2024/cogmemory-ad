import { Module } from '@nestjs/common';
import { AssessmentsModule } from '../assessments/assessments.module';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { ReportsModule } from '../reports/reports.module';
import { StorageModule } from '../storage/storage.module';
import { PatientAdministrationHistoryController } from './controllers/patient-administration-history.controller';
import { PatientAdministrationHistoryService } from './services/patient-administration-history.service';

@Module({
  imports: [
    AuthModule,
    AssessmentsModule,
    MediaModule,
    ReportsModule,
    StorageModule,
  ],
  controllers: [PatientAdministrationHistoryController],
  providers: [PatientAdministrationHistoryService],
})
export class PatientAdministrationHistoryModule {}
