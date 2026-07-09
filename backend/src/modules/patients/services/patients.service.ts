// backend/src/modules/patients/services/patients.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Patient,
  PatientDocument,
  PatientExternalRefs,
  PatientHandedness,
  PatientMetadata,
  PatientSex,
  PatientSourceType,
  PatientStatus,
} from '../schemas/patient.schema';

export type PatientSummary = {
  id: string;
  subjectCode: string;
  displayName?: string;
  sourceType: PatientSourceType;
  sex: PatientSex;
  birthDate: Date | null;
  educationYears: number | null;
  handedness: PatientHandedness;
  status: PatientStatus;
  tags: string[];
  notes?: string;
  externalRefs: PatientExternalRefs;
  metadata: PatientMetadata;
};

@Injectable()
export class PatientsService {
  constructor(
    @InjectModel(Patient.name)
    private readonly patientModel: Model<PatientDocument>,
  ) {}

  normalizeSubjectCode(subjectCode: string): string {
    return subjectCode.trim().toUpperCase();
  }

  async findPatientBySubjectCode(
    subjectCode: string,
  ): Promise<PatientSummary | null> {
    const normalizedCode = this.normalizeSubjectCode(subjectCode);

    if (!normalizedCode) {
      return null;
    }

    const patient = await this.patientModel
      .findOne({ subjectCode: normalizedCode })
      .exec();

    if (!patient) {
      return null;
    }

    return this.mapPatient(patient);
  }

  async listActivePatients(): Promise<PatientSummary[]> {
    const patients = await this.patientModel
      .find({ status: 'active' })
      .sort({ subjectCode: 1 })
      .exec();

    return patients.map((patient) => this.mapPatient(patient));
  }

  private mapPatient(patient: PatientDocument): PatientSummary {
    return {
      id: patient._id.toString(),
      subjectCode: patient.subjectCode,
      displayName: patient.displayName,
      sourceType: patient.sourceType,
      sex: patient.sex,
      birthDate: patient.birthDate ?? null,
      educationYears: patient.educationYears ?? null,
      handedness: patient.handedness,
      status: patient.status,
      tags: [...(patient.tags ?? [])],
      notes: patient.notes,
      externalRefs: patient.externalRefs ?? null,
      metadata: patient.metadata ?? null,
    };
  }
}
