# CogMemory AD / 智忆评 后端验证手册

## 1. 文档定位

本文档是后端验证的 active playbook，只维护三类内容：当前执行规则、仍待执行的 Browser 验收所依赖的后端 fixture 合同，以及已完成范围的最终证据索引。逐阶段命令、失败重试、临时 namespace 和执行流水由 Git 历史承担，不在本文重复保存。

本文档不改变产品、接口、DTO、Schema、测试合同或 roadmap 工作包状态。当前唯一事实是：WP-02、WP-04、Batch A 已完成；Batch B 桌面范围已完成；Batch C 的 B7、B8 与 B9 已完成，B9 最终为 51 active pass + B9-32 obsolete。B10-A fixture 与分批验收合同已完成；B10-B `generation-workflow` 当前为 43 pass / 0 fail / 5 not_executed / 0 obsolete，因此 B10-B 与 B10 整体均未完成；`public-surface-security` 尚未启动，Batch D 尚未启动；Batch E 的 8 项真实设备、辅助技术或人工验收继续保留。

## 2. 当前验证状态

| 范围 | 当前状态 | 当前结论 |
|---|---|---|
| 后端代码门禁 | 已建立 | 最终代码态独立执行 lint、typecheck、build、unit、E2E 五项门禁 |
| D-038 数据库隔离 | 已实现并认证 | `standard_test` 与 `browser_acceptance` 双向拒绝，建连前后库名门禁和数据库用户角色门禁有效 |
| WP-02 / B16 | 已完成 | replacement V2+ 生命周期矩阵与 Web Storage 最终审计已关闭 |
| WP-04 / B17 | 已完成 | 44 个 scenarioKey 全部通过，正式 fixture 已双次 cleanup，残留为 0 |
| Batch A / B1–B3 | 已完成 | 67 个验证原子全部有明确处置，正式 fixture 已双次 cleanup，残留为 0 |
| Batch B / B4–B6 | 桌面范围已完成 | Browser 133 项 + automated boundary 2 项 = 135 项；post-browser verify 通过；产品缺陷 0 |
| Batch C / B7–B10 | B7、B8 与 B9 已完成；B10-A fixture 已完成；B10-B 未完成 | `generation-workflow` 为 43 pass / 0 fail / 5 not_executed / 0 obsolete；定向 prepared verify 与双 cleanup 已收口；`public-surface-security` 尚未启动 |
| Batch D / B11–B15 | 尚未启动 | 包含 B14.1 的剩余 Browser 回归；详细待验合同以 frontend testing playbook 为准 |
| Batch E | 保留 8 项 | 真实设备、辅助技术或人工验收，不被桌面 Browser 证据替代 |

Batch B 的正式 namespace 已连续 cleanup 两次，两次均 `residualCount=0`；namespace-owned 数据和操作系统临时 fixture 文件已删除，全局 MMSE / MoCA seed 不在 cleanup 范围内。B7 采用组合证据完成：原完整 Browser 验收的 39 项、完整 post-browser verify 与双次 cleanup 事实继续有效；B7-38 修复后的三个 viewport 定向回归、Browser 前后 prepared verify 与双次 cleanup 也均通过。本次只读回归没有执行 compute，namespace 按合同保持 prepared 状态；要求 `first_compute_idempotency` 已产生写终态的 post-browser verify 不适用于该 namespace，其 phase 不匹配失败不构成当前阻断，也不是产品或 fixture 缺陷。B8 `core-workflow` 的 39 项与 `resilience-security` 的 21 项真实 Browser 验收均已完成；`resilience-security` post-browser verify 通过，双次 cleanup 均为 `residualCount=0`。B8 共 60 项全部闭环，B8 已完成。B9-B1 已建立 canonical seed readiness、namespace baseline 与稳定 `B9_FIXTURE_PASSWORD` 来源，B9-B2 已完成五条 `local_write_gate` route、服务端数组顺序和内部 ID DOM 边界修复。B9-B3 的 37 项 Browser pass、Browser 产品缺陷 0、logout/停服/端口释放和双次 `residualCount=0` cleanup 事实继续有效；原 B9-32 不可执行前置经治理后唯一处置为 `obsolete`，不得写成 pass 或创建非法 fixture。B9-B4 已让 seed-drift 变异目标复用 canonical hash 的实际受保护集合，并以原始 BSON `try/finally` 恢复；score-confirmation-only verifier 已与真实 A18 confirm 的 status、时间、review、操作者和 `a18Confirmation` 字段对齐，同时继续严格保护评分、版本、operatorNote、额外 metadata 与认知域终态。定向 E2E 1 suite / 7 tests、完整 E2E 24 suites / 110 tests 均通过；全新 core fixture 冒烟的 prepare、prepared verify、显式 replace、再次 prepared verify 均通过，双次 cleanup 均为 `residualCount=0`。B9-B5 在基线 `ed37e22dab3950e62bf434572f5a4bd4a983227a` 使用全新 namespace `b9c-b9b5-20260726-f3a7` 重跑 19 条 core route；37 个 active 项全部通过，B9-32 保持 `obsolete`，post-browser verify 通过，logout、Browser/服务关闭和端口释放完成，两次 cleanup 均为 `residualCount=0`，第二次 `matched=false`。B9-B `core-workflow` 已完成。B9-C 原完整 `resilience-security` 的 13 项、post-browser verify、logout/停服与双次 cleanup 证据继续有效；B9-C1 已在基线 `ff3b55ba1d4422234a93c923d1a107c2bfd4c16e` 修复并定向通过 B9-51，七个固定 viewport、768×900 压力尺寸和最大化 Chrome 均无 document/main 全局横向溢出，Browser 前后 prepared verify 与双次 cleanup 均通过。该只读 namespace 未执行全量 post-browser verify，符合定向合同且不构成缺陷。B9 最终为 51 active pass + B9-32 obsolete，B9 已完成；B10-A fixture 已完成，B10 Browser 验收尚未开始，下一阶段为 generation-workflow Browser 验收；不存在可填写的新 evidence commit。

B10-A 已建立 95 项完整唯一映射、两个互不依赖的 profile、各自 manifest、prepared / post-browser verifier 和 cleanup ownership。B10 定向 E2E 1 suite / 7 tests 与完整 E2E 25 suites / 117 tests 通过；两个 profile 的 prepare、prepared verify、显式 replace、再次 prepared verify 和双次 cleanup 冒烟均通过，第二次 cleanup 均为 `residualCount=0`、`matched=false`，canonical seed hash 全程不变。该阶段未启动 Browser、production frontend 或 Browser test backend，也未执行真实 A20 generate；这是 B10-A 的历史结论，不代表当前 B10-B 状态。

B10-B `generation-workflow` 原有 40 个 pass 事实继续有效。B10-B1 基于 `05d0ca98f17f111d1c8805f2a15df30f2df8d893` 完成 B10-05、B10-21、B10-22 产品修复与定向 Browser 复验：latest loading 手工重试会取消旧请求并只发起一个新请求，旧请求为 cancelled / `net::ERR_ABORTED`、新请求 404 生效，无第三次 latest、自动 retry、polling 或 generate；locked / voided Visit 的首次生成相关 DOM 数量均为 0，各自 latest GET 404×1、generate POST=0，并保留手工重新加载。backend build、B10 fixture 定向 E2E 1 suite / 7 tests、frontend lint / typecheck / build 均通过；Browser 前与 logout 后 prepared verify 均通过，业务 baseline、ClinicalReports=6 与 canonical seed 未变化。Browser、production frontend 与 Browser backend 已关闭，端口已释放；双次 cleanup 均为 `residualCount=0`，第二次 `matched=false`。B10-B 当前为 43 pass / 0 fail / 5 not_executed / 0 obsolete，B10-B 与 B10 整体仍未完成；下一阶段处理 B10-34、B10-36、B10-37、B10-39、B10-40 的稳定验收前置，`public-surface-security` 与 Batch D 均未启动；不存在可填写的新 evidence commit。

## 3. 数据库用途、凭据来源与进程隔离

### 3.1 五类用途与项目映射

| 用途类别 | 当前项目映射 | 允许用途 |
|---|---|---|
| `none` | 不连接数据库 | 纯文档、lint、typecheck、build、静态审计 |
| `development` | `cogmemory_ad_dev` | 日常开发和人工调试 |
| `standard_test` | `cogmemory_ad_test` | unit、普通 E2E，以及允许重建测试数据的自动化测试 |
| `browser_acceptance` | `cogmemory_ad_browser_test` | Browser fixture、Browser / Chrome 验收、post-browser verify |
| `production_or_operations` | 项目命名基线为 `cogmemory_ad` | 仅在用户同时明确授权目标环境与允许操作后使用；本文不构成连接授权 |

强制边界：

1. 每个会连接数据库的进程必须先确定唯一用途，连接后再读取真实数据库名并逐字校验。
2. `standard_test` 与 `browser_acceptance` 不得共用数据库；namespace 隔离不能替代数据库隔离。
3. 普通 unit / E2E 禁止连接 `cogmemory_ad_browser_test`；Browser fixture 和 Browser backend 禁止连接 `cogmemory_ad_test` 或 `cogmemory_ad_dev`。
4. 同一任务包含两种用途时必须启动独立进程，不得复用已经设置连接变量的 shell，也不得依赖 dotenv 顺序、旧变量或后加载覆盖来选择数据库。
5. cleanup 只能按显式 namespace 和 ownership 精确执行；不得使用 `dropDatabase()`、清空 collection 或无条件 `deleteMany({})`。
6. `none` 类任务不得启动应用、fixture、测试后端或其他会建立数据库连接的进程。

### 3.2 本地凭据来源与职责边界

| 用途 | 本地忽略文件 | 职责 |
|---|---|---|
| `standard_test` | `backend/.env.test` | 只供普通 unit / E2E 进程，不加载 Browser 配置 |
| `browser_acceptance` | `backend/.env.browser-acceptance` | 只供 Browser backend 与 fixture CLI，不与 `.env.test` 叠加 |

`backend/.env.browser-acceptance` 当前提供数据库用途、Browser app 主连接、Browser 管理连接，以及批次专用 fixture 密码的稳定本地凭据来源；B9 与 B10 的专用变量均已建立并完成跨独立进程一致性校验。本手册只记录变量职责，不记录实际密码或完整 URI。

Browser fixture 测试应用账号的批次专用密码由各批次约定的 `*_FIXTURE_PASSWORD` 环境变量承担职责，并从稳定的本地隔离测试固定凭据来源解析；本文只记录变量名称模式和职责，不记录任何具体密码。

独立进程的显式变量映射为：

- Browser backend：`COGMEMORY_DATABASE_PURPOSE=browser_acceptance`，`MONGO_URI` 映射 `BROWSER_ACCEPTANCE_APP_MONGO_URI`，`MONGO_ADMIN_URI` 映射 `BROWSER_ACCEPTANCE_ADMIN_MONGO_URI`。
- Browser fixture CLI：`COGMEMORY_DATABASE_PURPOSE=browser_acceptance`，`MONGO_URI` 与 `MONGO_ADMIN_URI` 都映射 `BROWSER_ACCEPTANCE_ADMIN_MONGO_URI`。
- 普通 E2E：`COGMEMORY_DATABASE_PURPOSE=standard_test`，只加载 `.env.test`，不得继承 Browser app/admin 连接变量。

数据库连接凭据与 fixture 测试应用账号凭据是两类不同职责，不得使用同一变量表示，不得混为一体或相互派生。尤其不得从 `BROWSER_ACCEPTANCE_APP_MONGO_URI`、`BROWSER_ACCEPTANCE_ADMIN_MONGO_URI` 或其中的数据库用户密码派生 fixture 测试应用账号密码。

同一个 namespace 从 prepare 或受控 replace 开始，到 prepared verify、Browser 登录与角色 Session、post-browser verify 为止，所有实际创建、认证或校验测试账号密码的进程都必须使用同一个稳定凭据来源和同一个密码值。不得使用每条命令临时产生的值，也不得因父进程缺少批次密码变量而临时构造另一个值；批次变量必须从上述 Git 忽略文件解析，或由同一隔离父进程稳定注入各目标进程。固定测试凭据不得通过 CLI 参数传递。

本地隔离测试专用固定凭据默认自动使用：Codex 可以从上述 Git 忽略文件读取并注入对应独立进程。不得机械要求剪贴板、一次性密码、Secret Manager、每次人工输入或每次重新生成；同时不得把密码、完整连接串、Cookie、Session token 或 hash 写入 Git 跟踪文件、文档、日志、manifest、截图、生成物、最终报告或提交记录。

切换用途或复用 shell 前，应优先新建独立进程；确需复用时，必须清除或覆盖数据库主连接、管理连接、数据库用途及其他用途相关变量。该动作是防串库门禁，不是密码保密仪式。

### 3.3 Browser 进程与数据库用户

| 独立进程 | 主连接用户 / 角色 | 管理连接 | 允许数据库 |
|---|---|---|---|
| Browser test backend | `cogmemory_ad_browser_test_app` / `readWrite` | 受控 db_admin 连接 | `cogmemory_ad_browser_test` |
| Browser fixture CLI | `cogmemory_ad_browser_test_db_admin` / `dbOwner` | 同一 db_admin 连接 | `cogmemory_ad_browser_test` |
| 普通 E2E | `.env.test` 中的 standard_test 用户 | 按测试配置 | `cogmemory_ad_test` |

app 用户的连接和 `readWrite` 角色、db_admin 用户的连接和 `dbOwner` 角色均已实际验证。不得让 Browser backend 以 db_admin 作为主连接，也不得让 fixture CLI 以 app 用户作为主连接。

`npm run start:browser-test` 是 test-only Browser backend 入口；只有用途、URI 声明库名、实际连接库名、用户名和角色全部通过后才监听端口。Browser backend 继续使用既有应用装配、CORS、Cookie、fake Storage 与 stub SMS / LLM。

### 3.4 D-038 双向门禁

D-038 的门禁顺序必须完整保留：

1. AppModule 导入前校验数据库用途。
2. 建连前校验 URI 声明的数据库名与用途固定映射一致。
3. Mongoose 建连后校验 `connection.name` 与允许数据库逐字一致。
4. Browser backend 校验 app 用户及 `readWrite`；fixture CLI 校验 db_admin 用户及 `dbOwner`。
5. 任一用途、库名、用户名或角色不一致立即失败，不自动回退、不改连、不输出凭据。
6. 普通 E2E 指向 Browser 库、Browser CLI 指向普通测试库或开发库、app/db_admin 角色互换时均必须拒绝。

D-038 认证时，Browser sentinel 在 standard_test 完整回归前后 prepared verify 与安全 manifest 哈希一致；两次 sentinel cleanup 均 `residualCount=0`。该事实证明进程和数据库隔离，不授权未来任务跳过自己的连接门禁。

## 4. 标准命令与最终门禁

### 4.1 后端最终五项门禁

在 `backend` 目录、最终代码态按固定顺序执行：

1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`
4. `npm test -- --runInBand`
5. `npm run test:e2e`

不可替代性：

- lint 只检查规则与格式，不能替代 TypeScript 全量检查。
- `typecheck` 使用 `tsconfig.typecheck.json`，覆盖 `src/**/*.ts`、`test/**/*.ts`、`scripts/**/*.ts` 且 `noEmit`；production build 不覆盖全部 spec、E2E、fixture、mock、helper 和 script。
- build 只证明生产编译范围可构建，不能替代 typecheck、unit 或 E2E。
- unit 主要验证纯函数、DTO、Controller、Service、mapper、状态和边界，不能替代真实 HTTP、Guard、全局 Pipe、模块装配和数据库链路。
- E2E 的 Jest 执行通过不能替代未被实际运行源码的全量 typecheck。

开发中可以运行定向 lint、unit 或 E2E 获取反馈，但最终代码任务必须重新执行五项完整门禁。`npm run typecheck` 未通过时不得宣称后端代码任务完成。纯文档任务按文档与 Git 检查验收，不机械运行代码门禁。

### 4.2 报告规则

五项结果必须分别报告退出状态和关键统计；未执行项必须说明原因，不得把未执行写成通过。不得通过新增 suppression、放宽 TypeScript、扩大 exclude、跳过测试或吞掉退出码制造通过。

当前最终代码态门禁证据为：lint 0 errors / 0 warnings，typecheck 0 errors，build 通过，full unit 89 suites / 761 tests，B10 fixture 定向 E2E 1 suite / 7 tests，full E2E 25 suites / 117 tests；E2E 实际连接 `cogmemory_ad_test`。这些是当前测试资产代码态的证据，不代表后续代码修改可以免于重跑。

## 5. 当前测试资产与覆盖范围

### 5.1 主要自动测试资产

| 资产层 | 当前覆盖重点 |
|---|---|
| unit / pure specs | 配置与数据库用途、Schema/索引、DTO whitelist、Controller Guard、Service ownership/状态/并发、mapper 白名单、量表 seed、作答、媒体、提交、评分、认知域、报告生命周期、历史与趋势 |
| HTTP / database E2E | 认证 Cookie、401/403、全局 ValidationPipe、真实 AppModule、MongoDB 写读、fake Storage、A12–A28 临床链路及 D-038 数据库门禁 |
| Browser fixture E2E | contract 计数、namespace 隔离、safe manifest、prepare/verify/post-browser verify、损坏检测、双 namespace、cleanup/二次 cleanup |
| Browser acceptance | production frontend + 真实 test backend + `browser_acceptance` 专用数据库；Network、Console、Storage、Cookie、CORS、角色、并发、幂等与页面行为 |

E2E 固定使用 `NODE_ENV=test`、`--runInBand`、隔离数据库、fake Storage、stub SMS / LLM 和脱敏人工数据；真实服务禁令统一见第 8 节。

### 5.2 Fixture CLI 简表

| 范围 | 入口 | 合同摘要 | 当前状态 |
|---|---|---|---|
| WP-02 / B16 | `scripts/b16-browser-fixtures.ts` | 4 角色；22 scenarioKey / 21 业务场景 | 已完成并清理 |
| WP-04 / B17 | `scripts/wp04-browser-fixtures.ts` | 5 角色；44 scenarioKey / 43 业务场景 | 已完成并清理 |
| Batch A / B1–B3 | `scripts/b123-browser-fixtures.ts` | 5 角色；27 scenarioKey / 26 业务场景 / 58 audit ID | 已完成并清理 |
| Batch B / B4–B6 | `scripts/b456-browser-fixtures.ts` | 5 角色；32 scenarioKey / 31 业务场景 / 135 audit ID；15 direct / 120 fixture-required | 桌面范围已完成并清理 |
| Batch C / B7 | `scripts/b7-browser-fixtures.ts` | 5 角色；14 scenarioKey / 13 业务场景 / 40 audit ID | 组合证据覆盖 40 项，B7 已完成并清理 |
| Batch C / B8 | `scripts/b8-browser-fixtures.ts` | 两个独立 profile；每个 5 角色 / 9 scenarioKey；`core-workflow` 39 audit ID，`resilience-security` 21 audit ID | 两个 profile 共 60 项均已完成；各自 post-browser verify 通过并完成双次 `residualCount=0` cleanup，B8 已完成 |
| Batch C / B9 | `scripts/b9-browser-fixtures.ts` | 两个独立 profile；每个 5 角色 / 10 业务 scenarioKey；`core-workflow` 19 route / 38 audit ID（37 active + B9-32 obsolete），`resilience-security` 11 route / 14 active audit ID | 51 active pass + B9-32 obsolete；两个 profile 按各自完整或定向合同完成 verify 与双 cleanup，B9 已完成 |
| Batch C / B10 | `scripts/b10-browser-fixtures.ts` | 两个独立 profile；每个 5 角色；`generation-workflow` 10 scenarioKey / 26 route / 48 audit ID，`public-surface-security` 13 scenarioKey / 21 route / 47 audit ID | B10-A 已完成；generation-workflow 为 43 pass / 0 fail / 5 not_executed / 0 obsolete，定向 prepared verify 与双 cleanup 已收口；B10-B 未完成 |

这些 CLI 是 test-only 资产，不是 production seed，不随应用启动，不向 Browser 输出密码、连接串、Cookie、Session、metadata、完整请求/响应、原始作答、评分规则、报告正文或内部 lineage/source ID。

Batch C / D fixture 的验证意图、前置状态和关键边界必须从 frontend testing playbook 的 B7–B15（含 B14.1）待验合同设计；B7 现有资产不覆盖 B8–B15，不得从已完成 Batch A / B、B7 的旧 namespace、操作流水或中间失败状态反推。B8、B9 与 B10 的两个 profile 都使用不同 namespace 前缀、独立 manifest、scenario 所有权、prepared / post-browser 合同和 cleanup 范围；`verify --phase post-browser` 只验证命令所选 profile，未执行该 profile 的 Browser 动作时不得调用或要求其通过。B10 `generation-workflow` 只允许 `first_generate_success` 新增恰好一份合法 V1 draft 报告，其他 route 数据库零变化；`public-surface-security` 整个 profile 业务数据零变化。B9 / B10 的 namespace-owned 冲突资源均不修改产品索引或全局 MMSE / MoCA seed，并由所选 profile 精确 cleanup。

## 6. Browser fixture 通用生命周期

每个新 Browser 批次统一执行以下生命周期：

1. 选择独立、合规的 namespace；重复 prepare 默认拒绝，替换必须显式确认。
2. 在 db_admin / `dbOwner` 的 fixture CLI 独立进程执行 `prepare` 或受控 `replace`。
3. 执行只读 `verify --phase prepared`，核对角色、scenario、前置状态、写入预留、临时文件、安全 manifest 和 transition 无遗留；verify 不得修复数据。
4. 启动 app / `readWrite` 的 Browser backend，并连接 production frontend；两端健康、CORS 和 Cookie 边界通过后才开始页面验收。
5. Browser 只使用脱敏固定账号和 fixture 明确提供的导航/输入；Network fault 用单次真实中止或合同指定方式，不伪造业务成功。
6. 多角色、双 Session、并发和幂等场景必须使用真实独立会话；写请求不得自动重试，网络结果不确定时先读回服务端事实。
7. Browser 完成后执行只读 `verify --phase post-browser`；它必须核对实际终态、无副作用、请求次数和合同计数，且前后快照一致。
8. 退出登录、关闭 Browser、停止进程后按 namespace 精确 cleanup；再执行第二次幂等 cleanup，两次都要求 `residualCount=0`。
9. cleanup 后确认 namespace-owned 记录和临时文件已删除，非 namespace 数据、全局 seed 与其他 namespace 未受影响。

prepare / replace 与后续账号密码校验必须处于相同的稳定 fixture 密码语义下。如果 `verify --phase prepared` 报告账号密码不匹配，必须先检查各进程的凭据来源是否一致；如确认 namespace 是由其他密码创建，应继续遵守显式确认、namespace ownership 和数据库隔离规则，使用正确的固定凭据显式执行受控 replace，并在完全相同的稳定凭据环境中立即重新执行只读 `verify --phase prepared`。只有 prepared verify 通过后才允许启动 Browser。

不得以手工补插或修改数据库账号、降低账号有效性或密码校验标准、只反复执行 verify，或把 verify 未执行、未通过或密码校验失败记为 prepared gate 通过来绕过不一致。prepared verify 始终是只读门禁，不能修复账号或重设密码。

固定测试凭据可由目标进程自动读取，但不得进入 CLI 参数、manifest、截图、日志或报告。prepare / prepared verify 只证明前置就绪，不等于 Browser 通过；Browser 场景通过但缺 post-browser verify 或 cleanup，也不得宣布工程收口。

## 7. 已完成批次证据索引

| 范围 | 最终状态 | 关键证据 | evidence commit | 是否需要重跑 |
|---|---|---|---|---|
| WP-02 / B16 | 已完成 | 基线 `9099f66…` 的确定性 Resume/unsafe fixture 与既有 V1/V2/V3 矩阵，加最终 Web Storage 审计；fixture 双次 cleanup 为 0 | `95b778448603e5eb4f96eafb82136edc36d3ab0e` | 否；相关产品代码变化时另行评估 |
| WP-04 / B17 | 已完成 | 验收基线 `7dd6f52…`；44/44 scenarioKey 通过，0 fail，0 未执行；Storage 八时点与双次 cleanup 为 0 | `db825a9df57ca1a131fee20159f9c6a38529f1ab` | 否 |
| Batch A / B1–B3 | 已完成 | 验收基线 `3a9c784…`；6 prior covered + 58 Browser + 2 用户人工视觉 + 1 obsolete = 67；双次 cleanup 为 0 | `335c6201f1f4864b371150467f5da6658b068e45` | 否 |
| Batch A 真正大屏抽查 | 已完成 | 普通最大化 Chrome，`innerWidth=1536`；5 个代表页均通过 | `8b8a9281dd738c5a0694d0c2feea4bcefcae6c66` | 否；后续新代表页按当前策略抽查 |
| D-038 数据库隔离 | 已实现并认证 | 五项门禁通过；89 unit suites / 761 tests，21 E2E suites / 94 tests；双向库名/角色门禁和 sentinel 隔离通过 | `f528efb7152b5770e9f873683fbd03c814108b81` | 否；数据库治理代码变化时重跑 |
| Batch B / B4–B6 | 桌面范围已完成 | 基于 D-038 代码基线；Browser 133 + automated boundary 2 = 135，0 fail / 0 未执行；post-browser verify 通过；双次 cleanup 为 0；产品缺陷 0 | `f59f3ac0c93d47e2c7fad4d29f1d7f2a61dc4021` | 否；Batch E 8 项仍需执行 |

表中的 evidence commit 已由当前文档与 Git 提交顺序、提交主题和文件范围交叉核对；“验收基线”是执行所基于的代码/fixture 状态，“evidence commit”是写入最终结果的提交，两者不得混写。

## 8. 医疗、量表、数据与安全红线

1. 只使用脱敏或人工构造的账号、患者、访视、作答、图片、轨迹、评分、报告和意见；不得使用真实姓名、身份证号、手机号、病历号、住址或其他可识别信息。
2. 测试不得生成或断言真实医疗诊断结论、疾病概率、治疗建议或未经确认的临床判断。
3. MMSE / MoCA 题项、CRF、指导语、评分规则和 seed 相关验证必须遵循权威资料与已确认修正，不得凭模型记忆或页面表现重新解释量表。
4. 原始作答、分步结果、提示后表现、图片、手写轨迹和报告来源是证据；测试不得用前端推断、自动评分或诊断文案覆盖服务端事实。
5. 媒体测试只使用人工 Buffer/文件；不得暴露源文件名、Storage bucket/objectKey、校验和、短期 URL、轨迹内容或内部关联 ID。
6. 除非未来单独定义并授权受控集成测试，不调用真实 OSS、阿里云 SMS、LLM、支付、医保、HIS/LIS/PACS、生产数据库或真实对象存储。
7. 不记录密码、完整 URI、Cookie、Session/token/hash、请求/响应全文、metadata、内部堆栈或浏览器持久化 value。
8. 401 必须表现为未认证，403 必须表现为无权限；前端角色展示不能替代后端 Guard，fixture 角色不能扩张产品权限。
9. cleanup 不物理删除非 namespace 数据，不以测试便利破坏审计、版本关系、全局 seed 或生产语义。
10. 测试截图、Console、Network 摘要、DOM、URL、Storage 审计和最终报告均适用同一隐私边界。

## 9. 当前未决事项和同步规则

- Batch C / B7 已通过组合证据完成。B8 `core-workflow` 的 39 项与 `resilience-security` 的 21 项均已完成；后者的完整 Browser 验收 21 项全部通过，post-browser verify 通过，双次 cleanup 均为 `residualCount=0`，不填写尚不存在的 evidence commit。B8 共 60 项全部闭环，B8 已完成。
- B9-B1 已完成 canonical seed readiness、受保护 baseline 与稳定 `B9_FIXTURE_PASSWORD` 前置。B9-B2 已修复五条 `local_write_gate` route 以及 `CognitiveDomainScoreList`、`CognitiveDomainContributionList`、`CognitiveDomainMappingSummary` 三个前端展示边界。B9-B3 的 37 项 Browser pass 事实保留。B9-B4 已将 B9-32 标记为有稳定原因的唯一 `obsolete`，core 合同为 37 active + 1 obsolete；seed-drift 与 score-confirmation-only verifier 阻断已修复，定向 E2E、完整 E2E 和全新 namespace core fixture 冒烟均通过。B9-B5 已以全新 namespace 完整重跑 `core-workflow`：37 个 active 项全部通过，B9-32 保持 `obsolete`；fixture CLI 确认实际数据库为 `cogmemory_ad_browser_test`，Browser backend 使用 app / `readWrite`，fixture CLI 使用 db_admin / `dbOwner`；post-browser verify 通过，cleanup 1 与 cleanup 2 均为 `residualCount=0`，第二次 `matched=false`。B9-C 已在基线 `977e3ce053dd13aae1965534409e209a0cb5d64e` 完整执行 `resilience-security`，B9-39–B9-50 与 B9-52 共 13 项通过，post-browser verify 与双次 cleanup 通过。B9-C1 基于 `ff3b55ba1d4422234a93c923d1a107c2bfd4c16e` 修复并定向通过 B9-51：七个固定 viewport、768×900 压力尺寸和最大化 Chrome 全部无全局横向溢出，七列表仅在局部 wrapper 横向滚动；latest GET 200×1，compute 与其他业务写请求均为 0，Browser 前后 prepared verify 与双次 cleanup 通过，第二次 `matched=false`。本次只读 namespace 未执行全量 post-browser verify，符合定向合同，不是产品、fixture 或环境缺陷。B9 最终为 51 active pass + B9-32 obsolete，B9 已完成；B10-A fixture 已完成，B10 Browser 验收尚未开始，下一阶段为 generation-workflow Browser 验收；不存在可填写的新 evidence commit。
- B10-B `generation-workflow` 当前为 43 pass / 0 fail / 5 not_executed / 0 obsolete；B10-05、B10-21、B10-22 产品修复、定向 Browser、前后 prepared verify、logout/停服与双次 cleanup 已收口。下一阶段处理 B10-34、B10-36、B10-37、B10-39、B10-40 的稳定验收前置；B10-B 与 B10 整体均未完成，`public-surface-security` 与 Batch D 尚未启动，不存在可填写的新 evidence commit。
- Batch D / B11–B15 尚未启动；B14.1 的行为等价 Browser 回归仍属于待验合同，不因 B16 / WP-02 已完成而自动覆盖。
- Batch E 的 8 项真实设备、辅助技术或人工验收继续保留：`B5-MV-008`、`B5-MV-028`、`B5-MV-029`、`B5-MV-058`、`B5-MV-059`、`B5-MV-060`、`B5-MV-061`、`B5-MV-062`；桌面 Browser、automated boundary 或大屏抽查均不能替代。
- roadmap 业务工作包状态不因 testing playbook 压缩、历史证据索引或未来 Batch 验收自动变化。
- 后端新增或调整测试脚本、fixture、数据库门禁、Service、Controller、DTO、权限或 E2E 时，应更新当前资产、门禁和证据索引；不得追加逐轮执行流水。
- 每次报告必须区分代码门禁、Browser 前置、Browser 结果、post-browser verify、cleanup 和人工签收，不能用其中一类替代另一类。

## 10. 历史追溯

- 本轮 testing playbook 减肥前的完整历史基线为 `3c0e373902985b9da09b359ed8f2a0334ef1e5d0`。
- 已删除的 A1–A28 逐阶段命令、旧 suite/test 数量、fixture 重试、临时诊断、旧 namespace 和逐轮 Browser 日志可通过 Git 历史查看。
- active playbook 不另建 archive，也不复制一份 Validation catalog；已完成历史只保留本文件的最终摘要与 evidence commit 索引。
