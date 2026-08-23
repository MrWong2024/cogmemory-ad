# CogMemory AD / 智忆评 后端 Handoff 入口

## 1. 文档定位与权威来源

- 本 INDEX 只负责后端 handoff 的文档入口与职责导航，不维护阶段日志或实现明细。
- [Roadmap](./handoff-roadmap.md) 维护产品范围、工作包状态和当前主线；本 INDEX 不复制这些事实。
- Backend snapshot 维护当前工程结构、能力和真实未实现边界；各 map、matrix、decisions 与 testing playbook 按下文分工维护专项事实。

## 2. Handoff 文档导航与职责

- [受监督患者施测合同](./handoff-patient-administration-contract.md)：WP-10.0 跨端业务、题目媒体、数据、安全与医生复核边界的唯一详细入口；不预设后端 Schema、DTO 或 endpoint。
- [Backend snapshot](./handoff-backend-snapshot.md)：当前后端工程结构、能力范围与真实未实现边界。
- [Backend API map](./handoff-backend-api-map.md)：endpoint、请求、响应、权限与错误。
- [Backend DTO cheatsheet](./handoff-backend-dto-cheatsheet.md)：DTO、response、字段形状与校验摘要。
- [Backend Service map](./handoff-backend-service-map.md)：Service / Workflow / 关键 Provider、调用关系、职责边界与内部一致性 / 恢复要求。
- [Backend config matrix](./handoff-backend-config-matrix.md)：环境变量、配置来源、默认 / 校验、静态数据库用途映射与部署事实。
- [Backend decisions](./handoff-backend-decisions.md)：稳定架构决策、理由与影响范围。
- [Backend testing playbook](./handoff-backend-testing-playbook.md)：测试用途选择、进程 / 数据库隔离与连接门禁、后端自动测试、fixture、verifier、cleanup 及 testing evidence。

- 跨端 Browser 验收参考：[Frontend testing playbook](./handoff-frontend-testing-playbook.md)。

## 3. 同步规则

- 产品范围、工作包状态或当前主线变化时，更新 roadmap。
- 后端工程结构、能力范围或真实未实现边界变化时，更新 backend snapshot。
- endpoint、请求、响应、权限或错误变化时更新 API map；DTO、response 或字段形状变化时更新 DTO cheatsheet。
- Service / Workflow / call graph、内部一致性或恢复机制变化时更新 Service map；静态配置、默认 / 校验或数据库用途映射变化时更新 config matrix；稳定架构决策变化时更新 decisions。
- 测试用途选择、进程 / 数据库隔离、连接门禁、后端自动测试、fixture、verifier、cleanup 或 testing evidence 变化时，更新 backend testing playbook；跨层设计、Browser 验收、稳定 Audit 清单或当前状态变化时，更新 frontend testing playbook。
- 仅当导航入口或文档职责变化时更新本 INDEX，不在此累积实现流水、测试事实或工作包状态。
