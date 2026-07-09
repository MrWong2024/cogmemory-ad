# CogMemory AD / 智忆评 后端 Handoff 入口

## 1. 项目名称

- 中文名：智忆评
- 英文名：CogMemory AD
- 项目方向：阿尔茨海默病认知评估与辅助诊断系统

## 2. 本文档用途

本文档是 CogMemory AD 后端 handoff 文档入口，用于索引后端事实快照、API、DTO、Service、配置、决策和验证手册。

当前内容记录后端公共底座和已进入真实代码阶段的 `scales` 量表定义模型底座；未实现的业务能力仍只能标记为待后续阶段确认。

## 3. 当前状态

- 后端工程已初始化，当前仓库存在 `backend\package.json`，技术栈版本以该文件、锁文件和实际代码为准。
- `backend\src` 已具备 NestJS 公共底座、配置加载与校验、MongoDB 连接底座、全局异常处理、健康检查和 Storage 公共模块。
- 当前新增 `scales` 量表定义模型底座，包含 `ScaleDefinition` / `ScaleVersion` Schema 与 `ScalesService` 内部读取能力。
- 当前公开 API 仍只有 `GET /health`；`scales` 未新增 Controller 或公开业务接口。
- 认证、患者、访视、评估实例、作答、媒体证据、计分、报告、AI、科研导出等业务能力仍未实现。

## 4. 必读基础文档

- `docs\backend-architecture.md`
- `docs\auth-baseline.md`
- `docs\database-conventions.md`
- `docs\e2e-testing.md`
- `docs\codex-rules.md`
- `docs\codex-instruction-spec.md`

## 5. 当前后端 handoff 文档列表

- `docs\handoff\handoff-backend-snapshot.md`
- `docs\handoff\handoff-backend-api-map.md`
- `docs\handoff\handoff-backend-dto-cheatsheet.md`
- `docs\handoff\handoff-backend-service-map.md`
- `docs\handoff\handoff-backend-config-matrix.md`
- `docs\handoff\handoff-backend-decisions.md`
- `docs\handoff\handoff-backend-testing-playbook.md`

## 6. 后续同步规则

- 后端新增或调整接口、DTO、Service、配置、测试脚本或关键决策时，应同步更新对应 handoff 文档。
- 未在业务文档和实际代码中确认的内容，只能标记为“待确认”或“待后续业务文档确定”。
- 不得在 handoff 中提前写入未实现的后端能力。
