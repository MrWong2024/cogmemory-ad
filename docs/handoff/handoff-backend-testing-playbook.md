# CogMemory AD / 智忆评 后端验证手册

## 1. 文档定位

本文档用于记录 CogMemory AD 后端验证命令、测试分层口径、医疗与量表数据测试红线，供后续开发和交接使用。

## 2. 当前状态

- `backend\src` 公共底座已初始化。
- 当前存在 health controller spec、Storage service spec、上传文件名工具 spec、scales service / schema spec、patients service / schema spec、assessments service / schema spec、media service / schema spec、scoring service / schema spec、cognitive-domains service / schema spec 和 reports service / schema spec。
- 后端默认端口为 `5002`。
- 本地前端默认 origin 为 `http://localhost:3002`。
- 测试环境默认 `STORAGE_DRIVER=fake`。
- 测试环境 `LLM_PROVIDER=stub`，不得依赖真实大模型调用。
- 当前没有 E2E 用例。
- TypeScript `rootDir` 当前为 `.`，后端主入口预期 build 产物为 `dist/src/main.js`。
- `tsBuildInfoFile` 保持 `./dist/tsconfig.build.tsbuildinfo`。
- `dist` 与 `*.tsbuildinfo` 为生成物，不进入版本库。

## 3. 当前 package.json 脚本

- `build`
- `format`
- `start`
- `start:dev`
- `start:debug`
- `start:prod`
- `lint`
- `lint:fix`
- `lint:file`
- `lint:file:fix`
- `test`
- `test:watch`
- `test:cov`
- `test:debug`
- `test:e2e`

## 4. 当前可执行性说明

- 当前已验证命令：
  - `npm install`
  - `npm run build`
  - `npm test -- --runInBand`
  - `npm run start:prod`
- 本次后端 A1 已验证命令：
  - `npm run lint:file -- src/modules/scales src/app.module.ts`
  - `npm run build`
  - `npm test -- --runInBand`
- 本次后端 A2 已验证命令：
  - `npm run lint:file -- src/modules/patients src/modules/assessments src/app.module.ts`
  - `npm run build`
  - `npm test -- --runInBand`
- 本次后端 A3 已验证命令：
  - `npm run lint:file -- src/modules/assessments`
  - `npm run build`
  - `npm test -- --runInBand`
- 本次后端 A4 已验证命令：
  - `npm run lint:file -- src/modules/media src/app.module.ts`
  - `npm run build`
  - `npm test -- --runInBand`
- 本次后端 A5 已验证命令：
  - `npm run lint:file -- src/modules/scoring src/app.module.ts`
  - `npm run build`
  - `npm test -- --runInBand`
- 本次后端 A6 已验证命令：
  - `npm run lint:file -- src/modules/cognitive-domains src/app.module.ts`
  - `npm run build`
  - `npm test -- --runInBand`
- 本次后端 A7 已验证命令：
  - `npm run lint:file -- src/modules/reports src/app.module.ts`
  - `npm run build`
  - `npm test -- --runInBand`
- 当前路径对齐验证命令：
  - `npm run build`
  - 检查 `dist/src/main.js` 存在
  - `npm run start:prod`
- 当前验证结果：
  - `npm install` 成功。
  - `npm run build` 成功。
  - build 后 `dist/src/main.js` 已确认存在。
  - `npm test -- --runInBand` 成功。
  - 当前单元测试为 10 个测试套件通过。
  - 当前单元测试为 93 个测试通过。
  - 用户已补充验证 `npm run start:prod` 本地启动成功。
  - `dist/src/main.js` 与 `start:prod` 指向的 `./dist/src/main.js` 路径匹配。
- 当前未验证命令：
  - `npm run lint`
  - `npm run test:e2e`
- 如果 `backend\node_modules` 存在，可执行 `npm run build` 验证 TypeScript 编译。
- 当前 `start:prod` 验证仅为本地基础启动验证，不代表真实生产环境部署完成。
- 如果 `backend\node_modules` 存在，可执行 `npm test -- --runInBand` 验证单元测试。
- 如果 `backend\node_modules` 不存在，不应自动执行 `npm install`。
- 当前任务不调用真实 OSS、阿里云 SMS、大模型或生产数据库。
- `test:e2e` 脚本存在，但当前没有 E2E 用例，且本次未执行 E2E；后续新增真实 HTTP 闭环后再同步。

## 5. 当前单元测试口径

- `backend\src\app.controller.spec.ts`：验证 `GET /health` 的 controller 返回结构。
- `backend\src\modules\storage\storage.service.spec.ts`：验证 fake storage 不依赖 OSS 配置，并验证 OSS driver 缺少配置时抛出明确异常。
- `backend\src\common\utils\uploaded-filename.util.spec.ts`：验证上传文件名的编码修复、空值 fallback 与路径字符清理。
- `backend\src\modules\scales\services\scales.service.spec.ts`：验证 `ScaleDefinition` / `ScaleVersion` schema 的 collection、索引、枚举 / ObjectId / Date / Mixed 显式类型，验证 `ScalesService` 的 code 规范化、查无返回 `null`、mapper 输出和 active definition 列表读取；不连接真实 MongoDB。
- `backend\src\modules\patients\services\patients.service.spec.ts`：验证 `Patient` schema 的 collection、索引、枚举 / Date / Number / Mixed 显式类型，验证 `PatientsService` 的 `subjectCode` 规范化、查无返回 `null`、mapper 输出和 active patient 列表读取；不连接真实 MongoDB，测试数据为 `SUBJ-TEST-*` 等脱敏人工样例。
- `backend\src\modules\assessments\services\assessments.service.spec.ts`：验证 `AssessmentVisit` / `ScaleInstance` / `ItemResponse` schema 的 collection、索引、枚举 / ObjectId / Date / Number / Boolean / Mixed 显式类型，验证 `ItemResponse` 内嵌子文档 `_id: false`，验证 `AssessmentsService` 的 `visitCode` / `instanceCode` / `itemCode` 规范化、访视 / 量表实例 / 题目作答查无返回 `null`、mapper 输出、按量表实例读取、按已计分条件读取和按访视读取；不连接真实 MongoDB，测试数据为 `SUBJ-TEST-*`、`VISIT-TEST-*`、`INST-TEST-*`、`moca.memory.immediate.trial_1.face`、`mmse.attention.serial_sevens.step_1` 等脱敏人工样例。
- `backend\src\modules\media\services\media-evidence.service.spec.ts`：验证 `MediaEvidence` schema 的 collection、索引、枚举 / ObjectId / Date / Number / Boolean / Mixed 显式类型，验证媒体证据内嵌子文档 `_id: false`，验证 `MediaEvidenceService` 的 `evidenceCode` 规范化、查无返回 `null`、mapper 输出、按题目作答 / 量表实例 / 访视 / 患者读取和 attached / locked 过滤读取；不连接真实 MongoDB，不调用 Storage / OSS，测试数据为 `SUBJ-TEST-*`、`VISIT-TEST-*`、`INST-TEST-*`、`EVD-TEST-*`、`moca.visuospatial.trail_making`、`moca.visuospatial.clock`、`mmse.language.drawing` 等脱敏人工样例。
- `backend\src\modules\scoring\services\scoring.service.spec.ts`：验证 `ScoreResult` schema 的 collection、索引、枚举 / ObjectId / Date / Number / Boolean / Mixed 显式类型，验证计分结果内嵌子文档 `_id: false`，验证 `ScoringService` 的 `scoreResultCode` 规范化、查无返回 `null`、mapper 输出、按量表实例最新读取、按量表实例 / 访视 / 患者读取，以及 `summarizeItemScores()` 对计入 / 不计入总分、缺失、未评分、需复核、非有限数字、逐步计分和 group score 汇总的处理；不连接真实 MongoDB，不调用 Storage / OSS / SMS / LLM，测试数据为 `SUBJ-TEST-*`、`VISIT-TEST-*`、`INST-TEST-*`、`SCR-TEST-*`、`moca.memory.immediate.trial_1.face`、`moca.recall.delayed.free.face`、`mmse.attention.serial_sevens.step_1` 等脱敏人工样例。
- `backend\src\modules\cognitive-domains\services\cognitive-domains.service.spec.ts`：验证 `CognitiveDomainResult` schema 的 collection、索引、枚举 / ObjectId / Date / Number / Boolean / Mixed 显式类型，验证认知域结果内嵌子文档 `_id: false`，验证 `CognitiveDomainsService` 的 `domainResultCode` / `domainCode` 规范化、查无返回 `null`、mapper 输出、按量表实例最新读取、按量表实例 / 计分结果 / 访视 / 患者读取，以及 `summarizeDomainScores()` 对默认映射、多认知域映射、权重、不计入认知域、缺失、未评分、需复核和非有限数字 warning 的处理；不连接真实 MongoDB，不调用 Storage / OSS / SMS / LLM，测试数据为 `SUBJ-TEST-*`、`VISIT-TEST-*`、`INST-TEST-*`、`SCR-TEST-*`、`CDR-TEST-*`、`moca.visuospatial.clock`、`moca.memory.delayed.face`、`mmse.attention.serial_sevens.step_1` 等脱敏人工样例。
- `backend\src\modules\reports\services\reports.service.spec.ts`：验证 `ClinicalReport` schema 的 collection、索引、枚举 / ObjectId / Date / Number / Boolean / Mixed 显式类型，验证报告内嵌子文档 `_id: false`，验证 `ReportsService` 的 `reportCode` 规范化、查无返回 `null`、mapper 输出、按访视最新读取、按访视 / 患者 / 状态读取、按患者读取 confirmed / archived / corrected 报告列表，以及 `canTransitionReportStatus()` / `getAllowedReportStatusTransitions()` 对草稿、待确认、已确认、已归档、更正和作废状态的处理；不连接真实 MongoDB，不调用 Storage / OSS / SMS / LLM，测试数据为 `SUBJ-TEST-*`、`VISIT-TEST-*`、`INST-TEST-*`、`SCR-TEST-*`、`CDR-TEST-*`、`RPT-TEST-*`、`moca.visuospatial.clock` 等脱敏人工样例。

## 6. E2E 测试口径

- 后续 E2E 必须遵循 `docs\e2e-testing.md`。
- E2E 应用于验证真实 HTTP 链路、权限、全局管道、模块装配和关键闭环。
- 启动期配置变量如影响模块装配，必须在 import `AppModule` 前设置。

## 7. 医疗与量表数据测试红线

- 测试不得使用真实患者数据、真实身份证号、真实手机号、真实病历号或其他可识别个人信息。
- 量表测试数据应使用脱敏样本或人工构造样本。
- 不得调用真实短信、真实阿里云 SMS、支付、医保、医院 HIS/LIS/PACS、对象存储生产环境或真实大模型服务，除非未来单独定义受控集成测试。
- 不得在测试断言中生成真实医疗诊断结论。

## 8. 后续同步规则

- 后端新增或调整测试脚本后，应同步更新自动验证命令。
- 新增 Service、Controller、DTO、权限或 E2E 用例后，应同步补充对应验证口径。
- 测试数据、截图和日志不得包含可识别个人信息。
