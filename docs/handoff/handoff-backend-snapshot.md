# CogMemory AD / 智忆评 后端事实快照

## 1. 文档定位与权威来源

本文只维护当前后端工程结构、主要模块的能力范围、关键架构边界与真实未实现边界。它不是 Schema、API、DTO、Service、配置、测试、患者施测合同、Roadmap 或 release notes 的替代品。

专项事实按以下 owner 查询：

- 产品阶段、工作包状态与当前主线见[路线图](./handoff-roadmap.md)。
- 受监督患者施测的稳定业务、安全、媒体、逐题及 F2 / F3 合同见[受监督患者施测合同](./handoff-patient-administration-contract.md)。
- endpoint、guard、请求 / 响应及错误边界见[后端 API 地图](./handoff-backend-api-map.md)。
- DTO、response 字段与 validation 见[后端 DTO 速查表](./handoff-backend-dto-cheatsheet.md)。
- Service 职责、调用关系与一致性机制见[后端 Service 职责地图](./handoff-backend-service-map.md)。
- 环境、数据库用途、端口与 Storage driver 配置见[后端环境与配置矩阵](./handoff-backend-config-matrix.md)。
- 历史决策及形成背景见[后端关键决策](./handoff-backend-decisions.md)。
- 测试治理、数据库隔离、fixture、verifier、cleanup 与 current / historical evidence 见[后端验证手册](./handoff-backend-testing-playbook.md)和[前端验证手册](./handoff-frontend-testing-playbook.md)。
- 当前实现细节以 `backend/src` 与 Git 为最终投影和演进追溯来源。

项目级采用 `reference, don't restate`：本快照只保留理解当前后端所需的模块级事实，专项 owner 已完整维护的细节不在此复制。

## 2. 当前工程结构

- 后端基于 NestJS、TypeScript 与 MongoDB / Mongoose，应用由根模块组合公共底座和各业务模块。
- 全局底座包括统一配置加载与 schema 校验、数据库连接门禁、请求 validation、统一异常响应和健康检查。
- `backend/src/modules` 当前包含 `storage`、`scales`、`patients`、`assessments`、`media`、`scoring`、`cognitive-domains`、`reports`、`clinical-history`、`users` 与 `auth`。
- Storage 通过私有抽象隔离业务代码与 fake / OSS driver；具体环境选择由配置 owner 维护。
- Controller、DTO、Schema 与 Service 按模块分层；具体 endpoint、字段和调用关系分别由对应 maps 与 current code 维护。

## 3. 当前主要模块与能力

### 3.1 Scales

- `ScalesModule` 维护版本化量表定义和运行目录，当前包含 MMSE / MoCA seed、按需物化能力与安全的量表目录投影。
- 题目呈现资产通过内部私有能力按量表版本和当前施测上下文受控读取，不作为公共静态资源或通用资产管理能力。
- MMSE 已具备受监督患者施测所需的 presentation config；逐题、媒体、播放和推进语义只由[受监督患者施测合同](./handoff-patient-administration-contract.md)与 current seed / code 维护。

### 3.2 Patients / Assessments

- `PatientsModule` 提供患者基础档案的最小创建与读取能力；完整编辑、归档、合并等运营能力尚未形成。
- `AssessmentsModule` 覆盖 Patient、Visit、ScaleInstance 与 ItemResponse 的执行底座，包括访视创建 / 读取及已落地的有限维护、量表实例初始化、正式答案草稿和整体提交。
- 正式 ItemResponse 写入与整体提交链已存在；提交一致性由可恢复写屏障保护，但具体 CAS、状态机和恢复算法只由 Service map 与 current code 维护。
- 受监督患者施测会话已接入 Assessments：患者短期会话与 staff 登录会话分离，患者侧原始事实不直接写入正式 ItemResponse。
- 患者施测 completed 后的临床复核继续复用既有 ScaleInstance 页面、A14 草稿、readiness 与 A16 整体提交链，不建立第二套正式答案工作流；详细边界见[受监督患者施测合同](./handoff-patient-administration-contract.md)。

### 3.3 Media / Patient Administration

- `MediaModule` 以 `MediaEvidence` 和私有 Storage 为基础，覆盖临床工作端媒体采集、短期访问、逻辑作废与重传。
- 受监督患者施测已具备患者 Evidence、音频 ASR 候选、安全 review projection 和受控 evidence adoption；原始媒体、机器候选与临床正式答案保持分离。
- Patient Administration 的会话、准备、same / cross device、逐题 Evidence、异常控制、复核和 F2 / F3 稳定合同统一见[受监督患者施测合同](./handoff-patient-administration-contract.md)，本快照不维护其状态机或逐题矩阵。

### 3.4 Scoring / Cognitive Domains

- `ScoringModule` 已提供基于正式提交结果的评分计算、最新结果读取、单题人工复核与显式确认。
- `CognitiveDomainsModule` 已提供基于确认评分的认知域计算与最新结果读取。
- 两个模块保持保守、可复核和非诊断边界；正式 submission 不自动触发评分或认知域计算。

### 3.5 Reports / Clinical History

- `ReportsModule` 已覆盖规则化报告生成、临床复核与确认、锁定、来源冻结、归档、版本化纠错、replacement 及历史版本读取。
- `ClinicalHistoryModule` 提供患者评估历史、指定历史报告详情所需的查询组合，以及基础随访趋势。
- 报告和历史能力复用正式 ItemResponse、评分、认知域与媒体投影；具体生命周期协议、权限和错误边界见 API / Service maps。

### 3.6 Users / Auth

- `UsersModule` 提供内部系统账号读取和安全投影底座，当前没有公开用户与角色管理能力。
- `AuthModule` 使用服务端 Session 与 HttpOnly Cookie 作为主登录态，提供登录、登出、当前用户，以及显式认证 / 角色 guard。
- 密码和会话凭证只持久化散列并保持安全响应边界；JWT 不是当前主登录态。

## 4. 当前关键架构边界

- 后端以 NestJS module 组织业务能力，以 MongoDB / Mongoose 持久化结构化业务事实；环境与数据库选择集中受配置门禁约束。
- staff 使用服务端登录 Session；患者施测使用独立、短期且受控的 patient session，两种身份不共享权限。
- Patient Administration 的原始作答、媒体、ASR 候选与现场观察不是正式 ItemResponse；只有临床复核后通过既有正式答案与整体提交链进入下游。
- 系统复用既有 ItemResponse、submission、scoring、domain 和 report 主链，没有第二套 Review / Observation 领域状态或旁路正式结果。
- Storage 对象保持私有并通过业务模块受控访问；数据库保存业务引用和元数据，不把二进制媒体作为结构化字段管理。
- 整体提交与评分 / 认知域计算是分离动作，系统不自动形成诊断。
- 接口、字段、Service 算法、配置和测试执行规则分别以对应 owner 为准；本快照不把这些细节再解释为模块事实。

## 5. 当前真实未实现边界

以下只描述后端能力缺口；是否属于当前产品阶段、一期范围或下一工作包由[路线图](./handoff-roadmap.md)决定。

- 公开用户 / 角色管理、账号生命周期、密码重置、OAuth / SSO 与短信验证码业务能力尚未实现。
- 患者完整编辑、更正、归档、删除与合并尚未形成；Visit 已有有限维护，但完整运营状态流转和知情者信息能力仍缺失。
- MoCA 的受监督患者多模态施测闭环尚未实现；现有 Patient Administration 能力不应被解释为自动覆盖全部量表。
- 评分仍缺少独立 lock、void、reopen、rerun、批量人工处理和历史生命周期；认知域仍缺少人工复核 / 确认、锁定、作废、重算、历史及跨量表组合能力。
- 报告仍缺少签名、逆向解锁 / 解冻 / 取消归档、纠错分支 / 取消，以及 PDF / Word / 打印等正式导出能力。
- 媒体仍缺少面向运营的跨患者 / 访视聚合、批量或分片上传、客户端直传、替换和物理删除等高级管理能力。
- 尚无公开量表管理后台、全量数据库 seed runner 或完整题目配置管理 API。
- AI / LLM、SMS 业务 Service，以及 HIS / EMR、计费、保险等第三方医院系统集成尚未实现。

## 6. 同步规则

- 只有后端工程结构、模块级 current capability、关键跨模块边界或真实未实现边界变化时，才更新本快照。
- API、DTO、Service、配置、测试或患者施测专项事实只更新各自 authoritative owner；本快照仅在其自身高层投影随之变化时同步。
- owner 已完整保留的细节从本快照删除属于 deduplication，不是 information loss；没有 Snapshot 职责变化时保持 zero diff。
