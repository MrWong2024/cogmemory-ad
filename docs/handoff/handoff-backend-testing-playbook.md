# CogMemory AD / 智忆评 后端验证手册

## 1. Scope / Owner

本文是 CogMemory AD backend test layers、真实 runner / command、Database Purpose、DB / process isolation、Browser backend APP / ADMIN role 与当前 backend test asset 事实的 Owner。通用验证候选生成、初始 / 增量 A/B/C、候选归属、完成治理与覆盖对账由 [Codex instruction spec](../codex-instruction-spec.md) §3.9 维护；本文不复制通用候选来源或完成合同。

精确 databaseName、连接变量、env file 与运行模式映射由 [Backend Config Matrix](./handoff-backend-config-matrix.md) 维护；本文维护测试用途语义与运行门禁。产品范围、工作包状态和下一主线由 [Roadmap](./handoff-roadmap.md) 维护；前端测试、Browser evidence execution mode、UI / Agent-assisted / Human smoke，以及 Browser / UI evidence 与 Batch E 状态由 [Frontend Testing Playbook](./handoff-frontend-testing-playbook.md) 维护，本手册不保存对应阶段台账。

本文不复制 API、DTO、Service 或配置明细，也不保存逐轮执行日志、覆盖率流水或完整 spec inventory。

当前不存在 profile-specific retained Browser fixture / admin CLI；generic Browser backend launcher 与 database-purpose safety foundation 仍保留。未来是否新增 Browser fixture / verifier / cleanup，按当前正式风险与 §3、§5、§6 的准入规则判断；UI / Browser execution mode 由 Frontend Testing Playbook 维护。

`database-purpose-gates.e2e-spec.ts` 覆盖 standard E2E AppModule gate 与 generic `start-browser-test-backend.ts` pre-import gate：前者检查 `standard_test` 只连接普通测试库并拒绝 Browser URI，后者检查 `browser_acceptance` launcher 在声明普通测试库时于 AppModule import / DB connection 前 fail-closed。generic launcher 不导入或绑定任何 profile fixture，保留 database-purpose pre-import / connected-runtime gate、AppModule 延迟加载、bootstrap、`configureApp` 与 listen，可作为未来合格 non-UI Browser semantic、Agent-assisted interactive Browser smoke 或其他受控 Browser runtime tooling 的基础；这些用途均继续服从 `browser_acceptance` database 与 APP / ADMIN role boundary（§2）。

Storage / ASR / presentation 相关受控 test double 只证明服务端 API、state 与 persistence invariant，不代表真实 OSS、真实 ASR、真实 Browser 或真实设备验收。

## 2. 数据库用途和隔离

### 2.1 五类用途与运行语义

| 用途 | 何时使用 | 允许操作范围 |
|---|---|---|
| `none` | 任务不需要数据库 | 文档、lint、typecheck、build、静态审计、Playwright runner、production frontend |
| `development` | 日常开发与人工调试 | 仅使用明确归属的开发范围，不作为自动测试或生产操作用途 |
| `standard_test` | unit、普通 HTTP E2E 和允许重建测试数据的自动化 | 按测试资产合同写入、验证和精确清理测试数据 |
| `browser_acceptance` | 合格 non-UI scripted 或 Agent-assisted / human Browser evidence 所需的 fixture、Browser test backend、verifier 与 cleanup | 仅在专用 Browser acceptance 运行链中使用；execution mode 本身不授予 fixture 资格 |
| `production_or_operations` | 用户同时明确授权目标环境与允许操作 | 仅执行该次授权覆盖的生产或运维操作 |

精确 database name、env file 及 main / admin URI variable source 统一按 [Backend Config Matrix](./handoff-backend-config-matrix.md) 解析，本文不维护第二张静态映射。`standard_test` 与 `browser_acceptance` 必须数据库级隔离；namespace 不能替代数据库隔离。任一进程只允许一种用途，不得混合两个用途的配置来源，也不得依赖 dotenv 顺序、继承变量或后加载覆盖选择数据库。

### 2.2 连接前后门禁与进程角色

1. 启动前确定唯一用途，从 [Backend Config Matrix](./handoff-backend-config-matrix.md) 取得该用途的声明数据库与 URI 来源，并校验 URI 声明数据库名与解析结果逐字一致。
2. 建连后读取实际数据库名，再与允许数据库逐字比较；不一致立即失败，不自动回退或猜测其他库。
3. Browser test backend 主连接使用 Browser app 用户与 `readWrite`；合法的测试管理 tooling 如未来存在，其 fixture、verifier、cleanup 独立进程使用 db_admin 与 `dbOwner`。这是通用角色边界；current retained Browser fixture / admin CLI count 为 0。
4. 同时存在不同用途时使用独立进程；需要切换时显式清除或覆盖全部 database purpose、main / admin connection 及其他用途相关变量。
5. 普通测试不得连接 Browser 库；Browser 进程不得连接普通测试库、开发库或生产库；角色互换也必须拒绝。
6. `none` 进程不得建立数据库连接，也不得启动会连接数据库的应用、fixture 或测试后端。

### 2.3 Secret 与进程职责

- 数据库账号密码、完整 `MONGO_URI` / `MONGO_ADMIN_URI`、真实开发人员或医护账号密码、真实患者相关认证凭据、production / operations 凭据、Cookie、Session、token、hash、私有数据、OSS AccessKey / Secret 及 ASR / LLM / SMS 等第三方 Secret 不得写入 tracked 文件、CLI 参数、日志、manifest、截图、产物或最终报告；该规则同样适用于 `standard_test` 与 `browser_acceptance` 的数据库凭据。
- unit / E2E、Browser fixture 或本地人工冒烟创建的 synthetic application user，只要专用于测试或人工冒烟、不对应真实人员、不复用真实密码、不具备生产或真实业务数据访问能力，且对应脚本具有正确环境和数据库 fail-closed 门禁，其应用账号密码属于普通测试常量。可以使用 `12345678` 这类固定简单值并直接写入 tracked test、fixture 或人工冒烟准备脚本，也可以按需要写入测试文档和结果；不强制 Git ignored 文件、环境变量、随机生成或父进程注入。
- 同一 synthetic application account 从 prepare、prepared verify、Browser 登录到 post verify 使用同一个确定性固定值；可以由 tracked 常量或既有稳定配置提供，不得从数据库 URI、数据库用户密码、时间、进程值或其他 Secret 派生。凭据不一致时停止并审计，不反复重试或降低校验。
- fixture runner 与 Browser backend 负责各自数据库职责；Playwright runner 和 production frontend 的用途始终为 `none`。

## 3. 后端证据职责

### 3.1 通用候选治理引用

Risk Classification 定义采用 [Frontend Testing Playbook](./handoff-frontend-testing-playbook.md)；验证候选生成、风险必要性判断、已有证据复用、候选归属、完成治理与覆盖对账，以及风险到最低充分证据层的分配遵循 [Codex instruction spec](../codex-instruction-spec.md) §3.9。

本章只维护 backend-specific evidence capability 与跨层不重复证明边界，不另建 candidate-generation checklist、A/B/C lifecycle 或 risk → evidence mapping。

页面是否可操作不由后端 E2E 冒充；服务端合同已被精确 HTTP E2E 证明时，Browser 不通过 `page.evaluate(fetch(...))`、Browser-side direct HTTP 或人工构造请求重复模拟同一服务端 API bypass / 攻击矩阵。Browser / UI 不可替代语义的 execution mode 由 Frontend Testing Playbook 维护。

测试文件存在、测试名称或代码阅读不等于本次动态通过；本次实际执行与结果由当前任务报告记录。

### 3.2 后端证据层职责

新风险的 `ui_reachable`、`public_api_reachable`、`legitimate_concurrency`、`internal_corruption_only`、`manual_or_real_device` 与 `general_gate` 分类，以 frontend testing playbook“当前测试设计规则”为权威。后端在该分类上只补充以下证据职责：

一个用户流程需要 Browser evidence，不自动要求后端建设 Browser fixture + verifier；UI flow 从 scripted 转为 Agent-assisted / human 后也不自动要求新增或扩张 fixture / verifier。服务端事实已由精确 HTTP E2E 证明时，Agent UI smoke 不再重复 post database verifier。真正 non-UI Browser semantic 是否使用 scripted，以及 objective UI / subjective-professional-real-device 如何分流，以 frontend testing playbook“Browser 证据的执行模式”为唯一项目级权威。

| 层级 | 负责 | 不能替代 |
|---|---|---|
| unit / pure spec | 局部判断、DTO、Controller 参数传递、Service 分支、mapper、状态边界与廉价防御 | 真实 HTTP、Guard、全局 Pipe、数据库终态 |
| HTTP E2E | 公开 API 绕过与合法并发的认证、401/403、Guard、Pipe、DTO whitelist、ownership、权限、状态门禁、重复提交、幂等、revision / CAS conflict、原子写入、audit、非法调用无副作用与真实 MongoDB 终态 | 页面入口、控件、Browser API 和用户体验 |
| database verifier | 仅在任一 Browser execution mode 的写入结果无法由现有 HTTP E2E 充分证明时，补充写入次数、audit、protected roots 或持久终态 | 不因 UI flow 转 Agent-assisted 自动新增，不重复已有准确 HTTP E2E，不替代页面行为 |
| static gate | lint、typecheck、build、discovery、依赖、import、路由和测试资产链接 | 动态权限、状态机、数据库或 Browser 通过 |

页面没有入口但公开 API 可直接调用的认证、权限、DTO、ownership 与状态绕过，由 HTTP E2E 证明拒绝和数据库无非法变化，不在 Browser 再模拟一次 HTTP 攻击。合法并发使用两个真实可达请求或独立会话，验证原子性、幂等、写入次数与终态；不可替代的页面恢复或 UI 交互由 Agent-assisted / human，真正 non-UI Browser semantic 才按 frontend testing playbook 评估 scripted。Browser 对这类风险只在有价值时证明真实页面产生正确最低充分 wiring，不复制服务端非法调用矩阵。

已进入可能写入的 Service，或涉及原子更新、部分写入、幂等、并发、不可逆状态的请求，必须验证数据库终态、写入次数与受保护字段。Guard / Pipe 之前拒绝的请求按风险使用最低充分无副作用证据，不机械为每个错误组合复制全库快照。代码阅读、测试文件存在或测试名称存在不得写成本次动态通过。

### 3.3 低频并发、CAS 与安全拒绝

- 系统级允许正常并行：医护 A 操作患者 A、医护 B 操作患者 B，以及不同 `Patient`、`Visit`、`ScaleInstance` 或 `PatientAdministrationSession` 的读写，可以由独立请求和会话正常并行，不建立全局业务队列。
- 同一业务聚合、同一个 `ScaleInstance` 或同一个 Session 内，在业务允许时优先一个阶段只有一个主要写入主体；读操作正常并发，不把多人实时协同编辑同一评估作为默认能力。该原则不表示 Node 单线程、全局 mutex、MongoDB 全局锁、Redis 锁、`session locked` 字段、所有 HTTP 请求排队、分布式锁或 worker 全局串行，也不授权新增技术锁模型。
- 低频真实并发的正确目标不是让全部竞争操作都成功；一个写入成功、另一个因服务端状态或 revision 已变化而被 CAS 安全拒绝，可以是正确结果。
- 409 本身不是产品缺陷。判定取决于是否存在真实竞争、数据是否保持一致、最新服务端状态是否可读取，以及用户是否能在明确提示后显式重试。
- 正常无竞争操作稳定 409、没有其他写入却持续 stale、成功事实丢失、重复副作用、状态矛盾或无法恢复，才是产品 `gap`，必须按当前合同关闭。
- 网络结果不确定、409 或页面恢复后，POST / PATCH / DELETE 等有副作用操作不得自动 retry / replay；先 GET 最新权威状态，再由用户决定是否重新操作。
- 不得仅为减少 409 默认建设自动 retry、自动 merge、锁、队列、lease、多套 revision 或分布式协调。只有当前业务合同证明这些机制不可缺少时，才能按最低充分范围引入。
- 并发 E2E 只选择少量代表性真实竞争，证明 CAS 有效、一个成功、一个安全拒绝、成功事实不被覆盖、无重复副作用、数据库终态一致且可恢复。不穷举所有 step × endpoint × role × interleaving；已有 unit / HTTP E2E 的低层精确证据仍适用于当前代码态时，不要求 Browser 再排列同一组合。
- `MediaEvidence` 的“两阶段 Storage / DB CAS + 失败精确补偿”继续保留；它承担真实对象与数据库引用的一致性、单一引用和零残留责任，不是为了隐藏普通 CAS 拒绝，也不因本次复杂度治理删除。

## 4. 定向 Jest / HTTP E2E 命令

命令生成期核验、discovery、定向执行、目标集合精确匹配、`not_executed` 判定与是否扩大测试范围统一遵循 [Codex instruction spec](../codex-instruction-spec.md) §3.8 / §3.9；本节只保留 CogMemory AD 当前真实 Jest / HTTP E2E runner 与命令入口。

当前 `npm run test:e2e` 包装器固定向 Jest 传入 `test/jest-e2e.json` 和 `--runInBand`，未读取 `process.argv`，因此 npm 追加参数不会透传。禁止用下列命令表示定向运行：

```powershell
npm run test:e2e -- <target>
```

以下命令均从 `backend` 目录执行，并在 Jest 启动前设置 `NODE_ENV=test` 与 `COGMEMORY_DATABASE_PURPOSE=standard_test`。discovery 只列出目标文件、不连接数据库，也不证明动态测试通过；正式运行导入应用时加载普通测试配置，并连接由 [Backend Config Matrix](./handoff-backend-config-matrix.md) 为 `standard_test` 解析出的数据库，实际库名仍须通过连接前后门禁。

单文件 discovery：

```powershell
node -e "process.env.NODE_ENV='test'; process.env.COGMEMORY_DATABASE_PURPOSE='standard_test'; require('jest').run(['--config', './test/jest-e2e.json', '--runInBand', '--listTests', '--runTestsByPath', ...process.argv.slice(1)])" ./test/<target>.e2e-spec.ts
```

单文件正式运行：

```powershell
node -e "process.env.NODE_ENV='test'; process.env.COGMEMORY_DATABASE_PURPOSE='standard_test'; require('jest').run(['--config', './test/jest-e2e.json', '--runInBand', '--runTestsByPath', ...process.argv.slice(1)])" ./test/<target>.e2e-spec.ts
```

多文件 discovery：

```powershell
node -e "process.env.NODE_ENV='test'; process.env.COGMEMORY_DATABASE_PURPOSE='standard_test'; require('jest').run(['--config', './test/jest-e2e.json', '--runInBand', '--listTests', '--runTestsByPath', ...process.argv.slice(1)])" ./test/<first-target>.e2e-spec.ts ./test/<second-target>.e2e-spec.ts
```

多文件正式运行：

```powershell
node -e "process.env.NODE_ENV='test'; process.env.COGMEMORY_DATABASE_PURPOSE='standard_test'; require('jest').run(['--config', './test/jest-e2e.json', '--runInBand', '--runTestsByPath', ...process.argv.slice(1)])" ./test/<first-target>.e2e-spec.ts ./test/<second-target>.e2e-spec.ts
```

正式运行前必须用当前 runner discovery 得到目标文件集合，并要求与预期目标精确一致；具体 discovery / `not_executed` / `unknown` 治理引用 [Codex instruction spec](../codex-instruction-spec.md) §3.8。

## 5. Fixture、verifier、cleanup 与 Stage

### 5.1 最小 fixture 与 Profile 生命周期

fixture 是“合法起点构造器”（legal minimal starting point），不是第二个产品、catalog 或 seed 治理器：优先使用现有 API、通用 test factory 或最小数据库 builder；不按每个 Audit ID 建 fixture，不制造产品永远不能持久化的状态，不建设批次专属 runner、journal、aggregator 或完整 manifest。写入、冲突和并发场景使用隔离 Report；只读场景仅在可寻址、无污染且所有权清楚时共享最小状态。

Agent-assisted interactive Browser smoke 优先复用已有合法测试起点、公开 API 或最小准备能力，不因“Agent 也使用 Browser”自动新增大型 fixture、broad DB hash、专属 post verifier、catalog 副本或第二套业务状态。只有需要独立合法 synthetic 起点、Browser 写入了尚未被 HTTP E2E 充分证明的持久事实，或确有 namespace / cleanup 隔离风险时，才增加对应的最小 fixture / verifier / cleanup。

已经存在且符合当前正式合同的 shared canonical 数据只读复用，不属于当前 Profile 的 namespace ownership。fixture 不得自动 materialize、update、repair 或 reseed shared canonical；canonical 不满足当前正式合同时必须 fail-closed 并报告，不得为让 Profile 启动而修补。prepared verifier 保持只读，不创建、修复或删除数据；fixture 与 cleanup 只管理当前 Profile 明确拥有的 namespace 资源，不修改 canonical seed / catalog。

“前端生产代码发生变化”本身不是 fixture 修改或重建触发器。只有 DTO 必填字段、Schema、权限、服务端状态前置、seed / catalog 或其他 fixture 必须满足的数据前置合同真实变化时才调整 fixture；纯 UI copy、布局、selector、展示结构和不改变数据前置的普通交互变化，不修改 fixture，也不授权 patch 已被 v1.20 取消资格的 scripted UI spec / support。是否需要 fresh production frontend build 是 production-connected Browser evidence 运行门禁，与 fixture 是否变化相互独立，具体规则引用 frontend testing playbook 3.1。

每个 Profile 独立完成：

1. 选择唯一、可回收的 Profile 标识和最小资源集合。
2. db_admin / `dbOwner` 独立进程 prepare；重复 prepare 默认拒绝，replace 必须显式且精确。
3. 执行只读 prepared verifier；不得创建、修复或删除数据。
4. prepared 门禁通过后才启动 app / `readWrite` 的 Browser backend；Playwright 仍为 `none`。
5. 在同一代码态和前置下按已选择的 execution mode 执行一次最低充分 Browser evidence；只有 non-UI Browser semantic 才执行 scripted micro-profile。
6. 执行与副作用匹配的只读 verifier；零写入场景也验证报告、audit、`updatedAt` 和受保护资源未变。
7. logout、关闭 Browser/Context、停止进程，按所有权精确 cleanup，再执行幂等 residual 核对。

一个任务可以包含多个 Profile，但不得跨 Profile 拼接前置、可写 Report、数据库终态或 cleanup。后续无关 Profile 失败，不得使此前独立闭环证据失效。

### 5.2 写入、并发、verifier 与 Stage

- 写请求按风险验证 Body 白名单、次数、actor、状态转换、审计和最终 MongoDB 状态；禁止自动 retry、replay 或 polling。同一业务聚合在一个业务阶段优先一个主要写入主体，不影响独立患者或独立量表实例正常并行。真实竞争允许“一个成功 + 一个 CAS 安全拒绝”，前提是数据一致、最新状态可读且用户可显式重试。
- 多角色或双 Session 使用真实独立会话；网络结果不确定时先只读核对服务端事实，不得重试写请求。
- Evidence 上传继续验证 prepare / Storage / `MediaEvidence` / session attach 的两阶段 CAS 与失败精确补偿，确保未被权威 session 接受的本次对象和记录不残留；该一致性职责不得用前端提示或普通 409 断言替代。
- verifier 只在现有 HTTP E2E 不足时补充任一 Browser execution mode 的写入终态，优先验证业务不变量、相对增量、禁止副作用、actor / ownership、持久终态和受保护事实未漂移；适用时拒绝零写入、额外写入、错误 actor、错误状态、缺失 audit、受保护字段漂移和跨 Profile 污染。UI flow 转 Agent-assisted 后不自动增加 verifier；Browser 只证明 wiring 或当前正常流程、没有新增未被低层覆盖的持久写入时，不机械增加 verifier。
- 禁止把与正式业务合同无关的历史固定 revision、内部累计 count、合法产品行为产生的累计事件为 0，或与当前 Profile 主风险无关的内部统计设为门禁。真正的数量不变量仍严格 exact，包括禁止副作用时新增数量必须为 0、at-most-once / exactly-once、重复提交只能产生一次写、禁止重复 Evidence，以及 cardinality 本身就是正式业务合同的情形。
- Stage 只协调正式页面或公开 API 能真实产生的并发窗口；必须少量、固定、边界明确、幂等且可精确 cleanup。禁止用直接改库、mock 响应或 Stage 创造产品不可达状态。
- Stage 前后只允许目标 transition；非目标报告、Patient、Visit、ScaleInstance、narrative、snapshot、audit、seed 与其他 Profile 保持不变。

### 5.3 Cleanup 与复杂度治理

- cleanup 只删除 Profile 明确拥有的 namespace、marker、runtime 和临时资源；禁止 `dropDatabase()`、清空 collection、无条件或宽泛 `deleteMany({})`，不得修改、删除或重建 canonical seed / catalog 及非目标数据。
- cleanup 必须有限超时、幂等并核对 residual；结果未知时先只读审计，不重复写入。cleanup 不替代 post-action verifier。
- 精确关闭本次 Session、BrowserContext、Chromium、Node 进程、端口、runtime 与 test-results；不终止所有权不明的资源。
- fixture、HTTP E2E、verifier 和 cleanup 的通用复杂度治理引用 `docs/codex-instruction-spec.md` 3.10；按职责、状态、进程、Secret、生命周期、耦合和重复实现判断，不以行数或文件数单独决定通过、失败或拆分。
- 当 fixture / verifier / support 的维护工程明显超过所证明的 Browser 风险，或开始复制 catalog、服务端状态判断和业务流程而形成第二套实现时，停止继续扩张并回到 frontend testing playbook 重新评估 execution mode。不得为了把 UI flow 伪装成 scripted 而扩张 fixture、support、test-only hook、复杂 harness 或第二套业务状态模型；大量稳定化基础设施本身进一步支持 Agent-assisted / human，不得用更多后端测试资产追求 scripted UI green。

## 6. 失败归因、Browser 止损与执行范围 Owner

- 活动场景状态、跨层 Failure Attribution、Browser-only evidence 的准确记录、scripted / Agent-assisted / human execution-mode 重选与 Browser stop-loss，由 [Frontend Testing Playbook](./handoff-frontend-testing-playbook.md) 统一维护；Backend Playbook 不建立第二套状态或失败分类。
- 命令未实际执行、discovery / runner 错误、`not_executed` 与临时 `unknown` 的通用执行语义遵循 [Codex instruction spec](../codex-instruction-spec.md) §3.8。
- 验证候选治理、已有证据复用、最低充分证据、是否扩大为完整 unit / HTTP E2E，以及“最终代码态”不自动构成扩大理由，统一遵循 [Codex instruction spec](../codex-instruction-spec.md) §3.9；backend-specific 真实 runner 仍见 §4。
- Backend 测试基础设施问题本身不自动等于 production defect；只有稳定复现并证明违反正式产品合同，才按 Frontend Testing Playbook 的 Failure Attribution 归入产品问题。后端测试资产、fixture、数据库或 runner 问题修对应测试层，不得反向塑造 production 锁、重试、队列或状态机。

## 7. Current asset 与 historical evidence 边界

- current backend test asset 以当前 commit 的 tracked files、package / Jest config 和实际 discovery 为准；Playbook 不维护完整 spec inventory 或 aggregate test count。
- historical green、旧 fixture / verifier / cleanup、旧 suite/test 数和阶段执行日志由 Git history 追溯，不代表当前代码态 dynamic green。
- historical evidence 是否仍可复用，须基于当前 diff、当前合同与当前资产判断；测试文件存在或历史通过本身不能替代本次应执行的验证。
- current 产品 / WP 状态由 Roadmap 维护；Browser / UI evidence 当前状态由 Frontend Testing Playbook 维护，Owner 入口见 §1。
- 当前任务实际执行的 unit / HTTP E2E / verifier 等验证由该任务最终报告记录，不回写为长期阶段台账。
- 测试资产的历史存在或退役不自动回退产品 Owner 已确认的产品状态；已退役资产不能冒充 current executable。
