import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/mongoose';
import { NestFactory } from '@nestjs/core';
import { spawnSync } from 'child_process';
import type { Connection } from 'mongoose';
import { AppModule } from '../src/app.module';
import { TEST_DATABASE_NAMES } from '../src/config/database-purpose';

jest.setTimeout(30000);

const FIXTURE_SCRIPTS = [
  'scripts/b123-browser-fixtures.ts',
  'scripts/b16-browser-fixtures.ts',
  'scripts/b456-browser-fixtures.ts',
  'scripts/wp04-browser-fixtures.ts',
] as const;

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

  it('makes all Browser fixture CLIs reject the normal test database before AppModule import', () => {
    for (const script of FIXTURE_SCRIPTS) {
      const result = spawnSync(
        process.execPath,
        [
          '-r',
          'ts-node/register',
          '-r',
          'tsconfig-paths/register',
          script,
          'prepare',
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
            B123_FIXTURE_PASSWORD: 'database-gate-placeholder',
            B16_FIXTURE_PASSWORD: 'database-gate-placeholder',
            B456_FIXTURE_PASSWORD: 'database-gate-placeholder',
            WP04_FIXTURE_PASSWORD: 'database-gate-placeholder',
          },
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain(
        'DATABASE_DECLARED_NAME_MISMATCH',
      );
    }
  });
});
