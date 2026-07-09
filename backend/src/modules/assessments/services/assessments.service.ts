// backend/src/modules/assessments/services/assessments.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AssessmentClinicalContext,
  AssessmentOperatorRole,
  AssessmentOperatorSnapshot,
  AssessmentStatus,
  AssessmentVisit,
  AssessmentVisitDocument,
  AssessmentVisitMetadata,
  AssessmentVisitType,
} from '../schemas/assessment-visit.schema';
import {
  ScaleAdministrationMode,
  ScaleInstance,
  ScaleInstanceDocument,
  ScaleInstanceMetadata,
  ScaleInstanceProgress,
  ScaleQualityControlSummary,
  ScaleVersionTrace,
} from '../schemas/scale-instance.schema';

export type AssessmentOperatorSnapshotSummary = {
  operatorId: string | null;
  operatorName?: string;
  operatorRole?: AssessmentOperatorRole;
};

export type AssessmentVisitSummary = {
  id: string;
  patientId: string;
  subjectCode: string;
  visitCode: string;
  visitType: AssessmentVisitType;
  status: AssessmentStatus;
  assessmentDate: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  lockedAt: Date | null;
  voidedAt: Date | null;
  operatorSnapshot: AssessmentOperatorSnapshotSummary | null;
  clinicalContext: AssessmentClinicalContext;
  notes?: string;
  metadata: AssessmentVisitMetadata;
};

export type ScaleVersionTraceSummary = {
  crfVersion?: string;
  scoringRuleVersion?: string;
  fieldEncodingVersion?: string;
  sourceDocument?: string;
};

export type ScaleInstanceSummary = {
  id: string;
  assessmentVisitId: string;
  patientId: string;
  subjectCode: string;
  scaleDefinitionId: string;
  scaleVersionId: string;
  scaleCode: string;
  scaleVersion: string;
  instanceCode: string;
  instanceNo: number;
  status: AssessmentStatus;
  administrationMode: ScaleAdministrationMode;
  versionTrace: ScaleVersionTraceSummary | null;
  startedAt: Date | null;
  completedAt: Date | null;
  lockedAt: Date | null;
  voidedAt: Date | null;
  durationMs: number | null;
  operatorSnapshot: AssessmentOperatorSnapshotSummary | null;
  progress: ScaleInstanceProgress;
  qualityControlSummary: ScaleQualityControlSummary;
  notes?: string;
  metadata: ScaleInstanceMetadata;
};

@Injectable()
export class AssessmentsService {
  constructor(
    @InjectModel(AssessmentVisit.name)
    private readonly assessmentVisitModel: Model<AssessmentVisitDocument>,
    @InjectModel(ScaleInstance.name)
    private readonly scaleInstanceModel: Model<ScaleInstanceDocument>,
  ) {}

  normalizeVisitCode(visitCode: string): string {
    return visitCode.trim().toUpperCase();
  }

  normalizeInstanceCode(instanceCode: string): string {
    return instanceCode.trim().toUpperCase();
  }

  async findVisitByCode(
    visitCode: string,
  ): Promise<AssessmentVisitSummary | null> {
    const normalizedCode = this.normalizeVisitCode(visitCode);

    if (!normalizedCode) {
      return null;
    }

    const visit = await this.assessmentVisitModel
      .findOne({ visitCode: normalizedCode })
      .exec();

    if (!visit) {
      return null;
    }

    return this.mapVisit(visit);
  }

  async listVisitsByPatientId(
    patientId: Types.ObjectId | string,
  ): Promise<AssessmentVisitSummary[]> {
    const normalizedId = this.normalizeObjectId(patientId);

    if (!normalizedId) {
      return [];
    }

    const visits = await this.assessmentVisitModel
      .find({ patientId: normalizedId })
      .sort({ assessmentDate: -1 })
      .exec();

    return visits.map((visit) => this.mapVisit(visit));
  }

  async findScaleInstanceByCode(
    instanceCode: string,
  ): Promise<ScaleInstanceSummary | null> {
    const normalizedCode = this.normalizeInstanceCode(instanceCode);

    if (!normalizedCode) {
      return null;
    }

    const scaleInstance = await this.scaleInstanceModel
      .findOne({ instanceCode: normalizedCode })
      .exec();

    if (!scaleInstance) {
      return null;
    }

    return this.mapScaleInstance(scaleInstance);
  }

  async listScaleInstancesByVisitId(
    assessmentVisitId: Types.ObjectId | string,
  ): Promise<ScaleInstanceSummary[]> {
    const normalizedId = this.normalizeObjectId(assessmentVisitId);

    if (!normalizedId) {
      return [];
    }

    const scaleInstances = await this.scaleInstanceModel
      .find({ assessmentVisitId: normalizedId })
      .sort({ instanceNo: 1, scaleCode: 1 })
      .exec();

    return scaleInstances.map((scaleInstance) =>
      this.mapScaleInstance(scaleInstance),
    );
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

    if (objectId.toString() !== normalizedId.toLowerCase()) {
      return null;
    }

    return objectId;
  }

  private mapVisit(visit: AssessmentVisitDocument): AssessmentVisitSummary {
    return {
      id: visit._id.toString(),
      patientId: visit.patientId.toString(),
      subjectCode: visit.subjectCode,
      visitCode: visit.visitCode,
      visitType: visit.visitType,
      status: visit.status,
      assessmentDate: visit.assessmentDate,
      startedAt: visit.startedAt ?? null,
      completedAt: visit.completedAt ?? null,
      lockedAt: visit.lockedAt ?? null,
      voidedAt: visit.voidedAt ?? null,
      operatorSnapshot: this.mapOperatorSnapshot(visit.operatorSnapshot),
      clinicalContext: visit.clinicalContext ?? null,
      notes: visit.notes,
      metadata: visit.metadata ?? null,
    };
  }

  private mapScaleInstance(
    scaleInstance: ScaleInstanceDocument,
  ): ScaleInstanceSummary {
    return {
      id: scaleInstance._id.toString(),
      assessmentVisitId: scaleInstance.assessmentVisitId.toString(),
      patientId: scaleInstance.patientId.toString(),
      subjectCode: scaleInstance.subjectCode,
      scaleDefinitionId: scaleInstance.scaleDefinitionId.toString(),
      scaleVersionId: scaleInstance.scaleVersionId.toString(),
      scaleCode: scaleInstance.scaleCode,
      scaleVersion: scaleInstance.scaleVersion,
      instanceCode: scaleInstance.instanceCode,
      instanceNo: scaleInstance.instanceNo,
      status: scaleInstance.status,
      administrationMode: scaleInstance.administrationMode,
      versionTrace: this.mapVersionTrace(scaleInstance.versionTrace),
      startedAt: scaleInstance.startedAt ?? null,
      completedAt: scaleInstance.completedAt ?? null,
      lockedAt: scaleInstance.lockedAt ?? null,
      voidedAt: scaleInstance.voidedAt ?? null,
      durationMs: scaleInstance.durationMs ?? null,
      operatorSnapshot: this.mapOperatorSnapshot(
        scaleInstance.operatorSnapshot,
      ),
      progress: scaleInstance.progress ?? null,
      qualityControlSummary: scaleInstance.qualityControlSummary ?? null,
      notes: scaleInstance.notes,
      metadata: scaleInstance.metadata ?? null,
    };
  }

  private mapOperatorSnapshot(
    operatorSnapshot?: AssessmentOperatorSnapshot | null,
  ): AssessmentOperatorSnapshotSummary | null {
    if (!operatorSnapshot) {
      return null;
    }

    return {
      operatorId: operatorSnapshot.operatorId?.toString() ?? null,
      operatorName: operatorSnapshot.operatorName,
      operatorRole: operatorSnapshot.operatorRole,
    };
  }

  private mapVersionTrace(
    versionTrace?: ScaleVersionTrace | null,
  ): ScaleVersionTraceSummary | null {
    if (!versionTrace) {
      return null;
    }

    return {
      crfVersion: versionTrace.crfVersion,
      scoringRuleVersion: versionTrace.scoringRuleVersion,
      fieldEncodingVersion: versionTrace.fieldEncodingVersion,
      sourceDocument: versionTrace.sourceDocument,
    };
  }
}
