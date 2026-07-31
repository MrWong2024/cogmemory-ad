# CogMemory AD / 智忆评 后端验证手册

## 1. 文档定位与当前状态

本文档是数据库用途与隔离、后端自动测试、最小 fixture、verifier 和 cleanup 规则的权威来源。它只维护当前有效规则与待验范围；逐轮命令、临时数据、旧结果和失败过程由 Git 历史承担。

| 范围 | 当前状态 |
|---|---|
| WP-02 / B16、WP-04 / B17 | 已完成，既有状态不变 |
| Batch A / B1–B3 | 已完成，既有状态不变 |
| Batch B / B4–B6 | 桌面范围已完成，既有状态不变 |
| Batch C / B7–B10 | 已完成，既有状态不变 |
| Batch D / B11 | 70 项已完成，状态不变 |
| Batch D / B12 | 未完成；`passed=7`、`pending=81`、`failed=0`、`blocked=0`、`not_executed=0` |
| Batch D / B13–B15（含 B14.1） | 稳定验收意图和顺序不变，尚未执行 |
| Batch E | 8 个真实设备或人工项目尚未执行 |

roadmap 继续维护产品范围和工作包状态；testing playbook 治理不得自动改变 roadmap。

当前状态：ClinicalReport 锁定请求字段白名单、服务端 `updatedAt` 来源、stale 冲突无锁定副作用，以及不新增 locked status 与 public lock summary 均已由分层证据闭环；B12-P0 后端合同已完成。

B12-P1 实验测试资产已全部移除，未新增关闭任何 Audit ID。B12 后续暂停执行，下一任务先审查验收清单本身；审查完成前不启动新的 Browser 实现。

## 2. 数据库用途和隔离

### 2.1 五类用途

| 用途 | 项目数据库 | 允许范围 |
|---|---|---|
| `none` | 不连接数据库 | 文档、lint、typecheck、build、静态审计、Playwright runner、production frontend |
| `development` | `cogmemory_ad_dev` | 日常开发与人工调试 |
| `standard_test` | `cogmemory_ad_test` | unit、普通 HTTP E2E 和允许重建测试数据的自动化 |
| `browser_acceptance` | `cogmemory_ad_browser_test` | 最小 Browser fixture、真实 Browser backend、verifier、精确 cleanup |
| `production_or_operations` | 项目命名基线 `cogmemory_ad` | 仅在用户同时明确授权目标环境与允许操作后使用 |

`standard_test` 与 `browser_acceptance` 必须数据库级隔离；namespace 不能替代数据库隔离。任一进程只允许一种用途，不得叠加 `.env.test` 与 `.env.browser-acceptance`，也不得依赖 dotenv 顺序、继承变量或后加载覆盖来选库。

### 2.2 连接前后门禁

1. 启动前确定唯一用途，并校验声明 URI 的数据库名与用途映射逐字一致。
2. 建连后读取实际数据库名，再与允许数据库逐字比较；不一致立即失败，不自动回退。
3. Browser backend 的主连接使用 app 用户与 `readWrite`；fixture/verifier/cleanup 进程使用 db_admin 与 `dbOwner`。
4. 同时存在两种用途时必须使用独立进程，并显式清除或覆盖 `MONGO_URI`、`MONGO_ADMIN_URI`、`COGMEMORY_DATABASE_PURPOSE` 及用途相关变量。
5. 普通测试不得连接 Browser 库；Browser fixture/backend 不得连接普通测试库、开发库或生产库。
6. `none` 任务不得启动应用、fixture、测试后端或其他会建立数据库连接的进程。

### 2.3 Secret 与进程职责

- 密码、完整连接串、Cookie、Session、token、hash 和私有数据不得写入 tracked 文件、CLI 参数、日志、manifest、截图、产物或最终报告。
- 本地隔离测试固定凭据只能来自项目约定且 Git ignored 的本地配置，或同一隔离父进程的稳定注入；不得从数据库 URI 或其他 Secret 派生。
- 同一微型 Profile 从 prepare 到认证、verifier 和 cleanup 使用一致凭据语义；凭据不一致时先停止并审计，不反复重试。
- fixture runner 与 Browser backend 负责数据库生命周期；Playwright runner 和 production frontend 的用途始终为 `none`，不得直接连接 MongoDB。

## 3. 后端 unit、HTTP E2E、Browser 与 verifier 职责

| 层级 | 负责 | 不能替代 |
|---|---|---|
| unit / pure spec | 纯函数、DTO 局部规则、Controller 参数传递、Service 分支、mapper、状态边界 | 真实 HTTP、Guard、全局 Pipe、数据库终态 |
| HTTP E2E | 认证、401/403、Guard、ValidationPipe、Body 白名单、错误码、状态机、幂等、并发、audit、真实 MongoDB | 页面入口、控件、真实 Browser API 和用户体验 |
| Browser 微型 Profile | 页面、输入、角色体验、Cookie/CORS、Storage、刷新、beforeunload、双 Session、错误恢复、键盘与可访问性 | 数据库写入次数、受保护根和最终持久化事实 |
| database verifier | 写入次数、audit、幂等终态、protected roots、narrative、snapshot、Profile 隔离、canonical seed | 页面行为与用户可见结果 |
| static gate | lint、typecheck、build、test discovery | 动态权限、状态机、数据库或 Browser 通过 |

四类动态证据各有不可替代职责。fixture E2E 只证明测试资产合同，不能冒充产品 Browser；页面文本不能替代 verifier；cleanup 成功不能推导业务通过。

## 4. 最小 fixture 原则

1. fixture 只制造合法最小前置，不成为第二个产品。
2. 优先使用现有 API、通用 test factory 或最小数据库 builder。
3. 不为每个 Audit ID 单独建设 fixture，不构造产品永远不能持久化的状态。
4. 不为测试机制扩展产品合同，不重复建设批次专属 runner、journal、aggregator 或完整 manifest。
5. 写入、并发和冲突场景必须 Report 隔离；只读场景仅在可寻址且证明无污染时共享最小状态。
6. fixture 只输出安全、最小、稳定的导航与账号职责信息，不输出动态内部 ID、密码、连接串或业务正文。
7. 微型 Profile 只验证自己的副作用，不机械执行整个批次的全量 verifier。

## 5. 微型 Profile 的数据库生命周期

每个 Profile 原则上只覆盖 1～4 个紧密相关场景，并独立完成：

1. 选择唯一、可回收的 Profile 标识和最小资源集合。
2. 由 db_admin / `dbOwner` 独立进程 prepare；重复 prepare 默认拒绝，replace 必须显式且范围精确。
3. 执行只读 prepared verifier；它不得创建、修复或删除数据。
4. 仅在 prepared 门禁通过后启动 app / `readWrite` 的 Browser backend；Playwright 仍为 `none`。
5. 在同一代码态、同一最小前置下执行一次 Browser 微型 Profile。
6. 执行与该 Profile 副作用匹配的只读 verifier；零写入场景也必须证明报告、audit、`updatedAt` 和受保护资源未变。
7. logout、关闭 Browser/Context、停止进程，按 Profile 所有权精确 cleanup，再执行幂等核对。

一个 Codex 证据包可以包含多个微型 Profile，但同一 Codex 任务不等于共享数据库生命周期。每个 Profile 的最小数据库前置、写入副作用、并发窗口、post-action verifier、cleanup 与 residual 核对必须独立；不得跨 Profile 拼接数据库终态证据。只读 Profile 只有在测试数据可寻址、无状态污染且 cleanup 边界明确时，才可以复用安全的最小测试数据；可写、幂等、冲突和并发 Profile 不得为了减少任务数量而共享同一个可写 Report。

同一 Profile 内必须保持 Git 代码态、前置、Browser、verifier 和 cleanup 原子性。后续无关 Profile 失败，不得使此前已经独立闭环的证据失效。

## 6. 写入、并发、Stage 与终态验证

- 写请求验证 Body 白名单、次数、actor、状态转换、审计和最终 MongoDB 状态；禁止自动 retry 或 polling。
- 首次成功与幂等、doctor 与 admin、两种冲突、401 与 403 必须使用各自证据，不得互相替代。
- 多角色或双 Session 使用真实独立会话；网络结果不确定时先只读核对服务端事实，不得重试写请求。
- Stage 只用于公开合法流程无法稳定制造的必要并发窗口；必须少量、固定、边界明确、幂等且可精确 cleanup。
- Stage 前后 verifier 只允许目标 transition；非目标报告、Patient、Visit、ScaleInstance、narrative、snapshot、audit、seed 和其他 Profile 必须保持不变。
- verifier 必须拒绝零写入、额外写入、错误 actor、错误状态、缺失 audit、受保护字段漂移和跨 Profile 污染。

## 7. Cleanup 与隔离

- cleanup 只能删除本次 Profile 明确拥有的 namespace、marker、runtime 和临时资源。
- 禁止 `dropDatabase()`、清空 collection、无条件或宽泛 `deleteMany({})`，也不得修改 canonical seed 或非目标数据。
- cleanup 必须有限超时、幂等并核对 residual；结果未知时先只读审计，不得重复写入。
- cleanup 不替代 post-action verifier。只有业务证据、数据库终态和资源收口分别通过，Profile 才能关闭。
- 无论是否创建数据库资源，都要精确关闭本次 Session、BrowserContext、Chromium、Node 进程、端口、runtime 和 test-results。

## 8. 失败分类与止损

每轮分别报告产品缺陷、测试代码缺陷、fixture 缺陷、Playwright/support 缺陷、环境编排缺陷、工具或权限限制和 `not_executed`。只有稳定复现并证明违反产品合同的行为才能归类为产品缺陷。

单个批次测试资产设计或修改累计达到 2 小时仍未进入稳定业务执行时暂停；公共 support 连续影响两个场景时停止方案；同一方案连续两轮因环境、fixture 或测试资产失败时不得第三轮重跑；每个微型 Profile 最多一次测试资产修复轮。修复后只重跑受影响 Profile 和必要关联证据。

不得在同一任务中同时重构 fixture、重构 runner、修改业务断言并执行正式完整验收。未经工具评估和用户明确批准，不得新建批次专属测试框架。每轮分别记录业务测试、fixture 准备、测试资产修改和环境收口耗时。

## 9. 后端静态及自动化门禁

后端代码、测试或 script 变化后的最终门禁按任务允许的数据库用途执行：

1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`
4. `npm test -- --runInBand`
5. `npm run test:e2e`（仅在任务允许 `standard_test` 数据库连接时执行）

lint、typecheck、build、unit 和 E2E 必须分别报告，互不替代。删除测试资产后必须额外验证 test discovery、TypeScript 全量范围、import、package script 和文档链接无悬空。禁止通过放宽 TypeScript、扩大 exclude、suppression、跳过测试或吞掉退出码制造通过。

## 10. B12～B15 当前待验范围

- B12：当前 `passed=7`、`pending=81`、`failed=0`、`blocked=0`、`not_executed=0`；P0 的 B12-09、B12-31、B12-32、B12-36、B12-37、B12-38、B12-84 有效证据保留，其余 81 项恢复为 `pending`。B12 暂停，下一任务先审查验收清单本身；审查完成前不启动 P1、P2 或新的 Browser 实现。
- B13：116 项稳定验收意图和顺序不变，默认采用证据分层、微型 Profile、2～4 个 canary、独立关闭和最小 fixture。
- B14：115 项稳定验收意图和顺序不变；B14.1 行为等价范围继续保留。
- B15：10 组稳定验收意图和顺序不变，采用相同新方案。

B13～B15 不创建批次专属大型 fixture、evidence matrix、runner、journal、aggregator 或完整 manifest，也不要求一次原子运行关闭整个批次。先完成非 Browser 证据，再执行 canary 与对应微型 Profile，最后执行一条轻量集成冒烟和静态门禁。

本手册不关闭任何待验 Audit ID，不改变 B11 及以前完成状态，不改变 B13～B15 产品范围或验收意图。
