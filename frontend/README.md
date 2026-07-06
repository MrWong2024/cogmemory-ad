# CogMemory AD / 智忆评 Frontend

## 当前状态

- `frontend` 根目录配置已初始化，package name 为 `cogmemory-ad-frontend`。
- `frontend/app` 最小入口已初始化，包括根布局、首页占位和 not-found 页面。
- `frontend/src` 公共底座已初始化，包括全局样式、环境变量工具、className 工具和基础 UI 组件。
- 当前首页是 CogMemory AD / 智忆评公共底座占位，不代表业务 MVP 已实现。

## 设计基线

当前前端遵循医疗系统 / 临床评估 / 低干扰 / 高可读性 / 冷静可信的基线：

- 浅色背景。
- 低饱和蓝绿。
- 清晰分区。
- 大字号可读。
- 少动画。
- 少装饰。
- 突出评估、记录、报告、医生工作流。

## 当前不包含

- 无真实登录。
- 无医生端真实工作台。
- 无患者端作答流程。
- 无量表页面。
- 无评估记录页面。
- 无报告页面。
- 无真实 API client。
- 首页不调用后端 API。

## 本地配置

- 前端本地默认端口：`3002`。
- 后端 API base URL：`http://localhost:5002`。
- 公开环境变量：`NEXT_PUBLIC_API_BASE_URL=http://localhost:5002`。

## 验证命令

后续可在 `frontend` 目录执行：

```bash
npm install
npm run build
npm run lint
npm run typecheck
```

本次任务中，`frontend/node_modules` 不存在，按任务约束未执行 `npm install`、`npm run build`、`npm run lint` 和 `npm run typecheck`。
