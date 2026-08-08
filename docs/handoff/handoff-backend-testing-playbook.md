# CogMemory AD / 智忆评 后端验证手册

## 1. 文档定位

本文档只维护后端稳定验证规则与当前仍有行动价值的边界：数据库用途和隔离、Secret 与进程职责、unit / HTTP E2E / database verifier 分工、低频并发与 CAS、精确 Jest discovery、fixture / verifier / cleanup 生命周期，以及按真实影响选择执行范围。

跨层分类、Browser 规则和真实设备边界见 frontend testing playbook；产品范围与工作包状态见 roadmap；当前 endpoint、DTO、Service 和实现事实见 backend maps / snapshot。既有已关闭阶段的详细命令、数字和执行证据由 Git 历史与当前测试资产追溯，本 Playbook 不维护历史证据账本。

## 2. 数据库用途和隔离

### 2.1 五类用途与固定映射

| 用途 | 项目数据库 | 允许范围 |
|---|---|---|
| `none` | 不连接数据库 | 文档、lint、typecheck、build、静态审计、Playwright runner、production frontend |
| `development` | `cogmemory_ad_dev` | 日常开发与人工调试 |
| `standard_test` | `cogmemory_ad_test` | unit、普通 HTTP E2E 和允许重建测试数据的自动化 |
| `browser_acceptance` | `cogmemory_ad_browser_test` | 最小 Browser fixture、Browser test backend、verifier 与精确 cleanup |
| `production_or_operations` | 项目命名基线 `cogmemory_ad` | 仅在用户同时明确授权目标环境与允许操作后使用 |

`standard_test` 与 `browser_acceptance` 必须数据库级隔离；namespace 不能替代数据库隔离。任一进程只允许一种用途，不得叠加 `.env.test` 与 `.env.browser-acceptance`，也不得依赖 dotenv 顺序、继承变量或后加载覆盖选择数据库。

### 2.2 连接前后门禁与进程角色

1. 启动前确定唯一用途，并校验 URI 声明数据库名与固定映射逐字一致。
2. 建连后读取实际数据库名，再与允许数据库逐字比较；不一致立即失败，不自动回退或猜测其他库。
3. Browser test backend 主连接使用 Browser app 用户与 `readWrite`；fixture、verifier、cleanup 独立进程使用 db_admin 与 `dbOwner`。
4. 同时存在不同用途时使用独立进程；需要切换时显式清除或覆盖 `MONGO_URI`、`MONGO_ADMIN_URI`、`COGMEMORY_DATABASE_PURPOSE` 及用途相关变量。
5. 普通测试不得连接 Browser 库；Browser 进程不得连接普通测试库、开发库或生产库；角色互换也必须拒绝。
6. `none` 进程不得建立数据库连接，也不得启动会连接数据库的应用、fixture 或测试后端。

### 2.3 Secret 与进程职责

- 密码、完整连接串、Cookie、Session、token、hash 和私有数据不得写入 tracked 文件、CLI 参数、日志、manifest、截图、产物或最终报告。
- 本地隔离测试固定凭据只能来自项目约定且 Git ignored 的本地配置，或由同一隔离父进程稳定注入；不得从数据库 URI、时间、进程值或其他 Secret 派生。
- 同一 Profile 从 prepare、prepared verify、Browser 登录、post verify 到 cleanup 使用一致账号语义；凭据不一致时停止并审计，不反复重试或降低校验。
- fixture runner 与 Browser backend 负责各自数据库职责；Playwright runner 和 production frontend 的用途始终为 `none`。

## 3. 后端证据职责

### 3.1 风险候选与分层

新增或修改后端合同时，至少核对 Controller / Route / Guard / Pipe、DTO whitelist 与转换、ownership / actor、Service 状态与不可逆动作、Repository / Mongoose 原子条件、Schema / 索引、mapper 隐私、audit / protected roots、Storage 等外部副作用，以及相关证据形成后调用链是否变化。通用候选生成、归属、增量对账和止损统一引用 `docs/codex-instruction-spec.md` 3.9，不为每个 Controller、DTO 或 Schema 字段机械建立测试。

| 层级 | 负责 | 不能替代 |
|---|---|---|
| unit / pure spec | 局部判断、DTO、Controller 参数传递、Service 分支、mapper、状态边界与廉价防御 | 真实 HTTP、Guard、全局 Pipe、数据库终态 |
| HTTP E2E | 认证、401/403、Guard、ValidationPipe、Body 白名单、ownership、错误码、状态机、幂等、原子写入、audit 与真实 MongoDB 终态 | 页面入口、控件、Browser API 与用户体验 |
| database verifier | 现有 HTTP E2E 不足时补 Browser 写入次数、audit、protected roots 或持久终态 | 不重复准确 HTTP E2E，不替代页面行为 |
| static gate | lint、typecheck、build、discovery、依赖、import、路由与测试资产链接 | 动态权限、状态机、数据库或 Browser 通过 |

页面无入口但公开 API 可直接调用的权限、DTO、ownership 与状态绕过由 HTTP E2E 证明拒绝和数据库无非法变化。进入可能写入的 Service，或涉及原子更新、部分写入、幂等、并发、不可逆状态时，必须按风险验证数据库终态、写入次数与受保护字段；Guard / Pipe 前拒绝不机械复制全库快照。

### 3.2 低频并发、CAS 与安全拒绝

- 医护 A 操作患者 A、医护 B 操作患者 B，以及不同 `Patient`、`Visit`、`ScaleInstance` 或 `PatientAdministrationSession` 可以正常并行，不建立全局业务队列。
- 同一业务聚合、同一个 `ScaleInstance` 或 Session 内，业务允许时优先一个阶段只有一个主要写入主体；读操作正常并发。该原则不表示 Node 单线程、全局 mutex、MongoDB 全局锁、Redis 锁、`session locked` 字段、所有 HTTP 请求排队、分布式锁或 worker 全局串行。
- 一个合法写入成功、另一个因状态或 revision 已变化而被 CAS 安全拒绝，可以是正确结果；409 本身不是产品缺陷。
- 正确结果必须保证成功事实不被旧写覆盖、无重复副作用、数据库一致、最新权威状态可读取，并由用户在明确提示后显式决定是否重试。正常无竞争操作稳定冲突、事实丢失、重复副作用、状态矛盾或无法恢复才是产品 gap。
- 网络结果不确定、409 或页面恢复后，POST / PATCH / DELETE 不得自动 retry / replay；先 GET 最新权威状态。不默认建设自动 merge、锁、队列、lease、多套 revision 或分布式协调。
- 并发 E2E 只选少量代表性真实竞争，证明 CAS、一个成功、一个安全拒绝、无覆盖、无重复副作用、终态一致和可恢复；不穷举所有 step × endpoint × role × interleaving，也不要求 Browser 重排已有低层精确证据。
- `MediaEvidence` 的“两阶段 Storage / DB CAS + 失败精确补偿”继续保留，保护真实对象与数据库引用的一致性、单一引用和零残留，不因验证范围收缩而削弱。

## 4. 定向 Jest / HTTP E2E

当前 `npm run test:e2e` 包装器固定向 Jest 传入 `test/jest-e2e.json` 和 `--runInBand`，未读取 `process.argv`，因此 npm 追加参数不会透传。不得用 `npm run test:e2e -- <target>` 声称定向运行。

以下命令从 `backend` 目录执行，并在 Jest 启动前设置 `NODE_ENV=test` 与 `COGMEMORY_DATABASE_PURPOSE=standard_test`。discovery 只列目标、不连接数据库，也不证明动态通过；正式运行导入应用时连接 `cogmemory_ad_test`。

单文件 discovery：

```powershell
node -e "process.env.NODE_ENV='test'; process.env.COGMEMORY_DATABASE_PURPOSE='standard_test'; require('jest').run(['--config', './test/jest-e2e.json', '--runInBand', '--listTests', '--runTestsByPath', ...process.argv.slice(1)])" ./test/<target>.e2e-spec.ts
```

单文件正式运行：

```powershell
node -e "process.env.NODE_ENV='test'; process.env.COGMEMORY_DATABASE_PURPOSE='standard_test'; require('jest').run(['--config', './test/jest-e2e.json', '--runInBand', '--runTestsByPath', ...process.argv.slice(1)])" ./test/<target>.e2e-spec.ts
```

多文件只需在同一命令末尾列出精确目标；discovery 增加 `--listTests`，正式运行不加。正式运行前把 discovery 输出规范化为文件路径集合并与预期完全相等；0 个、缺失、重复、额外文件、完整套件迹象或长期无目标摘要时立即停止，不延长超时掩盖范围错误。

参数或选择器错误导致目标未执行时记 `not_executed`；输出不足时临时记 `unknown`，不能关闭场景。明确持续的外部环境、工具或权限阻断才记 `blocked`。fixture E2E 不冒充产品 Browser，页面文本不替代 verifier，cleanup 成功不推导业务通过。

## 5. Fixture、verifier、cleanup 与 Stage

### 5.1 最小 Profile 生命周期

fixture 只制造合法最小前置：优先使用现有 API、通用 test factory 或最小数据库 builder；不按 Audit ID 建 fixture，不制造产品不可达状态，不建设批次专属 runner、journal、aggregator 或完整 manifest。写入、冲突和并发使用隔离业务根；只读场景仅在可寻址、无污染且所有权清楚时共享最小状态。

每个 Profile 独立完成：

1. 选择唯一、可回收的 Profile 标识和最小资源集合。
2. db_admin / `dbOwner` 独立进程 prepare；重复 prepare 默认拒绝，replace 必须显式且精确。
3. 执行只读 prepared verifier，不得创建、修复或删除数据。
4. prepared 门禁通过后才启动 app / `readWrite` 的 Browser backend；Playwright 仍为 `none`。
5. 在同一代码态和前置下执行一次 Browser 微型 Profile。
6. 执行与副作用匹配的只读 post verifier；零写入场景也核对 audit、`updatedAt` 与受保护资源未变。
7. logout、关闭 BrowserContext、停止进程，按所有权精确 cleanup，再执行幂等 residual 核对。

不得跨 Profile 拼接前置、可写业务根、数据库终态或 cleanup；后续无关 Profile 失败不使此前独立闭环证据失效。

### 5.2 写入、verifier 与 Stage

- 写请求按风险验证 Body 白名单、次数、actor、状态转换、审计和最终 MongoDB 状态；多角色或双 Session 使用真实独立会话，网络结果不确定时先只读核对。
- Evidence 上传验证 prepare / Storage / `MediaEvidence` / session attach 的两阶段 CAS 与失败精确补偿，确保未被权威 Session 接受的本次对象和记录不残留。
- verifier 只在现有 HTTP E2E 不足时补 Browser 终态；适用时拒绝零写入、额外写入、错误 actor / 状态、缺失 audit、受保护字段漂移和跨 Profile 污染。
- Stage 只协调正式页面或公开 API 能真实产生的少量固定并发窗口；禁止直接改库、mock 响应或创造产品不可达状态。Stage 前后只允许目标 transition，非目标 Patient、Visit、ScaleInstance、报告、audit、seed 与其他 Profile 保持不变。

### 5.3 Cleanup 与复杂度

- cleanup 只删除 Profile 明确拥有的 namespace、marker、runtime 和临时资源；禁止 `dropDatabase()`、清空 collection、无条件或宽泛 `deleteMany({})`，不得修改 canonical seed 或非目标数据。
- cleanup 必须有限超时、幂等并核对 residual；结果未知时先只读审计，不重复写入。cleanup 不替代 post verifier。
- 精确关闭本次 Session、BrowserContext、Chromium、Node 进程、端口、runtime 与 test-results，不终止所有权不明的资源。
- fixture、HTTP E2E、verifier 和 cleanup 的复杂度按职责、状态、进程、Secret、生命周期、耦合和重复实现判断，不以行数或文件数单独决定通过、失败或拆分。

## 6. 失败、止损与执行范围

失败先分类为 `product`、`spec/test`、`fixture`、`support/runner`、`environment`、`tool limitation` 或 `not_executed`。只有稳定证明违反正式产品合同才归类为产品缺陷；测试工具时序、fixture、runner 或环境问题只修对应层，不得自动演化为 production 并发、锁、重试或协调要求。

测试范围按真实影响选择：

- 纯文档变化只执行文档、链接、diff 与 Git 范围检查。
- 单个测试文件变化先执行精确 discovery，再执行定向测试和必要静态检查。
- 单模块生产代码变化执行受影响 unit / HTTP E2E 及对应 lint、typecheck、build；在最终代码态实际通过的定向 unit / HTTP E2E 可以作为最终有效动态证据。
- 只有认证或公共 Guard / Pipe、Schema 或共享持久化合同、公共 mapper / 共享基础设施、跨模块公共合同、影响边界无法由定向证据可靠界定、工作包最终收口明确要求或用户明确要求等实际依据，才执行完整 unit / 完整 HTTP E2E。
- “最终代码态”只决定何时运行已经证明有必要的完整回归，不构成扩大范围的理由。不得仅因到达最终代码态、“为了保险”“为了更完整”或后端代码有修改而执行完整套件。

lint、typecheck、build、unit、HTTP E2E、Browser、verifier 与 cleanup 互不替代。必须保留后端 TypeScript 全量 typecheck 的既有触发合同，不得用定向测试削弱类型、权限、Schema、数据完整性、不可逆业务事实或真实 HTTP 合同；也不得通过扩大 exclude、suppression、跳过测试或吞掉退出码制造通过。

## 7. 当前仍有行动价值的边界

- WP-10 F2-P2 recovery、staff Axe 分类和真实设备验收由 frontend testing playbook 与 roadmap 维护；后端只在这些 Profile 的数据库终态缺少既有 HTTP E2E 证据时补最低充分 verifier。
- fake Storage、stub ASR 和 desktop Browser 不证明真实患者 OSS、真实 ASR 服务、真实设备或生产部署。真实服务验收按 roadmap 既定边界执行，不因此扩大 F3 或机械重跑已关闭后端套件。
- 当前 endpoint / DTO / Service 事实以 backend maps / snapshot 为准。规则或当前仍待验边界变化时更新本文档；已关闭阶段的文件名清单、passed / pending / gap 数字和执行故事由 Git 历史及当前测试资产追溯。
