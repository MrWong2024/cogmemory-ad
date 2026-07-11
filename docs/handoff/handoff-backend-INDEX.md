# CogMemory AD / 智忆评 后端 Handoff 入口

## 1. 项目名称

- 中文名：智忆评
- 英文名：CogMemory AD
- 项目方向：阿尔茨海默病认知评估与辅助诊断系统

## 2. 本文档用途

本文档是 CogMemory AD 后端 handoff 文档入口，用于索引后端事实快照、API、DTO、Service、配置、决策和验证手册。

当前内容记录后端公共底座、量表与运行时模型、MMSE / MoCA seed、安全目录与初始化、单实例执行详情、单题草稿、A15 photo / handwriting 媒体证据工作流、A16 submission readiness / submit、A17 阶段性混合评分与安全查询，以及认证与角色权限底座。

## 3. 当前状态

- 后端工程已初始化，当前仓库存在 `backend\package.json`，技术栈版本以该文件、锁文件和实际代码为准。
- `backend\src` 已具备 NestJS 公共底座、配置加载与校验、MongoDB 连接底座、全局异常处理、健康检查和 Storage 公共模块。
- `ScalesModule` 当前包含 `ScaleDefinition` / `ScaleVersion` Schema、`ScalesService`、只读 `ScaleSeedDataService`、公开只读 `ScalesController` 和 `ScaleCatalogService`；目录读取不写数据库，初始化时才按需幂等物化对应 seed 版本。
- `PatientsModule` 当前包含 `Patient` Schema、既有内部读取能力，以及 `PatientsController` 的患者列表、创建、详情公开 API。
- `AssessmentsModule` 当前包含 `AssessmentVisit` / `ScaleInstance` / `ItemResponse` Schema、既有内部读取能力、`AssessmentExecutionService`、`AssessmentScaleWorkflowService`、`AssessmentExecutionDetailService`、`ItemResponseDraftService`，以及 `AssessmentVisitsController` 与 `AssessmentExecutionController`；A14 新增单实例安全执行详情和单题草稿保存能力。
- `AssessmentsModule` A16 新增 `ScaleInstanceSubmissionController`、`ScaleInstanceSubmissionService` 与纯 readiness evaluator，公开 submission-readiness GET 和 submit POST；不依赖 `MediaModule`，不执行评分。
- 当前新增 `assessments` 题目作答数据模型底座，包含 `ItemResponse` Schema 与 `AssessmentsService` 按量表实例 / 访视读取题目作答的内部能力。
- `MediaModule` 当前包含既有 `MediaEvidence` Schema / Service，以及 A15 `MediaEvidenceController`、`MediaEvidenceWorkflowService`、安全 public mapper、图片魔数 / 隐私元数据纯校验与手写轨迹 JSON 纯校验；依赖 Auth、Patients、Assessments 与 Storage，不重复注册 ItemResponse Schema。
- `ScoringModule` 在既有 `ScoreResult` Schema、`ScoringService` 与 `summarizeItemScores()` 基础上，新增 `ScoringController`、`ProvisionalScoringWorkflowService`、纯 provisional scoring engine 和显式 public mapper；公开 compute / latest 两个最小 API。
- 当前新增 `cognitive-domains` 认知域结果模型与通用认知域汇总底座，包含 `CognitiveDomainResult` Schema、`CognitiveDomainsService` 内部读取能力和 `summarizeDomainScores()` 通用认知域汇总纯函数。
- 当前新增 `reports` 临床报告模型与医生确认流程底座，包含 `ClinicalReport` Schema、`ReportsService` 内部读取能力和报告状态转换校验纯函数。
- 当前新增 `scales` 内部 MMSE / MoCA 初始配置种子数据底座，包含 MMSE / MoCA seed 常量、`ScaleSeedDataService` 只读读取能力和 `validateScaleSeeds()` 种子数据校验纯函数。
- `AssessmentExecutionService` 可基于 MMSE / MoCA seed 创建 `ScaleInstance` 与初始 `ItemResponse` 骨架；A13 由 `AssessmentScaleWorkflowService` 受控调用。题目批量创建失败时按本次实例 ID 尝试清理已创建题目和实例，当前为补偿式一致性，不是 Mongo transaction。
- 当前新增 `users` 内部模块，包含 `User` Schema 与 `UsersService` 内部账号读取、账号编码规范化和安全 mapper 输出能力。
- 当前新增 `auth` 模块，包含 `Session` Schema、`AuthService` 密码哈希 / 校验、session token 生成 / hash、session 创建 / 校验 / 撤销、账号密码认证编排能力，以及 `@Public()`、`@Roles()`、`@CurrentUser()`、`SessionAuthGuard`、`RolesGuard` 和 `AuthController`；不注册全局 Guard。
- 当前公开 API 在 A16 清单上新增 A17 两个接口：completed 量表实例阶段性评分计算与最新安全结果查询。
- A12-A17 临床接口均显式绑定 `SessionAuthGuard`、`RolesGuard` 与四个患者工作流角色；未注册全局 Guard。
- 当前媒体边界仅为 photo / handwriting；手写轨迹为可选 JSON / strokes，签名 URL 为短期地址，作废不物理删除。仍无批量上传、分片上传、客户端直传、永久 URL、公开 Storage 管理、物理删除、原子替换、OCR 或 AI。
- A17 验证后为 47 个单元测试套件、408 个测试通过；真实 HTTP E2E 为 6 个测试套件、36 个测试通过，使用隔离 `cogmemory_ad_test`、fake storage、stub SMS / LLM 与脱敏人工数据。
- A17 结果明确为 provisional / 待确认：仅严格 `multi_step_manual` 可自动计算，人工模式、missing 和既有题分进入 reviewQueue；仍无人工评分录入、评分修改、确认、锁定、重跑、认知域结果或报告 API。

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
