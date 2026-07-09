# CogMemory AD / 智忆评 后端 Handoff 入口

## 1. 项目名称

- 中文名：智忆评
- 英文名：CogMemory AD
- 项目方向：阿尔茨海默病认知评估与辅助诊断系统

## 2. 本文档用途

本文档是 CogMemory AD 后端 handoff 文档入口，用于索引后端事实快照、API、DTO、Service、配置、决策和验证手册。

当前内容记录后端公共底座、已进入真实代码阶段的 `scales` 量表定义模型底座、`patients` / `assessments` 患者、访视和量表实例运行时模型底座、`assessments` 内部 `ItemResponse` 题目作答数据模型底座、`media` 媒体证据模型底座、`scoring` 自动计分结果模型与通用计分汇总底座、`cognitive-domains` 认知域结果模型与通用认知域汇总底座、`reports` 临床报告模型与医生确认流程底座、`scales` 内部 MMSE / MoCA 初始配置种子数据底座、`assessments` 内部评估执行初始化编排底座，以及 `users` / `auth` 认证、用户、会话与角色权限模型 / Service / Guard 底座；未实现的业务能力仍只能标记为待后续阶段确认。

## 3. 当前状态

- 后端工程已初始化，当前仓库存在 `backend\package.json`，技术栈版本以该文件、锁文件和实际代码为准。
- `backend\src` 已具备 NestJS 公共底座、配置加载与校验、MongoDB 连接底座、全局异常处理、健康检查和 Storage 公共模块。
- 当前新增 `scales` 量表定义模型底座，包含 `ScaleDefinition` / `ScaleVersion` Schema 与 `ScalesService` 内部读取能力。
- 当前新增 `patients` 患者档案模型底座，包含 `Patient` Schema 与 `PatientsService` 内部读取能力。
- 当前新增 `assessments` 访视 / 量表实例运行时模型底座，包含 `AssessmentVisit` / `ScaleInstance` Schema 与 `AssessmentsService` 内部读取能力。
- 当前新增 `assessments` 题目作答数据模型底座，包含 `ItemResponse` Schema 与 `AssessmentsService` 按量表实例 / 访视读取题目作答的内部能力。
- 当前新增 `media` 媒体证据模型底座，包含 `MediaEvidence` Schema 与 `MediaEvidenceService` 按证据编码、题目作答、量表实例、访视或患者读取媒体证据摘要的内部能力。
- 当前新增 `scoring` 自动计分结果模型与通用计分汇总底座，包含 `ScoreResult` Schema、`ScoringService` 内部读取能力和 `summarizeItemScores()` 通用汇总纯函数。
- 当前新增 `cognitive-domains` 认知域结果模型与通用认知域汇总底座，包含 `CognitiveDomainResult` Schema、`CognitiveDomainsService` 内部读取能力和 `summarizeDomainScores()` 通用认知域汇总纯函数。
- 当前新增 `reports` 临床报告模型与医生确认流程底座，包含 `ClinicalReport` Schema、`ReportsService` 内部读取能力和报告状态转换校验纯函数。
- 当前新增 `scales` 内部 MMSE / MoCA 初始配置种子数据底座，包含 MMSE / MoCA seed 常量、`ScaleSeedDataService` 只读读取能力和 `validateScaleSeeds()` 种子数据校验纯函数。
- 当前新增 `assessments` 内部 `AssessmentExecutionService`，可基于 MMSE / MoCA seed 构建执行计划，并在内部方法中创建 `ScaleInstance` 与初始 `ItemResponse` 骨架；不提供公开 API。
- 当前新增 `users` 内部模块，包含 `User` Schema 与 `UsersService` 内部账号读取、账号编码规范化和安全 mapper 输出能力。
- 当前新增 `auth` 内部模块，包含 `Session` Schema、`AuthService` 密码哈希 / 校验、session token 生成 / hash、session 创建 / 校验 / 撤销能力，以及 `@Public()`、`@Roles()`、`@CurrentUser()`、`SessionAuthGuard`、`RolesGuard` 底座；不提供公开 API，不注册全局 Guard。
- 当前公开 API 仍只有 `GET /health`；`scales`、`patients`、`assessments`、`media`、`scoring`、`cognitive-domains`、`reports`、`users`、`auth` 均未新增 Controller 或公开业务接口。
- 公开登录 / 登出 / auth me / users me / 用户管理 API、前端登录页、认证态联动、权限菜单、真实患者建档流程、访视管理接口、公开评估执行业务接口、作答提交、媒体上传 / 下载 / 签名 URL、数据库 seed runner、seed 写库、公开 MMSE / MoCA 配置查询接口、计分触发、认知域计算触发、MMSE / MoCA 专用计分规则执行、MMSE / MoCA 专用认知域规则执行、报告生成接口、医生确认写库流程、报告归档 / 更正 / 作废接口、PDF 导出、疾病诊断、AI、科研导出等业务能力仍未实现。

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
