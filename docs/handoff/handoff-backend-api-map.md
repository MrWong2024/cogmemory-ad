# CogMemory AD / 智忆评 后端 API 地图

## 1. 文档定位

本文档用于记录 CogMemory AD 后端 API 清单与对接摘要，供后续前后端协作、测试和交接使用。

## 2. 当前状态

- 当前只实现一个公共健康检查接口。
- 当前没有认证、用户、医生、患者、量表、评估、报告、短信、AI / LLM 或业务上传接口。
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

## 4. 后续同步规则

- API 事实以实际 Controller、路由配置、DTO 和测试为准。
- 未实现或未确认的接口不得提前写入为已存在。
- API 变更影响前端时，应同步更新 `docs\handoff\handoff-frontend-api-map.md`。
