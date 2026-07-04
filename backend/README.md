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

- Local default backend port: `5002`.
- Local default frontend port: `3002`.
- Local `FRONTEND_URL` and `CORS_ORIGIN` examples use `http://localhost:3002`.
- Development and test default to `STORAGE_DRIVER=fake`; fake mode does not
  explicitly configure `OSS_BUCKET` or `OSS_OBJECT_PREFIX`.
- Production uses `STORAGE_DRIVER=oss`; `OSS_BUCKET` is a CogMemory AD
  placeholder and must be replaced after a real CogMemory AD bucket is created.
- SMS variables are Alibaba Cloud SMS example / pending-confirmation
  placeholders only; they do not mean SMS service has been implemented.
- Business modules, Controllers, Services, DTOs, Schemas, real APIs, database
  connection implementation, OSS Service, authentication, scales, assessments,
  and reports are not implemented.
- OSS, SMS, and LLM values in `.env.*.example` are placeholder configuration
  only; they do not mean OSS, SMS, or LLM services have been implemented.
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
