# CogMemory AD / 智忆评 前端事实快照

## 1. 文档定位

本文档用于记录 CogMemory AD 前端当前事实快照，帮助后续交接时快速判断前端工程、页面、路由、组件和验证能力的真实状态。

## 2. 当前工程状态

- `frontend\` 根目录公共骨架配置已初始化。
- `frontend\app` 最小入口已初始化。
- `frontend\src` 公共底座已初始化。
- 当前首页为 CogMemory AD / 智忆评公共底座占位，不代表业务 MVP 已实现。
- 当前无真实登录、医生端、患者端、量表、评估记录、报告或真实 API client。
- 当前首页不调用后端 API。
- 当前视觉按 `handoff-frontend-design-baseline.md` 重写，保持医疗系统 / 临床评估 / 低干扰 / 高可读性 / 冷静可信口径，不继承 ReviewX 视觉风格。

## 3. 当前已确认前端事实

- 项目名称为 CogMemory AD / 智忆评。
- 项目方向为阿尔茨海默病认知评估与辅助诊断系统。
- `frontend\package.json` 的 `name` 为 `cogmemory-ad-frontend`。
- 前端默认本地端口为 `3002`。
- 后端 API base URL 默认值为 `http://localhost:5002`。
- `frontend\app\layout.tsx` 已设置全局 metadata：
  - `title: 智忆评 | CogMemory AD`
  - `description: 阿尔茨海默病认知评估与辅助诊断系统`
- 当前已确认路由：
  - `/`
  - `not-found` 兜底页面
- 当前已确认公共组件：
  - `Button`
  - `Card`
  - `Badge`
- 当前已确认公共工具：
  - `frontend\src\lib\env.ts`
  - `frontend\src\lib\class-names.ts`
- 当前已确认全局样式：
  - `frontend\src\styles\globals.css`
- 当前 `env.ts` 只读取 `NEXT_PUBLIC_API_BASE_URL`，安全默认值为 `http://localhost:5002`。
- 当前没有 API client。
- 当前没有业务页面、业务路由、业务组件、认证状态、权限控制或状态管理。

## 4. 当前文件清单

- `frontend\app\layout.tsx`
- `frontend\app\page.tsx`
- `frontend\app\not-found.tsx`
- `frontend\src\styles\globals.css`
- `frontend\src\lib\env.ts`
- `frontend\src\lib\class-names.ts`
- `frontend\src\components\ui\Button.tsx`
- `frontend\src\components\ui\Card.tsx`
- `frontend\src\components\ui\Badge.tsx`
- `frontend\README.md`

## 5. 当前验证状态

- 用户本地已执行 `npm install`，结果成功。
- 用户本地已执行 `npm run build`，结果成功。
- 用户本地已执行 `npm run lint`，结果成功。
- 用户本地已执行 `npm run typecheck`，结果成功。
- E2E 未执行；当前没有真实业务流程或 E2E 场景。
- 当前验证结果仅覆盖前端公共底座的安装、构建、lint 和类型检查，不代表业务 MVP 完成。

## 6. 当前未确认前端事实

- 登录流程待后续业务文档和任务确定。
- 医生端真实工作台待后续业务文档和任务确定。
- 患者端真实作答流程待后续业务文档和任务确定。
- 量表页面、评估记录页面和报告页面待后续业务文档和任务确定。
- API client、BFF 代理和页面级接口调用待后续业务文档和任务确定。

## 7. 后续同步规则

- 后续新增页面、路由、组件、API Client 或测试命令后，应同步更新对应 handoff 文档。
- 新增页面、组件、布局、样式和关键交互前，应先检查 `handoff-frontend-design-baseline.md`。
- 本文档只记录已确认事实，不承载未确认推测。
