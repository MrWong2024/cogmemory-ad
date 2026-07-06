# CogMemory AD / 智忆评 前端 API 对接地图

## 1. 文档定位

本文档用于记录 CogMemory AD 前端对接后端 API 的调用方、参数、响应、错误处理和 UI 映射。

## 2. 当前状态

- 当前只初始化 app/src 公共底座。
- 当前没有 API client。
- 当前没有 BFF 代理。
- 当前首页不调用后端。
- 当前 not-found 页面不调用后端。
- 当前不定义任何业务 API。

## 3. 当前环境变量读取

- 调用方：`frontend\src\lib\env.ts`
- 读取项：`NEXT_PUBLIC_API_BASE_URL`
- 安全默认值：`http://localhost:5002`
- 导出对象：`frontendEnv.apiBaseUrl`
- 备注：该工具只读取公开环境变量，不调用后端，不写入密钥，不定义业务 API path

## 4. 当前 API 对接清单

- 当前暂无已确认前端 API 对接。
- 当前暂无已确认页面调用后端接口。
- 当前暂无真实请求参数、响应摘要、错误处理或 UI 映射。

## 5. 后续同步规则

- 前端 API 对接事实以后端 API 文档、前端调用代码和测试为准。
- 不得在后端 API 未确认前编造前端对接事实。
- 后端接口变化时，应同步检查本文件是否需要更新。
