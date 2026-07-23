# CogMemory AD / 智忆评 前端 Handoff 入口

## 1. 文档定位与权威来源

- 本 INDEX 只负责前端 handoff 的文档入口与职责导航，不维护阶段日志或实现明细。
- [Roadmap](./handoff-roadmap.md) 维护产品范围、工作包状态和当前主线；本 INDEX 不复制这些事实。
- Frontend snapshot 维护当前工程结构、能力和真实未实现边界；各 map、design baseline 与 testing playbook 按下文分工维护专项事实。

## 2. 当前实现摘要

- 前端采用 Next.js App Router、React、TypeScript 与 Tailwind CSS。
- Auth、Patients、Assessments 已落地，前端业务能力已实施至 B17。
- B16 已完成 replacement V2+ 生命周期，B17 已完成患者历史、报告版本导航、指定历史详情与基础随访趋势。
- 主登录态使用后端 Session 与 HttpOnly Cookie，浏览器不持久化凭据。
- 当前验证状态见 frontend testing playbook。

关键边界：
- Dashboard 是轻量临床入口，不等同完整医生工作台。
- AI 临床解释和科研脱敏导出仍未实现。
- 核心量表由医护或研究人员陪伴或监督完成，不用于患者居家自测。

## 3. Handoff 文档导航与职责

- [Frontend snapshot](./handoff-frontend-snapshot.md)：当前前端工程结构、能力范围与真实未实现边界。
- [Frontend route map](./handoff-frontend-route-map.md)：路由、页面职责、访问边界与数据来源。
- [Frontend API map](./handoff-frontend-api-map.md)：API Client 对接、请求、响应、错误处理与 UI 映射。
- [Frontend component map](./handoff-frontend-component-map.md)：组件、Hook、API Client 与调用职责。
- [Frontend design baseline](./handoff-frontend-design-baseline.md)：前端视觉与交互原则。
- [Frontend testing playbook](./handoff-frontend-testing-playbook.md)：门禁、批次、Browser、evidence、verify 与 cleanup。

- 跨端契约参考：[Backend API map](./handoff-backend-api-map.md) 维护后端 endpoint、权限与错误；[Backend DTO cheatsheet](./handoff-backend-dto-cheatsheet.md) 维护 DTO、response 与字段形状。

> 修改页面、组件或样式前必须阅读并遵循 frontend design baseline；不得继承 ReviewX 的业务视觉。

## 4. 同步规则

- 产品范围、工作包状态或当前主线变化时，更新 roadmap。
- 前端工程结构、能力范围或真实未实现边界变化时，更新 frontend snapshot。
- 路由、API 对接、组件或 Hook 变化时，分别更新 route map、API map、component map。
- 视觉或交互原则变化时，更新 frontend design baseline。
- 门禁、批次、Browser、evidence、verify 或 cleanup 变化时，更新 frontend testing playbook。
- 仅当导航入口或文档职责变化时更新本 INDEX，不在此累积实现流水、测试事实或工作包状态。
