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
- 当前验证状态与精确证据见 frontend testing playbook；B18 补充验证已闭合、自动化 `gap=0`，WP-03 已完成。产品范围、工作包状态和当前主线继续以 roadmap 为准。

关键边界：
- 现有医生侧工作台与量表执行工作流已经落地，是统一临床工作端的代码底座；`AuthDashboard` 本身仍是轻量入口。未来临床工作端在同一应用和工作流内区分医护施测模式与医生复核报告模式，不强制两套应用、两个账号或新增互斥角色。WP-12 继续只要求可复用既有页面或受控工具形成最小临床入口和账号运营能力，不预设全新 Dashboard 或完整用户管理 UI。
- 面向患者的一步一屏施测、单一主操作与大触控区、明确状态和求助入口、短期受控会话与安全进入、逐步骤题目 / 指导语文字和语音播报及播放 / 重播控制、设备准备与不计分练习、适用语音回答步骤的录音和一种基础 ASR 人工降级、患者点击 / 书写 / 绘图数字交互、共享设备隐私退出，以及患者端服务端权威恢复均尚未实现；完整 MMSE / MoCA 仍须由患者施测终端与临床工作端协同完成。同设备交接不强制配对，返回临床工作端需要医护安全解锁；跨设备时才需要短期配对、医护确认或其他安全进入机制，具体数据实体和技术由 WP-10.0 按最低充分合同确定。
- 医护施测模式的准备确认、动作观察、结构化影响因素、异常记录和控制，以及医生异常优先复核、无歧义客观步骤汇总确认、最终整体确认均尚未实现。WP-12 的医护代录知情者辅助信息也尚未实现；知情者信息必须与患者作答、ItemResponse 和量表得分分离，不要求长期账号、家庭门户或一期短期自助链接。
- AI 临床解释和科研脱敏导出仍未实现。
- 不实现永久离线草稿；Batch E 的 8 个历史 ID 仍为 `pending` 且当前主要归属为 WP-08，WP-08 启动时须按最终合同重新治理适用候选，不能机械把关闭旧 8 项等同于工作包完成。
- 一期核心量表由患者施测终端与临床工作端在医护在场或监督下协同完成。标准患者交互设备包括平板和具备触摸功能的电脑大屏，例如触控一体机或连接触控显示器的电脑，并应具备或可接入所需触控、音频播放、麦克风和受支持浏览器；摄像头不是通用前置，未来具体步骤确有拍摄或扫码必要时由步骤合同单独验收。手机只承担逐步骤验收后的有限兼容，普通非触控电脑主要用于医护施测、医生复核和报告，鼠标操作不替代患者触控验收。非语音步骤不默认录音，动作观察不等于机器采集；现有医生侧图片和手写证据能力不受影响。不开放无人监督的居家 MMSE / MoCA 核心自测。
- HIS / EMR、计费、保险及其他第三方医院系统集成不属于一期、WP-09 或上线验收门禁。

## 3. Handoff 文档导航与职责

- [受监督患者施测合同](./handoff-patient-administration-contract.md)：WP-10.0 跨端业务、逐题呈现、题目媒体、会话、安全退出与医生复核边界的唯一详细入口；不预设前端路由或页面结构。
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
