import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/mongoose';
import { NestFactory } from '@nestjs/core';
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import type { Connection } from 'mongoose';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { TEST_DATABASE_NAMES } from '../src/config/database-purpose';

jest.setTimeout(30000);

describe('database purpose gates (e2e)', () => {
  let app: INestApplicationContext;

  beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('E2E requires NODE_ENV=test');
    }
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('connects a normal E2E process only to the standard_test database', () => {
    const config = app.get(ConfigService);
    const connection = app.get<Connection>(getConnectionToken());

    expect(config.get<string>('mongo.purpose')).toBe('standard_test');
    expect(connection.name).toBe(TEST_DATABASE_NAMES.standard_test);
  });

  it('rejects an injected Browser URI before a normal E2E connection starts', () => {
    const source = [
      "require('reflect-metadata')",
      "const { NestFactory } = require('@nestjs/core')",
      '(async () => {',
      '  try {',
      "    const { AppModule } = require('./src/app.module')",
      '    const app = await NestFactory.createApplicationContext(AppModule, { abortOnError: false, logger: false })',
      '    await app.close()',
      '    process.exit(0)',
      '  } catch (error) {',
      "    console.log(error.code ?? 'UNKNOWN')",
      '    process.exit(17)',
      '  }',
      '})()',
    ].join(';');
    const result = spawnSync(
      process.execPath,
      ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register', '-e', source],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: 'test',
          COGMEMORY_DATABASE_PURPOSE: 'standard_test',
          MONGO_URI:
            'mongodb://unused:unused@127.0.0.1:27017/cogmemory_ad_browser_test?authSource=cogmemory_ad_browser_test',
          MONGO_ADMIN_URI:
            'mongodb://unused:unused@127.0.0.1:27017/cogmemory_ad_test?authSource=cogmemory_ad_test',
          MONGO_AUTO_INDEX: 'false',
        },
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(17);
    expect(`${result.stdout}${result.stderr}`).toContain(
      'DATABASE_DECLARED_NAME_MISMATCH',
    );
  });

  it('makes representative current Browser fixture CLIs reject the normal test database before AppModule import', () => {
    const wp10F1RuntimePath = join(
      process.cwd(),
      'test-results',
      `database-purpose-gate-wp10-f1-${process.pid}.json`,
    );
    expect(existsSync(wp10F1RuntimePath)).toBe(false);

    const fixtureProbes = [
      {
        script: 'scripts/b10-browser-fixtures.ts',
        args: ['prepare', '--profile', 'public-surface-security'],
        env: {
          B10_FIXTURE_PASSWORD: 'database-gate-placeholder',
        },
      },
      {
        script: 'scripts/wp10-f1-browser-fixtures.ts',
        args: ['prepare'],
        env: {
          WP10_F1_PROFILE: 'F1-P1-same-device',
          WP10_F1_NAMESPACE: 'wp10-f1-gate',
          WP10_F1_RUNTIME_PATH: wp10F1RuntimePath,
          WP10_F1_FIXTURE_PASSWORD: 'database-gate-placeholder',
        },
      },
    ] as const;

    for (const probe of fixtureProbes) {
      const result = spawnSync(
        process.execPath,
        [
          '-r',
          'ts-node/register',
          '-r',
          'tsconfig-paths/register',
          probe.script,
          ...probe.args,
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            NODE_ENV: 'test',
            COGMEMORY_DATABASE_PURPOSE: 'browser_acceptance',
            MONGO_URI:
              'mongodb://unused:unused@127.0.0.1:27017/cogmemory_ad_test?authSource=cogmemory_ad_test',
            MONGO_ADMIN_URI:
              'mongodb://unused:unused@127.0.0.1:27017/cogmemory_ad_test?authSource=cogmemory_ad_test',
            ...probe.env,
          },
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain(
        'DATABASE_DECLARED_NAME_MISMATCH',
      );
    }

    expect(existsSync(wp10F1RuntimePath)).toBe(false);
  });
});
