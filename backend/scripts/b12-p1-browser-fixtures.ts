import 'reflect-metadata';
import { createHash } from 'node:crypto';
import type { INestApplicationContext, Type } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import {
  assertBrowserAcceptancePreImportEnvironment,
  assertBrowserFixtureDatabaseAccess,
} from '../src/config/database-purpose';
import {
  AssessmentVisit,
  type AssessmentVisitDocument,
} from '../src/modules/assessments/schemas/assessment-visit.schema';
import {
  ItemResponse,
  type ItemResponseDocument,
} from '../src/modules/assessments/schemas/item-response.schema';
import {
  ScaleInstance,
  type ScaleInstanceDocument,
} from '../src/modules/assessments/schemas/scale-instance.schema';
import {
  Session,
  type SessionDocument,
} from '../src/modules/auth/schemas/session.schema';
import { AuthService } from '../src/modules/auth/services/auth.service';
import {
  CognitiveDomainResult,
  type CognitiveDomainResultDocument,
} from '../src/modules/cognitive-domains/schemas/cognitive-domain-result.schema';
import {
  MediaEvidence,
  type MediaEvidenceDocument,
} from '../src/modules/media/schemas/media-evidence.schema';
import {
  Patient,
  type PatientDocument,
} from '../src/modules/patients/schemas/patient.schema';
import {
  ClinicalReport,
  type ClinicalReportDocument,
} from '../src/modules/reports/schemas/clinical-report.schema';
import {
  ScaleDefinition,
  type ScaleDefinitionDocument,
} from '../src/modules/scales/schemas/scale-definition.schema';
import {
  ScaleVersion,
  type ScaleVersionDocument,
} from '../src/modules/scales/schemas/scale-version.schema';
import { ScaleCatalogService } from '../src/modules/scales/services/scale-catalog.service';
import {
  ScoreResult,
  type ScoreResultDocument,
} from '../src/modules/scoring/schemas/score-result.schema';
import {
  User,
  type UserDocument,
  type UserType,
} from '../src/modules/users/schemas/user.schema';

export const B12_P1_PROFILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const;
export type B12P1Profile = (typeof B12_P1_PROFILES)[number];
export type B12P1VerifyPhase = 'prepared' | 'post-browser';

type LockShape =
  | 'none'
  | 'valid'
  | 'audit_without_locked_at'
  | 'locked_at_without_audit'
  | 'mismatched_audit';

type Scenario = {
  key: string;
  status: 'draft' | 'pending_confirmation' | 'confirmed';
  source: 'system_draft' | 'mixed';
  quality: 'passed' | 'needs_review';
  confirmation: boolean;
  visitStatus: 'completed' | 'locked' | 'voided';
  lockShape: LockShape;
};

type ProfileDefinition = {
  name: string;
  roles: readonly UserType[];
  scenarios: readonly Scenario[];
};

const BASE_DATE = new Date('2026-07-31T02:00:00.000Z');
const PROFILE_DEFINITIONS: Record<B12P1Profile, ProfileDefinition> = {
  a: {
    name: 'B12-P1-A-lifecycle-state',
    roles: ['doctor'],
    scenarios: [
      scenario('draft', 'draft', 'system_draft'),
      scenario('pending', 'pending_confirmation', 'mixed'),
      scenario('confirmed-unlocked', 'confirmed', 'mixed', {
        confirmation: true,
      }),
    ],
  },
  b: {
    name: 'B12-P1-B-authorized-roles',
    roles: ['doctor', 'admin'],
    scenarios: [
      scenario('confirmed-unlocked', 'confirmed', 'mixed', {
        confirmation: true,
      }),
    ],
  },
  c: {
    name: 'B12-P1-C-restricted-roles',
    roles: ['nurse', 'research_assistant', 'system'],
    scenarios: [
      scenario('confirmed-unlocked', 'confirmed', 'mixed', {
        confirmation: true,
      }),
    ],
  },
  d: {
    name: 'B12-P1-D-report-eligibility-gates',
    roles: ['doctor'],
    scenarios: [
      scenario('quality-needs-review', 'confirmed', 'mixed', {
        confirmation: true,
        quality: 'needs_review',
      }),
      scenario('is-final-false', 'draft', 'mixed'),
      scenario('confirmation-missing', 'confirmed', 'mixed'),
    ],
  },
  e: {
    name: 'B12-P1-E-visit-status-gates',
    roles: ['doctor'],
    scenarios: [
      scenario('visit-locked', 'confirmed', 'mixed', {
        confirmation: true,
        visitStatus: 'locked',
      }),
      scenario('visit-voided', 'confirmed', 'mixed', {
        confirmation: true,
        visitStatus: 'voided',
      }),
    ],
  },
  f: {
    name: 'B12-P1-F-lock-consistency',
    roles: ['doctor'],
    scenarios: [
      scenario('already-locked', 'confirmed', 'mixed', {
        confirmation: true,
        lockShape: 'valid',
      }),
      scenario('audit-without-locked-at', 'confirmed', 'mixed', {
        confirmation: true,
        lockShape: 'audit_without_locked_at',
      }),
      scenario('locked-at-without-audit', 'confirmed', 'mixed', {
        confirmation: true,
        lockShape: 'locked_at_without_audit',
      }),
      scenario('mismatched-lock-time', 'confirmed', 'mixed', {
        confirmation: true,
        lockShape: 'mismatched_audit',
      }),
    ],
  },
  g: {
    name: 'B12-P1-G-locked-readonly-semantics',
    roles: ['doctor'],
    scenarios: [
      scenario('locked-readonly', 'confirmed', 'mixed', {
        confirmation: true,
        lockShape: 'valid',
      }),
      scenario('confirmed-unlocked', 'confirmed', 'mixed', {
        confirmation: true,
      }),
      scenario('nonfinal-unlocked', 'draft', 'mixed'),
    ],
  },
};

type Models = {
  users: Model<UserDocument>;
  sessions: Model<SessionDocument>;
  patients: Model<PatientDocument>;
  visits: Model<AssessmentVisitDocument>;
  instances: Model<ScaleInstanceDocument>;
  itemResponses: Model<ItemResponseDocument>;
  reports: Model<ClinicalReportDocument>;
  scores: Model<ScoreResultDocument>;
  domains: Model<CognitiveDomainResultDocument>;
  media: Model<MediaEvidenceDocument>;
  scaleDefinitions: Model<ScaleDefinitionDocument>;
  scaleVersions: Model<ScaleVersionDocument>;
};

type ScenarioIds = {
  patientId: Types.ObjectId;
  visitId: Types.ObjectId;
  instanceId: Types.ObjectId;
  reportId: Types.ObjectId;
  scoreSnapshotId: Types.ObjectId;
  domainSnapshotId: Types.ObjectId;
};

type ScenarioBaseline = {
  key: string;
  reportHash: string;
  reportUpdatedAt: string;
  patientHash: string;
  patientUpdatedAt: string;
  visitHash: string;
  visitUpdatedAt: string;
  instanceHash: string;
  instanceUpdatedAt: string;
};

type SafeSummary = {
  profile: B12P1Profile;
  profileName: string;
  databaseName: string;
  phase: 'prepared' | 'post-browser' | 'cleanup' | 'residual';
  scenarioCount: number;
  userCount: number;
  sessionCount: number;
  residualCount: number;
  businessMutationCount: number;
};

export class B12P1FixtureError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'B12P1FixtureError';
  }
}

function scenario(
  key: string,
  status: Scenario['status'],
  source: Scenario['source'],
  overrides: Partial<Omit<Scenario, 'key' | 'status' | 'source'>> = {},
): Scenario {
  return {
    key,
    status,
    source,
    quality: 'passed',
    confirmation: false,
    visitStatus: 'completed',
    lockShape: 'none',
    ...overrides,
  };
}

export function validateB12P1Profile(raw: string): B12P1Profile {
  const normalized = raw.trim().toLowerCase();
  if (!B12_P1_PROFILES.includes(normalized as B12P1Profile)) {
    throw new B12P1FixtureError(
      'B12_P1_PROFILE_INVALID',
      'Profile must be one of a, b, c, d, e, f, or g',
    );
  }
  return normalized as B12P1Profile;
}

export function b12P1ProfileName(profile: B12P1Profile): string {
  return PROFILE_DEFINITIONS[profile].name;
}

export function b12P1AccountName(
  profile: B12P1Profile,
  role: UserType,
): string {
  return `b12p1-${profile}-${role.replaceAll('_', '-')}`;
}

export function b12P1ScenarioIds(
  profile: B12P1Profile,
  scenarioKey: string,
): ScenarioIds {
  return {
    patientId: objectIdFor(profile, scenarioKey, 'patient'),
    visitId: objectIdFor(profile, scenarioKey, 'visit'),
    instanceId: objectIdFor(profile, scenarioKey, 'instance'),
    reportId: objectIdFor(profile, scenarioKey, 'report'),
    scoreSnapshotId: objectIdFor(profile, scenarioKey, 'score-snapshot'),
    domainSnapshotId: objectIdFor(profile, scenarioKey, 'domain-snapshot'),
  };
}

function objectIdFor(
  profile: B12P1Profile,
  scenarioKey: string,
  resource: string,
): Types.ObjectId {
  return new Types.ObjectId(
    createHash('sha256')
      .update(`b12-p1:${profile}:${scenarioKey}:${resource}`)
      .digest('hex')
      .slice(0, 24),
  );
}

function userIdFor(profile: B12P1Profile, role: UserType): Types.ObjectId {
  return objectIdFor(profile, 'roles', role);
}

function marker(profile: B12P1Profile, scenarioKey: string) {
  return {
    version: 1,
    profile,
    profileName: b12P1ProfileName(profile),
    scenarioKey,
  };
}

function timestampFor(
  profile: B12P1Profile,
  scenarioIndex: number,
  offsetMs = 0,
): Date {
  return new Date(
    BASE_DATE.getTime() +
      B12_P1_PROFILES.indexOf(profile) * 86_400_000 +
      scenarioIndex * 3_600_000 +
      offsetMs,
  );
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Types.ObjectId) return value.toString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record)
      .filter(
        ([key]) =>
          key !== '_id' &&
          key !== '__v' &&
          key !== 'createdAt' &&
          key !== 'updatedAt',
      )
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

function stableHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

function exactDate(value: unknown, label: string): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new B12P1FixtureError(
      'B12_P1_BASELINE_INVALID',
      `${label} is not a valid timestamp`,
    );
  }
  return value.toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredPassword(raw: string | undefined): string {
  const password = raw?.trim();
  if (!password || password.length > 256) {
    throw new B12P1FixtureError(
      'B12_P1_PASSWORD_UNAVAILABLE',
      'B12 fixture password is missing or invalid',
    );
  }
  return password;
}

function lifecycleFor(value: Scenario) {
  return {
    submitted:
      value.status === 'pending_confirmation' || value.status === 'confirmed',
    confirmed: value.confirmation,
  };
}

export class B12P1BrowserFixtureManager {
  constructor(
    private readonly databaseName: string,
    private readonly models: Models,
    private readonly authService: AuthService,
    private readonly scaleCatalog: ScaleCatalogService,
  ) {}

  async prepare(
    profile: B12P1Profile,
    rawPassword: string | undefined,
  ): Promise<SafeSummary> {
    const password = requiredPassword(rawPassword);
    const existing = await this.countResiduals(profile);
    if (existing !== 0) {
      throw new B12P1FixtureError(
        'B12_P1_PREPARE_REPEATED',
        'Profile namespace is already in use; explicit replace is required',
      );
    }
    await this.scaleCatalog.ensureSeedScaleVersionMaterialized('mmse');
    const [definition, version] = await Promise.all([
      this.models.scaleDefinitions.findOne({ code: 'mmse' }).exec(),
      this.models.scaleVersions
        .findOne({ scaleCode: 'mmse', status: 'active' })
        .sort({ version: -1, _id: 1 })
        .exec(),
    ]);
    if (!definition || !version) {
      throw new B12P1FixtureError(
        'B12_P1_CANONICAL_SCALE_UNAVAILABLE',
        'Canonical MMSE scale readiness is unavailable',
      );
    }
    try {
      const users = await this.createUsers(profile, password);
      const firstUser = [...users.values()][0];
      const doctor = users.get('doctor') ?? firstUser;
      if (!doctor) {
        throw new B12P1FixtureError(
          'B12_P1_USER_CREATION_FAILED',
          'Profile fixture user was not created',
        );
      }
      const baselines: ScenarioBaseline[] = [];
      for (const [index, value] of PROFILE_DEFINITIONS[
        profile
      ].scenarios.entries()) {
        baselines.push(
          await this.createScenario(
            profile,
            value,
            index,
            doctor,
            definition,
            version,
          ),
        );
      }
      const baselineResult = await this.models.users
        .updateOne(
          {
            _id: doctor._id,
            'metadata.b12P1Fixture.baselines': { $exists: false },
          },
          {
            $set: {
              'metadata.b12P1Fixture.baselines': baselines,
            },
          },
        )
        .exec();
      if (
        baselineResult.matchedCount !== 1 ||
        baselineResult.modifiedCount !== 1
      ) {
        throw new B12P1FixtureError(
          'B12_P1_BASELINE_RECORD_FAILED',
          'Prepared baseline could not be recorded exactly once',
        );
      }
      return await this.verify(profile, password, 'prepared');
    } catch (error: unknown) {
      await this.cleanup(profile);
      throw error;
    }
  }

  async replace(
    profile: B12P1Profile,
    rawPassword: string | undefined,
  ): Promise<SafeSummary> {
    await this.cleanup(profile);
    return this.prepare(profile, rawPassword);
  }

  async verify(
    profile: B12P1Profile,
    rawPassword: string | undefined,
    phase: B12P1VerifyPhase,
  ): Promise<SafeSummary> {
    const password = requiredPassword(rawPassword);
    const definition = PROFILE_DEFINITIONS[profile];
    const users = await this.models.users
      .find({
        _id: {
          $in: definition.roles.map((role) => userIdFor(profile, role)),
        },
      })
      .select('+passwordHash')
      .sort({ accountName: 1 })
      .exec();
    if (users.length !== definition.roles.length) {
      throw new B12P1FixtureError(
        'B12_P1_USER_COUNT_INVALID',
        'Profile user count does not match the contract',
      );
    }
    for (const role of definition.roles) {
      const user = users.find(
        (candidate) =>
          candidate._id.toString() === userIdFor(profile, role).toString(),
      );
      if (
        !user ||
        user.accountName !== b12P1AccountName(profile, role) ||
        user.status !== 'active' ||
        user.userType !== role ||
        user.roles.length !== 1 ||
        user.roles[0] !== role ||
        !(await this.authService.verifyPassword(password, user.passwordHash))
      ) {
        throw new B12P1FixtureError(
          'B12_P1_USER_INVALID',
          'A Profile user does not match the authentication contract',
        );
      }
    }
    const doctor =
      users.find((candidate) => candidate.userType === 'doctor') ?? users[0];
    const fixtureMetadata = isRecord(doctor?.metadata)
      ? doctor.metadata.b12P1Fixture
      : undefined;
    const baselines =
      isRecord(fixtureMetadata) && Array.isArray(fixtureMetadata.baselines)
        ? (fixtureMetadata.baselines as ScenarioBaseline[])
        : null;
    if (!baselines || baselines.length !== definition.scenarios.length) {
      throw new B12P1FixtureError(
        'B12_P1_BASELINE_MISSING',
        'Profile baseline is missing or incomplete',
      );
    }
    for (const value of definition.scenarios) {
      const baseline = baselines.find((entry) => entry.key === value.key);
      if (!baseline) {
        throw new B12P1FixtureError(
          'B12_P1_BASELINE_MISSING',
          'Scenario baseline is missing',
        );
      }
      await this.verifyScenario(profile, value, baseline);
    }
    const userIds = definition.roles.map((role) => userIdFor(profile, role));
    const sessions = await this.models.sessions
      .find({ userId: { $in: userIds } })
      .sort({ _id: 1 })
      .exec();
    if (
      phase === 'prepared'
        ? sessions.length !== 0
        : sessions.length !== definition.roles.length ||
          sessions.some(
            (session) =>
              session.status !== 'revoked' || session.revokedAt == null,
          )
    ) {
      throw new B12P1FixtureError(
        'B12_P1_SESSION_LIFECYCLE_INVALID',
        'Profile Session lifecycle does not match the verification phase',
      );
    }
    return {
      profile,
      profileName: definition.name,
      databaseName: this.databaseName,
      phase,
      scenarioCount: definition.scenarios.length,
      userCount: users.length,
      sessionCount: sessions.length,
      residualCount: 0,
      businessMutationCount: 0,
    };
  }

  async cleanup(profile: B12P1Profile): Promise<SafeSummary> {
    const definition = PROFILE_DEFINITIONS[profile];
    const userIds = definition.roles.map((role) => userIdFor(profile, role));
    const allIds = definition.scenarios.map((value) =>
      b12P1ScenarioIds(profile, value.key),
    );
    const patientIds = allIds.map((value) => value.patientId);
    const visitIds = allIds.map((value) => value.visitId);
    const instanceIds = allIds.map((value) => value.instanceId);
    const reportIds = allIds.map((value) => value.reportId);
    await this.models.sessions.deleteMany({ userId: { $in: userIds } }).exec();
    await this.models.media
      .deleteMany({
        $or: [
          { patientId: { $in: patientIds } },
          { assessmentVisitId: { $in: visitIds } },
        ],
      })
      .exec();
    await this.models.domains
      .deleteMany({
        $or: [
          { patientId: { $in: patientIds } },
          { assessmentVisitId: { $in: visitIds } },
        ],
      })
      .exec();
    await this.models.scores
      .deleteMany({
        $or: [
          { patientId: { $in: patientIds } },
          { assessmentVisitId: { $in: visitIds } },
        ],
      })
      .exec();
    await this.models.itemResponses
      .deleteMany({
        $or: [
          { patientId: { $in: patientIds } },
          { assessmentVisitId: { $in: visitIds } },
          { scaleInstanceId: { $in: instanceIds } },
        ],
      })
      .exec();
    await this.models.reports.deleteMany({ _id: { $in: reportIds } }).exec();
    await this.models.instances
      .deleteMany({ _id: { $in: instanceIds } })
      .exec();
    await this.models.visits.deleteMany({ _id: { $in: visitIds } }).exec();
    await this.models.patients.deleteMany({ _id: { $in: patientIds } }).exec();
    await this.models.users.deleteMany({ _id: { $in: userIds } }).exec();
    const residualCount = await this.countResiduals(profile);
    if (residualCount !== 0) {
      throw new B12P1FixtureError(
        'B12_P1_CLEANUP_RESIDUAL',
        'Profile cleanup left owned resources',
      );
    }
    return {
      profile,
      profileName: definition.name,
      databaseName: this.databaseName,
      phase: 'cleanup',
      scenarioCount: definition.scenarios.length,
      userCount: 0,
      sessionCount: 0,
      residualCount,
      businessMutationCount: 0,
    };
  }

  async residual(profile: B12P1Profile): Promise<SafeSummary> {
    const residualCount = await this.countResiduals(profile);
    if (residualCount !== 0) {
      throw new B12P1FixtureError(
        'B12_P1_RESIDUAL_NONZERO',
        'Profile residual count is nonzero',
      );
    }
    return {
      profile,
      profileName: b12P1ProfileName(profile),
      databaseName: this.databaseName,
      phase: 'residual',
      scenarioCount: PROFILE_DEFINITIONS[profile].scenarios.length,
      userCount: 0,
      sessionCount: 0,
      residualCount,
      businessMutationCount: 0,
    };
  }

  private async createUsers(
    profile: B12P1Profile,
    password: string,
  ): Promise<Map<UserType, UserDocument>> {
    const result = new Map<UserType, UserDocument>();
    for (const role of PROFILE_DEFINITIONS[profile].roles) {
      const user = await this.models.users.create({
        _id: userIdFor(profile, role),
        accountName: b12P1AccountName(profile, role),
        displayName: `B12 P1 synthetic ${role.replaceAll('_', ' ')}`,
        staffCode: `B12P1-${profile.toUpperCase()}-${role
          .replaceAll('_', '')
          .slice(0, 8)
          .toUpperCase()}`,
        passwordHash: await this.authService.hashPassword(password),
        passwordChangedAt: BASE_DATE,
        roles: [role],
        permissions: [],
        userType: role,
        status: 'active',
        failedLoginCount: 0,
        lockedUntil: null,
        metadata: {
          b12P1Fixture: {
            version: 1,
            profile,
            profileName: b12P1ProfileName(profile),
            role,
          },
        },
      });
      result.set(role, user);
    }
    return result;
  }

  private async createScenario(
    profile: B12P1Profile,
    value: Scenario,
    index: number,
    actor: UserDocument,
    definition: ScaleDefinitionDocument,
    version: ScaleVersionDocument,
  ): Promise<ScenarioBaseline> {
    const ids = b12P1ScenarioIds(profile, value.key);
    const at = timestampFor(profile, index);
    const submittedAt = timestampFor(profile, index, 60_000);
    const confirmedAt = timestampFor(profile, index, 120_000);
    const lockedAt = timestampFor(profile, index, 180_000);
    const auditLockedAt =
      value.lockShape === 'mismatched_audit'
        ? timestampFor(profile, index, 181_000)
        : lockedAt;
    const hasTopLockedAt = [
      'valid',
      'locked_at_without_audit',
      'mismatched_audit',
    ].includes(value.lockShape);
    const hasTopLockedBy = ['valid', 'mismatched_audit'].includes(
      value.lockShape,
    );
    const hasLockAudit = [
      'valid',
      'audit_without_locked_at',
      'mismatched_audit',
    ].includes(value.lockShape);
    const lifecycle = lifecycleFor(value);
    const metadata: Record<string, unknown> = {
      b12P1Fixture: marker(profile, value.key),
      a20Generation: {
        version: 1,
        generationId: `b12-p1-${profile}-${value.key}`,
        generatedAt: at,
        generatedBy: actor._id.toString(),
        generatedByName: actor.displayName,
        generatedByRole: 'doctor',
        engineVersion: 'a20-rules-v1',
        reportScope: 'selected_scale_instances',
        primaryScaleInstanceIds: [ids.instanceId.toString()],
        scoreResultIds: [ids.scoreSnapshotId.toString()],
        cognitiveDomainResultIds: [ids.domainSnapshotId.toString()],
        mediaEvidenceCount: 0,
        aiUsed: false,
      },
    };
    if (lifecycle.submitted) {
      metadata.a21Submission = {
        version: 1,
        submissionId: `b12-p1-submission-${profile}-${index}`,
        submittedAt,
        submittedBy: actor._id.toString(),
        submittedByName: actor.displayName,
        submittedByRole: 'doctor',
        submissionNote: 'B12 P1 synthetic submission without clinical meaning.',
      };
    }
    if (lifecycle.confirmed) {
      metadata.a21Confirmation = {
        version: 1,
        confirmationId: `b12-p1-confirmation-${profile}-${index}`,
        confirmedAt,
        confirmedBy: actor._id.toString(),
        confirmedByName: actor.displayName,
        confirmedByRole: 'doctor',
        confirmationNote:
          'B12 P1 synthetic confirmation without clinical meaning.',
      };
    }
    if (hasLockAudit) {
      const lockIdHash = createHash('sha256')
        .update(`b12-p1-lock:${profile}:${value.key}`)
        .digest('hex');
      metadata.a22Lock = {
        version: 1,
        lockId: `${lockIdHash.slice(0, 8)}-${lockIdHash.slice(
          8,
          12,
        )}-4${lockIdHash.slice(13, 16)}-8${lockIdHash.slice(
          17,
          20,
        )}-${lockIdHash.slice(20, 32)}`,
        lockedAt: auditLockedAt,
        lockedBy: actor._id.toString(),
        lockedByName: actor.displayName,
        lockedByRole: 'doctor',
        lockNote: 'B12 P1 synthetic lock without clinical meaning.',
      };
    }
    const report = await this.models.reports.create({
      _id: ids.reportId,
      patientId: ids.patientId,
      assessmentVisitId: ids.visitId,
      primaryScaleInstanceIds: [ids.instanceId],
      scoreResultIds: [ids.scoreSnapshotId],
      cognitiveDomainResultIds: [ids.domainSnapshotId],
      mediaEvidenceIds: [],
      subjectCode: `SUBJ-B12P1-${profile.toUpperCase()}-${index + 1}`,
      reportCode: `RPT-${createHash('sha256')
        .update(`b12-p1-report:${profile}:${value.key}`)
        .digest('hex')
        .slice(0, 24)
        .toUpperCase()}`,
      reportType: 'cognitive_assessment',
      status: value.status,
      reportVersion: 1,
      source: value.source,
      patientSnapshot: {
        subjectCode: `SUBJ-B12P1-${profile.toUpperCase()}-${index + 1}`,
        displayName: 'B12 P1 synthetic subject',
        sex: 'unknown',
        birthDate: null,
        educationYears: null,
      },
      visitSnapshot: {
        visitCode: `VISIT-B12P1-${profile.toUpperCase()}-${index + 1}`,
        visitType: 'follow_up',
        assessmentDate: at,
        operatorName: actor.displayName,
        operatorRole: 'doctor',
        clinicalContext: null,
      },
      scaleTraces: [
        {
          scaleInstanceId: ids.instanceId,
          scaleCode: 'mmse',
          scaleVersion: version.version,
          crfVersion: version.crfVersion,
          scoringRuleVersion: version.scoringRuleVersion,
          fieldEncodingVersion: version.fieldEncodingVersion,
          domainMappingVersion: 'a19-domain-mapping-v1',
          sourceDocument: 'B12 P1 synthetic source without item content.',
        },
      ],
      scoreSnapshots: [
        {
          scoreResultId: ids.scoreSnapshotId,
          scaleCode: 'mmse',
          scaleName: 'B12 P1 synthetic scale',
          scaleVersion: version.version,
          totalScoreValue: 1,
          totalMaxScore: 1,
          totalMinScore: 0,
          scorePercent: 100,
          scoreStatus: 'confirmed',
          qualityStatus: value.quality,
          summary: 'B12 P1 synthetic score without clinical meaning.',
          scoreDetails: null,
        },
      ],
      domainSnapshots: [
        {
          cognitiveDomainResultId: ids.domainSnapshotId,
          scaleCode: 'mmse',
          domainCode: 'b12_p1_synthetic',
          domainTitle: 'B12 P1 synthetic domain',
          scoreValue: 1,
          maxScore: 1,
          scorePercent: 100,
          weightedScore: 1,
          weightedMaxScore: 1,
          itemCount: 1,
          needsReviewItemCount: value.quality === 'passed' ? 0 : 1,
          summary: 'B12 P1 synthetic domain without clinical meaning.',
        },
      ],
      evidenceSnapshots: [],
      narrative: {
        chiefSummary: 'B12 P1 synthetic summary without clinical meaning.',
        scoreSummary: 'B12 P1 synthetic score without clinical meaning.',
        domainSummary: 'B12 P1 synthetic domain without clinical meaning.',
        evidenceSummary: 'B12 P1 synthetic evidence without clinical meaning.',
        limitations: 'B12 P1 synthetic limitation without clinical meaning.',
        doctorOpinion:
          value.source === 'mixed'
            ? 'B12 P1 synthetic opinion without clinical meaning.'
            : undefined,
        recommendationText:
          value.source === 'mixed'
            ? 'B12 P1 synthetic recommendation without clinical meaning.'
            : undefined,
      },
      aiDraft: { status: 'not_requested', doctorEdited: false },
      confirmation: lifecycle.confirmed
        ? {
            confirmedAt,
            confirmedBy: actor._id,
            confirmedByName: actor.displayName,
            confirmedByRole: 'doctor',
            confirmationNote:
              'B12 P1 synthetic confirmation without clinical meaning.',
          }
        : null,
      lockedAt: hasTopLockedAt ? lockedAt : null,
      lockedBy: hasTopLockedBy ? actor._id : null,
      archivedAt: null,
      archivedBy: null,
      correctionRecords: [],
      voidedAt: null,
      voidedBy: null,
      auditLogRefs: [],
      qualityStatus: value.quality,
      qualityHints: null,
      operatorNote: 'B12 P1 synthetic fixture.',
      metadata,
    });
    const instance = await this.models.instances.create({
      _id: ids.instanceId,
      assessmentVisitId: ids.visitId,
      patientId: ids.patientId,
      subjectCode: report.subjectCode,
      scaleDefinitionId: definition._id,
      scaleVersionId: version._id,
      scaleCode: 'mmse',
      scaleVersion: version.version,
      instanceCode: `INST-B12P1-${profile.toUpperCase()}-${index + 1}`,
      instanceNo: 1,
      status: 'completed',
      administrationMode: 'clinician_administered',
      versionTrace: {
        crfVersion: version.crfVersion,
        scoringRuleVersion: version.scoringRuleVersion,
        fieldEncodingVersion: version.fieldEncodingVersion,
        sourceDocument: 'B12 P1 synthetic source without item content.',
      },
      startedAt: timestampFor(profile, index, 10_000),
      completedAt: timestampFor(profile, index, 20_000),
      lockedAt: null,
      voidedAt: null,
      durationMs: null,
      operatorSnapshot: {
        operatorId: actor._id,
        operatorName: actor.displayName,
        operatorRole: 'doctor',
      },
      progress: null,
      qualityControlSummary: null,
      notes: 'B12 P1 synthetic execution root.',
      metadata: { b12P1Fixture: marker(profile, value.key) },
    });
    const visit = await this.models.visits.create({
      _id: ids.visitId,
      patientId: ids.patientId,
      subjectCode: report.subjectCode,
      visitCode: `VISIT-B12P1-${profile.toUpperCase()}-${index + 1}`,
      visitType: 'follow_up',
      status: value.visitStatus,
      assessmentDate: at,
      startedAt: timestampFor(profile, index, 10_000),
      completedAt: timestampFor(profile, index, 20_000),
      lockedAt:
        value.visitStatus === 'locked'
          ? timestampFor(profile, index, 30_000)
          : null,
      voidedAt:
        value.visitStatus === 'voided'
          ? timestampFor(profile, index, 30_000)
          : null,
      operatorSnapshot: {
        operatorId: actor._id,
        operatorName: actor.displayName,
        operatorRole: 'doctor',
      },
      clinicalContext: null,
      notes: 'B12 P1 synthetic visit root.',
      metadata: { b12P1Fixture: marker(profile, value.key) },
    });
    const patient = await this.models.patients.create({
      _id: ids.patientId,
      subjectCode: report.subjectCode,
      displayName: `B12 P1 synthetic subject ${index + 1}`,
      sourceType: 'research',
      sex: 'unknown',
      birthDate: null,
      educationYears: null,
      handedness: 'unknown',
      status: 'active',
      tags: ['b12', 'p1', profile, 'synthetic', 'deidentified'],
      notes: 'B12 P1 synthetic subject without clinical meaning.',
      externalRefs: null,
      metadata: { b12P1Fixture: marker(profile, value.key) },
    });
    return {
      key: value.key,
      reportHash: stableHash(report.toObject()),
      reportUpdatedAt: exactDate(report.get('updatedAt'), 'report.updatedAt'),
      patientHash: stableHash(patient.toObject()),
      patientUpdatedAt: exactDate(
        patient.get('updatedAt'),
        'patient.updatedAt',
      ),
      visitHash: stableHash(visit.toObject()),
      visitUpdatedAt: exactDate(visit.get('updatedAt'), 'visit.updatedAt'),
      instanceHash: stableHash(instance.toObject()),
      instanceUpdatedAt: exactDate(
        instance.get('updatedAt'),
        'instance.updatedAt',
      ),
    };
  }

  private async verifyScenario(
    profile: B12P1Profile,
    value: Scenario,
    baseline: ScenarioBaseline,
  ): Promise<void> {
    const ids = b12P1ScenarioIds(profile, value.key);
    const [report, patient, visit, instance] = await Promise.all([
      this.models.reports.findById(ids.reportId).exec(),
      this.models.patients.findById(ids.patientId).exec(),
      this.models.visits.findById(ids.visitId).exec(),
      this.models.instances.findById(ids.instanceId).exec(),
    ]);
    if (!report || !patient || !visit || !instance) {
      throw new B12P1FixtureError(
        'B12_P1_ROOT_MISSING',
        'A Profile-owned business root is missing',
      );
    }
    const comparisons = [
      [stableHash(report.toObject()), baseline.reportHash],
      [
        exactDate(report.get('updatedAt'), 'report.updatedAt'),
        baseline.reportUpdatedAt,
      ],
      [stableHash(patient.toObject()), baseline.patientHash],
      [
        exactDate(patient.get('updatedAt'), 'patient.updatedAt'),
        baseline.patientUpdatedAt,
      ],
      [stableHash(visit.toObject()), baseline.visitHash],
      [
        exactDate(visit.get('updatedAt'), 'visit.updatedAt'),
        baseline.visitUpdatedAt,
      ],
      [stableHash(instance.toObject()), baseline.instanceHash],
      [
        exactDate(instance.get('updatedAt'), 'instance.updatedAt'),
        baseline.instanceUpdatedAt,
      ],
    ];
    if (comparisons.some(([actual, expected]) => actual !== expected)) {
      throw new B12P1FixtureError(
        'B12_P1_BUSINESS_DATA_CHANGED',
        'Profile-owned business data changed after preparation',
      );
    }
    const relatedFilter = [
      { patientId: ids.patientId },
      { assessmentVisitId: ids.visitId },
    ];
    const [items, scores, domains, media] = await Promise.all([
      this.models.itemResponses.countDocuments({
        $or: [
          { patientId: ids.patientId },
          { assessmentVisitId: ids.visitId },
          { scaleInstanceId: ids.instanceId },
        ],
      }),
      this.models.scores.countDocuments({ $or: relatedFilter }),
      this.models.domains.countDocuments({ $or: relatedFilter }),
      this.models.media.countDocuments({ $or: relatedFilter }),
    ]);
    if (items + scores + domains + media !== 0) {
      throw new B12P1FixtureError(
        'B12_P1_PROTECTED_ROOTS_CHANGED',
        'Unexpected protected business roots were created',
      );
    }
  }

  private async countResiduals(profile: B12P1Profile): Promise<number> {
    const definition = PROFILE_DEFINITIONS[profile];
    const userIds = definition.roles.map((role) => userIdFor(profile, role));
    const allIds = definition.scenarios.map((value) =>
      b12P1ScenarioIds(profile, value.key),
    );
    const patientIds = allIds.map((value) => value.patientId);
    const visitIds = allIds.map((value) => value.visitId);
    const instanceIds = allIds.map((value) => value.instanceId);
    const reportIds = allIds.map((value) => value.reportId);
    const ownership = [
      { patientId: { $in: patientIds } },
      { assessmentVisitId: { $in: visitIds } },
    ];
    const counts = await Promise.all([
      this.models.users.countDocuments({
        $or: [
          { _id: { $in: userIds } },
          { 'metadata.b12P1Fixture.profile': profile },
        ],
      }),
      this.models.sessions.countDocuments({ userId: { $in: userIds } }),
      this.models.patients.countDocuments({
        $or: [
          { _id: { $in: patientIds } },
          { 'metadata.b12P1Fixture.profile': profile },
        ],
      }),
      this.models.visits.countDocuments({
        $or: [
          { _id: { $in: visitIds } },
          { 'metadata.b12P1Fixture.profile': profile },
        ],
      }),
      this.models.instances.countDocuments({
        $or: [
          { _id: { $in: instanceIds } },
          { 'metadata.b12P1Fixture.profile': profile },
        ],
      }),
      this.models.reports.countDocuments({
        $or: [
          { _id: { $in: reportIds } },
          { 'metadata.b12P1Fixture.profile': profile },
        ],
      }),
      this.models.itemResponses.countDocuments({
        $or: [
          { patientId: { $in: patientIds } },
          { assessmentVisitId: { $in: visitIds } },
          { scaleInstanceId: { $in: instanceIds } },
        ],
      }),
      this.models.scores.countDocuments({ $or: ownership }),
      this.models.domains.countDocuments({ $or: ownership }),
      this.models.media.countDocuments({ $or: ownership }),
    ]);
    return counts.reduce((total, count) => total + count, 0);
  }
}

export function createB12P1BrowserFixtureManager(
  app: INestApplicationContext,
): B12P1BrowserFixtureManager {
  const connection = app.get<Connection>(getConnectionToken());
  return new B12P1BrowserFixtureManager(
    connection.name,
    {
      users: app.get(getModelToken(User.name)),
      sessions: app.get(getModelToken(Session.name)),
      patients: app.get(getModelToken(Patient.name)),
      visits: app.get(getModelToken(AssessmentVisit.name)),
      instances: app.get(getModelToken(ScaleInstance.name)),
      itemResponses: app.get(getModelToken(ItemResponse.name)),
      reports: app.get(getModelToken(ClinicalReport.name)),
      scores: app.get(getModelToken(ScoreResult.name)),
      domains: app.get(getModelToken(CognitiveDomainResult.name)),
      media: app.get(getModelToken(MediaEvidence.name)),
      scaleDefinitions: app.get(getModelToken(ScaleDefinition.name)),
      scaleVersions: app.get(getModelToken(ScaleVersion.name)),
    },
    app.get(AuthService),
    app.get(ScaleCatalogService),
  );
}

type CliCommand =
  | 'prepare'
  | 'verify-prepared'
  | 'verify-post'
  | 'replace'
  | 'cleanup'
  | 'residual';

function parseCommand(argv: string[]): {
  command: CliCommand;
  profile: B12P1Profile;
} {
  const command = argv[0] as CliCommand | undefined;
  if (
    !command ||
    ![
      'prepare',
      'verify-prepared',
      'verify-post',
      'replace',
      'cleanup',
      'residual',
    ].includes(command)
  ) {
    throw new B12P1FixtureError(
      'B12_P1_COMMAND_INVALID',
      'Command is not supported',
    );
  }
  let rawProfile: string | undefined;
  let confirmCleanup = false;
  let confirmReplace = false;
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--profile' && !rawProfile) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new B12P1FixtureError(
          'B12_P1_PROFILE_REQUIRED',
          '--profile requires one safe Profile letter',
        );
      }
      rawProfile = value;
      index += 1;
      continue;
    }
    if (argument === '--confirm-cleanup-b12-p1-profile') {
      confirmCleanup = true;
      continue;
    }
    if (argument === '--confirm-replace-b12-p1-profile') {
      confirmReplace = true;
      continue;
    }
    throw new B12P1FixtureError(
      'B12_P1_ARGUMENT_INVALID',
      'Unknown or duplicate argument',
    );
  }
  if (!rawProfile) {
    throw new B12P1FixtureError(
      'B12_P1_PROFILE_REQUIRED',
      'Every command requires --profile',
    );
  }
  if (
    (command === 'cleanup' && !confirmCleanup) ||
    (command !== 'cleanup' && confirmCleanup)
  ) {
    throw new B12P1FixtureError(
      'B12_P1_CLEANUP_CONFIRMATION_INVALID',
      'Cleanup requires its exact confirmation flag',
    );
  }
  if (
    (command === 'replace' && !confirmReplace) ||
    (command !== 'replace' && confirmReplace)
  ) {
    throw new B12P1FixtureError(
      'B12_P1_REPLACE_CONFIRMATION_INVALID',
      'Replace requires its exact confirmation flag',
    );
  }
  return { command, profile: validateB12P1Profile(rawProfile) };
}

async function runCli(): Promise<void> {
  let app: INestApplicationContext | undefined;
  try {
    const parsed = parseCommand(process.argv.slice(2));
    assertBrowserAcceptancePreImportEnvironment({
      nodeEnv: process.env.NODE_ENV,
      purpose: process.env.COGMEMORY_DATABASE_PURPOSE,
      mongoUri: process.env.MONGO_URI,
    });
    const { NestFactory } = await import('@nestjs/core');
    // Application modules are loaded only after the process and database gates.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as {
      AppModule: Type<unknown>;
    };
    app = await NestFactory.createApplicationContext(AppModule, {
      abortOnError: false,
      logger: false,
    });
    const connection = app.get<Connection>(getConnectionToken());
    await assertBrowserFixtureDatabaseAccess(connection);
    const manager = createB12P1BrowserFixtureManager(app);
    const password = process.env.B12_FIXTURE_PASSWORD;
    const result =
      parsed.command === 'prepare'
        ? await manager.prepare(parsed.profile, password)
        : parsed.command === 'replace'
          ? await manager.replace(parsed.profile, password)
          : parsed.command === 'verify-prepared'
            ? await manager.verify(parsed.profile, password, 'prepared')
            : parsed.command === 'verify-post'
              ? await manager.verify(parsed.profile, password, 'post-browser')
              : parsed.command === 'cleanup'
                ? await manager.cleanup(parsed.profile)
                : await manager.residual(parsed.profile);
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
  } catch (error: unknown) {
    const safe =
      error instanceof B12P1FixtureError
        ? { code: error.code, message: error.message }
        : {
            code: 'B12_P1_FIXTURE_FAILED',
            message: 'B12 P1 fixture command failed',
          };
    process.stderr.write(`${JSON.stringify({ ok: false, ...safe })}\n`);
    process.exitCode = 1;
  } finally {
    await app?.close();
  }
}

if (require.main === module) {
  void runCli();
}
