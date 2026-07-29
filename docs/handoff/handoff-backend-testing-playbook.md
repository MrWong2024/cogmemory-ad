# CogMemory AD / 智忆评 后端验证手册

## 1. 文档定位

本文档是后端验证的 active playbook，只维护三类内容：当前执行规则、仍待执行的 Browser 验收所依赖的后端 fixture 合同，以及已完成范围的最终证据索引。逐阶段命令、失败重试、临时 namespace 和执行流水由 Git 历史承担，不在本文重复保存。

本文档不改变产品、接口、DTO、Schema、测试合同或 roadmap 工作包状态。当前唯一事实是：WP-02、WP-04、Batch A 已完成；Batch B 桌面范围已完成；Batch C 的 B7–B10 已完成。B10 `generation-workflow` 为 48 pass，`public-surface-security` 为 47 pass，共 95 项全部完成。Batch D 的 B11 `core-workflow` 58 Browser 项、`resilience-security` 11 Browser 项与 B11-70 static-gate 1 项均已通过，共 70 项完成，B11 已完成。Batch D 尚未完成；下一阶段为 Batch D / B12，B12–B15（含 B14.1）仍待验。Batch E 的 8 项真实设备或人工验收尚未执行并继续保留。

## 2. 当前验证状态

| 范围 | 当前状态 | 当前结论 |
|---|---|---|
| 后端代码门禁 | 已建立 | 最终代码态独立执行 lint、typecheck、build、unit、E2E 五项门禁 |
| D-038 数据库隔离 | 已实现并认证 | `standard_test` 与 `browser_acceptance` 双向拒绝，建连前后库名门禁和数据库用户角色门禁有效 |
| WP-02 / B16 | 已完成 | replacement V2+ 生命周期矩阵与 Web Storage 最终审计已关闭 |
| WP-04 / B17 | 已完成 | 44 个 scenarioKey 全部通过，正式 fixture 已双次 cleanup，残留为 0 |
| Batch A / B1–B3 | 已完成 | 67 个验证原子全部有明确处置，正式 fixture 已双次 cleanup，残留为 0 |
| Batch B / B4–B6 | 桌面范围已完成 | Browser 133 项 + automated boundary 2 项 = 135 项；post-browser verify 通过；产品缺陷 0 |
| Batch C / B7–B10 | 已完成 | B10 最终为 `generation-workflow` 48 pass + `public-surface-security` 47 pass，共 95 项 |
| Batch D / B11–B15 | B11 已完成，Batch D 尚未完成 | B11 `core-workflow` 58 Browser pass + `resilience-security` 11 Browser pass + B11-70 static-gate 1 pass，共 70 项闭环；下一阶段为 Batch D / B12，B12–B15（含 B14.1）仍待验 |
| Batch E | 尚未执行，保留 8 项 | 真实设备或人工验收，不被桌面 Browser 证据替代 |

Batch B 的正式 namespace 已连续 cleanup 两次，两次均 `residualCount=0`；namespace-owned 数据和操作系统临时 fixture 文件已删除，全局 MMSE / MoCA seed 不在 cleanup 范围内。B7 采用组合证据完成：原完整 Browser 验收的 39 项、完整 post-browser verify 与双次 cleanup 事实继续有效；B7-38 修复后的三个 viewport 定向回归、Browser 前后 prepared verify 与双次 cleanup 也均通过。本次只读回归没有执行 compute，namespace 按合同保持 prepared 状态；要求 `first_compute_idempotency` 已产生写终态的 post-browser verify 不适用于该 namespace，其 phase 不匹配失败不构成当前阻断，也不是产品或 fixture 缺陷。B8 `core-workflow` 的 39 项与 `resilience-security` 的 21 项真实 Browser 验收均已完成；`resilience-security` post-browser verify 通过，双次 cleanup 均为 `residualCount=0`。B8 共 60 项全部闭环，B8 已完成。B9-B1 已建立 canonical seed readiness、namespace baseline 与稳定 `B9_FIXTURE_PASSWORD` 来源，B9-B2 已完成五条 `local_write_gate` route、服务端数组顺序和内部 ID DOM 边界修复。B9-B3 的 37 项 Browser pass、Browser 产品缺陷 0、logout/停服/端口释放和双次 `residualCount=0` cleanup 事实继续有效；原 B9-32 不可执行前置经治理后唯一处置为 `obsolete`，不得写成 pass 或创建非法 fixture。B9-B4 已让 seed-drift 变异目标复用 canonical hash 的实际受保护集合，并以原始 BSON `try/finally` 恢复；score-confirmation-only verifier 已与真实 A18 confirm 的 status、时间、review、操作者和 `a18Confirmation` 字段对齐，同时继续严格保护评分、版本、operatorNote、额外 metadata 与认知域终态。定向 E2E 1 suite / 7 tests、完整 E2E 24 suites / 110 tests 均通过；全新 core fixture 冒烟的 prepare、prepared verify、显式 replace、再次 prepared verify 均通过，双次 cleanup 均为 `residualCount=0`。B9-B5 在基线 `ed37e22dab3950e62bf434572f5a4bd4a983227a` 使用全新 namespace `b9c-b9b5-20260726-f3a7` 重跑 19 条 core route；37 个 active 项全部通过，B9-32 保持 `obsolete`，post-browser verify 通过，logout、Browser/服务关闭和端口释放完成，两次 cleanup 均为 `residualCount=0`，第二次 `matched=false`。B9-B `core-workflow` 已完成。B9-C 原完整 `resilience-security` 的 13 项、post-browser verify、logout/停服与双次 cleanup 证据继续有效；B9-C1 已在基线 `ff3b55ba1d4422234a93c923d1a107c2bfd4c16e` 修复并定向通过 B9-51，七个固定 viewport、768×900 压力尺寸和最大化 Chrome 均无 document/main 全局横向溢出，Browser 前后 prepared verify 与双次 cleanup 均通过。该只读 namespace 未执行全量 post-browser verify，符合定向合同且不构成缺陷。B9 最终为 51 active pass + B9-32 obsolete，B9 已完成。B10-A 当时仅完成 fixture、尚未开始 Browser 验收；该历史状态后续已由 B10-B5、B10-C 和 B10-C2 关闭，当前 B10 已完成。不存在可填写的新 evidence commit。

B10-A 已建立 95 项完整唯一映射、两个互不依赖的 profile、各自 manifest、prepared / post-browser verifier 和 cleanup ownership。B10 定向 E2E 1 suite / 7 tests 与完整 E2E 25 suites / 117 tests 通过；两个 profile 的 prepare、prepared verify、显式 replace、再次 prepared verify 和双次 cleanup 冒烟均通过，第二次 cleanup 均为 `residualCount=0`、`matched=false`，canonical seed hash 全程不变。该阶段未启动 Browser、production frontend 或 Browser test backend，也未执行真实 A20 generate；这是 B10-A 的历史结论，不代表当前 B10-B 状态。

B10-B `generation-workflow` 原有 40 个 pass 事实继续有效。B10-B1 基于 `05d0ca98f17f111d1c8805f2a15df30f2df8d893` 完成 B10-05、B10-21、B10-22 产品修复与定向 Browser 复验：latest loading 手工重试会取消旧请求并只发起一个新请求，旧请求为 cancelled / `net::ERR_ABORTED`、新请求 404 生效，无第三次 latest、自动 retry、polling 或 generate；locked / voided Visit 的首次生成相关 DOM 数量均为 0，各自 latest GET 404×1、generate POST=0，并保留手工重新加载。B10-B2 已为 B10-34、B10-36、B10-37、B10-39、B10-40 建立确定性前置：幂等 scope 只从 latest 公开 traces 推导；scope conflict 与 scale-not-ready 使用显式 fixture stage；generation conflict 由真实 HTTP 定向 E2E 证明。

B10-B3 在基线 `ab1a5941857a1da3b524b3c4ab2cfeba733878a1` 使用全新 namespace `b10g-b10b3-20260727-k4m2` 完整触达 `generation-workflow` 的 10 个 scenarioKey / 26 条 route。静态子进程不加载数据库；backend build、B10 fixture 定向 E2E 1 suite / 8 tests、frontend lint / typecheck / build、prepare 与 prepared verify 均通过。standard_test 实际库为 `cogmemory_ad_test`；Browser backend 与 fixture CLI 实际库均为 `cogmemory_ad_browser_test`，角色分别为 app / `readWrite` 与 db_admin / `dbOwner`，未叠加 `.env.test`。B10-34 的同源已认证 Browser generate 返回 200 / `alreadyGenerated=true`，B10-39 为真实 404 → 409 → 404，首次生成仅新增合同允许的一份产品 V1 draft。历史阻断一：当时 Browser 工具不支持受控真实 HTTP 500，且禁止 response mutation，故 B10-04 为 `not_executed`。历史阻断二：两个 allowlist stage 均在 Browser 完成候选加载和选择后各调用一次，但 `verifyStageBaseline` 因 `first_generate_success` 的合法新增 V1 draft 与 prepared baseline 不同而在变更前返回 `B10_FIXTURE_SCENARIO_INVALID`；没有 staged report 或 Instance transition，为避免未授权产品写入，B10-36、B10-37、B10-40 均为 `not_executed`。post-browser verify 因报告根矩阵缺少 scope-conflict staged draft 返回 `B10_FIXTURE_ROOT_MATRIX_INVALID`。Browser、production frontend 与 Browser backend 已关闭，3002 / 5002 已释放；两次 cleanup 均为 `residualCount=0`，第二次 `matched=false`，canonical seed hash 不变。当时状态为 44 pass / 0 fail / 4 not_executed / 0 obsolete，B10-B 与 B10 尚未完成；上述阻断后续已由 B10-B4 修复并由 B10-B5 完整重跑，`public-surface-security` 后续也已完成。Batch D 尚未启动；不存在可填写的新 evidence commit。

B10-B4 已完成上述两项测试资产修复。Stage baseline 现在按 route 识别 prepared、合法 `first_generate_success` 产品 V1 draft、固定 scope-conflict staged draft 与固定 scale-not-ready Instance transition；first generate 后两个 allowlist stage 均可执行，两个 stage 的顺序互不影响，总报告矩阵按 prepared reports + legal first-generated report + scope-conflict staged report 计算。verifier 仍逐 route 保护 report/source hash、固定 scope/ownership/marker、stage 外 Instance、其他来源对象、canonical seed、profile isolation 和资源总数，stage 前后保持只读。Browser backend 同时具备仅限 `generation-workflow/latest_lifecycle/latest_failure` 的 test-only、allowlist、进程内 one-shot 真实 HTTP 500；目标由 fixture manager 内部解析，环境不完整或不安全时启动失败，不接受 path/status/body，响应使用安全通用 envelope，位于 CORS 之后，不修改 production route，也不依赖 Browser response mutation。最终代码态 lint、typecheck、build、89 suites / 761 unit tests、B10 定向 E2E 1 suite / 11 tests、full E2E 25 suites / 121 tests 均通过，standard_test 实际库为 `cogmemory_ad_test`。全新 browser_acceptance namespace 的 fault 冒烟得到目标第一次 GET 500、第二次进入产品路由 404、unrelated route 404、精确 CORS 与业务数据零变化；未配置 fault 的新后端进程同一路由首个 GET 为产品 404。fixture prepare/prepared verify、两个 stage、replace/再次 prepared verify 与双 cleanup 均通过，第二次 cleanup 为 `residualCount=0`、`matched=false`，canonical seed 不变，无服务或监听残留。本阶段未启动 frontend 或 Browser，以上 HTTP/E2E 证据不计作 B10-04、B10-36、B10-37、B10-40 Browser pass；当时状态仍为 44 pass / 0 fail / 4 not_executed / 0 obsolete，下一步是使用全新 namespace 完整重跑 `generation-workflow`。该历史待办后续已由 B10-B5 关闭，`public-surface-security` 后续也已完成；Batch D 尚未启动，不存在可填写的新 evidence commit。

B10-B5 基于 `8be7b50c97521e00dbf379d976e8364b85a93590`，使用全新 namespace `b10g-b10b5r-20260727-m8p2`、production frontend、Browser test backend 与真实 Browser 完整重跑 `generation-workflow` 的 10 个 scenarioKey / 26 条 route。backend build、B10 fixture 定向 E2E 1 suite / 11 tests、frontend lint / typecheck / build、prepare 与 prepared verify 均通过；静态子进程未加载数据库，standard_test 实际库为 `cogmemory_ad_test`，Browser backend 与 fixture CLI 实际库均为 `cogmemory_ad_browser_test`，角色分别为 app / `readWrite` 与 db_admin / `dbOwner`，未叠加 `.env.test`，one-shot fault 变量仅注入该 Browser backend 进程。B10-04 为真实 HTTP 500 → 手工重试 → 产品 404，B10-05 为旧 latest aborted、新 latest 404 唯一生效；B10-34 返回 `alreadyGenerated=true`，B10-36/37 为 404 → Stage → 409 → latest 200，B10-39 为 404 → 409 → 404，B10-40 为 ready snapshot → Stage → 409。逐 route Network 账本共记录 latest GET 27 次、generate POST 9 次；所有 generate Body 仅含 `confirm` 与 `primaryScaleInstanceIds`，没有写请求 retry、polling 或 A17/A18/A19 扇出。`first_generate_success` 只新增一份合法产品 V1 draft，scope-conflict staged report 与 scale-not-ready 单一 Instance transition 符合 fixture-owned 合同，其余产品 route 数据库零变化。post-browser verify 通过，ClinicalReports 从 prepared 5 变为 7；五类真实 Session 均建立并 logout，active Session 终态为 0，Browser/服务关闭且 3002 / 5002 已释放。两次 cleanup 均为 `residualCount=0`，第二次 `matched=false`，临时索引、blocker、companion、staged 资源与 namespace 数据均无残留，canonical seed、其他 namespace 与非 namespace 数据未受影响。B10-01–B10-45、B10-93–B10-95 共 48 项全部通过，B10-B `generation-workflow` 已完成；当时下一项为 `public-surface-security`，后续已由 B10-C 与 B10-C2 完成。Batch D 尚未启动，B9 已完成事实保持不变，不填写不存在的 evidence commit。

B10-C 基于 `44ac1f3ddb5bb2352a4215b20fee8a628035016f`，使用全新 `b10p-` namespace 完整执行 `public-surface-security` 的 13 个 scenarioKey / 21 条 route / 47 项。静态子进程未加载数据库；backend build、B10 fixture 定向 E2E 1 suite / 11 tests、frontend lint / typecheck / build、prepare 与 prepared verify 均通过。standard_test 实际库为 `cogmemory_ad_test`；Browser backend 与 fixture CLI 实际库均为 `cogmemory_ad_browser_test`，角色分别为 app / `readWrite` 与 db_admin / `dbOwner`，未叠加 `.env.test`，未注入 generation-workflow fault 配置。B10-85 当时为产品缺陷：真实 generate POST 在服务端写入前中止后，scope 保留且无 retry，Body 仅含 `confirm` 与 `primaryScaleInstanceIds`，但确认 checkbox 被清除。B10-89 当时为 fixture / 测试资产阻断：合同声明 `long_report` 提供 native checkbox，实际代表页 checkbox 数量为 0；另有当时 Browser 键盘注入无法可靠触发 Enter / Space 的工具限制。其余 45 项通过；post-browser verify 通过，prepared / post-browser 均为 patients 13、visits 21、instances 24、itemResponses 309、MediaEvidence 4、ScoreResults 2、CognitiveDomainResults 2、ClinicalReports 19，业务数据及 hash 完全一致，canonical seed 不变。五角色 Session 已 logout，Browser / Chrome 与服务已关闭，3002 / 5002 已释放；cleanup 1 为 `residualCount=0` / `matched=true`，cleanup 2 为 `residualCount=0` / `matched=false`，未影响其他 namespace 或非 namespace 数据。B10-B `generation-workflow` 48 项完成事实、B9 已完成事实均保持不变；B10-C 当时尚未完成，上述 B10-85 后续由 B10-C1 修复，B10-89 后续由 B10-C2 完成。Batch D 尚未启动，不填写不存在的 evidence commit。

B10-C1 基于 `7c594e811283425b819a85b33ab1a68adf1d85c5` 完成产品与 fixture 定向修复。`useClinicalReport.confirmGenerate()` 仅在 `service_unavailable` 保留已选 scope、确认区与已勾选 checkbox，其他错误继续沿用既有清理、latest 重读或冲突处理；成功路径、A20 路由及 Body 未改变。`long_report` 改用显式 `long_pending_confirmation`，prepared verifier 保护 `pending_confirmation`、医生确认资格、合法 submission、至少一个合法 trace、技术摘要、`mixed` 来源、医生文本、长 narrative、多 trace、`aiUsed=false`、`confirmation=null` 与 `isFinal=false`；manifest 增加 button / checkbox / link / details 键盘目标，资源数量、audit ID、profile、scenarioKey、routeKey、owner、零写入和 cleanup 合同不变。最终代码态 backend lint / typecheck / build、B10 fixture 定向 E2E 1 suite / 13 tests、frontend lint / typecheck / build 均通过；standard_test 为 `cogmemory_ad_test`，Browser backend 与 fixture CLI 为 `cogmemory_ad_browser_test`，角色分别为 app / `readWrite` 与 db_admin / `dbOwner`。B10-85 的 latest 与 generate 网络分支均定向通过，generate 失败后状态保留且 ClinicalReports 保持 0；B10-88 在八个固定尺寸与最大化 1536 宽、visual scale 1 上通过，无横向溢出或业务写请求。B10-89 在第一条正式 Tab 前调用同一已用于 Network / viewport 的 CDP 会话 `Input.dispatchKeyEvent` 时被控制层明确拒绝为 unsupported；按合同停止，未使用 CUA 或 DOM 模拟，两个 viewport 当时均为 `not_executed`。Browser 前后 prepared verify 通过，未执行不适用于三项定向证据的全量 post-browser verify；原完整 public-surface-security 的其余 45 项、post-browser verify 与双 cleanup 证据继续有效。logout、Browser / 服务关闭与端口释放完成；cleanup 1 为 `residualCount=0` / `matched=true`，cleanup 2 为 `residualCount=0` / `matched=false`，canonical seed 不变。当时 `public-surface-security` 为 46 pass / 0 fail / 1 not_executed；该历史阻断后续已由 B10-C2 关闭，B10-C 与 B10 均已完成。Batch D 尚未启动，不填写不存在的 evidence commit。

B10-C2 基于 `c0922c47aa9467f85eae6ea97814d091bbe010de` 使用 Playwright Chromium 定向复验 B10-89。一个 spec 在 1536×864 与 390×844 两个独立 BrowserContext / Session 内完成真实 Tab、Shift+Tab、Enter 和 Space；button、native checkbox、details summary 与 scale link 均由自然 Tab 顺序到达，keydown / keyup 均为 `isTrusted=true`，`:focus-visible` 及可见 outline / box-shadow 通过，焦点可离开并 Shift+Tab 返回报告区。未对目标控件使用 click、合成 KeyboardEvent、checked/open 属性修改或 `locator.focus()` 跳过自然顺序。Playwright runner 不连接 MongoDB；固定 `public-surface-security/responsive_keyboard/long_report/doctor` 的七字段临时 runtime 描述仅作为路径桥接，生成前 prepared verify 通过，测试后已删除且未进入 Git。两个 Session 均通过真实 login 建立并 logout；报告确认、编辑、提交及 A17/A18/A19 写请求均为 0，产品业务写请求为 0。Browser 前后 prepared verify 均通过，ClinicalReports 保持 19，业务 hash 与 canonical seed 不变；按定向合同不重跑全量 post-browser verify，原 `public-surface-security` 其余 46 项、完整 post-browser verify 和双 cleanup 证据继续有效。Browser / 服务均已关闭，端口已释放；cleanup 1 为 `residualCount=0` / `matched=true`，cleanup 2 为 `residualCount=0` / `matched=false`。B10 最终为 `generation-workflow` 48 pass + `public-surface-security` 47 pass，共 95 项完成；Batch C / B7–B10 已完成。Batch D 尚未启动，下一阶段为 Batch D / B11；不填写不存在的 evidence commit。

Playwright Test、Chromium 与 Axe 通用 Browser acceptance 跑道现已建立。runner 与 production frontend 的数据库用途均为 `none`，不加载 MongoDB 或 Browser fault 配置；B10-89 runner 只读取 fixture 密码用于真实应用登录，不将其解释为数据库凭据或写入产物。仅 Browser test backend 保持 `browser_acceptance` / `cogmemory_ad_browser_test` / app / `readWrite`。

## 3. 数据库用途、凭据来源与进程隔离

### 3.1 五类用途与项目映射

| 用途类别 | 当前项目映射 | 允许用途 |
|---|---|---|
| `none` | 不连接数据库 | 纯文档、lint、typecheck、build、静态审计、Playwright runner 与 production frontend |
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

`backend/.env.browser-acceptance` 当前提供数据库用途、Browser app 主连接、Browser 管理连接，以及批次专用 fixture 密码的稳定本地凭据来源；B9 与 B10 的专用变量均已建立并完成跨独立进程一致性校验，B11 CLI 只从 `B11_FIXTURE_PASSWORD` 读取本阶段稳定密码。本手册只记录变量职责，不记录实际密码或完整 URI。

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

Playwright runner 和 production frontend 不加载 `backend/.env.test` 或 `backend/.env.browser-acceptance`，不持有数据库角色，也不得直接连接 MongoDB。Browser test backend 继续只加载 `backend/.env.browser-acceptance`，保持 app / `readWrite` 与实际库名逐字门禁；不配置 Batch fault 时必须清除对应 fault 变量。本次通用 live smoke 不执行 fixture CLI，不创建 fixture 或 namespace，数据库业务计数应保持不变。

`npm run start:browser-test` 是 test-only Browser backend 入口；只有用途、URI 声明库名、实际连接库名、用户名和角色全部通过后才监听端口。Browser backend 继续使用既有应用装配、CORS、Cookie、fake Storage 与 stub SMS / LLM。

B10 one-shot HTTP fault 只在五个固定 `B10_BROWSER_HTTP_FAULT_*` 配置完整且目标严格为 `generation-workflow/latest_lifecycle/latest_failure` 时启用，并额外校验 B10 namespace、固定 fixture 密码、`browser_acceptance` 用途、实际 Browser 测试库和 app / `readWrite` 门禁。目标动态路径只在进程内由 fixture manager 解析，不进入日志、文档或 safe manifest；故障只拦截第一次精确 GET，之后及其他 method/route 均进入真实产品路由。未配置任何 fault 变量时不加载 B10 fixture runtime，启动行为与既有 Browser backend 一致。

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

当前最终代码态门禁证据为：lint 0 errors / 0 warnings，typecheck 0 errors，build 通过，A21 mapper / workflow 定向 unit 2 suites / 21 tests，full unit 89 suites / 765 tests，A21 HTTP 定向 E2E 1 suite / 3 tests，B11 fixture 定向 E2E 1 suite / 13 tests，full E2E 26 suites / 137 tests；E2E 实际连接 `cogmemory_ad_test`。这些是当前代码态证据，不代表任何 B11 Browser 项通过。

## 5. 当前测试资产与覆盖范围

### 5.1 主要自动测试资产

| 资产层 | 当前覆盖重点 |
|---|---|
| unit / pure specs | 配置与数据库用途、Schema/索引、DTO whitelist、Controller Guard、Service ownership/状态/并发、mapper 白名单、量表 seed、作答、媒体、提交、评分、认知域、报告生命周期、历史与趋势 |
| HTTP / database E2E | 认证 Cookie、401/403、全局 ValidationPipe、真实 AppModule、MongoDB 写读、fake Storage、A12–A28 临床链路及 D-038 数据库门禁 |
| Browser fixture E2E | contract 计数、namespace 隔离、safe manifest、transition-aware Stage 顺序/漂移拒绝、one-shot 真实 HTTP 500、prepare/verify/post-browser verify、cleanup/二次 cleanup |
| Browser acceptance | Playwright Chromium + production frontend + 真实 test backend + `browser_acceptance` 专用数据库；Network、Console、Storage、Cookie、CORS、角色、并发、幂等与页面行为 |

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
| Batch C / B10 | `scripts/b10-browser-fixtures.ts` | 两个独立 profile；每个 5 角色；`generation-workflow` 10 scenarioKey / 26 route / 48 audit ID，`public-surface-security` 13 scenarioKey / 21 route / 47 audit ID | `generation-workflow` 48 pass + `public-surface-security` 47 pass，共 95 项全部完成；B10 已完成并清理 |
| Batch D / B11 | `scripts/b11-browser-fixtures.ts` | 两个独立 profile、每个 5 角色；`core-workflow` 5 scenarioKey / 20 route / 58 Browser audit ID，`resilience-security` 4 scenarioKey / 9 route / 11 Browser audit ID；B11-70 为 static-gate | 58 + 11 个 Browser audit ID 与 B11-70 static-gate 全部通过，共 70 项完成；B11 已完成，Batch D 尚未完成，下一阶段为 B12 |

这些 CLI 是 test-only 资产，不是 production seed，不随应用启动，不向 Browser 输出密码、连接串、Cookie、Session、metadata、完整请求/响应、原始作答、评分规则、报告正文或内部 lineage/source ID。

Batch D fixture 的验证意图、前置状态和关键边界必须从 frontend testing playbook 的 B11–B15（含 B14.1）待验合同设计；不得从已完成 Batch A / B / C 的旧 namespace、操作流水或中间失败状态反推。B8、B9、B10 与 B11 的 profile 都使用不同 namespace 前缀、独立 manifest、scenario 所有权、prepared / post-browser 合同和 cleanup 范围；`verify --phase post-browser` 只验证命令所选 profile，未执行该 profile 的 Browser 动作时不得调用或要求其通过。B10 `generation-workflow` prepared 合同为 patients 10、visits 26、instances 39、ScoreResults 8、CognitiveDomainResults 6、MediaEvidence 21、ClinicalReports 5；post-browser 允许 `first_generate_success` 的一份产品 V1 draft、`scope_conflict/base` 的一份 fixture-owned staged draft，以及 `source_readiness_errors/scale_not_ready` 的单一 Instance 状态 transition。B10-34 与 B10-39 要求所有业务数据零变化；B10-36/37 的 generate 自身零写入；B10-40 除 stage 声明的 Instance 状态外零写入。`public-surface-security` 整个 profile 业务数据零变化。B9 / B10 的 namespace-owned 冲突资源均不修改产品索引或全局 MMSE / MoCA seed，并由所选 profile 精确 cleanup。

B11 fixture CLI 固定使用 `browser_acceptance` / `cogmemory_ad_browser_test` / db_admin / `dbOwner`，只允许 prepare、prepared/post-browser verify、replace、两个 allowlist Stage、runtime descriptor 与 cleanup；Playwright runner 数据库用途为 `none`，Browser backend 使用 app / `readWrite`。两个 Stage 仅为 `confirmation-conflict-touch` 与 `forbidden-confirm-role`，均要求 profile、namespace、scenario、route、transition、role 命中固定合同。B11-B1 已移除 Stage 前错误的全 profile prepared 门禁，改由 pre-Stage progress verifier 逐 route 接受精确 prepared 或其原合同的精确 product-completed；只有目标 route / 用户可处于精确 target-staged，非法中间态、审计缺失/多写、错误状态/source/qualityStatus/isFinal、产品与 fixture mutation 混合、非目标 marker、用户越界、来源根/快照/seed 与跨 profile 污染均拒绝。Stage 后按同一严格进度矩阵验证非目标 route，目标 route 仍固定为 product mutation `none` 加精确 fixture mutation；完整 post-browser verifier 继续要求所有最终产品 mutation 和 Stage 完成，没有放宽。

B11 fixture 定向 E2E 为 1 suite / 13 tests，覆盖 core prepared、单个/多个/全部合法产品 mutation 后 Stage、重复 Stage 幂等、完整合法 post-browser simulation，以及 resilience prepared Stage / 幂等 / 完整终态；负向覆盖部分与多余 edit、缺失 submit audit、多余 confirmation、目标已 confirm 或状态错误、marker 漂移、角色越界、Patient / Visit / ScaleInstance、system narrative / snapshot、canonical seed 和跨 namespace / profile 污染。最终后端 lint、typecheck、build、89 suites / 761 unit tests、定向 E2E 1 suite / 13 tests、完整 E2E 26 suites / 137 tests 全部通过；`standard_test` 实际为 `cogmemory_ad_test` / app / `readWrite`。两个 profile 的全新 CLI 冒烟均完成 prepare、prepared verify、Stage、重复 Stage、replace、再次 prepared verify、runtime 生成与删除及双次 cleanup；cleanup 1 为 `residualCount=0` / `matched=true`，cleanup 2 为 `residualCount=0` / `matched=false`。canonical seed 语义 hash 不变，seed readiness 仅刷新 lifecycle `updatedAt`，其余 collections、其他 namespace 与非 namespace 业务数据未改变，runtime / manifest 与 namespace 数据无残留。本阶段没有启动 production frontend 或 Browser test backend，没有执行正式 B11 Browser 验收；Browser 历史状态仍为 51 pass / 7 not_executed。下一阶段必须使用全新 namespace 从 prepare 开始完整重跑 B11-B `core-workflow`；不得进入 B11-C，不得关闭 B11-70，也不存在可填写的新 evidence commit。

B11-B2 基于 `0c53cd180eca10c84149a9adcc8429bf3b2aadfd`，使用全新 `b11c-` namespace 完整执行 `core-workflow` 的 5 个 scenarioKey / 20 条 route / 58 个 Browser audit ID。backend build、B11 fixture 定向 E2E 1 suite / 13 tests、frontend test list / infrastructure 12 tests / lint / typecheck / production build、prepare、prepared verify 与 20 个 runtime descriptor 均通过；`standard_test` 实际库为 `cogmemory_ad_test`，Browser backend 与 fixture CLI 实际库均为 `cogmemory_ad_browser_test`，角色分别为 app / `readWrite` 与 db_admin / `dbOwner`，Playwright runner 不连接数据库。Playwright 结果为 2 route / 9 audit ID pass、18 route / 49 audit ID fail；稳定产品阻断为 A21 latest 与 action report 的 public workflow actor 返回非空内部 `operatorId`，安全解析器在 `latest_parse` 或 action response 收口时按合同拒绝，`edit-success` 的真实 A21 edit 200 响应也复现同一泄露。`confirmation-conflict-touch` Stage 未请求、未执行；post-browser verify 按实际不完整进度在 `edit-concurrency/edit-conflict-continue` 拒绝。Browser、Context、服务、runtime、test-results 与 error-context 均已清理；cleanup 1 为 `matched=true` / `residualCount=0`，cleanup 2 为 `matched=false` / `residualCount=0`，canonical seed 不变。当前分类为产品缺陷 1、fixture / Playwright 资产缺陷 0、稳定环境限制 0。B11-B、B11 与 Batch D 均保持未完成，不进入 B11-C，不关闭 B11-70，也不存在可填写的新 evidence commit。

B11-B3 已把 A21 review actor 从 A20 generation 与 A22–A25 lifecycle actor 中独立拆分；latest / historical report、edit / submit / confirm 首次响应、alreadySubmitted、alreadyConfirmed 与 confirmation 历史 fallback 均只公开 operatorName / operatorRole，数据库 editedBy / submittedBy / confirmedBy 审计 ID 保持真实。B11-B4 基于 `adc132e432a15163abdc424913b87e7c6a5216f3`，使用全新 `b11c-` namespace 完整执行 `core-workflow` 的 5 个 scenarioKey / 20 条 route / 58 个 Browser audit ID。backend build、B11 fixture 定向 E2E 1 suite / 13 tests、frontend test list / infrastructure 12 tests / lint / typecheck / production build、prepare、prepared verify、20 个 runtime descriptor、production frontend、Browser test backend、health、CORS 与 credentials 均通过；`standard_test` 实际库为 `cogmemory_ad_test`，Browser backend 与 fixture CLI 实际库均为 `cogmemory_ad_browser_test`，角色分别为 app / `readWrite` 与 db_admin / `dbOwner`，Playwright runner 不连接数据库。20 条 route 全部执行，18 条通过；`edit-success` 因 Playwright 仍期待 `editReceipt.editedBy` 的 actor keys 含 `operatorId` 而失败，实际响应只含 operatorName / operatorRole 且内部 ID 属性不存在；`corrected-readonly` 因 Console error 无法与唯一允许的只读网络事件完成相关性收集而失败。按 route ownership 计为 48 audit ID pass，B11-11–B11-19 与 B11-54 共 10 项 fail；产品缺陷 0、fixture / Playwright 资产缺陷 2、稳定环境限制 0。A21 public actor 在 initial latest、edit、submit、alreadySubmitted、confirm、alreadyConfirmed 与 historical reports 均无 `operatorId`，post-browser verifier 同时确认数据库内部 editedBy / submittedBy / confirmedBy 审计 ID 存在且正确。`confirmation-conflict-touch` 在合法产品进度后成功执行一次，Browser 随后真实 confirm 409 且未产生 confirmation；产品 mutation、Stage、A22–A25 零写入边界与 20 条 route 最终数据库状态均通过 post-browser verify。所有实际 Session 均执行真实 logout，Browser / Context / 服务关闭，端口、runtime、test-results 与 error-context 均无残留；cleanup 1 为 `matched=true` / `residualCount=0`，cleanup 2 为 `matched=false` / `residualCount=0`，canonical seed、其他 namespace 与非 namespace 数据未受影响。不填写不存在的 evidence commit。B11-B、B11 与 Batch D 均未完成，不进入 B11-C，B11-70 尚未最终关闭。

B11-B5 基于指定基线定向修复并重验 `edit-success` 与 `corrected-readonly`，不重跑其余 18 条 route。A21 安全解析器现在以 `Object.hasOwn(actor, 'operatorId')` 拒绝属性本身，无论值为字符串、null、undefined、空串、遮罩或哈希；actor 的 own enumerable key 白名单严格限制为可选 operatorName / operatorRole，额外字段安全失败，`edit-success` 期待 keys 精确为 operatorName / operatorRole。该 route 真实 edit PATCH 200 恰好 1 次，actor 内部 ID 属性不存在且 role 为 doctor，editorial 与 receipt actor 一致；新 Session 中 editorial 保留、receipt 消失且没有第二次 edit，beforeunload、Storage、Cookie、CORS、URL、DOM / HTML / aria / title / data 属性隐私边界与 logout 均通过，B11-11–B11-19 关闭。Console 捕获只保留发生时间、类别和由 `ConsoleMessage.location().url` 清洗出的 safe endpoint pattern，不保留原文或完整 URL；相关性先要求 route-scoped 精确合同，再把 2.5 秒窗口仅用于同一 endpoint 内的辅助定位。`corrected-readonly` 唯一允许事件为 GET `/patients/<id>/visits/<id>/clinical-reports`、409、request failure 为空且恰好 1 次；页面 corrected 与写控件为 0 的业务断言先通过，产品业务写入、retry、polling、pageerror 均为 0，Console 与 Network 一一对应，Storage、Cookie、CORS、URL、隐私和 logout 均通过，B11-54 corrected 半项关闭。前端 test list、infrastructure 12/12、lint、typecheck、production build，backend build 与 B11 fixture 定向 E2E 1 suite / 13 tests 均通过；`standard_test` 使用 `cogmemory_ad_test`，Browser backend / fixture CLI 使用 `cogmemory_ad_browser_test` 且分别为 app / `readWrite`、db_admin / `dbOwner`，Playwright runner 不连接数据库。两条 route 分别使用新的隔离数据范围；prepared verify 均在 Browser 前通过，corrected 在 Browser 后再次通过；全部 Session logout、Browser / 服务关闭，cleanup 1 均为 `matched=true` / `residualCount=0`，cleanup 2 均为 `matched=false` / `residualCount=0`，canonical seed 不变且无运行与测试产物残留。B11-B4 的其余 18 route / 48 audit ID、完整 post-browser verify、Stage、全部产品 mutation、数据库内部审计、profile isolation、canonical seed 与双次 cleanup 证据继续有效；与本次 2 route / 10 audit ID 组合后，B11-B 共 58 个 Browser audit ID 全部通过，`core-workflow` 已完成。产品缺陷 0；fixture 缺陷 0；本次关闭的是 Playwright 测试资产缺陷，稳定环境限制 0。B11 整体与 Batch D 仍未完成；下一阶段为 B11-C `resilience-security`，B11-70 尚未最终关闭；不填写不存在的 evidence commit。

B11-C `resilience-security` 已完整执行 4 个 scenarioKey / 9 条 route，B11-56–B11-59、B11-63–B11-69 共 11 个 Browser audit ID 全部通过。真实 401 / 403、三个 one-shot network abort、Storage / refresh、七个正式 viewport、最大化 Chrome、Axe / ARIA、stale / disabled 真实 409 与 Action 所有权边界均通过；所有产品业务 mutation、A22–A25 与 PDF / print / download / signature / AI 请求为 0。`forbidden-confirm-role` Stage 仅在页面建立本地确认草稿后执行，post-browser verify 接受唯一 `fixture_forbidden_role_only` 变化；prepared / post-browser 资源计数均为 users 5、patients 9、visits 9、scaleInstances 9、clinicalReports 9、fixtureMarkers 9，canonical seed 不变。全部 Session logout，Browser / Context / 服务关闭，runtime 与测试产物无残留；cleanup 1 为 `matched=true,residualCount=0`，cleanup 2 为 `matched=false,residualCount=0`。最终 frontend lint、typecheck、production build 全部通过，B11-70 关闭。B11 最终为 58 + 11 个 Browser 项与 1 个 static-gate，共 70 项完成；B11 已完成，Batch D 尚未完成，下一阶段为 Batch D / B12，B12–B15（含 B14.1）仍待验；不填写不存在的 evidence commit。

## 6. Browser fixture 通用生命周期

每个新 Browser 批次统一执行以下生命周期：

Playwright 只负责 Browser、独立 BrowserContext、Network、键盘、viewport、Axe、ARIA tree 基本结构、runtime 与 beforeunload 自动化。现有 live-region helper 可以保留为可选技术能力，但 live region、动态播报和屏幕阅读器行为不属于强制验收合同；Axe 与 ARIA tree 自动检查也不等同于屏幕阅读器专项验收。各 Batch 既有 fixture CLI 继续唯一负责 prepare / replace、prepared verify、post-browser verify、cleanup、namespace ownership、数据库门禁与稳定 fixture password；不得把这些数据库生命周期重新实现到 Playwright 测试中，Playwright 也不得直接连接 MongoDB。

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
- B9-B1 已完成 canonical seed readiness、受保护 baseline 与稳定 `B9_FIXTURE_PASSWORD` 前置。B9-B2 已修复五条 `local_write_gate` route 以及 `CognitiveDomainScoreList`、`CognitiveDomainContributionList`、`CognitiveDomainMappingSummary` 三个前端展示边界。B9-B3 的 37 项 Browser pass 事实保留。B9-B4 已将 B9-32 标记为有稳定原因的唯一 `obsolete`，core 合同为 37 active + 1 obsolete；seed-drift 与 score-confirmation-only verifier 阻断已修复，定向 E2E、完整 E2E 和全新 namespace core fixture 冒烟均通过。B9-B5 已以全新 namespace 完整重跑 `core-workflow`：37 个 active 项全部通过，B9-32 保持 `obsolete`；fixture CLI 确认实际数据库为 `cogmemory_ad_browser_test`，Browser backend 使用 app / `readWrite`，fixture CLI 使用 db_admin / `dbOwner`；post-browser verify 通过，cleanup 1 与 cleanup 2 均为 `residualCount=0`，第二次 `matched=false`。B9-C 已在基线 `977e3ce053dd13aae1965534409e209a0cb5d64e` 完整执行 `resilience-security`，B9-39–B9-50 与 B9-52 共 13 项通过，post-browser verify 与双次 cleanup 通过。B9-C1 基于 `ff3b55ba1d4422234a93c923d1a107c2bfd4c16e` 修复并定向通过 B9-51：七个固定 viewport、768×900 压力尺寸和最大化 Chrome 全部无全局横向溢出，七列表仅在局部 wrapper 横向滚动；latest GET 200×1，compute 与其他业务写请求均为 0，Browser 前后 prepared verify 与双次 cleanup 通过，第二次 `matched=false`。本次只读 namespace 未执行全量 post-browser verify，符合定向合同，不是产品、fixture 或环境缺陷。B9 最终为 51 active pass + B9-32 obsolete，B9 已完成。B10-A 当时仅完成 fixture、尚未开始 Browser 验收；该历史状态后续已关闭，当前 B10 已完成。不存在可填写的新 evidence commit。
- B10-B5 已使用全新 namespace 完整重跑 `generation-workflow`，48 项全部通过；B10-C 原完整 `public-surface-security` 的其余 46 项、post-browser verify 和双 cleanup 证据继续有效。B10-C2 已使用 Playwright Chromium 在 1536×864 与 390×844 定向通过 B10-89，Browser 前后 prepared verify、logout/停服、临时 runtime 删除和双次 `residualCount=0` cleanup 全部闭环，产品业务写入为 0。B10 最终为 `generation-workflow` 48 pass + `public-surface-security` 47 pass，共 95 项完成；Batch C / B7–B10 已完成；不存在可填写的新 evidence commit。
- Batch D 的 B11 `core-workflow` 58 个 Browser audit ID、`resilience-security` 11 个 Browser audit ID 与 B11-70 static-gate 均已通过，共 70 项完成；post-browser verify、logout/停服、runtime / 测试产物删除和双次 cleanup 全部闭环，产品缺陷、fixture / Playwright 资产缺陷与稳定环境限制均为 0。B11 已完成，Batch D 尚未完成；下一阶段为 Batch D / B12，B12–B15（含 B14.1）仍待验；不存在可填写的新 evidence commit。
- Batch E 的 8 项真实设备或人工验收尚未执行并继续保留：`B5-MV-008`、`B5-MV-028`、`B5-MV-029`、`B5-MV-058`、`B5-MV-059`、`B5-MV-060`、`B5-MV-061`、`B5-MV-062`；桌面 Browser、automated boundary 或大屏抽查均不能替代。B5-MV-008、B5-MV-028、B5-MV-029 保留真实设备、媒体或手写边界；B5-MV-058–B5-MV-062 后续重建时只恢复真实设备或人工验收意图，不凭空补写细分步骤，也不恢复屏幕阅读器或 live region 专项要求。
- roadmap 业务工作包状态不因 testing playbook 压缩、历史证据索引或未来 Batch 验收自动变化。
- 后端新增或调整测试脚本、fixture、数据库门禁、Service、Controller、DTO、权限或 E2E 时，应更新当前资产、门禁和证据索引；不得追加逐轮执行流水。
- 每次报告必须区分代码门禁、Browser 前置、Browser 结果、post-browser verify、cleanup 和人工签收，不能用其中一类替代另一类。

## 10. 历史追溯

- 本轮 testing playbook 减肥前的完整历史基线为 `3c0e373902985b9da09b359ed8f2a0334ef1e5d0`。
- 已删除的 A1–A28 逐阶段命令、旧 suite/test 数量、fixture 重试、临时诊断、旧 namespace 和逐轮 Browser 日志可通过 Git 历史查看。
- active playbook 不另建 archive，也不复制一份 Validation catalog；已完成历史只保留本文件的最终摘要与 evidence commit 索引。
