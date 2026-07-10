// backend/src/modules/patients/services/patients.service.ts
import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { escapeRegExp } from '../../../common/utils/mongo-query';
import type { CreatePatientDto } from '../dto/create-patient.dto';
import type { ListPatientsQueryDto } from '../dto/list-patients-query.dto';
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
import type {
  PatientDetailResponse,
  PatientListItemResponse,
  PatientListResponse,
} from '../types/patient-response.types';

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

type MongoDuplicateKeyError = {
  code: number;
};

type PatientListFilter = {
  $or?: Array<{ subjectCode: RegExp } | { displayName: RegExp }>;
  sourceType?: PatientSourceType;
  status?: PatientStatus;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMongoDuplicateKeyError(
  error: unknown,
): error is MongoDuplicateKeyError {
  return isRecord(error) && error.code === 11000;
}

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

  async findPatientById(
    patientId: Types.ObjectId | string,
  ): Promise<PatientSummary | null> {
    const normalizedId = this.normalizeObjectId(patientId);

    if (!normalizedId) {
      return null;
    }

    const patient = await this.patientModel
      .findOne({ _id: normalizedId })
      .exec();

    return patient ? this.mapPatient(patient) : null;
  }

  async listActivePatients(): Promise<PatientSummary[]> {
    const patients = await this.patientModel
      .find({ status: 'active' })
      .sort({ subjectCode: 1 })
      .exec();

    return patients.map((patient) => this.mapPatient(patient));
  }

  async listPatients(
    query: ListPatientsQueryDto,
  ): Promise<PatientListResponse> {
    const filter: PatientListFilter = {};
    const keyword = query.keyword?.trim();

    if (keyword) {
      const safeKeywordPattern = new RegExp(escapeRegExp(keyword), 'i');
      filter.$or = [
        { subjectCode: safeKeywordPattern },
        { displayName: safeKeywordPattern },
      ];
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.sourceType) {
      filter.sourceType = query.sourceType;
    }

    const skip = (query.page - 1) * query.pageSize;
    const [patients, total] = await Promise.all([
      this.patientModel
        .find(filter)
        .sort({ subjectCode: 1 })
        .skip(skip)
        .limit(query.pageSize)
        .exec(),
      this.patientModel.countDocuments(filter).exec(),
    ]);

    return {
      items: patients.map((patient) =>
        this.toPatientListItemResponse(this.mapPatient(patient)),
      ),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async createPatient(input: CreatePatientDto): Promise<PatientDetailResponse> {
    const subjectCode = this.normalizeSubjectCode(input.subjectCode);
    const existingPatient = await this.patientModel
      .findOne({ subjectCode })
      .exec();

    if (existingPatient) {
      this.throwSubjectCodeConflict();
    }

    try {
      const patient = await this.patientModel.create({
        subjectCode,
        displayName: input.displayName?.trim() || undefined,
        sourceType: input.sourceType ?? 'clinical',
        sex: input.sex ?? 'unknown',
        birthDate: input.birthDate ?? null,
        educationYears: input.educationYears ?? null,
        handedness: input.handedness ?? 'unknown',
        status: 'active',
        tags: this.normalizeTags(input.tags ?? []),
        notes: input.notes?.trim() || undefined,
      });

      return this.toPatientDetailResponse(this.mapPatient(patient));
    } catch (error: unknown) {
      if (isMongoDuplicateKeyError(error)) {
        this.throwSubjectCodeConflict();
      }

      throw error;
    }
  }

  toPatientListItemResponse(patient: PatientSummary): PatientListItemResponse {
    return {
      id: patient.id,
      subjectCode: patient.subjectCode,
      displayName: patient.displayName,
      sourceType: patient.sourceType,
      sex: patient.sex,
      birthDate: patient.birthDate,
      educationYears: patient.educationYears,
      handedness: patient.handedness,
      status: patient.status,
      tags: [...patient.tags],
    };
  }

  toPatientDetailResponse(patient: PatientSummary): PatientDetailResponse {
    return {
      ...this.toPatientListItemResponse(patient),
      notes: patient.notes,
    };
  }

  private normalizeObjectId(
    id: Types.ObjectId | string,
  ): Types.ObjectId | null {
    if (id instanceof Types.ObjectId) {
      return id;
    }

    const normalizedId = id.trim();

    if (!normalizedId || !Types.ObjectId.isValid(normalizedId)) {
      return null;
    }

    const objectId = new Types.ObjectId(normalizedId);
    return objectId.toString() === normalizedId.toLowerCase() ? objectId : null;
  }

  private normalizeTags(tags: string[]): string[] {
    return tags.map((tag) => tag.trim()).filter(Boolean);
  }

  private throwSubjectCodeConflict(): never {
    throw new ConflictException({
      code: 'PATIENT_SUBJECT_CODE_CONFLICT',
      message: 'Patient subject code already exists',
    });
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
