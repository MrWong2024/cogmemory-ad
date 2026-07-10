# CogMemory AD / 智忆评 handoff 路线图

## 1. 文档定位

本文档用于记录 CogMemory AD / 智忆评的 handoff 路线图与业务接续基线，供后续 GPT / Codex 接续项目时快速理解已确认事实、业务边界、阶段路线、非目标和维护规则。

本文档不是正式对外宣传材料，不定义已实现 API、DTO、数据库集合、页面路由、组件、测试脚本或部署能力。当前业务基线是产品与架构方向，不等同于代码已经实现。

## 2. 项目正式名称

- 中文名：智忆评——阿尔茨海默病认知评估与辅助诊断系统
- 英文名：CogMemory AD — Alzheimer’s Cognitive Assessment and Clinical Decision Support System

## 3. 总体定位

本系统不是普通电子问卷系统，而是面向临床与科研场景的阿尔茨海默病认知评估与辅助诊断系统。

核心能力方向包括：标准化量表采集、自动计分、认知域分析、AI 辅助解释、临床报告生成、随访趋势管理、科研数据沉淀。

一期虽然围绕 MMSE 和 MoCA 建设，但架构必须按完整产品底座设计，不能写死成两个表单或两个孤立页面。

## 4. 当前工程与业务承接状态

- 当前仓库已存在 `backend/package.json` 与 `frontend/package.json`，说明后端、前端公共底座已存在；具体技术栈、模块能力和验证命令以后续真实代码与对应 handoff 为准。
- 后端 A1 已完成“量表定义模型底座”真实代码阶段：当前已新增 `scales` 内部模块、`ScaleDefinition` / `ScaleVersion` Mongoose Schema 和最小内部读取 Service。
- 后端 A2 已完成“患者 / 访视 / 量表实例运行时模型底座”真实代码阶段：当前已新增 `patients` 与 `assessments` 内部模块、`Patient` / `AssessmentVisit` / `ScaleInstance` Mongoose Schema 和最小内部读取 Service。
- 后端 A3 已完成“题目作答数据模型底座”真实代码阶段：当前已在 `assessments` 内部模块新增 `ItemResponse` Mongoose Schema 和按量表实例 / 访视读取题目作答的最小内部 Service 能力。
- 后端 A4 已进入并完成“媒体证据模型底座”真实代码阶段：当前已新增 `media` 内部模块、`MediaEvidence` Mongoose Schema 和按证据编码、题目作答、量表实例、访视或患者读取媒体证据摘要的最小内部 Service 能力。
- 后端 A5 已完成“自动计分结果模型与通用计分汇总底座”真实代码阶段：当前已新增 `scoring` 内部模块、`ScoreResult` Mongoose Schema、内部计分结果读取 Service 和 `summarizeItemScores()` 通用计分汇总纯函数。
- 后端 A6 已完成“认知域结果模型与通用认知域汇总底座”真实代码阶段：当前已新增 `cognitive-domains` 内部模块、`CognitiveDomainResult` Mongoose Schema、内部认知域结果读取 Service 和 `summarizeDomainScores()` 通用认知域汇总纯函数。
- 后端 A7 已完成“临床报告模型与医生确认流程底座”真实代码阶段：当前已新增 `reports` 内部模块、`ClinicalReport` Mongoose Schema、内部报告摘要读取 Service 和报告状态转换校验纯函数。
- 后端 A8 已完成“MMSE / MoCA 初始配置种子数据底座”真实代码阶段：当前已在 `scales` 内部模块新增 MMSE / MoCA 初始配置 seed 常量、`ScaleSeedDataService` 只读读取能力和 `validateScaleSeeds()` 种子数据校验纯函数。
- 后端 A9 已完成“评估执行工作流内部编排底座”真实代码阶段：当前已在 `assessments` 内部模块新增 `AssessmentExecutionService`，可基于 MMSE / MoCA seed 构建不写库执行计划，并在内部方法中创建 `ScaleInstance` 与初始 `ItemResponse` 骨架。
- 后端 A10 已完成“认证、用户、会话与角色权限模型底座”真实代码阶段：当前已新增 `users` 与 `auth` 内部模块、`User` / `Session` Schema、内部 `UsersService`、内部 `AuthService`、基础认证上下文、`@Public()` / `@Roles()` / `@CurrentUser()` 装饰器以及 `SessionAuthGuard` / `RolesGuard` 底座；未注册全局 Guard。
- 后端 A11 已完成“公开认证 API 底座”真实代码阶段：当前 `auth` 模块新增 `AuthController`，公开 `POST /auth/login`、`POST /auth/logout`、`GET /auth/me`；AuthModule 内部 Cookie 名称统一为 `cogmemory_ad_session`，登录成功下发 HttpOnly Cookie，主登录态仍为服务端 Session + HttpOnly Cookie，不采用 JWT 主登录态；未实现前端登录页、前端认证态联动、权限菜单、用户管理 API、角色权限管理 API、短信验证码、OAuth / SSO 或密码重置。
- 后端 A12 已完成“患者档案与评估访视最小公开 API”真实代码阶段：当前公开 `GET /patients`、`POST /patients`、`GET /patients/:patientId`、`GET /patients/:patientId/visits`、`POST /patients/:patientId/visits`；五个接口均显式使用 `SessionAuthGuard` + `RolesGuard`，仅允许 `admin`、`doctor`、`nurse`、`research_assistant`，公开响应不暴露 `externalRefs`、`metadata` 或 `clinicalContext`，访视操作者快照由认证上下文生成。
- 前端 B1 已进入并完成“登录页、认证状态与 Auth API 接入底座”真实代码阶段：当前新增 `/login`、`/dashboard`、Auth API Client、认证公开类型和 `useAuth()`；前端仅对接 `POST /auth/login`、`POST /auth/logout`、`GET /auth/me`，所有请求使用 `credentials: 'include'`。会话由后端 HttpOnly Cookie 维护，前端不读取 Cookie、不保存 token；`/dashboard` 仅为认证占位，不是完整医生工作台。
- 前端 B2 已进入并完成“患者档案与评估访视页面接入”真实代码阶段：当前新增 `/patients`、`/patients/new`、`/patients/[patientId]`、`/patients/[patientId]/visits/new`，真实对接 A12 五个患者 / 访视 API，提供患者分页与过滤、患者创建、患者详情、访视分页与过滤、访视创建以及 `/patients/**` 轻量认证工作区；`/dashboard` 已增加患者档案入口。
- 当前 `scales`、`patients`、`assessments`、`media`、`scoring`、`cognitive-domains`、`reports`、`users`、`auth` 与前端 B1 / B2 仅代表量表定义、MMSE / MoCA 初始配置 seed、患者档案、访视、量表执行实例、题目作答记录、评估执行初始化内部编排、媒体证据元数据、计分结果快照、通用计分汇总、认知域结果快照、通用认知域汇总、临床报告快照、报告状态语义校验、系统账号、服务端会话、会话校验、角色装饰器、Guard、最小公开认证 API、患者档案与访视五个受保护公开 API，以及前端认证和患者 / 访视最小页面闭环，不代表完整量表引擎、完整患者管理、完整评估流程、公开用户管理 API、权限菜单、完整权限系统、数据库 seed runner、量表实例公开创建、作答提交、媒体上传 / 下载 / 签名 URL、MMSE / MoCA 页面或专用规则执行、计分触发、报告生成、医生确认写库、报告归档 / 更正 / 作废、疾病诊断或 AI 能力已完成。
- 本路线图只更新当前已确认的业务需求基线，不扩展描述未确认的业务实现。
- 后续 backend / frontend handoff 应在实际后端或前端阶段推进后，基于真实代码和最新提交单独更新。
- 不得在本文件中编造已经实现的 API、DTO、数据库集合、角色权限矩阵、页面路由、组件、测试脚本或部署能力。

## 5. 一期核心量表与原始依据

- 一期核心量表为 MMSE 与 MoCA。
- 本项目“来源”中的 `MMSE+MoCA.pdf` 是一期开发的重要原始依据之一。
- 该 PDF 对应病例报告表中的“神经心理检查”部分，包含 MMSE 与 MoCA 的条目、指导语、评分规则、图片上传、用时记录、总分字段等内容。
- 后续 MMSE / MoCA 字段字典、评分规则、图片/手写证据、用时记录、CRF 编码映射等设计，应以该 PDF 和后续确认文档为依据。
- 当前不得把 MMSE / MoCA 表述为已完成量表引擎或已完成页面。

## 6. 授权与版本追溯口径

- 重医已具备 MMSE、MoCA 等相关量表正规授权。
- 后续不需要把量表版权、MoCA 电子化、网页发布、材料开发等作为项目风险反复讨论。
- 系统仍必须保留量表版本、CRF 版本、评分规则版本、字段编码版本等追溯信息，确保临床、科研、导出和审计场景可回溯。

## 7. 施测边界

- 核心认知量表不设计成患者居家自测。
- 一期场景按医生 / 护士 / 研究助理在旁陪伴或监督下完成评估。
- 患者可以在系统界面或平板上完成部分作答、绘图、连线，但评分、确认、报告归档必须由医护人员或研究人员完成。

## 8. 图片与平板手写要求

- 一期需支持图片上传，用于保存绘图、连线、钟表等任务的原始证据或扫描/拍照材料。
- 一期需支持平板手写方向，用于保存患者在平板上完成的绘图、连线、书写等过程结果。
- 系统不能只保存最终分数，应保留图片证据、手写轨迹、原始文本、用时、操作者备注和必要的质控提示。
- 图片与手写材料应进入报告、审计、科研导出和后续复查对比的证据链设计。

## 9. PDF / CRF 编号错误处理原则

- MMSE 中“表达”项在附件里重复写成第 8 项，系统中应修正为第 9 项。
- MMSE 绘图为第 10 项。
- MoCA 抽象项明细在附件中误写为 `N1.2.11.1`、`N1.2.11.2`，系统中应修正为：
  - `N1.2.12.1`：火车和自行车
  - `N1.2.12.2`：手表和秤
- 系统内部建议使用稳定语义化字段编码，导出时再映射为甲方确认后的 CRF 编码。

## 10. 一期产品底座要求

一期必须建设通用量表引擎，而不是写死 MMSE / MoCA 页面。数据模型、量表引擎、评估流程、报告体系、AI 接入点和扩展能力都必须面向长期产品化。

后续应兼容 ADL、IADL、CDR、FAQ、NPI、GDS、HAMD、HAMA、照护负担、复查记录等量表或随访模块。

一期必须支持的量表引擎能力方向包括：

- 量表配置
- 量表版本
- 题目配置
- 分组配置
- 指导语配置
- 作答类型配置
- 得分范围配置
- 自动计分规则
- 是否计入总分
- 图片上传
- 平板手写
- 计时
- 原始文本记录
- 操作者备注
- 认知域映射
- 质控规则
- 报告展示规则
- 科研导出字段映射

## 11. 建议核心业务对象

以下对象为建议 / 待实际建模确认；除已在后端 A1 落地的 `ScaleDefinition`、`ScaleVersion` 模型底座外，不表示已经存在数据库集合、DTO、接口或前端模型：

- `Patient`（后端 A2 已落地内部 Schema，collection：`patients`）
- `AssessmentVisit`（后端 A2 已落地内部 Schema，collection：`assessment_visits`）
- `ScaleDefinition`（后端 A1 已落地内部 Schema，collection：`scale_definitions`）
- `ScaleVersion`（后端 A1 已落地内部 Schema，collection：`scale_versions`）
- `ScaleInstance`（后端 A2 已落地内部 Schema，collection：`scale_instances`）
- `ScaleItem`
- `ItemResponse`（后端 A3 已落地内部 Schema，collection：`item_responses`）
- `MediaEvidence`（后端 A4 已落地内部 Schema，collection：`media_evidences`）
- `ScoreResult`（后端 A5 已落地内部 Schema，collection：`score_results`）
- `CognitiveDomainResult`（后端 A6 已落地内部 Schema，collection：`cognitive_domain_results`）
- `ClinicalReport`（后端 A7 已落地内部 Schema，collection：`clinical_reports`）
- `User`（后端 A10 已落地内部 Schema，collection：`users`）
- `Session`（后端 A10 已落地内部 Schema，collection：`sessions`）
- `AiAnalysisResult`
- `FollowUpPlan`
- `AuditLog`

## 12. 一期功能范围

以下为目标范围 / 待分阶段实现，不表示当前已经完成：

- 患者档案
- 新建评估
- MMSE 独立填写与自动计分
- MoCA 独立填写与自动计分
- 图片上传
- 平板手写
- 自动保存原始作答、图片、轨迹、用时、备注
- 总分、分项分、认知域得分
- 质控提醒
- AI 辅助解释
- AI 报告草稿
- 医生确认报告
- 历史评估记录
- 随访趋势展示
- 科研数据导出
- 数据脱敏
- 账号权限
- 操作日志
- 数据安全基础能力

## 13. AI 一期应用边界

AI 定位为临床副驾驶，不替代医生。

AI 可以用于报告草稿、异常认知域解释、MMSE / MoCA 综合总结、随访趋势总结、质控提醒、绘图/连线/钟表任务辅助观察、医生报告措辞优化。

AI 不得直接确诊阿尔茨海默病，不得替代医生最终评分，不得无医生确认自动归档报告，不得单独根据量表判断疾病类型。

## 14. 报告与锁定 / 更正 / 审计要求

- 报告必须由医生确认。
- 报告确认后，原始记录、计分结果、图片证据、操作者、时间戳必须锁定。
- 后续修改必须形成更正记录和审计日志。
- AI 报告草稿只能作为医生确认前的辅助材料，不得自动成为正式报告。

## 15. 数据采集重点

- 系统不能只保存 MMSE 总分、MoCA 总分。
- 必须保存总分、分项得分、单题得分、原始作答、图片证据、手写轨迹、用时、提示后表现、操作者备注、AI 质控提示、医生确认意见、评分规则版本、量表版本。
- MoCA 即刻记忆不计入总分，但必须保留原始记录。
- MoCA 延迟回忆中，自由回忆计分；分类提示和多选提示不计入自由回忆得分，但必须保留。
- MMSE 连续减 7 每一步独立计分，前一步错误不影响后续评分。
- MoCA 连续减 7 同样需要逐步记录和独立评分。

## 16. UI 风格方向

- UI 应面向临床与科研日常使用，优先清晰、稳定、可扫描、可复核。
- 评估执行界面应突出题目指导语、作答记录、计分状态、图片/手写证据、用时和操作者备注。
- 报告与历史趋势界面应支持医生快速复核原始证据、分项得分、认知域结果和 AI 辅助文本。
- 不应把系统做成营销落地页或普通问卷工具视觉风格。

## 17. 建议开发阶段顺序

不要先直接堆 MMSE / MoCA 页面。建议优先顺序为：

1. 建设量表定义数据模型。
2. 建设评估实例数据模型。
3. 建设题目作答数据模型。
4. 建设媒体证据模型。
5. 建设自动计分结果模型与通用计分汇总底座。
6. 建设认知域结果模型与通用认知域汇总底座。
7. 建设报告草稿与医生确认流程。
8. 建设 MMSE / MoCA 初始配置种子数据。
9. 建设评估执行工作流内部编排底座，并在后续开发 MMSE / MoCA 评估执行页面。
10. 再扩展随访趋势、科研导出、AI 质控和报告优化能力。

当前进度：步骤 1 已在后端 A1 完成模型底座，实现范围仅限量表定义 / 量表版本 Schema 与内部读取 Service；步骤 2 已在后端 A2 完成模型底座，实现范围仅限患者 / 访视 / 量表实例 Schema 与内部读取 Service；步骤 3 已在后端 A3 完成模型底座，实现范围仅限 `ItemResponse` Schema 与内部读取 Service；步骤 4 已在后端 A4 完成模型底座，实现范围仅限 `MediaEvidence` Schema 与内部读取 Service；步骤 5 已在后端 A5 完成计分结果模型与通用计分汇总底座，实现范围仅限 `ScoreResult` Schema、内部读取 Service 与基于单题得分快照的 `summarizeItemScores()` 纯函数；步骤 6 已在后端 A6 完成认知域结果模型与通用认知域汇总底座，实现范围仅限 `CognitiveDomainResult` Schema、内部读取 Service 与基于单题得分快照和认知域映射快照的 `summarizeDomainScores()` 纯函数；步骤 7 已在后端 A7 完成临床报告模型与医生确认流程底座，实现范围仅限 `ClinicalReport` Schema、内部读取 Service 与报告状态转换校验纯函数；步骤 8 已在后端 A8 完成 MMSE / MoCA 初始配置种子数据底座，实现范围仅限 `scales` 内部 seed 常量、只读 `ScaleSeedDataService` 与不写库的 `validateScaleSeeds()` 校验纯函数；步骤 9 的后端内部编排底座已在后端 A9 完成，实现范围仅限 `assessments` 内部 `AssessmentExecutionService`、不写库执行计划构建，以及内部创建 `ScaleInstance` 与初始 `ItemResponse` 骨架；后端 A10 已完成认证、用户、会话与角色权限模型底座，实现范围仅限 `users` / `auth` 内部 Schema、Service、认证上下文、装饰器与 Guard 底座；后端 A11 已完成最小公开认证 API 底座；后端 A12 已完成患者列表 / 创建 / 详情与患者访视列表 / 创建五个受保护最小公开 API，并完成 DTO、Controller、Service 单测与隔离 test database 上的真实 HTTP E2E；前端 B1 已完成 `/login`、`/dashboard`、Auth API Client 与认证状态 Hook；前端 B2 已完成患者列表 / 创建、患者详情 / 访视列表、访视创建、patients API Client 与认证工作区，使用 HttpOnly Cookie 会话且不读取 Cookie 或保存 token。患者编辑 / 删除 / 归档 / 合并、访视编辑 / 删除 / 详情 / 状态流转、MMSE / MoCA 评估执行、量表实例公开创建、作答提交、媒体上传、自动计分触发、认知域计算触发、报告、AI、用户管理、角色权限管理和权限菜单仍未实现。当前公开 API 为 `GET /health`、三个认证 API 与 A12 五个患者 / 访视 API。

## 18. 当前非目标

- 除后端 A1 已落地的 `ScaleDefinition` / `ScaleVersion` Schema、后端 A2 已落地的 `Patient` / `AssessmentVisit` / `ScaleInstance` Schema、后端 A3 已落地的 `ItemResponse` Schema、后端 A4 已落地的 `MediaEvidence` Schema、后端 A5 已落地的 `ScoreResult` Schema、后端 A6 已落地的 `CognitiveDomainResult` Schema、后端 A7 已落地的 `ClinicalReport` Schema，以及后端 A10 已落地的 `User` / `Session` Schema 外，不设计 AI、随访、审计或科研导出等后续数据库 Schema。
- 除 A12 已确认的患者 / 访视 DTO 与公开响应外，不提前定义其他业务请求 DTO 或前端调用契约。
- 不新增除 `GET /health`、三个认证 API 与 A12 五个患者 / 访视 API 以外的公开 API 路径。
- 除已落地的 `/`、`/login`、`/dashboard` 与 B2 四条患者 / 访视路由外，不实现其他前端业务页面路由。
- 不实现完整量表引擎。
- 不实现 MMSE / MoCA 页面。
- 不实现 A12 访视列表 / 创建之外的公开评估执行 API 或量表实例初始化公开接口。
- 不实现数据库 seed runner、seed 写库或公开 MMSE / MoCA 配置查询 API。
- 不实现真实作答提交、媒体上传 / 下载 / 签名 URL、MMSE / MoCA 专用自动计分规则、MMSE / MoCA 专用认知域规则、作答提交后自动计分或认知域计算触发、报告生成接口、医生确认写库流程、报告归档 / 更正 / 作废接口、PDF 导出、疾病诊断、AI 解释、公开用户管理 API、权限菜单或完整权限矩阵管理。
- 不实现 AI 能力。
- 不把 A12 / B2 写成完整患者管理或完整评估工作流；患者编辑 / 删除 / 归档 / 合并与访视编辑 / 删除 / 详情 / 状态流转仍未实现。
- 不生成正式需求规格说明书。
- 不创建新的业务文档。
- 不处理任何代码初始化或工程配置。

## 19. 路线图维护规则

- 本文档仅记录已确认事实、边界、阶段路线、非目标和维护规则。
- 新增业务事实时，应区分“已实现能力”“目标范围”“建议对象”“待确认事项”。
- 任何 API、DTO、数据库集合、路由、组件、权限矩阵、测试脚本或部署能力必须以实际代码、业务确认文档和对应 handoff 为准。
- 后续 backend / frontend handoff 只能在实际后端或前端阶段推进后，基于真实代码和最新提交单独更新。
- 如后续确认文档与本路线图冲突，应按最新业务确认结果更新本文件，并保留辅助诊断、医生确认、审计追溯和非居家自测等核心边界。
