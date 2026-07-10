import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { CreatePatientDto } from '../dto/create-patient.dto';
import { ListPatientsQueryDto } from '../dto/list-patients-query.dto';
import { PatientIdParamDto } from '../dto/patient-id-param.dto';
import { PATIENT_WORKFLOW_ROLES } from '../patients.constants';
import { PatientsService } from '../services/patients.service';
import type {
  PatientDetailResponse,
  PatientListResponse,
} from '../types/patient-response.types';

@Controller('patients')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(...PATIENT_WORKFLOW_ROLES)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  listPatients(
    @Query() query: ListPatientsQueryDto,
  ): Promise<PatientListResponse> {
    return this.patientsService.listPatients(query);
  }

  @Post()
  createPatient(
    @Body() createPatientDto: CreatePatientDto,
  ): Promise<PatientDetailResponse> {
    return this.patientsService.createPatient(createPatientDto);
  }

  @Get(':patientId')
  async getPatient(
    @Param() params: PatientIdParamDto,
  ): Promise<PatientDetailResponse> {
    const patient = await this.patientsService.findPatientById(
      params.patientId,
    );

    if (!patient) {
      throw new NotFoundException({
        code: 'PATIENT_NOT_FOUND',
        message: 'Patient not found',
      });
    }

    return this.patientsService.toPatientDetailResponse(patient);
  }
}
