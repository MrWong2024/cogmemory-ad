# CogMemory AD / 智忆评 前端 Handoff 入口

## 1. 文档定位与权威来源

- 本 INDEX 只负责前端 handoff 的文档入口与职责导航，不维护阶段日志或实现明细。
- [Roadmap](./handoff-roadmap.md) 维护产品范围、工作包状态和当前主线；本 INDEX 不复制这些事实。
- Frontend snapshot 维护当前工程结构、能力和真实未实现边界；各 map、design baseline 与 testing playbook 按下文分工维护专项事实。

## 2. 当前实现摘要

- 前端采用 Next.js App Router、React、TypeScript 与 Tailwind CSS。
- 主登录态使用后端 Session 与 HttpOnly Cookie，浏览器不持久化凭据。
- 当前实现事实和真实未实现边界以 frontend snapshot、roadmap 与各专项 map 为准，本 INDEX 不复制阶段状态或测试流水。

## 3. Handoff 文档导航与职责

- [受监督患者施测合同](./handoff-patient-administration-contract.md)：WP-10 跨端业务、逐题呈现、题目媒体、会话、安全退出与医生复核边界的稳定合同入口；不预设前端路由或页面结构。
- [Frontend snapshot](./handoff-frontend-snapshot.md)：当前前端工程结构、能力范围与真实未实现边界。
- [Frontend route map](./handoff-frontend-route-map.md)：路由、页面职责、访问边界与数据来源。
- [Frontend API map](./handoff-frontend-api-map.md)：API Client 对接、请求、响应、错误处理与 UI 映射。
- [Frontend component map](./handoff-frontend-component-map.md)：组件、Hook、API Client 与调用职责。
- [Frontend design baseline](./handoff-frontend-design-baseline.md)：前端视觉与交互原则。
- [Frontend testing playbook](./handoff-frontend-testing-playbook.md)：前端与 Browser 的稳定验证规则、跨层证据分工和当前仍待验边界。

- 跨端契约参考：[Backend API map](./handoff-backend-api-map.md) 维护后端 endpoint、权限与错误；[Backend DTO cheatsheet](./handoff-backend-dto-cheatsheet.md) 维护 DTO、response 与字段形状。

> 修改页面、组件或样式前必须阅读并遵循 frontend design baseline；不得继承 ReviewX 的业务视觉。

## 4. 同步规则

- 产品范围、工作包状态或当前主线变化时，更新 roadmap。
- 前端工程结构、能力范围或真实未实现边界变化时，更新 frontend snapshot。
- 路由、API 对接、组件或 Hook 变化时，分别更新 route map、API map、component map。
- 视觉或交互原则变化时，更新 frontend design baseline。
- 前端或 Browser 稳定验证规则、跨层证据分工或当前仍待验边界变化时，更新 frontend testing playbook；已关闭阶段的详细执行证据由 Git 历史和当前测试资产追溯。
- 仅当导航入口或文档职责变化时更新本 INDEX，不在此累积实现流水、测试事实或工作包状态。
