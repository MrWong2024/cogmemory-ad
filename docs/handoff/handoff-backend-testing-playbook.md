# CogMemory AD / 智忆评 后端验证手册

## 1. 文档定位

本文档用于记录 CogMemory AD 后端验证命令、测试分层口径、医疗与量表数据测试红线，供后续开发和交接使用。

## 2. 当前状态

- `backend\src` 公共底座已初始化。
- 当前存在 health controller spec、Storage service spec、上传文件名工具 spec、scales service / schema spec、scales seed service spec、patients service / schema spec、assessments service / schema spec、assessment execution service spec、media service / schema spec、scoring service / schema spec、cognitive-domains service / schema spec、reports service / schema spec、users service / schema spec、auth service / schema spec、session auth guard spec 和 roles guard spec。
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
- 本次后端 A8 已验证命令：
  - `npm run lint:file -- src/modules/scales`
  - `npm run build`
  - `npm test -- --runInBand`
- 本次后端 A9 已验证命令：
  - `npm run lint:file -- src/modules/assessments`
  - `npm run build`
  - `npm test -- --runInBand`
- 本次后端 A10 已验证命令：
  - `npm run lint:file -- src/modules/users src/modules/auth src/app.module.ts`
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
  - 当前单元测试为 16 个测试套件通过。
  - 当前单元测试为 160 个测试通过。
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
- `backend\src\modules\scales\seeds\scale-seed-data.service.spec.ts`：验证 `ScaleSeedDataService` 对 MMSE / MoCA 初始配置 seed 的只读读取、trim + lowercase code 规范化、版本读取、definition / version 列表、内置 seed 校验、总分范围、MMSE 表达第 9 项与绘图第 10 项修正、MoCA 抽象项 `N1.2.12.1` / `N1.2.12.2` 修正、MoCA 即刻记忆不计分但保留原始记录、MoCA 延迟回忆保留分类提示和多选提示记录、MMSE / MoCA 连续减 7 分步独立计分、MoCA 连线 / 立方体 / 钟表图片与手写证据、连线计时要求、item code 唯一、groupCode 引用存在，以及重复 item code、无效 groupCode、无效 scoreRange 和错误 MoCA 抽象 CRF 编码的校验错误分支；不连接真实 MongoDB，不调用 Storage / OSS / SMS / LLM，测试数据为配置样例或脱敏人工样例。
- `backend\src\modules\patients\services\patients.service.spec.ts`：验证 `Patient` schema 的 collection、索引、枚举 / Date / Number / Mixed 显式类型，验证 `PatientsService` 的 `subjectCode` 规范化、查无返回 `null`、mapper 输出和 active patient 列表读取；不连接真实 MongoDB，测试数据为 `SUBJ-TEST-*` 等脱敏人工样例。
- `backend\src\modules\assessments\services\assessments.service.spec.ts`：验证 `AssessmentVisit` / `ScaleInstance` / `ItemResponse` schema 的 collection、索引、枚举 / ObjectId / Date / Number / Boolean / Mixed 显式类型，验证 `ItemResponse` 内嵌子文档 `_id: false`，验证 `AssessmentsService` 的 `visitCode` / `instanceCode` / `itemCode` 规范化、访视 / 量表实例 / 题目作答查无返回 `null`、mapper 输出、按量表实例读取、按已计分条件读取和按访视读取；不连接真实 MongoDB，测试数据为 `SUBJ-TEST-*`、`VISIT-TEST-*`、`INST-TEST-*`、`moca.memory.immediate.trial_1.face`、`mmse.attention.serial_sevens.step_1` 等脱敏人工样例。
- `backend\src\modules\assessments\services\assessment-execution.service.spec.ts`：验证 `AssessmentExecutionService` 基于 MMSE / MoCA seed 构建执行计划、MMSE 写句子 `MMSE.9` 修正、绘图 / 连线 photo 与 handwriting 证据占位、MoCA 即刻记忆不计入总分但保留骨架、MoCA 延迟回忆分类提示 / 多选提示记录追溯、MMSE / MoCA 连续减 7 stepResults、MoCA 连线 timing、score 初始快照、normalize 方法、seed 不存在、seed 校验失败、非法 ObjectId / 空 subjectCode / 不支持施测模式、`ScaleInstance` 先于 `ItemResponse` 创建、创建数量与 seed item 数量一致，以及 mapper summary 不暴露原始 Mongoose document；不连接真实 MongoDB，不调用 Storage / OSS / SMS / LLM，测试数据为配置样例或 `SUBJ-TEST-*`、`VISIT-TEST-*`、`INST-TEST-*` 等脱敏人工样例。
- `backend\src\modules\media\services\media-evidence.service.spec.ts`：验证 `MediaEvidence` schema 的 collection、索引、枚举 / ObjectId / Date / Number / Boolean / Mixed 显式类型，验证媒体证据内嵌子文档 `_id: false`，验证 `MediaEvidenceService` 的 `evidenceCode` 规范化、查无返回 `null`、mapper 输出、按题目作答 / 量表实例 / 访视 / 患者读取和 attached / locked 过滤读取；不连接真实 MongoDB，不调用 Storage / OSS，测试数据为 `SUBJ-TEST-*`、`VISIT-TEST-*`、`INST-TEST-*`、`EVD-TEST-*`、`moca.visuospatial.trail_making`、`moca.visuospatial.clock`、`mmse.language.drawing` 等脱敏人工样例。
- `backend\src\modules\scoring\services\scoring.service.spec.ts`：验证 `ScoreResult` schema 的 collection、索引、枚举 / ObjectId / Date / Number / Boolean / Mixed 显式类型，验证计分结果内嵌子文档 `_id: false`，验证 `ScoringService` 的 `scoreResultCode` 规范化、查无返回 `null`、mapper 输出、按量表实例最新读取、按量表实例 / 访视 / 患者读取，以及 `summarizeItemScores()` 对计入 / 不计入总分、缺失、未评分、需复核、非有限数字、逐步计分和 group score 汇总的处理；不连接真实 MongoDB，不调用 Storage / OSS / SMS / LLM，测试数据为 `SUBJ-TEST-*`、`VISIT-TEST-*`、`INST-TEST-*`、`SCR-TEST-*`、`moca.memory.immediate.trial_1.face`、`moca.recall.delayed.free.face`、`mmse.attention.serial_sevens.step_1` 等脱敏人工样例。
- `backend\src\modules\cognitive-domains\services\cognitive-domains.service.spec.ts`：验证 `CognitiveDomainResult` schema 的 collection、索引、枚举 / ObjectId / Date / Number / Boolean / Mixed 显式类型，验证认知域结果内嵌子文档 `_id: false`，验证 `CognitiveDomainsService` 的 `domainResultCode` / `domainCode` 规范化、查无返回 `null`、mapper 输出、按量表实例最新读取、按量表实例 / 计分结果 / 访视 / 患者读取，以及 `summarizeDomainScores()` 对默认映射、多认知域映射、权重、不计入认知域、缺失、未评分、需复核和非有限数字 warning 的处理；不连接真实 MongoDB，不调用 Storage / OSS / SMS / LLM，测试数据为 `SUBJ-TEST-*`、`VISIT-TEST-*`、`INST-TEST-*`、`SCR-TEST-*`、`CDR-TEST-*`、`moca.visuospatial.clock`、`moca.memory.delayed.face`、`mmse.attention.serial_sevens.step_1` 等脱敏人工样例。
- `backend\src\modules\reports\services\reports.service.spec.ts`：验证 `ClinicalReport` schema 的 collection、索引、枚举 / ObjectId / Date / Number / Boolean / Mixed 显式类型，验证报告内嵌子文档 `_id: false`，验证 `ReportsService` 的 `reportCode` 规范化、查无返回 `null`、mapper 输出、按访视最新读取、按访视 / 患者 / 状态读取、按患者读取 confirmed / archived / corrected 报告列表，以及 `canTransitionReportStatus()` / `getAllowedReportStatusTransitions()` 对草稿、待确认、已确认、已归档、更正和作废状态的处理；不连接真实 MongoDB，不调用 Storage / OSS / SMS / LLM，测试数据为 `SUBJ-TEST-*`、`VISIT-TEST-*`、`INST-TEST-*`、`SCR-TEST-*`、`CDR-TEST-*`、`RPT-TEST-*`、`moca.visuospatial.clock` 等脱敏人工样例。
- `backend\src\modules\users\services\users.service.spec.ts`：验证 `User` schema 的 collection、索引、`passwordHash select: false`、枚举 / Date / Number / Mixed 显式类型，验证 `UsersService` 的 accountName / email / staffCode 规范化、按 ID / 账号查无返回 `null`、mapper 输出不含 `passwordHash`、凭证查询显式 select `+passwordHash` 且只返回认证必要字段、active 用户列表读取；不连接真实 MongoDB，测试数据为 `doctor-test-001`、`STAFF-TEST-001`、`doctor-test-001@example.test` 等脱敏人工样例。
- `backend\src\modules\auth\services\auth.service.spec.ts`：验证 `Session` schema 的 collection、索引、`sessionTokenHash select: false`、`expiresAt` TTL 索引、ObjectId / Date / Mixed 显式类型，验证 `AuthService` 的密码 hash / verify、错误密码和损坏 hash、session token 随机性、token hash 稳定性、session 创建写入 token hash 而非 raw token、session 不存在 / revoked / expired / 用户不存在 / 用户非 active 返回 `null`、正常返回 `AuthenticatedUserContext` 且不含 `passwordHash`、raw token、session token hash 或 token hash；不连接真实 MongoDB，不调用 OSS / Storage / SMS / LLM，测试数据为 `SESSION-TEST-*` 等脱敏人工样例。
- `backend\src\modules\auth\guards\session-auth.guard.spec.ts`：验证 `SessionAuthGuard` 对 `@Public()` 路由直通、缺少 Cookie 抛 `UnauthorizedException`、从 cookie-parser cookies 读取 `_session`、从原始 cookie header 解析 `_session`、校验成功挂载 `req.user`、校验失败抛 `UnauthorizedException`；不连接真实 MongoDB，不调用外部服务。
- `backend\src\modules\auth\guards\roles.guard.spec.ts`：验证 `RolesGuard` 在没有 `@Roles()` 时直通、用户包含要求角色时通过、已认证但角色不足时抛 `ForbiddenException`、没有 `req.user` 时抛 `ForbiddenException`；不连接真实 MongoDB，不调用外部服务。

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
