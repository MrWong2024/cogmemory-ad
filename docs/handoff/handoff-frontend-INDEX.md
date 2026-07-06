# CogMemory AD / 智忆评 前端 Handoff 入口

## 1. 项目名称

- 中文名：智忆评
- 英文名：CogMemory AD
- 项目方向：阿尔茨海默病认知评估与辅助诊断系统

## 2. 本文档用途

本文档是 CogMemory AD 前端 handoff 文档入口，用于索引前端事实快照、设计基线、路由、API 对接、组件和验证手册。

当前内容记录已确认治理基线、前端根目录公共骨架配置，以及 `frontend\app` / `frontend\src` 最小公共底座。不定义真实登录、医生端、患者端、量表、评估记录、报告或业务 API 能力。

## 3. 当前状态

- `frontend\` 根目录公共骨架配置已初始化。
- 当前已初始化 `package.json`、`package-lock.json`、`.env.local.example`、`.gitignore`、`eslint.config.mjs`、`next.config.ts`、`postcss.config.mjs`、`tsconfig.json`。
- 前端根配置与 app/src 公共底座均按任务授权读取指定外部源仓库 commit `b302b8af7b7ac9cc558939dc1b38ace0976c65b3` 的公共结构参考，并改造为 CogMemory AD / 智忆评口径。
- 当前已初始化 `frontend\app` 最小入口：根布局、首页占位和 not-found 页面。
- 当前已初始化 `frontend\src` 公共底座：全局样式、环境变量工具、className 工具和基础 UI 组件。
- 当前前端公共底座已完成基础验证闭环：`npm install`、`npm run build`、`npm run lint`、`npm run typecheck` 均已由用户本地执行并通过。
- 当前仅有公开首页占位和 not-found 兜底，不代表业务 MVP 已实现。
- 当前尚无真实登录、医生端、患者端、量表、评估记录、报告、API Client 或页面级后端调用。
- 当前只继承公共工程结构、配置形态和组件治理经验，不继承任何业务事实。
- 当前已新增前端设计基线，用于约束 CogMemory AD 的医疗系统 / 临床评估视觉风格，并阻止 ReviewX 视觉风格误迁移。
- 后续业务页面、认证、API 对接和医生 / 患者工作流需按单独任务实现。

## 4. 必读基础文档

- `docs\frontend-architecture.md`
- `docs\auth-baseline.md`
- `docs\codex-rules.md`
- `docs\codex-instruction-spec.md`
- `docs\handoff\handoff-frontend-design-baseline.md`
- `docs\handoff\handoff-backend-api-map.md`
- `docs\handoff\handoff-backend-dto-cheatsheet.md`

## 5. 当前前端 handoff 文档列表

- `docs\handoff\handoff-frontend-snapshot.md`
- `docs\handoff\handoff-frontend-design-baseline.md`
- `docs\handoff\handoff-frontend-route-map.md`
- `docs\handoff\handoff-frontend-api-map.md`
- `docs\handoff\handoff-frontend-component-map.md`
- `docs\handoff\handoff-frontend-testing-playbook.md`

## 6. 设计基线使用规则

- `handoff-frontend-design-baseline.md` 是后续前端 `app` / `src`、页面、组件和样式迁移前必须阅读的基线文档。
- 该文档用于约束 CogMemory AD 的医疗系统 / 临床评估 / 低干扰 / 高可读性 / 冷静可信视觉风格。
- 后续迁移前端公共结构时，只继承 ReviewX 的工程结构、配置经验和组件治理方法，不继承 ReviewX 的视觉风格、颜色体系、页面布局、业务文案或管理后台气质。
- 当前设计基线已在 app/src 公共底座中首次落地，但不代表完整设计系统或业务页面已经实现。

## 7. 后续同步规则

- 后续调整前端 `src` / `app` 公共底座时，应同步更新事实快照、路由地图、组件地图、API 对接地图和验证手册。
- 前端新增或调整页面、路由、API 对接、复用组件、测试脚本或关键交互时，应同步更新对应 handoff 文档。
- 前端新增或调整页面、组件、布局、样式和关键交互时，应同步检查 `handoff-frontend-design-baseline.md`。
- 后续进入业务 MVP 前，应以事实快照、路由地图、组件地图、API 对接地图和验证手册为基线，并继续遵循前端设计基线。
- 未在业务文档和实际代码中确认的内容，只能标记为“待确认”或“待后续业务文档确定”。
- 不得在 handoff 中提前写入未实现的前端能力。
