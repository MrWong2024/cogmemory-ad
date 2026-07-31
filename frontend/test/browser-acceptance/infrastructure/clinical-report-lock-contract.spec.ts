import {
  existsSync,
  readFileSync,
  readdirSync,
  type Dirent,
} from 'node:fs';
import {
  dirname,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { expect, test } from '@playwright/test';

import { lockClinicalReport } from '@/src/features/assessments/api/clinical-report-api';
import {
  buildLockClinicalReportRequest,
  createClinicalReportLockDraft,
} from '@/src/features/assessments/lib/clinical-report-workflow-draft';
import { isClinicalReportLocked } from '@/src/features/assessments/lib/clinical-report-display';
import type {
  ClinicalReport,
  LockClinicalReportRequest,
} from '@/src/features/assessments/types/clinical-report';

const PATIENT_ID = '507f1f77bcf86cd799439011';
const VISIT_ID = '507f1f77bcf86cd799439012';
const REPORT_ID = '507F1F77BCF86CD799439013';
const NORMALIZED_REPORT_ID = REPORT_ID.toLowerCase();
const REPORT_UPDATED_AT = '2026-07-31T01:02:03.000Z';
const TEST_LOCK_NOTE = 'TEST DE-IDENTIFIED clinical report lock note';
const originalFetch = globalThis.fetch;

type RouteEntry = {
  kind: 'page' | 'route';
  route: string;
  segments: string[];
};

function createTestReport(): ClinicalReport {
  return {
    id: ` ${REPORT_ID} `,
    reportCode: 'TEST-CLINICAL-REPORT',
    reportType: 'cognitive_assessment',
    status: 'confirmed',
    reportVersion: 1,
    source: 'mixed',
    qualityStatus: 'passed',
    patientSnapshot: null,
    visitSnapshot: null,
    scaleTraces: [],
    scoreSnapshots: [],
    domainSnapshots: [],
    evidenceSnapshots: [],
    narrative: null,
    generation: null,
    editorial: null,
    submission: null,
    confirmation: null,
    lockedAt: null,
    lock: null,
    sourceFreeze: null,
    archivedAt: null,
    archive: null,
    correction: null,
    replacementOf: null,
    voidedAt: null,
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: REPORT_UPDATED_AT,
    isFinal: true,
  };
}

function findAppRouterRoot(): string {
  const candidates = [resolve('src/app'), resolve('app')].filter((candidate) =>
    existsSync(candidate),
  );
  expect(candidates).toHaveLength(1);
  return candidates[0]!;
}

function enumerateRouteEntries(appRouterRoot: string): RouteEntry[] {
  const routeFiles = new Set(['page.tsx', 'page.ts', 'route.ts', 'route.tsx']);
  const entries: RouteEntry[] = [];

  function visit(directory: string): void {
    const children = readdirSync(directory, {
      withFileTypes: true,
    }) as Dirent[];
    for (const child of children) {
      const absolutePath = join(directory, child.name);
      if (child.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (!child.isFile() || !routeFiles.has(child.name)) continue;

      const segments = relative(appRouterRoot, dirname(absolutePath))
        .split(sep)
        .filter(
          (segment) =>
            segment.length > 0 &&
            !(segment.startsWith('(') && segment.endsWith(')')),
        );
      entries.push({
        kind: child.name.startsWith('page.') ? 'page' : 'route',
        route: segments.length > 0 ? `/${segments.join('/')}` : '/',
        segments,
      });
    }
  }

  visit(appRouterRoot);
  return entries;
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  expect(globalThis.fetch).toBe(originalFetch);
});

test('serializes only the clinical report lock request contract from the current report timestamp', async () => {
  const report = createTestReport();
  const draft = createClinicalReportLockDraft(report);
  expect(draft).not.toBeNull();
  if (!draft) throw new Error('Expected a valid TEST clinical report lock draft');

  expect(draft.reportId).toBe(NORMALIZED_REPORT_ID);
  expect(draft.baseUpdatedAt).toBe(report.updatedAt);

  draft.lockNote = `  ${TEST_LOCK_NOTE}  `;
  draft.confirmed = true;
  draft.stale = false;
  const request = buildLockClinicalReportRequest(draft);
  expect(request).toEqual({
    confirm: true,
    lockNote: TEST_LOCK_NOTE,
    expectedUpdatedAt: report.updatedAt,
  });

  const runtimeInput = Object.assign({}, request, {
    status: 'confirmed',
    lockedBy: 'TEST-DE-IDENTIFIED-OPERATOR',
    metadata: { source: 'TEST-DE-IDENTIFIED' },
    extraField: 'TEST-EXTRA-FIELD',
  }) as LockClinicalReportRequest & Record<string, unknown>;
  const capturedRequests: Array<{ url: string; init: RequestInit }> = [];

  try {
    globalThis.fetch = async (input, init) => {
      capturedRequests.push({
        url: String(input),
        init: init ?? {},
      });
      return new Response(
        JSON.stringify({
          report,
          lockReceipt: {
            lockId: 'TEST-LOCK-RECEIPT',
            lockedAt: '2026-07-31T01:02:04.000Z',
            lockedBy: {
              id: '507f1f77bcf86cd799439014',
              name: 'TEST DE-IDENTIFIED OPERATOR',
              role: 'doctor',
            },
            lockNote: TEST_LOCK_NOTE,
            alreadyLocked: false,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    };

    await lockClinicalReport(
      PATIENT_ID,
      VISIT_ID,
      draft.reportId,
      runtimeInput,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  expect(capturedRequests).toHaveLength(1);
  const captured = capturedRequests[0];
  if (!captured) {
    throw new Error('Expected the TEST fetch stub to capture one request');
  }

  const body = JSON.parse(String(captured.init.body)) as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual([
    'confirm',
    'expectedUpdatedAt',
    'lockNote',
  ]);
  expect(body).toEqual({
    confirm: true,
    lockNote: TEST_LOCK_NOTE,
    expectedUpdatedAt: report.updatedAt,
  });
  expect(body).not.toHaveProperty('status');
  expect(body).not.toHaveProperty('lockedBy');
  expect(body).not.toHaveProperty('metadata');
  expect(body).not.toHaveProperty('extraField');
  expect(captured.init.method).toBe('POST');
  expect(new Headers(captured.init.headers).get('content-type')).toBe(
    'application/json',
  );
  expect(captured.init.credentials).toBe('include');
  expect(new URL(captured.url).pathname).toBe(
    `/patients/${PATIENT_ID}/visits/${VISIT_ID}/clinical-reports/${NORMALIZED_REPORT_ID}/lock`,
  );
});

test('keeps the lock workflow on the existing visit detail route without a dedicated route segment', () => {
  const appRouterRoot = findAppRouterRoot();
  const routes = enumerateRouteEntries(appRouterRoot);
  expect(
    routes.some(
      ({ kind, route }) =>
        kind === 'page' &&
        route === '/patients/[patientId]/visits/[visitId]',
    ),
  ).toBe(true);

  const forbiddenSegments = new Set([
    'lock',
    'locks',
    'report-lock',
    'clinical-report-lock',
    'a22',
  ]);
  expect(
    routes.filter(({ segments }) =>
      segments.some((segment) =>
        forbiddenSegments.has(segment.toLowerCase()),
      ),
    ),
  ).toEqual([]);

  const visitPageSource = readFileSync(
    join(
      appRouterRoot,
      'patients',
      '[patientId]',
      'visits',
      '[visitId]',
      'page.tsx',
    ),
    'utf8',
  );
  expect(visitPageSource).toContain(
    "import { AssessmentVisitExecutionPage } from '@/src/features/assessments/components/AssessmentVisitExecutionPage';",
  );
  expect(visitPageSource).toContain('<AssessmentVisitExecutionPage');

  const executionPageSource = readFileSync(
    resolve(
      'src/features/assessments/components/AssessmentVisitExecutionPage.tsx',
    ),
    'utf8',
  ).replace(/\s+/g, ' ');
  expect(executionPageSource).toContain(
    'const reportWorkflow = useClinicalReportWorkflow({ patientId, visitId, report: reportState.report,',
  );
  expect(executionPageSource).toContain(
    '<ClinicalReportPanel catalog={scales} instances={detail.scaleInstances} onRefreshVisitDetail={handleRefreshVisitDetail} patientId={patientId} reportState={reportState} visitId={visitId} workflow={reportWorkflow}',
  );

  const lockPanelSource = readFileSync(
    resolve(
      'src/features/assessments/components/ClinicalReportLockPanel.tsx',
    ),
    'utf8',
  );
  expect(lockPanelSource).toContain('onClick={workflow.openLock}');
  expect(lockPanelSource).toContain(
    'onClick={() => void workflow.confirmLock()}',
  );

  const lockHookSource = readFileSync(
    resolve(
      'src/features/assessments/hooks/clinical-report-workflow/useClinicalReportLockAction.ts',
    ),
    'utf8',
  ).replace(/\s+/g, ' ');
  expect(lockHookSource).toContain(
    'const draft = createClinicalReportLockDraft(report);',
  );
  expect(lockHookSource).toContain(
    'lockClinicalReport( patientId, visitId, lockDraft.reportId, buildLockClinicalReportRequest(lockDraft),',
  );
});

test('B12-69: derives locked read-only semantics from lockedAt and never from isFinal', () => {
  const unlockedFinal = { ...createTestReport(), isFinal: true };
  const unlockedNonFinal = { ...createTestReport(), isFinal: false };
  const lockedFinal = {
    ...createTestReport(),
    lockedAt: '2026-07-31T01:03:00.000Z',
    isFinal: true,
  };
  const lockedNonFinal = { ...lockedFinal, isFinal: false };

  expect(isClinicalReportLocked(unlockedFinal)).toBe(false);
  expect(isClinicalReportLocked(unlockedNonFinal)).toBe(false);
  expect(isClinicalReportLocked(lockedFinal)).toBe(true);
  expect(isClinicalReportLocked(lockedNonFinal)).toBe(true);
});
