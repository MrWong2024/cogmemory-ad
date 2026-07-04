# CogMemory AD Backend / 智忆评后端

This directory currently contains only the backend root-level public skeleton for
CogMemory AD / 智忆评: package metadata, environment examples, and engineering
configuration for NestJS, TypeScript, ESLint, Prettier, Jest, Mongoose, and OSS
placeholder settings.

The backend code directories have not been initialized in this task:

- `backend\src`
- `backend\test`
- `backend\scripts`

## Current Scope

- Local default backend port: `3002`.
- Local frontend origin examples use `http://localhost:3000`.
- Business modules, Controllers, Services, DTOs, Schemas, real APIs, database
  connection implementation, OSS Service, authentication, scales, assessments,
  and reports are not implemented.
- OSS bucket values in `.env.*.example` are placeholders or examples. A real
  CogMemory AD bucket must be created and substituted in a later task.
- Dependencies have not been installed by this task. Commands below require
  dependencies to be installed before execution.

## Package Scripts

Current `package.json` scripts are:

- `npm run build`
- `npm run format`
- `npm run start`
- `npm run start:dev`
- `npm run start:debug`
- `npm run start:prod`
- `npm run lint`
- `npm run lint:fix`
- `npm run lint:file`
- `npm run lint:file:fix`
- `npm test`
- `npm run test:watch`
- `npm run test:cov`
- `npm run test:debug`
- `npm run test:e2e`

Because `src`, `test`, and `scripts` are not initialized yet, build, lint, unit
test, and E2E execution must be evaluated again after those directories and
dependencies are in place.
