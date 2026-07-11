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
- 后端 A13 已完成“访视详情、可用量表目录与量表执行初始化最小公开 API”真实代码阶段：当前新增 `GET /scales/available`、`GET /patients/:patientId/visits/:visitId`、`POST /patients/:patientId/visits/:visitId/scale-instances`；三个接口均显式使用 `SessionAuthGuard` + `RolesGuard`，仅允许 `admin`、`doctor`、`nurse`、`research_assistant`。MMSE / MoCA 目录来自经校验 seed 且读取目录不写库；第一次初始化时按需幂等物化 `ScaleDefinition` / `ScaleVersion`，不覆盖已有配置；同访视同量表当前仅允许一份实例；初始化创建 `ScaleInstance` 与 `ItemResponse` 骨架，批量题目创建失败时采用补偿清理而非 Mongo transaction。
- 后端 A14 已完成“量表实例执行详情与单题作答草稿保存最小公开 API”真实代码阶段：当前新增 `GET /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId` 与 `PATCH /patients/:patientId/visits/:visitId/scale-instances/:scaleInstanceId/item-responses/:itemResponseId`。执行详情只返回安全量表身份、分组、题目配置、现有草稿与实际进度；PATCH 只更新单条 `ItemResponse` 草稿，不执行评分，不自动修改访视或实例状态。分步和提示后表现只能更新既有槽位，实际进度按 `ItemResponse` 的 `answered` / `scored` 状态实时派生；公开响应不返回完整 scoringRule、expectedValue、正确答案或 score / isCorrect / scoreValue。
- 后端 A15 已完成“图片与平板手写媒体证据最小公开 API”真实代码阶段：新增题目下证据列表、multipart 上传、短期签名访问和作废四个接口；首阶段仅支持 photo 与 handwriting，手写必须包含最终渲染图片并可选携带规范化 JSON / strokes 轨迹。上传写入当前 Storage driver、创建 `MediaEvidence` 并原子绑定 `ItemResponse.evidenceRefs`；作废保留审计记录和存储对象，替换流程为先作废再重新上传。上传与作废不修改 ItemResponse、ScaleInstance 或 AssessmentVisit 状态，不计分；一致性使用补偿策略而非 Mongo transaction。
- 后端 A16 已完成“量表实例 submission readiness 与最终提交最小公开 API”真实代码阶段：新增只读 readiness GET 与幂等 submit POST。readiness 通用检查版本项目集合、题目完成、有效作答、缺失原因、必填步骤、计时、photo / handwriting 证据和操作者备注；同时配置 photo / handwriting 时按采集方式二选一。正式提交仅将 `ScaleInstance` 原子迁移为 `completed`，保留 `AssessmentVisit` 与 `ItemResponse` 状态，写入受控 `metadata.submission` 审计；采用提交前二次实时检查与单实例条件更新，不是跨集合 transaction，不执行评分。
- 后端 A17 已完成“阶段性混合评分预计算、待人工复核清单与安全结果查询最小公开 API”真实代码阶段：新增 `POST .../score-results/compute` 与 `GET .../score-results/latest`。首次计算只允许 completed ScaleInstance，固定 `runNo=1` 并幂等；仅严格数值 / 布尔 `multi_step_manual` 自动评分，其他人工模式、missing 和既有 ItemResponse 题分进入复核，`countsTowardTotal=false` / `raw_record_only` 过程项正确排除。阶段性总分只累计可靠自动得分，存在待复核项时 `scorePercent=null`、`isFinal=false`；不修改 Patient、Visit、ScaleInstance、ItemResponse，不确认或锁定评分，不创建认知域结果或报告。
- 前端 B1 已进入并完成“登录页、认证状态与 Auth API 接入底座”真实代码阶段：当前新增 `/login`、`/dashboard`、Auth API Client、认证公开类型和 `useAuth()`；前端仅对接 `POST /auth/login`、`POST /auth/logout`、`GET /auth/me`，所有请求使用 `credentials: 'include'`。会话由后端 HttpOnly Cookie 维护，前端不读取 Cookie、不保存 token；`/dashboard` 仅为认证占位，不是完整医生工作台。
- 前端 B2 已进入并完成“患者档案与评估访视页面接入”真实代码阶段：当前新增 `/patients`、`/patients/new`、`/patients/[patientId]`、`/patients/[patientId]/visits/new`，真实对接 A12 五个患者 / 访视 API，提供患者分页与过滤、患者创建、患者详情、访视分页与过滤、访视创建以及 `/patients/**` 轻量认证工作区；`/dashboard` 已增加患者档案入口。
- 前端 B3 已进入并完成“访视详情与量表实例初始化页面接入”真实代码阶段：当前新增 `/patients/[patientId]/visits/[visitId]`，真实对接 A13 的 `GET /scales/available`、`GET /patients/:patientId/visits/:visitId`、`POST /patients/:patientId/visits/:visitId/scale-instances`；患者详情访视列表已有“打开访视”入口，页面可展示已有 MMSE / MoCA 实例，并为尚未存在的量表初始化实例与展示 ItemResponse 骨架数量。
- 前端 B4 已进入并完成“MMSE / MoCA 施测执行页与逐题手工作答草稿保存”真实代码阶段：当前新增 `/patients/[patientId]/visits/[visitId]/scale-instances/[scaleInstanceId]`，真实对接 A14 的单实例执行详情 GET 与单题草稿 PATCH；页面按服务端 groups / groupCode / order 动态展示安全分组与题目，支持普通回答、分步回答、提示后表现、缺失原因、计时草稿和操作者备注，并支持逐题保存与标记本题完成。保存后使用后端 itemResponse 与 progress 响应更新当前页面，不重新加载整页。
- 前端 B5 已进入并完成“题目 photo / handwriting 媒体证据闭环”真实代码阶段：在既有量表实例施测路由中真实接入 A15 的题目媒体列表、multipart 上传、短期访问地址和作废四个接口；photo 源图先经浏览器 Canvas 解码并重编码为受控 JPEG，移动端文件输入可提示后置摄像头；handwriting 使用 1200 × 800 逻辑画布并生成最终 PNG 与默认启用的 strokes JSON。页面支持安全历史列表、内联图片预览、轨迹文件入口、作废后重传、只读历史查看，以及跨分组保留但刷新即丢失的内存媒体草稿。
- 前端 B6 已进入并完成“量表提交完整性检查、问题定位与正式提交交互”真实代码阶段：在既有量表实例执行路由真实接入 A16 readiness GET 与 submit POST，展示统计、阻断问题和不阻断警告，支持跨分组定位题目、readiness 过期提示、本地未保存作答 / 媒体及进行中写请求阻断、内联二次确认和提交期间临时只读。提交成功或幂等 `alreadySubmitted=true` 后使用服务端响应切换实例为 completed，只保留当前会话 submission 回执；不修改 Visit 或 ItemResponse，不执行评分。
- 当前后端已具备 A1-A17 对应模型 / Service 底座、认证、临床 API 和阶段性保守评分闭环；前端 B1-B6 已形成“逐题记录 → 媒体证据 → 完整性检查 → 实例提交”的最小闭环。现状不代表完整患者管理、批量 / 自动保存、媒体批量 / 直传 / 物理删除 / 原子替换、人工评分复核 / 确认、认知域、报告、疾病诊断或 AI 已完成。
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

当前进度：A1-A15 已完成既有模型、认证、患者 / 访视、执行草稿与媒体证据能力；A16 已新增 submission readiness 与 submit 两个 API。A16 完成 `ScaleInstance`，但不完成或锁定 `AssessmentVisit`，不修改 `ItemResponse`，不创建评分、认知域或报告结果。前端 B1-B6 已完成认证、患者 / 访视、实例初始化、逐题手工草稿、媒体采集、readiness 问题定位和正式实例提交；本地 dirty / 写请求会阻断提交，题目或媒体写成功后需重新检查。当前公开 API 在 A15 清单上新增两个 A16 接口。

A16 接续更新：后端已开放 readiness 与 submit；重复 submit 返回既有安全审计摘要且不重写 submissionId / completedAt / durationMs。A16 本身不执行评分；当前仍无批量 / 分片 / 客户端直传、物理删除、原子替换、OCR / AI、人工评分复核 / 确认、认知域计算与报告 API。

A17 接续更新：后端已开放阶段性 compute / latest；只对 completed 实例首次计算，固定 runNo=1。MMSE / MoCA 连续减 7 可按真实 seed 的严格步骤与 MoCA aggregationRule 自动计算，其余计分项保守进入 reviewQueue，非计分过程项不进入复核。当前仍无人工评分录入、修改、确认、锁定、作废或重跑；下一阶段需建设人工复核与评分确认。

## 18. 当前非目标

- 除后端 A1 已落地的 `ScaleDefinition` / `ScaleVersion` Schema、后端 A2 已落地的 `Patient` / `AssessmentVisit` / `ScaleInstance` Schema、后端 A3 已落地的 `ItemResponse` Schema、后端 A4 已落地的 `MediaEvidence` Schema、后端 A5 已落地的 `ScoreResult` Schema、后端 A6 已落地的 `CognitiveDomainResult` Schema、后端 A7 已落地的 `ClinicalReport` Schema，以及后端 A10 已落地的 `User` / `Session` Schema 外，不设计 AI、随访、审计或科研导出等后续数据库 Schema。
- 除 A12 / A13 / A14 与 A15 已确认的患者、访视、量表目录、实例初始化、执行详情、单题草稿和媒体证据 DTO / 公开响应外，不提前定义其他业务请求 DTO 或前端调用契约。
- 不新增除当前 A11-A17 已确认接口以外的公开 API 路径。
- 除已落地的 `/`、`/login`、`/dashboard`、B2 四条患者 / 访视路由、B3 访视详情路由与 B4 量表实例施测执行路由外，不实现其他前端业务页面路由。
- 不实现完整量表引擎。
- 不实现人工评分复核、评分确认和报告页面；A16 最终提交只完成实例，A17 只生成阶段性待确认结果。
- 不实现 A14、A15 与 A16 已确认接口之外的其他公开评估执行 API。
- 不实现全量数据库 seed runner、量表配置编辑或公开完整 MMSE / MoCA 题目配置查询 API；A13 仅在初始化时按需物化对应 seed 版本。
- 不实现撤销 / reopen / lock / force submit、批量或自动保存、媒体批量 / 分片 / 客户端直传、永久公开 URL、物理删除或原子替换、MMSE / MoCA 专用自动计分规则、认知域规则、提交后自动计分、报告生成、医生确认、PDF、疾病诊断、AI、公开用户管理或权限菜单。
- 不实现 AI 能力。
- 不把 A12 / A13 / A14 / A15 / A16 / B2 / B3 / B4 / B5 / B6 写成完整患者管理或完整评估工作流；患者编辑 / 删除 / 归档 / 合并与访视编辑 / 删除 / 状态流转仍未实现，B6 只完成 ScaleInstance，不等同于计分、认知域、报告或 AI。
- 不生成正式需求规格说明书。
- 不创建新的业务文档。
- 不处理任何代码初始化或工程配置。

## 19. 路线图维护规则

- 本文档仅记录已确认事实、边界、阶段路线、非目标和维护规则。
- 新增业务事实时，应区分“已实现能力”“目标范围”“建议对象”“待确认事项”。
- 任何 API、DTO、数据库集合、路由、组件、权限矩阵、测试脚本或部署能力必须以实际代码、业务确认文档和对应 handoff 为准。
- 后续 backend / frontend handoff 只能在实际后端或前端阶段推进后，基于真实代码和最新提交单独更新。
- 如后续确认文档与本路线图冲突，应按最新业务确认结果更新本文件，并保留辅助诊断、医生确认、审计追溯和非居家自测等核心边界。
