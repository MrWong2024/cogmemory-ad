# CogMemory AD / 智忆评 后端 API 地图

## 1. 文档定位

本文档用于记录 CogMemory AD 后端 API 清单与对接摘要，供后续前后端协作、测试和交接使用。

## 2. 当前状态

- 当前只实现一个公共健康检查接口。
- 当前公开 API 仍只有 `GET /health`。
- 当前没有认证、用户、医生、患者、量表、评估、报告、短信、AI / LLM 或业务上传接口。
- 本次新增的 `ScalesModule` 仅为内部模型和 Service 底座，不新增 scale controller，不暴露公开业务 API。
- 本次新增的 `PatientsModule` 与 `AssessmentsModule` 仅为内部模型和 Service 底座，不新增 patient / assessment controller，不暴露患者、访视或量表实例公开业务 API。
- 本次新增的 `ItemResponse` 仅为 `assessments` 内部题目作答数据模型和 Service 读取底座，不新增 item-response controller，不暴露作答提交、作答查询、计分或媒体上传公开业务 API。
- 本次新增的 `MediaModule` 仅为内部媒体证据元数据模型和 Service 读取底座，不新增 media controller，不暴露媒体上传、媒体查询、媒体下载、媒体删除或签名 URL 公开业务 API。
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
- `backend\src\modules\patients` 当前没有 Controller。
- `PatientsService` 仅供后续后端业务模块内部读取患者 / 受试者基础档案。
- `backend\src\modules\assessments` 当前没有 Controller。
- `AssessmentsService` 仅供后续后端业务模块内部读取访视、量表实例运行时数据与题目作答数据。
- `backend\src\modules\media` 当前没有 Controller。
- `MediaEvidenceService` 仅供后续后端业务模块内部读取媒体证据元数据摘要。
- 当前不定义前端调用契约，不定义认证或权限，不提供 MMSE / MoCA 填写、作答提交、计分、报告、媒体上传或种子数据接口。

## 5. 后续同步规则

- API 事实以实际 Controller、路由配置、DTO 和测试为准。
- 未实现或未确认的接口不得提前写入为已存在。
- API 变更影响前端时，应同步更新 `docs\handoff\handoff-frontend-api-map.md`。
