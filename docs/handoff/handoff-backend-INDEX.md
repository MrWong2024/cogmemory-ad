# CogMemory AD / 智忆评 后端 Handoff 入口

## 1. 文档定位与权威来源

- 本 INDEX 只负责后端 handoff 的文档入口与职责导航，不维护阶段日志或实现明细。
- [Roadmap](./handoff-roadmap.md) 维护产品范围、工作包状态和当前主线；本 INDEX 不复制这些事实。
- Backend snapshot 维护当前工程结构、能力和真实未实现边界；各 map、matrix、decisions 与 testing playbook 按下文分工维护专项事实。

## 2. 当前实现摘要

- 后端采用 NestJS、Mongoose 与 HttpOnly Session Cookie 认证底座。
- 后端业务能力已实施至 A28，覆盖患者、访视与量表执行、媒体证据、评分、认知域、临床报告生命周期、历史读取和基础随访趋势。
- A26 让任意合法线性 replacement V2+ 复用 A21–A24 的既有生命周期。
- 详细后端门禁与跨端 Browser 验收状态分别见 backend / frontend testing playbook。

## 3. Handoff 文档导航与职责

- [Backend snapshot](./handoff-backend-snapshot.md)：当前后端工程结构、能力范围与真实未实现边界。
- [Backend API map](./handoff-backend-api-map.md)：endpoint、请求、响应、权限与错误。
- [Backend DTO cheatsheet](./handoff-backend-dto-cheatsheet.md)：DTO、response、字段形状与校验摘要。
- [Backend Service map](./handoff-backend-service-map.md)：Service、调用关系、职责边界与一致性要求。
- [Backend config matrix](./handoff-backend-config-matrix.md)：环境、配置来源、用途与部署事实。
- [Backend decisions](./handoff-backend-decisions.md)：稳定架构决策、理由与影响范围。
- [Backend testing playbook](./handoff-backend-testing-playbook.md)：后端门禁、fixture、数据库隔离、证据、verify 与 cleanup。

- 跨端 Browser 验收参考：[Frontend testing playbook](./handoff-frontend-testing-playbook.md)。

## 4. 同步规则

- 产品范围、工作包状态或当前主线变化时，更新 roadmap。
- 后端工程结构、能力范围或真实未实现边界变化时，更新 backend snapshot。
- endpoint、请求、响应、权限或错误变化时更新 API map；DTO、response 或字段形状变化时更新 DTO cheatsheet。
- Service 职责或调用关系、环境配置、稳定架构决策变化时，分别更新 Service map、config matrix、decisions。
- 门禁、批次、Browser、evidence、verify 或 cleanup 变化时，更新对应 testing playbook。
- 仅当导航入口或文档职责变化时更新本 INDEX，不在此累积实现流水、测试事实或工作包状态。
