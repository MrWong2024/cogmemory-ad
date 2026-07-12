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
- 后端 A18 已完成“题目人工评分复核、受控审计与评分结果确认最小公开 API”真实代码阶段：新增 `PATCH .../item-scores/:itemResponseId/manual-review` 与 `POST .../score-results/:scoreResultId/confirm`。仅 `needs_review` / `manual_scored` 且计入总分的项目可编辑，`auto_scored` 与过程项不可覆盖；人工分值按当前 ScaleVersion range / step 校验，服务端使用 `summarizeItemScores()` 重新派生 total / group / scorePercent，并把受控追加事件写入 `metadata.a18ManualReview`。两个写接口使用公开 `updatedAt` + 请求 `expectedUpdatedAt` 做单 ScoreResult 文档乐观并发控制；队列清空后仍需显式确认才进入 `confirmed`，`qualityStatus=passed` 只表示评分完整性与复核流程通过，不表示临床诊断。A18 不锁定结果，不修改 Patient / Visit / ScaleInstance / ItemResponse，不创建认知域结果或报告。
- 后端 A19 已完成“确认评分驱动的认知域结果计算与安全查询最小公开 API”：新增 `POST .../cognitive-domain-results/compute` 与 `GET .../cognitive-domain-results/latest`。首次计算仅接受 runNo=1、confirmed / locked、confirmedAt 完整、qualityStatus=passed 且无 warning 的 ScoreResult；只读取其安全 itemScores 快照并与实例绑定 ScaleVersion 的 item、countsTowardTotal、score range、cognitiveDomainCodes 逐项校验，不重新读取原始作答判分。当前固定 mappingSource=scale_config、mappingMode=item_domain_codes、weight=1；同 item 同 domain 去重，多 domain 使用完整题分重叠归因且不平均拆分。结果固定 runNo=1、status=computed、isFinal=false，幂等且不支持重算；domainScores 不可跨 domain 求和解释为量表总分，不生成报告、诊断或 AI 内容。
- 后端 A20 已完成“访视级规则化临床报告草稿生成与安全查询最小公开 API”：新增 `POST /patients/:patientId/visits/:visitId/clinical-reports/generate` 与 `GET /patients/:patientId/visits/:visitId/clinical-reports/latest`。生成时显式选择 1-10 个同访视 completed / locked ScaleInstance；每个实例必须具有 confirmed / locked 的 runNo=1 ScoreResult 和有效 A19 CognitiveDomainResult。新报告固定 reportType=cognitive_assessment、reportVersion=1、status=draft、source=system_draft，使用患者 / 访视 / 历史量表版本 / 确认评分 / 认知域 / 有效媒体受控快照和规则化非 AI narrative；认知域尚未独立确认，重叠归因不可跨域求和，scorePercent 不是诊断概率。reportCode 使用确定性哈希，同 scope 幂等、不同 scope 冲突；不重生成、不生成 version 2 / PDF、不执行医生确认、不调用 AI，也不输出诊断或治疗建议。
- 后端 A21 已完成“报告草稿受控编辑、提交待确认与医生确认最小公开 API”：新增 draft PATCH、submit-confirmation POST 与 confirm POST。A21 只允许患者工作流角色补充 `doctorOpinion` 和可选 `recommendationText`，不编辑 A20 五段规则摘要或任何来源快照；成功编辑后 `source=mixed`。三个写接口均以 `expectedUpdatedAt` 做单 ClinicalReport 文档乐观并发，编辑向 `metadata.a21Edits` 追加最多 200 条内部事件，提交写 `a21Submission` 并进入 `pending_confirmation`，仅 doctor / admin 可写 `a21Confirmation` 并进入 `confirmed`、`qualityStatus=passed`、`isFinal=true`。确认不等于锁定，不修改任何来源数据，不执行 AI 或生成 PDF。
- 后端 A22 已完成“已确认 ClinicalReport 不可逆锁定、安全审计与幂等公开 API”：新增 `POST /patients/:patientId/visits/:visitId/clinical-reports/:reportId/lock`，仅 doctor / admin 可提交 `confirm=true`、trim 后 3-2000 的 `lockNote` 和最新 `expectedUpdatedAt`。首次锁定在单 ClinicalReport 文档一次条件更新中写 `lockedAt`、`lockedBy` 与一次性 `metadata.a22Lock`；status 继续为 confirmed、isFinal 继续为 true，不新增 locked 状态。重复锁定返回既有回执且不写库，历史报告可从完整 Schema 锁定字段安全 fallback。锁定不等于归档，不修改任何来源对象，不提供 unlock，不生成 PDF，不调用 AI；前端 B12 已完成对应锁定确认与安全展示。
- 后端 A23 已完成“已锁定 ClinicalReport 驱动的来源链冻结、可恢复编排与安全审计最小公开 API”：新增 doctor / admin 专用 `POST .../:reportId/freeze-sources`。冻结 scope 完全来自报告内的 ScaleInstance、评分、认知域和媒体引用，并在 `metadata.a23SourceFreeze` 固化实例下全部 ItemResponse 精确 ID；五类来源使用同一 `sourceLockedAt`，其中 computed CognitiveDomainResult 只写 lockedAt、不自动确认。编排使用 `in_progress / completed` 支持中断恢复和完成后幂等，不使用 Mongo transaction，completed 前允许存在部分来源已冻结；既有来源写入口增加 lockedAt 防御。不冻结 Patient、Visit 或 Storage，不提供 unfreeze。前端 B13 已完成确认、恢复与安全摘要接入。
- 后端 A24 已完成“已冻结 ClinicalReport 归档、安全审计、乐观并发与幂等公开 API”：新增 doctor / admin 专用 `POST .../:reportId/archive`，Body 只接收 `confirm=true`、`archiveNote`、`expectedUpdatedAt`。首次归档只接受完整 confirmed / mixed / passed、A22 已锁定且 A23 sourceFreeze completed 的报告，复用既有 `confirmed -> archived` 转换，以单文档条件更新写 status、archivedAt、archivedBy 与一次性 `metadata.a24Archive`；Patient inactive 与 Visit locked 不阻断，Patient / Visit 只用于存在性和 ownership。重复归档允许旧 expectedUpdatedAt 且不写库，历史 archived / corrected 支持安全 fallback；不重读或修改五类来源，不改变锁定、来源冻结、confirmation、narrative 或快照，不提供 unarchive / correction / void / PDF / AI。下一阶段为前端 B14 归档确认与安全摘要展示。
- 前端 B1 已进入并完成“登录页、认证状态与 Auth API 接入底座”真实代码阶段：当前新增 `/login`、`/dashboard`、Auth API Client、认证公开类型和 `useAuth()`；前端仅对接 `POST /auth/login`、`POST /auth/logout`、`GET /auth/me`，所有请求使用 `credentials: 'include'`。会话由后端 HttpOnly Cookie 维护，前端不读取 Cookie、不保存 token；`/dashboard` 仅为认证占位，不是完整医生工作台。
- 前端 B2 已进入并完成“患者档案与评估访视页面接入”真实代码阶段：当前新增 `/patients`、`/patients/new`、`/patients/[patientId]`、`/patients/[patientId]/visits/new`，真实对接 A12 五个患者 / 访视 API，提供患者分页与过滤、患者创建、患者详情、访视分页与过滤、访视创建以及 `/patients/**` 轻量认证工作区；`/dashboard` 已增加患者档案入口。
- 前端 B3 已进入并完成“访视详情与量表实例初始化页面接入”真实代码阶段：当前新增 `/patients/[patientId]/visits/[visitId]`，真实对接 A13 的 `GET /scales/available`、`GET /patients/:patientId/visits/:visitId`、`POST /patients/:patientId/visits/:visitId/scale-instances`；患者详情访视列表已有“打开访视”入口，页面可展示已有 MMSE / MoCA 实例，并为尚未存在的量表初始化实例与展示 ItemResponse 骨架数量。
- 前端 B4 已进入并完成“MMSE / MoCA 施测执行页与逐题手工作答草稿保存”真实代码阶段：当前新增 `/patients/[patientId]/visits/[visitId]/scale-instances/[scaleInstanceId]`，真实对接 A14 的单实例执行详情 GET 与单题草稿 PATCH；页面按服务端 groups / groupCode / order 动态展示安全分组与题目，支持普通回答、分步回答、提示后表现、缺失原因、计时草稿和操作者备注，并支持逐题保存与标记本题完成。保存后使用后端 itemResponse 与 progress 响应更新当前页面，不重新加载整页。
- 前端 B5 已进入并完成“题目 photo / handwriting 媒体证据闭环”真实代码阶段：在既有量表实例施测路由中真实接入 A15 的题目媒体列表、multipart 上传、短期访问地址和作废四个接口；photo 源图先经浏览器 Canvas 解码并重编码为受控 JPEG，移动端文件输入可提示后置摄像头；handwriting 使用 1200 × 800 逻辑画布并生成最终 PNG 与默认启用的 strokes JSON。页面支持安全历史列表、内联图片预览、轨迹文件入口、作废后重传、只读历史查看，以及跨分组保留但刷新即丢失的内存媒体草稿。
- 前端 B6 已进入并完成“量表提交完整性检查、问题定位与正式提交交互”真实代码阶段：在既有量表实例执行路由真实接入 A16 readiness GET 与 submit POST，展示统计、阻断问题和不阻断警告，支持跨分组定位题目、readiness 过期提示、本地未保存作答 / 媒体及进行中写请求阻断、内联二次确认和提交期间临时只读。提交成功或幂等 `alreadySubmitted=true` 后使用服务端响应切换实例为 completed，只保留当前会话 submission 回执；不修改 Visit 或 ItemResponse，不执行评分。
- 前端 B7 已进入并完成“阶段性评分计算、待人工复核清单与安全结果展示”真实代码阶段：在既有量表实例执行路由接入 A17 latest GET 与 compute POST；completed 实例无结果时必须由用户阅读说明、勾选确认后才发送 `{ confirm: true }`，页面加载与正式提交均不自动计算，也不支持重算。页面直接展示服务端阶段性总分、分组得分、题目分值、计算警告与 reviewQueue，并复用 B6 题目定位机制进行只读核对；不重新计算任何分数、比例、状态或复核队列。
- 前端 B8 已进入并完成“题目人工评分复核、乐观并发与 ScoreResult 显式确认”真实代码阶段：在既有量表实例路由接入 A18 manual-review PATCH 与 confirm POST；needs_review 项可按服务端 min / max 录入人工分值与依据，manual_scored 项在确认前可修订，自动评分与过程项不可覆盖。expectedUpdatedAt 直接使用表单展开时读取的服务端 updatedAt；并发冲突保留本地输入、刷新 latest 且不自动重试或覆盖。人工评分成功后的 total / group / item / reviewQueue 全部使用完整服务端响应；队列清空后仍由用户显式确认，confirmed 后评分区域只读，confirmed 不等于 locked，qualityStatus=passed 只表示评分复核流程通过。
- 前端 B9 已进入并完成“认知域结果计算、重叠归因说明与安全结果展示”真实代码阶段：在既有量表实例路由接入 A19 latest GET 与 compute POST。评分 confirmed / locked / voided 且实例允许历史读取时才查询 latest；无结果时由用户阅读重叠归因与非诊断说明、勾选确认后首次计算，页面不自动 compute、不重算。页面按服务端事实展示 domainScores、itemContributions、mapping、computation、versionTrace 与来源评分安全摘要，贡献记录可复用既有定位回原题；多认知域保留完整分值重叠归因，domainScores 不跨域求和，scorePercent 不解释为诊断概率。新结果为 computed 且尚未独立确认。
- 前端 B10 已完成访视级规则化报告 scope、generate / latest 与安全只读展示；前端 B11 已在同一访视详情路由接入 A21 draft PATCH、submit-confirmation POST 与 confirm POST。B11 只允许编辑 `doctorOpinion` / `recommendationText`，三个写请求均使用服务端 `report.updatedAt` 作为 `expectedUpdatedAt`；冲突保留本地输入、自动刷新一次 latest、标记 stale，且不自动覆盖或重发。
- B11 复用 `PatientsWorkspaceShell` 已取得的安全用户，通过轻量 Context 只把 roles 用于确认入口可见性，没有第二次 `/auth/me`。draft 可受控编辑，提交后进入 pending_confirmation；仅 doctor / admin 显示最终确认入口，nurse / research_assistant 只读等待。confirmed 使用服务端 `isFinal=true` 并进入只读，但 confirmed 不等于 locked。
- 前端 B12 已在同一访视详情路由接入 A22 lock API。仅 doctor / admin 对满足 confirmed、passed、isFinal、完整确认摘要、未锁定、访视可写且无其他写操作 / 本地草稿的报告显示锁定入口；请求只发送 `confirm=true`、trim 后 `lockNote` 与服务端 `updatedAt`。冲突保留说明、清除 checkbox、刷新 latest 一次且不自动重发或覆盖；`alreadyLocked=true` 作为正常成功。
- 前端 B13 已在同一访视详情路由接入 A23 freeze-sources。仅 doctor / admin 显示可用首次冻结或恢复入口；请求只发送 `confirm=true`、trim 后 `freezeNote` 与当前服务端 `report.updatedAt`。`sourceFreeze=null / in_progress / completed` 分别表示尚未冻结、同一流程尚未完整完成、固定 scope 已验证完成冻结；in_progress 可能已有部分来源被冻结且不会自动回滚。恢复沿用服务端原 freezeId、freezeNote 与 scope，不生成新 ID、不覆盖首次说明；`resumedExisting` 表示既有流程恢复完成，`alreadyFrozen` 表示 completed 幂等且未重复写入。页面只展示五类来源及合计的 expected / completed / newly / previously 安全计数，不公开来源 ID，不自动轮询、重试或恢复。
- 当前后端与前端已形成“逐题记录 → 媒体证据 → readiness → 实例提交 → 阶段性评分 → 人工评分 → 评分确认 → 认知域计算与安全展示 → 访视级规则报告 → 受控编辑 → 提交待确认 → 医生 / 管理员确认 → 不可逆锁定”的最小闭环。锁定后 status 继续为 confirmed，锁定事实由 `lockedAt` 与安全 `lock` 摘要表达；锁定只作用于 ClinicalReport，不锁定来源数据。现状仍不代表完整患者管理、批量 / 自动保存、评分 lock / void / rerun、认知域人工修改 / 确认 / 锁定 / 作废 / 重算、报告退回 / 签名 / unlock / 归档 / 更正 / 作废 / PDF、疾病诊断或 AI 已完成。
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

当前进度：后端 A1-A24 与前端 B1-B13 已完成各自当前阶段。当前报告闭环为 generate / latest / edit draft / submit confirmation / confirm / lock / freeze-sources / archive；归档保留报告锁定和 completed 来源冻结事实，重复请求只读幂等。仍无 unlock / unfreeze / unarchive、更正、作废、签名、PDF 或 AI；下一阶段建议为前端 B14 归档确认与安全摘要展示。

A16 接续更新：后端已开放 readiness 与 submit；重复 submit 返回既有安全审计摘要且不重写 submissionId / completedAt / durationMs。A16 本身不执行评分；评分计算、人工复核和确认分别由后续 A17 / A18 显式接口承担。

A17 / B7 接续更新：后端已开放阶段性 compute / latest；前端 B7 已在既有执行页完成安全接入。只对 completed 实例提供首次计算入口，固定 runNo=1；结果可查看阶段性 total / group / item、reviewQueue、版本和配置警告，待复核项目可定位回原题。前端不自动计算、不支持重算、不从作答推导得分。

A18 / B8 接续更新：前端已接入单题 manual-review 与 ScoreResult confirm。人工评分不修改原始作答；修订表单一致预填服务端最新人工分值与公开意见，前端只做 min / max 基础校验且不猜测 step。expectedUpdatedAt 使用服务端 updatedAt；冲突刷新 latest 并要求用户明确基于最新结果继续。显式确认后为 confirmed / isFinal=true，但不是 locked；qualityStatus=passed 不代表患者正常。当前仍无评分 lock、void、撤销确认、reopen、重跑、报告或 AI；A19 认知域接口现由 B9 在同页接入。

A19 接续更新：认知域计算必须由用户显式提交 `{ confirm: true }`，只使用已确认评分安全快照和历史实例绑定版本。单题多 domain 采用完整分值重叠归因，同题同域去重，weight 固定 1；没有分值拆分，也没有 MMSE / MoCA itemCode 或 domain title 硬编码。结果 status=computed、isFinal=false，computed 不等于 confirmed / locked；当前不提供人工修改、确认、锁定、作废、重算、报告或诊断。前端 B9 已安全展示 domain score、贡献、覆盖 / 排除计数、映射与计算版本，并明确分数不可跨 domain 求和。

B9 接续更新：前端已按来源 ScoreResult 事实编排 latest 状态，评分 confirmed / locked / voided 可查询历史；confirmed / locked、isFinal=true、实例 completed、访视状态允许且无本地 dirty / writing 时才开放首次计算确认。结果展示包含 domainScores、itemContributions、mapping policy / interpretation、computation、warning、versionTrace 和来源评分摘要，并支持按 itemResponseId 定位原题。页面固定说明完整分值重叠归因、跨域不可求和、scorePercent 不是疾病概率、结果不能单独形成诊断；已有结果只可重新加载 GET，不提供重新计算。认知域修改、确认、锁定、作废和 AI 仍未实现；B10 已在访视详情页接入 A20。

A20 接续更新：报告是 AssessmentVisit 级资源，由调用方显式选择同访视 1-10 个量表实例作为 scope。首次生成只读取已验证的确认评分、确定性认知域结果和有效 photo / handwriting 媒体索引，单次创建完整 reportVersion=1 draft；不修改任何来源数据。规则化 narrative 明确 draft、未医生确认、认知域未独立确认、未使用 AI、无诊断阈值 / 疾病判断 / 治疗建议 / 趋势分析。前端 B10 已接入 generate / latest 并展示安全报告，B11 在此基础上接入 A21 受控工作流。

A21 接续更新：后端只开放 clinician-owned `doctorOpinion` / `recommendationText`，使用受控 metadata 审计和 `updatedAt` 乐观并发完成 draft → pending_confirmation → confirmed；重复 submit / confirm 安全幂等。confirmed 仅表示当前 reportVersion=1 已经医生或管理员确认，不设置 lockedAt，不锁定来源记录。仍无退回 / reopen、签名、lock、archive、correct、void、重生成、version 2、PDF 或 AI。

A22 接续更新：锁定是 confirmed 报告上的不可逆正交事实，由 `lockedAt`、`lockedBy` 与安全 `a22Lock` 审计表达，不改变 ClinicalReportStatus、qualityStatus、confirmation、reportVersion、reportCode、narrative 或快照。首次锁定校验报告自身 A20/A21 完整性并用 updatedAt 乐观并发；不重读或锁定 Patient、Visit、ScaleInstance、ItemResponse、ScoreResult、CognitiveDomainResult、MediaEvidence 或 Storage。重复请求即使持有旧 updatedAt 也只读返回原锁定回执；仍无 unlock / reopen / return / reject、archive / correct / void、PDF、Storage 文件或 AI。

B10 接续更新：前端在 `/patients/[patientId]/visits/[visitId]` 自动查询 A20 latest，查询状态独立于访视详情和量表目录；无报告时由用户从 completed / locked 实例中明确选择 1-10 项并二次确认，页面不自动 generate，也不扇出 A17 / A19 readiness 请求。生成请求只发送 `confirm=true` 与稳定排序、规范化且无重复的实例 ID；alreadyGenerated 按成功处理，scope conflict / voided / generation conflict 只自动查询一次 latest，不覆盖、不重发 POST。页面安全展示 patient / visit / scale / score / domain / evidence / narrative / generation 与历史 confirmation，明确 system_draft、未使用 AI、尚未经医生确认、认知域未独立确认及非诊断边界；B11 已在该展示基础上补齐受控编辑、提交和确认，仍无 PDF、下载、重生成或 version 2。

B11 接续更新：前端继续复用访视详情路由，不新增报告路由。`ClinicalReport` 已扩展 clinician-owned narrative、editorial、submission、confirmationId 与三类回执；PATCH 只发送 doctorOpinion、可选 recommendationText、editNote、expectedUpdatedAt，submit / confirm 分别只发送 confirm、对应 note、expectedUpdatedAt。系统五段摘要、scope 与所有结构化快照不可编辑。source=mixed 只表示规则内容与临床人员补充并存，不表示 AI；generation.aiUsed=false 继续表示 A20 规则生成未使用 AI。pending_confirmation 不可编辑，confirmed / archived / corrected / voided 只读；confirmed 不等于 locked。当前仍无退回、reject、reopen、withdraw、签名、lock、archive、correct、void、重生成、version 2、PDF、下载或 AI 操作。

B12 接续更新：前端继续复用 `/patients/[patientId]/visits/[visitId]`，不新增路由。锁定采用 lockNote + 可见 checkbox 的内联二次确认，并复用 B11 单一工作流写锁、roles、latest、unauthorized 与完整 report 应用路径。expectedUpdatedAt 只取服务端 `report.updatedAt`；LOCK_CONFLICT 保留 lockNote、清 checkbox、自动 latest 一次、标记 stale，不自动 POST 或覆盖。成功完整采用后端 report 与当前会话 lockReceipt；status 保持 confirmed，lockedAt 为主锁定事实，lock 为安全审计摘要，isFinal 直接使用服务端值。已锁定报告 edit / submit / confirm / lock 全部只读。未实现 unlock / reopen / return / reject / withdraw、archive / correct / void、签名、PDF / 下载 / Storage 文件、来源数据锁定或 AI。

B13 接续更新：前端继续复用同一访视详情路由和 B11/B12 单一报告写锁，不新增 route、Auth 请求或 latest。首次冻结要求 confirmed / mixed / passed / isFinal、报告锁定摘要一致、sourceFreeze=null、Visit 为 draft / in_progress / completed且没有其他写请求或本地草稿；恢复仅要求服务端 in_progress 安全摘要、当前 report.updatedAt 与 doctor / admin，不因 Visit 后续 locked / voided 擅自阻断。首次说明由用户填写 3–2000 字并二次确认；恢复说明只读且必须来自服务端。冲突、incomplete、failed 等最多 latest 一次，不自动 POST 或恢复；网络不确定结果只提供手工 latest。页面明确 A23 不使用 Mongo transaction、completed 前可能部分冻结、无自动回滚 / unfreeze，且 Patient、Visit、Storage 未冻结；CognitiveDomainResult 冻结不等于确认。仍无 archive / correct / void / PDF / 下载或 AI。

## 18. 当前非目标

- 除后端 A1 已落地的 `ScaleDefinition` / `ScaleVersion` Schema、后端 A2 已落地的 `Patient` / `AssessmentVisit` / `ScaleInstance` Schema、后端 A3 已落地的 `ItemResponse` Schema、后端 A4 已落地的 `MediaEvidence` Schema、后端 A5 已落地的 `ScoreResult` Schema、后端 A6 已落地的 `CognitiveDomainResult` Schema、后端 A7 已落地的 `ClinicalReport` Schema，以及后端 A10 已落地的 `User` / `Session` Schema 外，不设计 AI、随访、审计或科研导出等后续数据库 Schema。
- 除 A12 / A13 / A14 与 A15 已确认的患者、访视、量表目录、实例初始化、执行详情、单题草稿和媒体证据 DTO / 公开响应外，不提前定义其他业务请求 DTO 或前端调用契约。
- 不新增除当前 A11-A23 已确认接口以外的公开 API 路径。
- 除已落地的 `/`、`/login`、`/dashboard`、B2 四条患者 / 访视路由、B3 访视详情路由与 B4 量表实例施测执行路由外，不实现其他前端业务页面路由。
- 不实现完整量表引擎。
- 不实现独立人工评分路由或报告页面；B8 只在既有量表实例页完成 A18 单题人工复核与评分确认交互。
- 不实现 A14、A15 与 A16 已确认接口之外的其他公开评估执行 API。
- 不实现全量数据库 seed runner、量表配置编辑或公开完整 MMSE / MoCA 题目配置查询 API；A13 仅在初始化时按需物化对应 seed 版本。
- 不实现撤销 / reopen / force submit、批量或自动保存、媒体批量 / 分片 / 客户端直传、永久公开 URL、物理删除或原子替换、MMSE / MoCA 专用自动计分、weighted mapping、认知域人工修改 / 确认 / 锁定 / 重算、提交后自动计分、报告退回 / 签名 / unlock / 归档 / 更正 / 作废 / 重生成 / version 2、PDF、疾病诊断、AI、公开用户管理或权限菜单。
- 不实现 AI 能力。
- 不把 A12-A24 或 B2-B13 写成完整患者管理或完整评估工作流；患者编辑 / 删除 / 归档 / 合并与访视编辑 / 删除 / 状态流转仍未实现，A18 confirmed 不等同于 locked，A19 computed 不等同于认知域 confirmed，A21 confirmed 不自动等于 locked；A22 / B12 只锁报告，A23 / B13 再按已锁报告固化的精确 scope 冻结来源，A24 只归档完成冻结的报告，但不冻结或归档 Patient、Visit、Storage，也不提供 unfreeze / unarchive。
- 不生成正式需求规格说明书。
- 不创建新的业务文档。
- 不处理任何代码初始化或工程配置。

## 19. 路线图维护规则

- 本文档仅记录已确认事实、边界、阶段路线、非目标和维护规则。
- 新增业务事实时，应区分“已实现能力”“目标范围”“建议对象”“待确认事项”。
- 任何 API、DTO、数据库集合、路由、组件、权限矩阵、测试脚本或部署能力必须以实际代码、业务确认文档和对应 handoff 为准。
- 后续 backend / frontend handoff 只能在实际后端或前端阶段推进后，基于真实代码和最新提交单独更新。
- 如后续确认文档与本路线图冲突，应按最新业务确认结果更新本文件，并保留辅助诊断、医生确认、审计追溯和非居家自测等核心边界。
