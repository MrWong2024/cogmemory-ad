# CogMemory AD / 智忆评 前端事实快照

## 1. 文档定位

本文档只维护当前 frontend 的工程结构、主要模块、高层能力、关键架构边界和真实未实现边界。

- 产品阶段、工作包状态和当前主线见 [Roadmap](./handoff-roadmap.md)。
- 受监督患者施测的 same/cross、准备、逐题呈现、媒体、ASR、Evidence、异常控制及正式复核详细稳定合同见 [Patient Administration Contract](./handoff-patient-administration-contract.md)。
- current / historical 测试证据与 current executable inventory 见 [Frontend Testing Playbook](./handoff-frontend-testing-playbook.md)；跨层后端证据见 [Backend Testing Playbook](./handoff-backend-testing-playbook.md)。
- 完整 current 路由、API Client 对接和组件 / Hook 职责分别见 [Route Map](./handoff-frontend-route-map.md)、[API Map](./handoff-frontend-api-map.md) 与 [Component Map](./handoff-frontend-component-map.md)。
- 视觉、布局、交互气质和长期 UX 原则见 [Design Baseline](./handoff-frontend-design-baseline.md)。

本项目遵循 reference, don't restate：专项事实由对应 owner 完整维护，本快照只保留模块级投影。

## 2. 当前技术结构

- frontend/package.json 当前使用 Next.js App Router、React、TypeScript 与 Tailwind CSS。
- frontend/app 负责页面、layout 与 not-found；动态路由参数按当前 Next.js 合同读取。
- frontend/src/components/ui 提供 Button、Card、Badge 三个低业务语义公共组件。
- frontend/src/features/auth、patients、assessments、patient-administration 分别承载认证、患者与访视、量表与报告、受监督患者施测。
- 所有业务 fetch 集中在各 feature API Client，基础地址由 frontend/src/lib/env.ts 读取 NEXT_PUBLIC_API_BASE_URL。
- 当前没有 BFF、Next Route Handler 代理、middleware、全局业务 Provider、Redux / Zustand / SWR / React Query 或第三方图表库。
- 页面遵循医疗系统、临床评估、低干扰、高可读性和冷静可信的设计基线。

测试目录、Profile、support 能力和 current executable inventory 不在本快照展开，由 testing playbook 维护。

## 3. 当前页面族

- 公共与认证：首页、登录、轻量工作台和 404 兜底。
- 患者与访视：患者列表 / 创建 / 详情、访视创建 / 详情，以及患者历史与随访趋势。
- 量表执行：正式 ItemResponse、媒体证据、整体提交、评分、认知域和受监督患者施测的临床控制 / 复核组合。
- 患者施测终端：独立安全进入页与当前患者会话页。
- 临床报告：访视内 current workflow、版本列表及指定历史报告只读详情。

完整路径、访问边界、数据来源和关联组件见 [Route Map](./handoff-frontend-route-map.md)。

## 4. 当前主要 feature

### 4.1 Auth

- 支持机构账号登录、会话探针、公开用户摘要和登出。
- 主登录态由后端 Session 与 HttpOnly Cookie 维护；前端不读取 Cookie，不保存 token，也不建设前端权限系统。
- /dashboard 是认证后的轻量入口，不是完整临床运营工作台。

### 4.2 Patients

- 支持患者列表、创建、详情及访视列表和创建。
- 支持患者评估历史、报告摘要、URL 可分享筛选和基础随访趋势。
- 访视详情组合有限 maintenance、量表初始化、实例列表和报告区域；完整 Visit 运营仍属于未实现边界。

### 4.3 Assessments

- 支持量表目录与实例初始化、动态分组执行，以及正式 ItemResponse 草稿、自动 / 显式保存、冲突与网络结果协调、切组和实时计时。
- 支持题目媒体采集 / 查看、submission readiness 与整体提交。
- 支持阶段性评分、人工评分复核与确认，以及认知域结果展示；前端不自行重算临床结果或生成诊断。

### 4.4 Clinical Report

- 支持访视级 current report 的生成、编辑、提交确认、锁定、来源冻结、归档和更正组合。
- 支持报告版本列表、replacement V2+ 复用既有 lifecycle，以及指定历史报告只读详情。
- current workflow 与历史详情复用安全只读内容，但历史详情不挂载写工作流。

### 4.5 Patient Administration

- 当前 frontend 已实现受监督 MMSE 患者施测：医护在现有量表实例页发起和控制短期患者会话，患者通过独立 Shell 安全进入并按服务端权威步骤完成施测。
- 患者施测 completed 后，正式复核继续复用现有 ScaleInstance 页面、ItemResponse、readiness 与整体提交链，不新增独立 review route 或第二套正式答案工作流。
- same/cross、准备、逐题 response / media、ASR、Evidence、播放、异常控制和正式复核边界统一见 [Patient Administration Contract](./handoff-patient-administration-contract.md)；本快照不维护逐 step 合同。

## 5. API 与状态边界

- 所有业务请求位于 feature API Client，统一使用公开 API base、Cookie credentials 与 no-store 策略；具体 method、endpoint、请求 / 响应和错误映射见 [API Map](./handoff-frontend-api-map.md)。
- 认证、页面数据、工作流草稿、媒体 Blob / strokes、短期 URL 与当前会话回执保存在 React 内存。
- history / trends 只把可分享的非敏感筛选和分页写入 URL；临床草稿、客户端可读凭据和不可逆操作的待提交状态不写入 URL 或浏览器持久化存储。
- 后端 Guard 是最终权限边界；前端展示 gate 不替代服务端授权和业务校验。

## 6. 当前实现结论

- 产品状态、剩余工作包和下一主线以 [Roadmap](./handoff-roadmap.md) 为准。
- frontend 当前模块级能力以本快照为入口；route、API、component 和设计专项事实由对应 owner 维护。
- 测试通过、失败、历史数量、fixture、cleanup 与当前可执行资产不在本快照维护。

## 7. 当前未实现边界

- MoCA 患者端多模态闭环尚未实现；规划归属见 Roadmap 的 WP-11。
- 临床运营与知情者辅助整体能力尚未完成，已存在的 Visit maintenance 窄切片不等于完整运营工作区；规划归属见 Roadmap 的 WP-12。
- 真实设备、真实麦克风 / 触控笔、真实患者媒体与人工验收尚未完整闭合，桌面自动化不能替代；规划归属见 Roadmap 的 WP-08。
- 患者编辑、删除、归档与合并尚未实现；Visit 仅有当前有限 maintenance，通用生命周期尚未实现。
- 评分的独立 lock / void / reopen / rerun / 批量人工评分与独立历史，认知域的人工修改 / 确认 / 锁定 / 作废 / 重算，报告的 reject / reopen / withdraw / 签名 / unlock / unfreeze / unarchive / 作废 / 重生成 / PDF / 打印 / 下载尚未实现。
- AI 临床解释、诊断概率、自动结论、用户 / 角色管理和完整权限菜单尚未实现。
- HIS / EMR、计费、保险及其他第三方医院系统集成当前未实现，且不属于一期产品缺口。

以上条目只维护 frontend 模块级真实缺口；已实现患者施测的详细合同不在此复述。

## 8. 后续同步规则

- Snapshot 只在 frontend 工程结构、模块级 current 能力、关键架构边界或真实未实现边界变化时更新。
- 路由、API 对接、组件 / Hook、设计原则、患者施测详细合同和测试 evidence 分别由对应 owner 更新；本快照只在自身投影受影响时同步。
- “同步相关文档”不表示复制事实。owner 更新后，projection 没有职责变化时保持 zero diff。
- 工作包状态只由 Roadmap 维护；不得把阶段日志、测试流水或逐题患者合同写回本快照。
