# CogMemory AD / 智忆评 后端 Handoff 入口

## 1. 项目名称

- 中文名：智忆评
- 英文名：CogMemory AD
- 项目方向：阿尔茨海默病认知评估与辅助诊断系统

## 2. 本文档用途

本文档是 CogMemory AD 后端 handoff 文档入口，用于索引后端事实快照、API、DTO、Service、配置、决策和验证手册。

当前内容记录后端公共底座、已进入真实代码阶段的 `scales` 量表定义模型底座、`patients` / `assessments` 患者、访视和量表实例运行时模型底座、`assessments` 内部 `ItemResponse` 题目作答数据模型底座、`media` 媒体证据模型底座、`scoring` 自动计分结果模型与通用计分汇总底座、`cognitive-domains` 认知域结果模型与通用认知域汇总底座、`reports` 临床报告模型与医生确认流程底座、`scales` 内部 MMSE / MoCA 初始配置种子数据底座、`assessments` 内部评估执行初始化编排底座，`users` / `auth` 认证、用户、会话与角色权限模型 / Service / Guard 底座、A11 最小公开认证 API，以及 A12 患者档案与评估访视五个受保护最小公开 API；未实现的业务能力仍只能标记为待后续阶段确认。

## 3. 当前状态

- 后端工程已初始化，当前仓库存在 `backend\package.json`，技术栈版本以该文件、锁文件和实际代码为准。
- `backend\src` 已具备 NestJS 公共底座、配置加载与校验、MongoDB 连接底座、全局异常处理、健康检查和 Storage 公共模块。
- 当前新增 `scales` 量表定义模型底座，包含 `ScaleDefinition` / `ScaleVersion` Schema 与 `ScalesService` 内部读取能力。
- `PatientsModule` 当前包含 `Patient` Schema、既有内部读取能力，以及 `PatientsController` 的患者列表、创建、详情公开 API。
- `AssessmentsModule` 当前包含 `AssessmentVisit` / `ScaleInstance` Schema、既有内部读取能力，以及 `AssessmentVisitsController` 的患者访视列表、创建公开 API。
- 当前新增 `assessments` 题目作答数据模型底座，包含 `ItemResponse` Schema 与 `AssessmentsService` 按量表实例 / 访视读取题目作答的内部能力。
- 当前新增 `media` 媒体证据模型底座，包含 `MediaEvidence` Schema 与 `MediaEvidenceService` 按证据编码、题目作答、量表实例、访视或患者读取媒体证据摘要的内部能力。
- 当前新增 `scoring` 自动计分结果模型与通用计分汇总底座，包含 `ScoreResult` Schema、`ScoringService` 内部读取能力和 `summarizeItemScores()` 通用汇总纯函数。
- 当前新增 `cognitive-domains` 认知域结果模型与通用认知域汇总底座，包含 `CognitiveDomainResult` Schema、`CognitiveDomainsService` 内部读取能力和 `summarizeDomainScores()` 通用认知域汇总纯函数。
- 当前新增 `reports` 临床报告模型与医生确认流程底座，包含 `ClinicalReport` Schema、`ReportsService` 内部读取能力和报告状态转换校验纯函数。
- 当前新增 `scales` 内部 MMSE / MoCA 初始配置种子数据底座，包含 MMSE / MoCA seed 常量、`ScaleSeedDataService` 只读读取能力和 `validateScaleSeeds()` 种子数据校验纯函数。
- 当前新增 `assessments` 内部 `AssessmentExecutionService`，可基于 MMSE / MoCA seed 构建执行计划，并在内部方法中创建 `ScaleInstance` 与初始 `ItemResponse` 骨架；不提供公开 API。
- 当前新增 `users` 内部模块，包含 `User` Schema 与 `UsersService` 内部账号读取、账号编码规范化和安全 mapper 输出能力。
- 当前新增 `auth` 模块，包含 `Session` Schema、`AuthService` 密码哈希 / 校验、session token 生成 / hash、session 创建 / 校验 / 撤销、账号密码认证编排能力，以及 `@Public()`、`@Roles()`、`@CurrentUser()`、`SessionAuthGuard`、`RolesGuard` 和 `AuthController`；不注册全局 Guard。
- 当前公开 API 为 `GET /health`、`POST /auth/login`、`POST /auth/logout`、`GET /auth/me`、`GET /patients`、`POST /patients`、`GET /patients/:patientId`、`GET /patients/:patientId/visits`、`POST /patients/:patientId/visits`；A12 是第一组受服务端 Session 和角色权限保护的临床业务 API。
- A12 五个接口均显式绑定 `SessionAuthGuard`、`RolesGuard` 与 `@Roles('admin', 'doctor', 'nurse', 'research_assistant')`；未注册全局 Guard。
- users me / 用户管理 API、前端患者 / 访视页面、权限菜单、患者编辑 / 删除 / 归档、访视编辑 / 删除 / 状态流转、量表实例公开创建、作答提交、媒体上传 / 下载 / 签名 URL、数据库 seed runner、seed 写库、公开 MMSE / MoCA 配置查询接口、计分触发、认知域计算触发、MMSE / MoCA 专用规则执行、报告生成、医生确认写库、PDF 导出、疾病诊断、AI、科研导出等业务能力仍未实现。
- A12 单元验证为 22 个测试套件、213 个测试通过；真实 HTTP E2E 为 1 个测试套件、7 个测试通过，使用隔离 `cogmemory_ad_test` 数据库和脱敏人工数据。

## 4. 必读基础文档

- `docs\backend-architecture.md`
- `docs\auth-baseline.md`
- `docs\database-conventions.md`
- `docs\e2e-testing.md`
- `docs\codex-rules.md`
- `docs\codex-instruction-spec.md`

## 5. 当前后端 handoff 文档列表

- `docs\handoff\handoff-backend-snapshot.md`
- `docs\handoff\handoff-backend-api-map.md`
- `docs\handoff\handoff-backend-dto-cheatsheet.md`
- `docs\handoff\handoff-backend-service-map.md`
- `docs\handoff\handoff-backend-config-matrix.md`
- `docs\handoff\handoff-backend-decisions.md`
- `docs\handoff\handoff-backend-testing-playbook.md`

## 6. 后续同步规则

- 后端新增或调整接口、DTO、Service、配置、测试脚本或关键决策时，应同步更新对应 handoff 文档。
- 未在业务文档和实际代码中确认的内容，只能标记为“待确认”或“待后续业务文档确定”。
- 不得在 handoff 中提前写入未实现的后端能力。
