# CogMemory AD / 智忆评 后端事实快照

## 1. 文档定位

本文档用于记录 CogMemory AD 后端当前事实快照，帮助后续交接时快速判断后端工程、模块、接口和验证能力的真实状态。

## 2. 当前工程状态

- `backend` 根目录公共骨架已初始化改造。
- 当前仅包含后端根目录配置、包管理和工程配置文件。
- 已存在 `backend\package.json` 与 `backend\package-lock.json`，后端 npm package name 为 `cogmemory-ad-backend`。
- 本地默认后端端口为 `5002`。
- 本地默认前端端口为 `3002`，本地 `FRONTEND_URL` / `CORS_ORIGIN` 示例为 `http://localhost:3002`。
- 当前仓库未初始化 `backend\src`、`backend\test`、`backend\scripts`。
- 当前不得写成完整后端工程已经可运行。

## 3. 当前已确认后端事实

- 项目名称为 CogMemory AD / 智忆评。
- 项目方向为阿尔茨海默病认知评估与辅助诊断系统。
- 后端根目录公共骨架保留 NestJS、TypeScript、ESLint、Prettier、Jest、Mongoose、OSS 等公共工程能力的配置形态。
- `.env.*.example` 使用 CogMemory AD / 智忆评口径的示例配置，不包含真实密钥。
- OSS bucket 当前仅为占位或示例，真实 bucket 待后续为 CogMemory AD 新建后替换。
- OSS、SMS、LLM 当前只是 `.env.*.example` 中的配置占位，不代表对应服务已实现。

## 4. 当前尚未初始化或实现

- 尚未初始化 `backend\src`。
- 尚未初始化 `backend\test`。
- 尚未初始化 `backend\scripts`。
- 尚无业务模块。
- 尚无 Controller、Service、DTO、Schema。
- 尚无真实 API。
- 尚未实现配置加载代码、数据库连接、OSS Service、SMS Service、认证、量表、评估、报告、短信登录或 AI / LLM 调用。

## 5. 后续同步规则

- 后续初始化 `backend\src`、`backend\test` 或 `backend\scripts` 后，应同步更新本文档。
- 新增模块、接口、DTO、数据模型、Service 或测试命令后，应同步更新对应 handoff 文档。
- 本文档只记录已确认事实，不承载未确认推测。
