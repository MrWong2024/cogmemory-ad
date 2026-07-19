import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AssessmentsService } from '../../assessments/services/assessments.service';
import { PatientsService } from '../../patients/services/patients.service';
import type { ListClinicalReportVersionsQueryDto } from '../dto/list-clinical-report-versions-query.dto';
import {
  type ClinicalReportHistoryLineageEvaluation,
  ClinicalReportHistoryRuleError,
  evaluateClinicalReportHistoryLineage,
} from '../lib/clinical-report-history-lineage';
import { assertReadableClinicalReport } from '../lib/clinical-report-readability';
import { mapClinicalReportVersionItem } from '../lib/clinical-report-version.mapper';
import type { ClinicalReportDetailResponse } from '../types/clinical-report-response.types';
import type { ClinicalReportVersionListResponse } from '../types/clinical-report-history-response.types';
import { ClinicalReportPublicMapper } from './clinical-report-public.mapper';
import { ReportsService } from './reports.service';

@Injectable()
export class ClinicalReportHistoryQueryService {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly assessmentsService: AssessmentsService,
    private readonly reportsService: ReportsService,
    private readonly publicMapper: ClinicalReportPublicMapper,
  ) {}

  async listVersions(
    patientId: string,
    visitId: string,
    query: ListClinicalReportVersionsQueryDto,
  ): Promise<ClinicalReportVersionListResponse> {
    const context = await this.loadContext(patientId, visitId);
    const reports = await this.reportsService.listClinicalReportHistoryRecords(
      context.patientId,
      [context.visitId],
    );
    let evaluation: ClinicalReportHistoryLineageEvaluation;
    try {
      evaluation = evaluateClinicalReportHistoryLineage({
        reports,
        patientId: context.patientId,
        assessmentVisitId: context.visitId,
      });
    } catch (error: unknown) {
      if (
        error instanceof ClinicalReportHistoryRuleError &&
        error.kind === 'lineage_invalid'
      ) {
        throw new ConflictException({
          code: 'CLINICAL_REPORT_HISTORY_LINEAGE_INVALID',
          message: 'Clinical report history lineage is invalid',
        });
      }
      throw new ConflictException({
        code: 'CLINICAL_REPORT_INCOMPLETE',
        message: 'Clinical report is incomplete',
      });
    }
    const descending = [...evaluation.ordered].sort(
      (left, right) =>
        right.reportVersion - left.reportVersion ||
        right.createdAt!.getTime() - left.createdAt!.getTime() ||
        right.id.localeCompare(left.id),
    );
    const start = (query.page - 1) * query.pageSize;
    return {
      items: descending
        .slice(start, start + query.pageSize)
        .map((report) => mapClinicalReportVersionItem({ report, evaluation })),
      page: query.page,
      pageSize: query.pageSize,
      total: descending.length,
      lineage: {
        status: 'valid',
        firstVersion: evaluation.firstVersion,
        latestVersion: evaluation.latestVersion,
        totalVersions: evaluation.totalVersions,
      },
    };
  }

  async getHistoricalReport(
    patientId: string,
    visitId: string,
    reportId: string,
  ): Promise<ClinicalReportDetailResponse> {
    const context = await this.loadContext(patientId, visitId);
    const report = await this.reportsService.findReportByOwnership({
      reportId,
      patientId: context.patientId,
      assessmentVisitId: context.visitId,
    });
    if (!report) {
      throw new NotFoundException({
        code: 'CLINICAL_REPORT_NOT_FOUND',
        message: 'Clinical report not found',
      });
    }
    assertReadableClinicalReport(report, context.patientId, context.visitId);
    return { report: this.publicMapper.toPublicReport(report) };
  }

  private async loadContext(
    patientId: string,
    visitId: string,
  ): Promise<{ patientId: string; visitId: string }> {
    const patient =
      await this.patientsService.findPatientHistoryIdentityById(patientId);
    if (!patient) {
      throw new NotFoundException({
        code: 'PATIENT_NOT_FOUND',
        message: 'Patient not found',
      });
    }
    const visit =
      await this.assessmentsService.findAssessmentHistoryVisitIdentity(
        patient.id,
        visitId,
      );
    if (!visit) {
      throw new NotFoundException({
        code: 'VISIT_NOT_FOUND',
        message: 'Assessment visit not found',
      });
    }
    return { patientId: patient.id, visitId: visit.id };
  }
}
