import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { AssessmentsService } from '../../assessments/services/assessments.service';
import { CognitiveDomainsService } from '../../cognitive-domains/services/cognitive-domains.service';
import { PatientsService } from '../../patients/services/patients.service';
import { ReportsService } from '../../reports/services/reports.service';
import { ScoringService } from '../../scoring/services/scoring.service';
import type { ListPatientAssessmentHistoryQueryDto } from '../dto/list-patient-assessment-history-query.dto';
import { mapPatientAssessmentHistoryItem } from '../lib/assessment-history.mapper';
import type { PatientAssessmentHistoryResponse } from '../types/clinical-history.types';

@Injectable()
export class ClinicalHistoryQueryService {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly assessmentsService: AssessmentsService,
    private readonly scoringService: ScoringService,
    private readonly cognitiveDomainsService: CognitiveDomainsService,
    private readonly reportsService: ReportsService,
  ) {}

  async listPatientAssessmentHistory(
    patientId: string,
    query: ListPatientAssessmentHistoryQueryDto,
  ): Promise<PatientAssessmentHistoryResponse> {
    if (
      query.dateFrom &&
      query.dateTo &&
      query.dateFrom.getTime() > query.dateTo.getTime()
    ) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'dateFrom must not be later than dateTo',
      });
    }
    const patient =
      await this.patientsService.findPatientHistoryIdentityById(patientId);
    if (!patient) {
      throw new NotFoundException({
        code: 'PATIENT_NOT_FOUND',
        message: 'Patient not found',
      });
    }
    const visitIds = query.scaleCode
      ? await this.assessmentsService.listPatientVisitIdsByScaleCode(
          patient.id,
          query.scaleCode,
        )
      : undefined;
    const visitPage =
      await this.assessmentsService.listPatientAssessmentHistoryVisits(
        patient.id,
        {
          page: query.page,
          pageSize: query.pageSize,
          ...(query.dateFrom ? { dateFrom: query.dateFrom } : {}),
          ...(query.dateTo ? { dateTo: query.dateTo } : {}),
          ...(query.visitType ? { visitType: query.visitType } : {}),
          ...(query.status ? { status: query.status } : {}),
          ...(visitIds ? { visitIds } : {}),
        },
      );
    if (visitPage.items.length === 0) {
      return {
        items: [],
        page: query.page,
        pageSize: query.pageSize,
        total: visitPage.total,
      };
    }
    if (
      visitPage.items.some(
        (visit) =>
          !(visit.assessmentDate instanceof Date) ||
          !Number.isFinite(visit.assessmentDate.getTime()),
      )
    ) {
      throw new InternalServerErrorException({
        code: 'ASSESSMENT_HISTORY_DATA_INVALID',
        message: 'Assessment history data is invalid',
      });
    }
    const pageVisitIds = visitPage.items.map((visit) => visit.id);
    const [scaleInstances, reports] = await Promise.all([
      this.assessmentsService.listAssessmentHistoryScaleInstances(
        patient.id,
        pageVisitIds,
      ),
      this.reportsService.listClinicalReportHistoryRecords(
        patient.id,
        pageVisitIds,
      ),
    ]);
    const scaleInstanceIds = scaleInstances.map((instance) => instance.id);
    const scoreResults =
      await this.scoringService.listAssessmentHistoryScoreResults(
        patient.id,
        pageVisitIds,
        scaleInstanceIds,
      );
    const domainResults =
      await this.cognitiveDomainsService.listAssessmentHistoryDomainResults(
        patient.id,
        pageVisitIds,
        scaleInstanceIds,
        scoreResults.map((score) => score.id),
      );
    return {
      items: visitPage.items.map((visit) =>
        mapPatientAssessmentHistoryItem({
          visit,
          scaleInstances: scaleInstances.filter(
            (instance) => instance.assessmentVisitId === visit.id,
          ),
          scoreResults: scoreResults.filter(
            (score) => score.assessmentVisitId === visit.id,
          ),
          domainResults: domainResults.filter(
            (domain) => domain.assessmentVisitId === visit.id,
          ),
          reports: reports.filter(
            (report) => report.assessmentVisitId === visit.id,
          ),
        }),
      ),
      page: query.page,
      pageSize: query.pageSize,
      total: visitPage.total,
    };
  }
}
