# CogMemory AD / 智忆评 后端 Handoff 入口

## 1. 项目名称

- 中文名：智忆评
- 英文名：CogMemory AD
- 项目方向：阿尔茨海默病认知评估与辅助诊断系统

## 2. 本文档用途

本文档是 CogMemory AD 后端 handoff 文档入口，用于索引后端事实快照、API、DTO、Service、配置、决策和验证手册。

当前内容记录后端公共底座、量表与运行时模型、A12-A20 评估至报告 draft 闭环、A21 ClinicalReport 受控编辑 / 提交待确认 / 医生确认、A22 不可逆报告锁定、A23 可恢复来源链冻结，以及认证与角色权限底座。

## 3. 当前状态

- 后端工程已初始化，当前仓库存在 `backend\package.json`，技术栈版本以该文件、锁文件和实际代码为准。
- `backend\src` 已具备 NestJS 公共底座、配置加载与校验、MongoDB 连接底座、全局异常处理、健康检查和 Storage 公共模块。
- `ScalesModule` 当前包含 `ScaleDefinition` / `ScaleVersion` Schema、`ScalesService`、只读 `ScaleSeedDataService`、公开只读 `ScalesController` 和 `ScaleCatalogService`；目录读取不写数据库，初始化时才按需幂等物化对应 seed 版本。
- `PatientsModule` 当前包含 `Patient` Schema、既有内部读取能力，以及 `PatientsController` 的患者列表、创建、详情公开 API。
- `AssessmentsModule` 当前包含 `AssessmentVisit` / `ScaleInstance` / `ItemResponse` Schema、既有内部读取能力、`AssessmentExecutionService`、`AssessmentScaleWorkflowService`、`AssessmentExecutionDetailService`、`ItemResponseDraftService`，以及 `AssessmentVisitsController` 与 `AssessmentExecutionController`；A14 新增单实例安全执行详情和单题草稿保存能力。
- `AssessmentsModule` A16 新增 `ScaleInstanceSubmissionController`、`ScaleInstanceSubmissionService` 与纯 readiness evaluator，公开 submission-readiness GET 和 submit POST；不依赖 `MediaModule`，不执行评分。
- 当前新增 `assessments` 题目作答数据模型底座，包含 `ItemResponse` Schema 与 `AssessmentsService` 按量表实例 / 访视读取题目作答的内部能力。
- `MediaModule` 当前包含既有 `MediaEvidence` Schema / Service，以及 A15 `MediaEvidenceController`、`MediaEvidenceWorkflowService`、安全 public mapper、图片魔数 / 隐私元数据纯校验与手写轨迹 JSON 纯校验；依赖 Auth、Patients、Assessments 与 Storage，不重复注册 ItemResponse Schema。
- `ScoringModule` 在既有 `ScoreResult` Schema、`ScoringService` 与 `summarizeItemScores()` 基础上，提供 `ScoringController`、A17 `ProvisionalScoringWorkflowService`、A18 `ScoreReviewWorkflowService`、纯评分 / 复核函数和显式 public mapper；公开 compute、latest、单题 manual-review 与 ScoreResult confirm 四个最小 API。
- `CognitiveDomainsModule` 当前在既有 `CognitiveDomainResult` Schema、`CognitiveDomainsService` 与 `summarizeDomainScores()` 基础上，新增 `CognitiveDomainResultsController`、`CognitiveDomainComputationWorkflowService`、确认评分纯映射 / 校验和安全 public mapper；公开 runNo=1 compute / latest 两个最小 API。
- `ReportsModule` 当前包含 generation、review、lock、source-freeze、archive 与 A25 `ClinicalReportCorrectionWorkflowService`，以及对应纯函数、`ReportsService` 原子持久化和 `ClinicalReportPublicMapper`；公开 API 共九个。
- 当前新增 `scales` 内部 MMSE / MoCA 初始配置种子数据底座，包含 MMSE / MoCA seed 常量、`ScaleSeedDataService` 只读读取能力和 `validateScaleSeeds()` 种子数据校验纯函数。
- `AssessmentExecutionService` 可基于 MMSE / MoCA seed 创建 `ScaleInstance` 与初始 `ItemResponse` 骨架；A13 由 `AssessmentScaleWorkflowService` 受控调用。题目批量创建失败时按本次实例 ID 尝试清理已创建题目和实例，当前为补偿式一致性，不是 Mongo transaction。
- 当前新增 `users` 内部模块，包含 `User` Schema 与 `UsersService` 内部账号读取、账号编码规范化和安全 mapper 输出能力。
- 当前新增 `auth` 模块，包含 `Session` Schema、`AuthService` 密码哈希 / 校验、session token 生成 / hash、session 创建 / 校验 / 撤销、账号密码认证编排能力，以及 `@Public()`、`@Roles()`、`@CurrentUser()`、`SessionAuthGuard`、`RolesGuard` 和 `AuthController`；不注册全局 Guard。
- 当前报告公开 API 共九个：generate、latest、edit draft、submit confirmation、confirm、lock、freeze-sources、archive、corrections。
- A12-A25 临床接口均显式绑定 `SessionAuthGuard` 与 `RolesGuard`；普通 V1 的 A21 edit / submit 沿用四个患者工作流角色，replacement A21 与 confirm / lock / freeze / archive / corrections 限制 doctor / admin；未注册全局 Guard。
- 当前媒体边界仅为 photo / handwriting；手写轨迹为可选 JSON / strokes，签名 URL 为短期地址，作废不物理删除。仍无批量上传、分片上传、客户端直传、永久 URL、公开 Storage 管理、物理删除、原子替换、OCR 或 AI。
- A24 最终验证记录为 scoped lint 通过、build 通过、72 个单元测试套件 / 625 个测试通过、A24 定向真实 HTTP E2E 1 个套件 / 6 个测试通过、全量 E2E 13 个套件 / 60 个测试通过。A24 完成后补充执行的最近两次全量 E2E 均完整通过；未运行全模块 lint，既有 scoring 格式技术债未修改。
- A25 实际验证为 scoped reports + A25 E2E lint 通过、build 通过、75 个单元测试套件 / 653 个测试通过、A25 定向 E2E 1 个套件 / 4 个测试通过、全量 E2E 14 个套件 / 64 个测试通过；运行环境为隔离 test DB、fake Storage、stub SMS / LLM。上述数量来自本阶段实际 Jest 执行；A24 的 13 / 60 历史事实保留。
- 两次最新全量 E2E 均使用 `NODE_ENV=test`、Jest `--runInBand`、隔离 `cogmemory_ad_test`、fake Storage、stub SMS / LLM 与脱敏人工数据，未调用真实外部服务。此前一次全量复跑曾出现既有跨套件 test catalog / 数据顺序污染现象；该现象在随后两次完整串行复跑中未再次出现。当前验证结论以最近连续两次全量通过为准，但尚不据此宣称潜在测试隔离风险已被永久消除。
- 当前后端闭环为 A17 → A18 → A19 → A20 generate / latest → A21 edit / submit / confirm → A22 lock → A23 freeze-sources → A24 archive → A25 corrections。latest / generate 返回当前最新版本；合法 replacement 支持 doctor/admin A21，仍无 cancel / branch / replacement lock / freeze / archive、PDF 或 AI。

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
