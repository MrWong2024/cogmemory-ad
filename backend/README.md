# CogMemory AD Backend / 智忆评后端

This directory contains the NestJS backend public foundation for CogMemory AD /
智忆评.

## Current Scope

- `backend\src` has been initialized with the NestJS startup entry, root module,
  global application setup, health controller, configuration loading,
  environment validation, MongoDB connection foundation, global validation pipe,
  global exception filter, and public storage module.
- `GET /health` is the only public HTTP endpoint.
- `GET /health` returns `{ status: 'ok', service: 'cogmemory-ad-backend' }`.
- `ConfigModule` loads `.env.${NODE_ENV}` and `.env`.
- `MongooseModule` reads `mongo.uri`, `mongo.autoIndex`, and
  `mongo.serverSelectionTimeoutMs` from the centralized config.
- `StorageModule` provides the `STORAGE_SERVICE` token with fake and Alibaba
  Cloud OSS driver structure. This is only a low-level storage adapter.
- No business upload controller or business upload endpoint is implemented.
- No authentication, user management, doctor, patient, scale, assessment,
  report, SMS, or LLM business service is implemented.
- No business module, DTO, schema, or API has been added.

## Defaults

- Local backend port: `5002`.
- Local frontend origin: `http://localhost:3002`.
- Session cookie name: `cogmemory_ad_session`.
- Development MongoDB naming uses `cogmemory_ad_dev`.
- Test MongoDB naming uses `cogmemory_ad_test`.
- Storage object prefix defaults to `cogmemory_ad`.
- Development and test default to `STORAGE_DRIVER=fake`; production defaults to
  `STORAGE_DRIVER=oss`.
- OSS, SMS, and LLM values are placeholders or examples only. No real bucket,
  AccessKey, SMS credential, SMS template, or LLM API key is stored here.

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

Dependencies were not installed by this task. Build and unit tests require
`backend\node_modules` to exist.
