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
| Batch D / B12 | 清单治理已完成，产品验收尚未恢复执行；活动场景 `passed=2`、`pending=15`、`failed=0`、`blocked=0`、`not_executed=0`，具体清单、状态和旧 ID 映射见 frontend testing playbook 第 9 节 |
| Batch D / B13–B15（含 B14.1） | 候选断言和历史设计输入保留，尚未执行；正式执行前须先场景化审查 |
| Batch E | 8 个真实设备或人工项目尚未执行 |

roadmap 继续维护产品范围和工作包状态；testing playbook 治理不得自动改变 roadmap。

当前状态：B12-P0 后端合同已完成；既有分层证据已迁移为 `B12-S03`、`B12-S05` 通过，原 B12-84 的“无新增路由”证据继续有效并归入通用路由边界门禁。活动场景、具体状态和旧 ID 映射以 frontend testing playbook 第 9 节为权威来源。

B12-P1 实验测试资产已全部移除，未新增关闭任何活动场景。B12 清单治理已经完成，产品验收尚未恢复执行；下一步须先设计最低充分执行方案，并经用户确认后才能启动 P1～P5 或新的 Browser 实现。未经确认不得重建 B12 专属 fixture/support。

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

### 3.1 定向 Jest / HTTP E2E 命令契约

当前 `npm run test:e2e` 是完整 HTTP E2E 入口：它在导入应用前设置 `NODE_ENV=test` 和 `COGMEMORY_DATABASE_PURPOSE=standard_test`，然后以 `test/jest-e2e.json`、`--runInBand` 及该配置的 `testRegex` 启动 Jest。该 Node 包装器传给 `jest.run()` 的参数数组是固定值，未读取 `process.argv`，所以 npm 追加参数不会进入 Jest。禁止使用以下命令表示定向运行：

```powershell
npm run test:e2e -- <target>
```

以下定向命令均从 `backend` 目录执行，与完整 E2E 一致地在 Jest 启动前设置 `NODE_ENV=test` 和 `COGMEMORY_DATABASE_PURPOSE=standard_test`，并使用同一 Jest 配置与串行执行语义；正式运行导入应用时据此加载 `.env.test` 并保持 `standard_test` 数据库用途。discovery 只列出文件，不连接数据库，也不证明任何动态测试通过。`<target>`、`<first-target>` 与 `<second-target>` 必须替换为仓库内相对于 `backend` 的实际 E2E 文件路径。

单文件 discovery：

```powershell
node -e "process.env.NODE_ENV='test'; process.env.COGMEMORY_DATABASE_PURPOSE='standard_test'; require('jest').run(['--config', './test/jest-e2e.json', '--runInBand', '--listTests', '--runTestsByPath', ...process.argv.slice(1)])" ./test/<target>.e2e-spec.ts
```

单文件正式运行：

```powershell
node -e "process.env.NODE_ENV='test'; process.env.COGMEMORY_DATABASE_PURPOSE='standard_test'; require('jest').run(['--config', './test/jest-e2e.json', '--runInBand', '--runTestsByPath', ...process.argv.slice(1)])" ./test/<target>.e2e-spec.ts
```

多文件 discovery 与正式运行分别使用同一入口，并将目标路径逐个作为 Node 参数传入：

```powershell
node -e "process.env.NODE_ENV='test'; process.env.COGMEMORY_DATABASE_PURPOSE='standard_test'; require('jest').run(['--config', './test/jest-e2e.json', '--runInBand', '--listTests', '--runTestsByPath', ...process.argv.slice(1)])" ./test/<first-target>.e2e-spec.ts ./test/<second-target>.e2e-spec.ts
node -e "process.env.NODE_ENV='test'; process.env.COGMEMORY_DATABASE_PURPOSE='standard_test'; require('jest').run(['--config', './test/jest-e2e.json', '--runInBand', '--runTestsByPath', ...process.argv.slice(1)])" ./test/<first-target>.e2e-spec.ts ./test/<second-target>.e2e-spec.ts
```

正式运行前必须把 `--listTests` 输出规范化为文件路径集合，并与预期目标做完全相等比较；单文件只能发现一个目标，多文件不得缺失、重复或包含额外文件。以下任一情况触发立即停止：discovery 为 0、discovery 包含非目标文件、正式运行出现无关测试文件或完整 E2E 套件启动迹象、长时间没有目标测试摘要。不得通过延长超时掩盖范围错误，也不得用该次结果关闭或判失败目标验收项。

参数或选择器错误导致目标没有实际运行时，目标记为 `not_executed`。命令已经启动，但因超时且没有可靠测试摘要、输出不完整或证据不足而无法判断时，执行报告中的临时测试结论记为 `unknown`；`unknown` 不是 Audit ID 状态，不得写入 Audit 清单。相关 Audit ID 不得据此关闭、通过或失败，尚未形成有效证据时通常保持原有 `pending`；只有存在符合既有定义的明确且持续外部环境、工具或权限阻断时，才使用 `blocked`，目标测试未实际执行且符合项目定义时可使用 `not_executed`。

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

- B12：原 88 个 ID 不再作为活动关闭对象；当前有 17 个活动场景，状态为 `passed=2`、`pending=15`、`failed=0`、`blocked=0`、`not_executed=0`，其中 `B12-S03`、`B12-S05` 已通过。其余活动状态和旧 ID 映射以 frontend testing playbook 第 9 节为准；本手册继续负责数据库用途、后端证据、fixture、verifier 和 cleanup 规则。清单治理已完成，产品验收尚未恢复执行。
- B13：原 116 项属于候选断言和历史设计输入，本次不改写具体候选条目；正式执行前须先场景化审查。
- B14：原 115 项和 B14.1 行为范围属于候选断言和历史设计输入，本次不改写具体候选条目；正式执行前须先场景化审查。
- B15：原 10 组属于候选断言和历史设计输入，本次不改写具体候选条目；正式执行前须先场景化审查。

B13～B15 的场景化审查允许合并重复断言、迁移通用门禁、退役失去阶段前提的断言，并重新分配最低充分证据层；审查必须保留核心业务风险、不可替代语义、旧条目映射和已有有效证据，不得冻结历史数量或顺序。

场景化审查后仍不创建批次专属大型 fixture、evidence matrix、runner、journal、aggregator 或完整 manifest，也不要求一次原子运行关闭整个批次。先完成非 Browser 证据，再执行 2～4 个 canary 与对应微型 Profile，最后执行一条轻量集成冒烟和通用门禁。

本手册不关闭任何待验活动场景，不改变 B11 及以前完成状态，不改变 B13～B15 产品范围或具体候选条目。B12～B15 的活动场景清单、具体状态和旧 ID 映射以 frontend testing playbook 为权威来源。
