// backend/src/modules/patients/patients.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { PatientsController } from './controllers/patients.controller';
import { Patient, PatientSchema } from './schemas/patient.schema';
import { PatientsService } from './services/patients.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: Patient.name, schema: PatientSchema }]),
  ],
  controllers: [PatientsController],
  providers: [PatientsService],
  exports: [PatientsService],
})
export class PatientsModule {}
