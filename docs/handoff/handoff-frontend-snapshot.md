# CogMemory AD / 智忆评 前端事实快照

## 1. 文档定位

本文档用于记录 CogMemory AD 前端当前事实快照，帮助后续交接时快速判断前端工程、页面、路由、组件和验证能力的真实状态。

## 2. 当前工程状态

- `frontend\` 根目录公共骨架配置已初始化。
- 当前仅初始化前端根目录配置，尚未迁移 `frontend\app` 或 `frontend\src`。
- 当前不写入任何页面、路由、组件、API Client 或测试脚本已经通过验证的事实。

## 3. 当前已确认前端事实

- 项目名称为 CogMemory AD / 智忆评。
- 项目方向为阿尔茨海默病认知评估与辅助诊断系统。
- `docs` 下通用宪法文档已作为工程治理基线。
- 前端 handoff 文档体系处于初始化阶段。
- 已初始化以下前端根目录文件：
  - `frontend\package.json`
  - `frontend\package-lock.json`
  - `frontend\.env.local.example`
  - `frontend\.gitignore`
  - `frontend\eslint.config.mjs`
  - `frontend\next.config.ts`
  - `frontend\postcss.config.mjs`
  - `frontend\tsconfig.json`
- `frontend\package.json` 的 `name` 为 `cogmemory-ad-frontend`。
- 前端默认本地端口为 `3002`。
- `NEXT_PUBLIC_API_BASE_URL` 当前示例值为 `http://localhost:5002`。
- 当前未执行 `npm install`。
- 当前未执行 `npm run build`。
- 当前未执行 `npm run lint`。
- 当前未执行 `npm run typecheck`。
- 当前无页面、无路由、无组件、无 API Client、无页面级后端接口调用。
- 当前 `eslint.config.mjs` 保留公共 lint 口径中的 `react-hooks/exhaustive-deps` 与 `react-hooks/set-state-in-effect` 关闭项；这只记录当前公共配置，不代表业务代码可绕过代码评审。

## 4. 当前未确认前端事实

- `frontend\app` 公共入口待后续迁移。
- `frontend\src` 公共底座待后续迁移。
- 页面结构和路由待确认。
- API 对接方式待确认。
- 组件体系和复用边界待确认。
- 认证与权限展示口径待确认。
- 量表作答、报告预览、医生端和患者端页面待后续业务文档确定。
- 自动化验证脚本和人工验证口径待确认。

## 5. 后续同步规则

- 后续迁移 `frontend\app` 或 `frontend\src` 后，应以实际代码和相关业务文档为准更新本文档。
- 新增页面、路由、组件、API Client 或测试命令后，应同步更新对应 handoff 文档。
- 本文档只记录已确认事实，不承载未确认推测。
