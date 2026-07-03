# CogMemory AD / 智忆评 后端 API 地图

## 1. 文档定位

本文档用于记录 CogMemory AD 后端 API 清单与对接摘要，供后续前后端协作、测试和交接使用。

## 2. 当前状态

- 当前后端 API 地图处于初始化阶段。
- 当前不定义真实 API 路径。
- 当前不定义真实权限、请求 DTO、响应结构或错误码。

## 3. API 记录格式

后续每个 API 建议按以下格式记录：

- 接口名称：
- Method：
- Path：
- 权限：
- 请求 DTO：
- 响应摘要：
- 错误码：
- 调用方：
- 备注：

## 4. 当前 API 清单

- 当前暂无已确认 API。
- 后续新增或修改接口时，必须同步记录 method、path、权限、请求 DTO、响应摘要、错误码和调用方。

## 5. 后续同步规则

- API 事实以实际 Controller、路由配置、DTO 和测试为准。
- 未实现或未确认的接口不得提前写入为已存在。
- API 变更影响前端时，应同步更新 `docs\handoff\handoff-frontend-api-map.md`。
