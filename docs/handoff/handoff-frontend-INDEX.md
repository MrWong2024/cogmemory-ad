# CogMemory AD / 智忆评 前端 Handoff 入口

## 1. 文档定位与权威来源

- 本 INDEX 只负责前端 handoff 的文档入口与职责导航，不维护阶段日志或实现明细。
- [Roadmap](./handoff-roadmap.md) 维护产品范围、工作包状态和当前主线；本 INDEX 不复制这些事实。
- Frontend snapshot 维护当前工程结构、能力和真实未实现边界；各 map、design baseline 与 testing playbook 按下文分工维护专项事实。

## 2. 当前实现摘要

- 前端采用 Next.js App Router、React、TypeScript 与 Tailwind CSS。
- Auth、Patients、Assessments 已落地；B18-A、B18-B1、B18-B2 与补充验证均已完成。
- B16 已完成 replacement V2+ 生命周期，B17 已完成患者历史、报告版本导航、指定历史详情与基础随访趋势。
- 主登录态使用后端 Session 与 HttpOnly Cookie，浏览器不持久化凭据。
- 施测页已消费 A29 revision / 完整 timing，具备逐题自动保存、显式冲突 / 网络核对、逐 ItemResponse/attempt reconciliation single-flight、切组 flush、媒体 generation 协调和实时计时；B18-B1/B2、P7/P8、P3 回归与 P9 媒体上传失败草稿保全证据均成立。
- 当前验证状态与精确证据见 frontend testing playbook；B18 补充验证已闭合、自动化 `gap=0`，WP-03 已完成。当前无生产实现活动工作包；下一阶段已锁定为 WP-10.0“受监督患者施测产品与数据合同”，尚未开始，范围与状态以 roadmap 为准。

关键边界：
- 现有医生侧工作台与量表执行工作流已经落地；`AuthDashboard` 本身仍是轻量入口。WP-12 只要求可复用既有页面或受控工具形成最小临床入口和账号运营能力，不预设全新 Dashboard 或完整用户管理 UI。
- 面向患者的一步一屏施测、短期受控会话与安全进入、分层的测量刺激与普通指导、录音与基础 ASR 人工降级、医生及时状态查看和控制权接管、患者端服务端权威恢复、医生复核后形成正式 `ItemResponse`，以及患者端与医护监管端协同完成完整 MMSE / MoCA 的多模态编排均尚未实现。同设备交接不强制配对；跨设备时才需要短期配对、医生确认或其他安全进入机制，具体技术由 WP-10.0 确定。
- AI 临床解释和科研脱敏导出仍未实现。
- 不实现永久离线草稿；Batch E 的 8 个历史 ID 仍为 `pending` 且当前主要归属为 WP-08，WP-08 启动时须按最终合同重新治理适用候选，不能机械把关闭旧 8 项等同于工作包完成。
- 一期核心量表由患者端与医护监管端在医护在场或监督下协同完成。标准患者交互设备包括平板和具备触摸功能的电脑大屏，例如触控一体机或连接触控显示器的电脑，并应具备或可接入所需触控、音频播放、麦克风和受支持浏览器；手机只承担逐步骤验收后的有限兼容，普通非触控电脑主要用于医护监管、复核和报告，鼠标操作不替代患者触控验收。不开放无人监督的居家 MMSE / MoCA 核心自测。

## 3. Handoff 文档导航与职责

- [Frontend snapshot](./handoff-frontend-snapshot.md)：当前前端工程结构、能力范围与真实未实现边界。
- [Frontend route map](./handoff-frontend-route-map.md)：路由、页面职责、访问边界与数据来源。
- [Frontend API map](./handoff-frontend-api-map.md)：API Client 对接、请求、响应、错误处理与 UI 映射。
- [Frontend component map](./handoff-frontend-component-map.md)：组件、Hook、API Client 与调用职责。
- [Frontend design baseline](./handoff-frontend-design-baseline.md)：前端视觉与交互原则。
- [Frontend testing playbook](./handoff-frontend-testing-playbook.md)：跨层测试设计思想、Browser 验收策略、稳定 Audit 清单和当前验证状态的权威来源。

- 跨端契约参考：[Backend API map](./handoff-backend-api-map.md) 维护后端 endpoint、权限与错误；[Backend DTO cheatsheet](./handoff-backend-dto-cheatsheet.md) 维护 DTO、response 与字段形状。

> 修改页面、组件或样式前必须阅读并遵循 frontend design baseline；不得继承 ReviewX 的业务视觉。

## 4. 同步规则

- 产品范围、工作包状态或当前主线变化时，更新 roadmap。
- 前端工程结构、能力范围或真实未实现边界变化时，更新 frontend snapshot。
- 路由、API 对接、组件或 Hook 变化时，分别更新 route map、API map、component map。
- 视觉或交互原则变化时，更新 frontend design baseline。
- 跨层测试设计、Browser 验收、稳定 Audit 清单或当前验证状态变化时，更新 frontend testing playbook。
- 仅当导航入口或文档职责变化时更新本 INDEX，不在此累积实现流水、测试事实或工作包状态。
