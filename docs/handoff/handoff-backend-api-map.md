# CogMemory AD / 智忆评 后端 API 地图

## 1. 文档定位

本文档用于记录 CogMemory AD 后端 API 清单与对接摘要，供后续前后端协作、测试和交接使用。

## 2. 当前状态

- 当前只实现一个公共健康检查接口。
- 当前公开 API 仍只有 `GET /health`。
- 当前没有认证、用户、医生、患者、量表、评估、报告、短信、AI / LLM 或业务上传接口。
- 本次新增的 `ScalesModule` 仅为内部模型、Service 和 MMSE / MoCA 初始配置 seed 底座，不新增 scale controller，不暴露公开业务 API。
- 本次新增的 `PatientsModule` 与 `AssessmentsModule` 仅为内部模型和 Service 底座，不新增 patient / assessment controller，不暴露患者、访视或量表实例公开业务 API。
- 本次新增的 `ItemResponse` 仅为 `assessments` 内部题目作答数据模型和 Service 读取底座，不新增 item-response controller，不暴露作答提交、作答查询、计分或媒体上传公开业务 API。
- 本次新增的 `MediaModule` 仅为内部媒体证据元数据模型和 Service 读取底座，不新增 media controller，不暴露媒体上传、媒体查询、媒体下载、媒体删除或签名 URL 公开业务 API。
- 本次新增的 `ScoringModule` 仅为内部计分结果模型和 Service 底座，不新增 scoring controller，不暴露计分触发、计分查询、计分复核、报告或其他公开业务 API。
- 本次新增的 `CognitiveDomainsModule` 仅为内部认知域结果模型和 Service 底座，不新增 cognitive-domain controller，不暴露认知域计算触发、认知域查询、认知域复核、报告或其他公开业务 API。
- 本次新增的 `ReportsModule` 仅为内部临床报告模型、Service 读取和报告状态转换校验底座，不新增 reports controller，不暴露报告生成、报告查询、医生确认、归档、更正、作废、PDF 导出、AI 生成或其他公开业务 API。
- 本次新增的 `AssessmentExecutionService` 仅为 `assessments` 内部评估执行初始化编排底座，不新增 assessment execution controller，不暴露评估创建、量表实例初始化、作答提交、媒体上传、计分触发、认知域计算触发、报告生成或其他公开业务 API。
- 当前 API 事实以 `backend\src\app.controller.ts` 和对应测试为准。

## 3. 当前 API 清单

- 接口名称：健康检查
- Method：`GET`
- Path：`/health`
- 权限：公开
- 请求 DTO：无
- 响应摘要：`{ status: 'ok', service: 'cogmemory-ad-backend' }`
- 错误码：无专用业务错误码
- 调用方：运维检查、本地启动验证、自动化健康探针
- 备注：仅健康检查，不代表业务 API 已实现。

## 4. 当前未暴露接口说明

- `backend\src\modules\scales` 当前没有 Controller。
- `ScalesService` 仅供后续后端业务模块内部读取量表定义与版本配置。
- `ScaleSeedDataService` 仅供后续导入脚本、初始化任务或后端业务模块内部只读读取 MMSE / MoCA 初始配置 seed；当前不暴露公开 MMSE / MoCA 配置查询 API，不提供 seed 执行接口，不写数据库。
- `backend\src\modules\patients` 当前没有 Controller。
- `PatientsService` 仅供后续后端业务模块内部读取患者 / 受试者基础档案。
- `backend\src\modules\assessments` 当前没有 Controller。
- `AssessmentsService` 仅供后续后端业务模块内部读取访视、量表实例运行时数据与题目作答数据。
- `AssessmentExecutionService` 仅供后续后端业务模块内部基于 MMSE / MoCA seed 构建评估执行初始化计划，或内部创建 `ScaleInstance` 与初始 `ItemResponse` 骨架；当前不暴露公开 assessment execution controller、评估创建接口、量表实例初始化接口、作答提交接口或前端调用契约。
- `backend\src\modules\media` 当前没有 Controller。
- `MediaEvidenceService` 仅供后续后端业务模块内部读取媒体证据元数据摘要。
- `backend\src\modules\scoring` 当前没有 Controller。
- `ScoringService` 仅供后续后端业务模块内部读取计分结果摘要，并提供不落库的通用计分汇总纯函数。
- `backend\src\modules\cognitive-domains` 当前没有 Controller。
- `CognitiveDomainsService` 仅供后续后端业务模块内部读取认知域结果摘要，并提供不落库的通用认知域汇总纯函数。
- `backend\src\modules\reports` 当前没有 Controller。
- `ReportsService` 仅供后续后端业务模块内部读取临床报告摘要，并提供不落库的报告状态转换校验纯函数。
- 当前不定义前端调用契约，不定义认证或权限，不提供 MMSE / MoCA 填写、MMSE / MoCA 配置查询、seed 执行、公开评估创建、公开量表实例初始化、作答提交、计分触发、计分查询、计分复核、认知域计算触发、认知域查询、认知域复核、报告生成、报告查询、医生确认、归档、更正、作废、PDF 导出、媒体上传或其他种子数据接口。

## 5. 后续同步规则

- API 事实以实际 Controller、路由配置、DTO 和测试为准。
- 未实现或未确认的接口不得提前写入为已存在。
- API 变更影响前端时，应同步更新 `docs\handoff\handoff-frontend-api-map.md`。
