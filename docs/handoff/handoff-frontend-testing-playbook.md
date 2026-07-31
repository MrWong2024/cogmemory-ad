# CogMemory AD / 智忆评 前端验证手册

## 1. 文档定位与当前状态

本文档是跨层测试设计、Browser 验收策略、稳定 Audit 清单和当前验证状态的权威来源。它只维护当前有效规则与待验合同；roadmap 继续维护产品范围和工作包状态，Git 历史负责旧命令、旧结果与失败过程。

> B12-P1 eligibility-readonly、R1、A3、A3-R2 已退役。约70小时投入后，专属fixture/support复杂度超过业务；未新增关闭Audit ID，代码全删。继续前须重审ID的业务必要性、可表达性、重复性和证据层；未获新设计及用户确认，不重建B12专属fixture/support。

| 范围 | 当前状态 |
|---|---|
| WP-02 / B16 | 已完成，既有状态不变 |
| WP-04 / B17 | 已完成，既有状态不变 |
| Batch A / B1–B3 | 已完成，既有状态不变 |
| Batch B / B4–B6 | 桌面范围已完成，Batch E 仍保留 8 项 |
| Batch C / B7–B10 | 已完成；B7、B8、B9、B10 各自既有最终处置不变 |
| Batch D / B11 | 70 项已完成，状态不变 |
| Batch D / B12 | 未完成；`passed=7`、`pending=81`、`failed=0`、`blocked=0`、`not_executed=0` |
| Batch D / B13–B15（含 B14.1） | 稳定验收点和顺序保留，尚未执行 |

B12-P0-A/B/C 已完成，`B12-P0-contract-state` 已完成：P0 拥有的 B12-09、B12-31、B12-32、B12-36、B12-37、B12-38、B12-84 均已通过非 Browser 证据闭环。

B12 当前汇总为 `passed=7`、`pending=81`、`failed=0`、`blocked=0`、`not_executed=0`。B12 已暂停；下一任务先审查验收清单本身，审查完成前不启动 P1、P2 或新的 Browser 实现。

B12-09、B12-38不再重复要求Browser支持；页面状态、锁定回执与字段语义仍分别由B12-10、B12-11、B12-16、B12-39、B12-44～B12-48承担。

## 2. 强制测试设计理念

### 2.1 验收点守恒

- 稳定 Audit ID 总数和不同业务语义不得减少；优化的是取证方式，不是验收要求。
- 每个 Audit ID 必须定位到主证据层、必要支持证据、Browser 必要性、微型 Profile 和当前状态。
- 不得以“类似场景已覆盖”替代具体证据；doctor 与 admin、401 与 403、首次成功与幂等、两种冲突、不同状态机结果均不得互相替代。
- 先选择最低充分主证据，再安排支持证据；不得因为 Browser 更直观而把全部验证塞进 Browser。

### 2.2 分层取证

- 页面文本不能替代数据库终态，代码阅读不能替代真实交互，静态检查不能替代动态权限或状态机，fixture E2E 不能冒充产品 Browser 通过。
- 一个验收点只在最合适层作为主证据；其他层只承担不可替代的支持事实。
- 业务、权限、安全、数据库终态和真实 Browser 质量均不得因拆分 Profile 而降低。

## 3. 证据层级与最低充分证据

| 证据层 | 主职责 | 不可替代边界 |
|---|---|---|
| `backend_unit` | 纯函数、mapper、DTO 局部规则、Service 状态分支、无数据库算法 | 不证明真实 HTTP、Guard 或数据库终态 |
| `backend_http_e2e` | 权限、401/403、ValidationPipe、Body、错误码、状态机、幂等、并发、audit、真实 MongoDB 终态 | 不证明页面真实交互 |
| `frontend_static_or_pure` | 纯展示映射、路由静态存在性、action ownership 静态边界、纯逻辑 | 不证明真实输入、Browser API 或后端动态行为 |
| `browser_micro_profile` | 页面入口、控件状态、真实输入、刷新、beforeunload、Storage、Cookie、双 Session、错误恢复、focus、keyboard、viewport、Axe | 不替代真实数据库终态 |
| `database_verifier` | 写入次数、audit、幂等终态、protected roots、narrative、snapshot、Profile 隔离、canonical seed | 不替代页面与用户体验 |
| `static_gate` | lint、typecheck、build、test discovery | 不证明业务运行通过 |

主证据与必要支持证据都实际通过后才具备关闭资格；支持证据为“—”表示没有独立附加层级，不表示免除通用质量门禁。

## 4. 微型 Browser Profile

微型 Profile 原则上只包含 1～4 个紧密相关业务场景，具有单一主风险、最小合法前置、独立执行、独立证据、必要后置验证和精确 cleanup，并能独立关闭所拥有的 Audit ID。

每个微型 Profile 内保持证据原子性：同一 Git 代码态、同一最小前置、同一次 Browser 执行、同一次对应 verifier 和同一次 cleanup。后一个无关 Profile 失败，不得作废前一个已经闭环的有效证据。

禁止一个 Profile 混入十几个以上无关状态、让单次失败使整个批次证据归零、建设批次专属 runner/journal/aggregator/完整 manifest，或让所有 Profile 共享超长服务生命周期。

### 4.1 Codex 任务、证据包与微型 Profile 的粒度

Codex 任务默认按业务风险一致、证据类型相近的完整业务风险包或证据包批量处理；非 Browser 证据可以在同一证据包内批量执行。单个 Audit ID 或单个微型 Profile 都不是默认任务边界，一个 Codex 任务可以包含多个相互独立的微型 Profile。不得为了减少 Codex 数量而合并不可互换的业务语义，也不得为了形式上的独立性将每个 Audit ID 机械拆成单独 Codex 任务。

同一证据包可以覆盖多个相关 Audit ID，但每个 Audit ID 仍须单独定位主证据和必要支持证据、单独记录实际执行结果、单独判断关闭资格并单独更新状态；不得因为批量执行而批量推定通过。

Browser 场景继续按微型 Profile 隔离执行。每个 Profile 必须独立拥有最小合法前置、业务特有断言、必要后置验证、verifier、cleanup 和证据结果。同一 Codex 包含多个 Profile，不表示这些 Profile 必须共享 fixture、namespace、可写 Report、BrowserContext 或 Session，也不表示可以跨 Profile 拼接数据库终态证据或形成一次大型原子运行。后续无关 Profile 失败，不得作废此前已经完成业务证据、必要 verifier 和 cleanup 的 Profile。

Codex 任务规模取决于业务风险是否一致、证据层是否相近、前置状态是否兼容、写入和并发是否需要隔离，以及能否在合理时间内完成和收口。一个 Codex 通常可处理约 5～25 个相关 Audit ID；该数量仅是任务规划参考，不是验收门禁，不得为了达到该数字而扩大或缩减验收语义。

### 4.2 B12 Profile 基线

- `B12-P0-contract-state`（已完成）：DTO、权限、错误码、状态机、mapper、幂等、请求正文、并发基线、路由所有权和数据库终态，以 pure/static、unit、HTTP E2E 和 verifier 为主；已关闭 B12-09、B12-31、B12-32、B12-36、B12-37、B12-38、B12-84。
- `B12-P1-eligibility-readonly`：draft、pending、confirmed、角色入口、quality、confirmation、locked/voided、一致性 warning 和 locked 只读。
- `B12-P2-lock-success-idempotency`：doctor/admin 首次锁定、alreadyLocked、必要支持证据和数据库终态。
- `B12-P3-conflict`：可继续冲突、latest 已锁冲突、必要 Stage 和终态 verifier。
- `B12-P4-error-client-boundary`：audit unavailable、metadata unsupported、401、403、network abort、beforeunload、Storage 和 refresh。
- `B12-P5-presentation-accessibility`：action ownership、非诊断语言、敏感信息、响应式、键盘、focus、label 和 Axe。
- `B12-P6-final-smoke`：拥有 B12-85～B12-88；审核全部 B12 测试数据的脱敏与来源，针对 B12-P1～P5 完成后的最终代码态执行 lint、typecheck、build，并跑一条轻量跨层集成冒烟。冒烟本身不新增 Audit ID，也不重新执行 88 项。

## 5. Browser 必须验证的行为

- 使用 production frontend、真实 Browser test backend 和真实 HTTP；不得以 mock server、伪造成功响应或代码阅读替代。
- 验证页面入口、角色可见性、控件 enabled/disabled、真实输入、请求次数与状态、用户可见成功、冲突和错误恢复。
- 验证刷新、beforeunload、localStorage、sessionStorage、IndexedDB、Cookie、URL、Console、DOM 和 Network 隐私边界。
- 多角色或双 Session 使用独立 BrowserContext；不得通过清除同一 Context Cookie 模拟隔离。
- 响应式代表覆盖 390×844、800×1280、1280×800、1024×1366、1366×1024、1280×720、1536×864；宽表只允许局部滚动。
- 键盘证据使用真实 Tab、Shift+Tab、Enter、Space 与 `isTrusted=true` 事件，验证自然焦点顺序、focus-visible 和焦点进出。
- Axe 与 ARIA tree 用于基础 A/AA、role、accessible name 和结构；不能替代真实设备或专业判断。

## 6. 横切能力代表性验证

认证生命周期、logout/Cookie、Storage/URL 隐私、CORS、通用 Console、通用 DOM 敏感信息扫描、Axe、viewport、focus-visible 和不支持 Action 扫描，可在少量代表 Profile 验证。代表组合至少包含一个正常只读、一个真实写入、一个权限失败和一个错误或冲突。

横切失败只影响直接 Audit ID 或最终质量门禁；横切代表不得替代业务特有页面断言、业务特有错误恢复、角色差异、状态差异、请求次数与状态或数据库终态。

### 6.1 Browser Origin、Cookie 与认证 preflight

每个 Browser Profile 启动前必须记录并逐项核对以下非敏感事实：页面 URL 与实际页面 origin、前端构建实际使用的 `NEXT_PUBLIC_API_BASE_URL`、Browser 实际请求的 API origin、后端 `CORS_ORIGIN`、Session Cookie 所属 host，以及 backend 健康检查地址。声明值、构建产物、响应头、Cookie 元数据和实际 Network 请求必须相互一致。

本地 Browser 验收使用以下 canonical host 规则：

| canonical host | 页面 origin | API origin / API Base | CORS origin | Cookie host | health |
|---|---|---|---|---|---|
| `localhost` | `http://localhost:3002` | `http://localhost:5002` | `http://localhost:3002` | `localhost` | `http://localhost:5002/health` |
| `127.0.0.1` | `http://127.0.0.1:3002` | `http://127.0.0.1:5002` | `http://127.0.0.1:3002` | `127.0.0.1` | `http://127.0.0.1:5002/health` |

- 页面使用 `localhost` 时，API、health 和 Cookie host 必须使用 `localhost`，CORS 必须精确允许该页面 origin；页面使用 `127.0.0.1` 时，整条链路必须对应使用 `127.0.0.1`。同一认证链不得混用二者，也不得把它们视为等价 host。
- 页面与 API 端口可以不同；当前本地链路的 scheme 和 host 必须一致，CORS 必须精确匹配包含 scheme 与端口的页面 origin，Cookie host / domain 语义必须匹配实际 API 请求 host。
- 当前 Session Cookie 未设置 `Domain`，属于 API 响应 host 的 host-only Cookie；验收只记录 Cookie 名称、host/domain、path、HttpOnly、SameSite、Secure 和是否存在，不得输出 Cookie 值。
- `BROWSER_ACCEPTANCE_FRONTEND_ORIGIN` 与 `BROWSER_ACCEPTANCE_BACKEND_ORIGIN` 声明 Playwright 预期拓扑；它们不能覆盖已经进入 production frontend 构建产物的 API Base。
- `NEXT_PUBLIC_API_BASE_URL` 是 Next.js 公开构建时输入。该值变化后必须重新执行 production build，再启动生产服务；只重启既有 production server 不能证明新值已生效。Browser 必须以实际 Network 请求确认构建产物使用的 API origin。

进入任何业务 Profile 前，必须在同一 BrowserContext 完成认证 preflight：

1. 请求 canonical backend health 地址并确认成功。
2. 打开页面并确认实际 `location.origin` 与声明的页面 origin 完全一致。
3. 发起登录并确认请求发送到预期 API origin，响应 CORS origin 与 credentials 语义正确。
4. 确认登录响应成功，并在该 BrowserContext 中产生预期的 HttpOnly Session Cookie；登录接口成功本身不能证明认证链通过。
5. 保持同一 BrowserContext 调用 `GET /auth/me`，确认 Cookie 被发送且已认证读取成功。

任一步失败都不得进入业务 Profile；受影响的本轮业务结果无效，也不得通过重试业务请求或延长超时绕过 preflight。origin、CORS、Cookie host 或公开构建输入不一致时，先排查环境与配置链：本地 `.env.local`、启动 URL 或未重新 build 导致的不一致属于环境编排缺陷。完成正确声明、重新 production build 和 canonical 规范启动后，若构建产物或实际请求仍违反已确认的 Origin 合同，必须按证据重新分类为产品代码或受版本管理配置缺陷；不得把所有 Origin 类问题永久豁免为非产品缺陷。

## 7. Audit ID 关闭规则

状态只允许 `pending`、`passed`、`failed`、`blocked`、`not_executed`、`obsolete`。一个 Audit ID 只有在主证据、必要支持证据、必需数据库终态、资源 cleanup 全部实际通过，且没有测试资产、环境或未执行项阻断时才能关闭。

`unknown` 仅是命令已启动但没有可靠摘要或证据不足时的临时测试结论，不属于允许的 Audit ID 状态，也不得写入 Audit 清单。相关 Audit ID 不得据此关闭、通过或失败；尚未形成有效证据时通常保持原有 `pending`。只有存在符合既有定义的明确且持续外部环境、工具或权限阻断时才使用 `blocked`；目标测试因命令、选择器、权限或进程未启动而没有实际执行时，按既有规则使用 `not_executed`。

不得根据 Playwright exit code、测试代码已存在、历史失败轮局部观察或 cleanup 成功批量关闭；`blocked` 和 `not_executed` 不得写成 `passed`。每个 Profile 独立关闭自己拥有的 ID。

## 8. 失败分类与止损门禁

每轮分别报告产品缺陷、测试代码缺陷、fixture 缺陷、Playwright/support 缺陷、环境编排缺陷、工具或权限限制和 `not_executed`。只有稳定复现且证明违反产品合同的行为才归类为产品缺陷。

强制止损：

1. 单个批次的测试资产设计或修改累计达到 2 小时仍未进入稳定业务执行，立即暂停并复核分层与 Profile。
2. 同一公共 support 连续影响两个业务场景，停止当前执行方案。
3. 同一方案连续两轮因环境、fixture 或测试资产失败，不进行第三轮同方案重跑。
4. 每个微型 Profile 最多一次测试资产修复轮；修复后只重跑受影响 Profile 与必要关联证据。
5. 同一任务不得同时重构 fixture、重构 runner、修改业务断言并执行正式完整验收。
6. 未经工具评估和用户明确批准，不得新建批次专属测试框架。
7. 每轮分别报告业务测试、fixture 准备、测试资产修改和环境收口耗时。
8. 测试基础设施复杂度明显超过被测业务时，立即停止扩张。

## 9. B12 验收清单（暂停，待审查）

下表保留 B12 现有 88 项清单语义，本轮只复位状态，不增删、合并、降级或改写 Audit ID；“是（横切代表）”表示主证据不一定在 Browser，但关闭仍需要横切代表 Browser 支持证据。

| Audit ID | 紧凑验收意图 | 主证据层 | 必要支持证据 | 必须 Browser | 微型 Profile | 当前状态 |
|---|---|---|---|---|---|---|
| B12-01 | draft 报告不显示锁定入口。 | `browser_micro_profile` | `backend_unit` | 是 | `B12-P1-eligibility-readonly` | `pending` |
| B12-02 | pending_confirmation 不显示锁定入口。 | `browser_micro_profile` | `backend_unit` | 是 | `B12-P1-eligibility-readonly` | `pending` |
| B12-03 | confirmed 未锁定报告显示锁定状态。 | `browser_micro_profile` | `backend_unit` | 是 | `B12-P1-eligibility-readonly` | `pending` |
| B12-04 | confirmed 未锁定报告对 doctor 显示锁定入口。 | `browser_micro_profile` | `backend_http_e2e` | 是 | `B12-P1-eligibility-readonly` | `pending` |
| B12-05 | confirmed 未锁定报告对 admin 显示锁定入口。 | `browser_micro_profile` | `backend_http_e2e` | 是 | `B12-P1-eligibility-readonly` | `pending` |
| B12-06 | nurse 不显示可用锁定入口。 | `browser_micro_profile` | `backend_http_e2e` | 是 | `B12-P1-eligibility-readonly` | `pending` |
| B12-07 | research_assistant 不显示可用锁定入口。 | `browser_micro_profile` | `backend_http_e2e` | 是 | `B12-P1-eligibility-readonly` | `pending` |
| B12-08 | system 不显示可用锁定入口。 | `browser_micro_profile` | `backend_http_e2e` | 是 | `B12-P1-eligibility-readonly` | `pending` |
| B12-09 | 不新增 locked status。 | `backend_http_e2e` | `backend_unit + frontend_static_or_pure` | 否 | `B12-P0-contract-state` | `passed` |
| B12-10 | 技术信息中的 status 仍为 confirmed。 | `browser_micro_profile` | `backend_http_e2e` | 是 | `B12-P1-eligibility-readonly` | `pending` |
| B12-11 | 页面独立显示“尚未锁定”。 | `browser_micro_profile` | `backend_unit` | 是 | `B12-P1-eligibility-readonly` | `pending` |
| B12-12 | quality 非 passed 不开放锁定。 | `browser_micro_profile` | `backend_unit` | 是 | `B12-P1-eligibility-readonly` | `pending` |
| B12-13 | isFinal=false 不开放锁定。 | `browser_micro_profile` | `backend_unit` | 是 | `B12-P1-eligibility-readonly` | `pending` |
| B12-14 | confirmation 缺失不开放锁定。 | `browser_micro_profile` | `backend_unit` | 是 | `B12-P1-eligibility-readonly` | `pending` |
| B12-15 | Visit locked / voided 不开放首次锁定。 | `browser_micro_profile` | `backend_http_e2e + backend_unit` | 是 | `B12-P1-eligibility-readonly` | `pending` |
| B12-16 | lockedAt 非空不显示再次锁定入口。 | `browser_micro_profile` | `backend_unit` | 是 | `B12-P1-eligibility-readonly` | `pending` |
| B12-17 | lock 非空但 lockedAt 为空显示一致性警告。 | `browser_micro_profile` | `backend_unit` | 是 | `B12-P1-eligibility-readonly` | `pending` |
| B12-18 | lockedAt 非空但 lock 为空显示审计摘要不完整。 | `browser_micro_profile` | `backend_unit` | 是 | `B12-P1-eligibility-readonly` | `pending` |
| B12-19 | lock.lockedAt 与 top-level 不一致显示警告。 | `browser_micro_profile` | `backend_unit` | 是 | `B12-P1-eligibility-readonly` | `pending` |
| B12-20 | 锁定前显示不可逆说明。 | `browser_micro_profile` | `frontend_static_or_pure` | 是 | `B12-P2-lock-success-idempotency` | `pending` |
| B12-21 | 锁定前说明 status 仍为 confirmed。 | `browser_micro_profile` | `backend_http_e2e` | 是 | `B12-P2-lock-success-idempotency` | `pending` |
| B12-22 | 锁定前说明只锁报告本身。 | `browser_micro_profile` | `database_verifier` | 是 | `B12-P2-lock-success-idempotency` | `pending` |
| B12-23 | 锁定前说明不锁来源数据。 | `browser_micro_profile` | `database_verifier` | 是 | `B12-P2-lock-success-idempotency` | `pending` |
| B12-24 | 锁定前说明不等于归档。 | `browser_micro_profile` | `static_gate` | 是 | `B12-P2-lock-success-idempotency` | `pending` |
| B12-25 | 锁定前说明不生成签名或 PDF。 | `browser_micro_profile` | `static_gate` | 是 | `B12-P2-lock-success-idempotency` | `pending` |
| B12-26 | lockNote 少于 3 字符不能提交。 | `browser_micro_profile` | `backend_unit` | 是 | `B12-P2-lock-success-idempotency` | `pending` |
| B12-27 | lockNote 超过 2000 字符不能提交。 | `browser_micro_profile` | `backend_unit` | 是 | `B12-P2-lock-success-idempotency` | `pending` |
| B12-28 | lockNote 不自动生成。 | `browser_micro_profile` | `frontend_static_or_pure` | 是 | `B12-P2-lock-success-idempotency` | `pending` |
| B12-29 | confirmationNote 不自动填入 lockNote。 | `browser_micro_profile` | `frontend_static_or_pure` | 是 | `B12-P2-lock-success-idempotency` | `pending` |
| B12-30 | 未勾选 checkbox 不能锁定。 | `browser_micro_profile` | `frontend_static_or_pure` | 是 | `B12-P2-lock-success-idempotency` | `pending` |
| B12-31 | lock 只发送 confirm、lockNote、expectedUpdatedAt。 | `frontend_static_or_pure` | `backend_unit + backend_http_e2e` | 否 | `B12-P0-contract-state` | `passed` |
| B12-32 | expectedUpdatedAt 来自服务端。 | `frontend_static_or_pure` | `backend_http_e2e` | 否 | `B12-P0-contract-state` | `passed` |
| B12-33 | 锁定期间 edit / submit / confirm / lock 均禁用。 | `browser_micro_profile` | `frontend_static_or_pure` | 是 | `B12-P2-lock-success-idempotency` | `pending` |
| B12-34 | 锁定期间报告仍可阅读。 | `browser_micro_profile` | — | 是 | `B12-P2-lock-success-idempotency` | `pending` |
| B12-35 | 锁定成功使用服务端完整 report。 | `backend_http_e2e` | `browser_micro_profile + database_verifier` | 是 | `B12-P2-lock-success-idempotency` | `pending` |
| B12-36 | 锁定成功 status 仍为 confirmed。 | `backend_http_e2e` | `backend_unit + database_verifier` | 否 | `B12-P0-contract-state` | `passed` |
| B12-37 | 锁定成功 lockedAt 非空。 | `database_verifier` | `backend_http_e2e` | 否 | `B12-P0-contract-state` | `passed` |
| B12-38 | 锁定成功 lock summary 非空。 | `backend_unit` | `backend_http_e2e + database_verifier` | 否 | `B12-P0-contract-state` | `passed` |
| B12-39 | 锁定成功显示 lockReceipt。 | `browser_micro_profile` | `backend_http_e2e` | 是 | `B12-P2-lock-success-idempotency` | `pending` |
| B12-40 | alreadyLocked=false 显示首次锁定成功。 | `browser_micro_profile` | `backend_http_e2e` | 是 | `B12-P2-lock-success-idempotency` | `pending` |
| B12-41 | alreadyLocked=true 按成功处理。 | `backend_http_e2e` | `browser_micro_profile + database_verifier` | 是 | `B12-P2-lock-success-idempotency` | `pending` |
| B12-42 | alreadyLocked 不自动重发。 | `browser_micro_profile` | `backend_http_e2e + database_verifier` | 是 | `B12-P2-lock-success-idempotency` | `pending` |
| B12-43 | 重复锁定不显示第二个可用入口。 | `browser_micro_profile` | `backend_unit` | 是 | `B12-P2-lock-success-idempotency` | `pending` |
| B12-44 | lockId 弱化为技术追溯号。 | `browser_micro_profile` | `backend_unit` | 是 | `B12-P2-lock-success-idempotency` | `pending` |
| B12-45 | lockedBy 显示姓名和角色。 | `browser_micro_profile` | `backend_unit + backend_http_e2e` | 是 | `B12-P2-lock-success-idempotency` | `pending` |
| B12-46 | operatorId 不作为主要业务字段。 | `browser_micro_profile` | `backend_unit` | 是 | `B12-P2-lock-success-idempotency` | `pending` |
| B12-47 | lockNote 标记为锁定流程说明。 | `browser_micro_profile` | `backend_unit` | 是 | `B12-P2-lock-success-idempotency` | `pending` |
| B12-48 | lockNote 不显示为报告正文。 | `browser_micro_profile` | `backend_unit` | 是 | `B12-P2-lock-success-idempotency` | `pending` |
| B12-49 | lock conflict 保留 lockNote。 | `browser_micro_profile` | `backend_http_e2e` | 是 | `B12-P3-conflict` | `pending` |
| B12-50 | lock conflict 清除 checkbox。 | `browser_micro_profile` | `frontend_static_or_pure` | 是 | `B12-P3-conflict` | `pending` |
| B12-51 | lock conflict 自动 latest 一次。 | `browser_micro_profile` | `backend_http_e2e` | 是 | `B12-P3-conflict` | `pending` |
| B12-52 | lock conflict 不自动 POST。 | `browser_micro_profile` | `backend_http_e2e` | 是 | `B12-P3-conflict` | `pending` |
| B12-53 | stale 时不能锁定。 | `browser_micro_profile` | `frontend_static_or_pure` | 是 | `B12-P3-conflict` | `pending` |
| B12-54 | 基于最新报告继续后保留 lockNote。 | `browser_micro_profile` | `frontend_static_or_pure` | 是 | `B12-P3-conflict` | `pending` |
| B12-55 | 最新报告已锁定时不能继续提交本地草稿。 | `browser_micro_profile` | `backend_http_e2e + database_verifier` | 是 | `B12-P3-conflict` | `pending` |
| B12-56 | audit unavailable 不猜测锁定人。 | `backend_unit` | `backend_unit + browser_micro_profile` | 是 | `B12-P4-error-client-boundary` | `pending` |
| B12-57 | metadata unsupported 不显示 metadata。 | `backend_unit` | `backend_unit + browser_micro_profile` | 是 | `B12-P4-error-client-boundary` | `pending` |
| B12-58 | action 403 保留报告和 lockNote。 | `browser_micro_profile` | `backend_http_e2e` | 是 | `B12-P4-error-client-boundary` | `pending` |
| B12-59 | 401 返回登录页。 | `browser_micro_profile` | `backend_http_e2e` | 是 | `B12-P4-error-client-boundary` | `pending` |
| B12-60 | 网络错误保留 lockNote。 | `browser_micro_profile` | `frontend_static_or_pure` | 是 | `B12-P4-error-client-boundary` | `pending` |
| B12-61 | beforeunload 覆盖 lockNote。 | `browser_micro_profile` | `frontend_static_or_pure` | 是 | `B12-P4-error-client-boundary` | `pending` |
| B12-62 | lockNote 不写 localStorage。 | `browser_micro_profile` | `frontend_static_or_pure` | 是 | `B12-P4-error-client-boundary` | `pending` |
| B12-63 | 刷新后未提交 lockNote 消失。 | `browser_micro_profile` | — | 是 | `B12-P4-error-client-boundary` | `pending` |
| B12-64 | 已锁定报告 edit 不可用。 | `browser_micro_profile` | `backend_unit` | 是 | `B12-P1-eligibility-readonly` | `pending` |
| B12-65 | 已锁定报告 submit 不可用。 | `browser_micro_profile` | `backend_unit` | 是 | `B12-P1-eligibility-readonly` | `pending` |
| B12-66 | 已锁定报告 confirm 不可用。 | `browser_micro_profile` | `backend_unit` | 是 | `B12-P1-eligibility-readonly` | `pending` |
| B12-67 | 已锁定报告 lock 不可用。 | `browser_micro_profile` | `backend_http_e2e` | 是 | `B12-P1-eligibility-readonly` | `pending` |
| B12-68 | confirmed 不显示为 locked status。 | `browser_micro_profile` | `backend_http_e2e` | 是 | `B12-P1-eligibility-readonly` | `pending` |
| B12-69 | isFinal 不作为锁定判断。 | `frontend_static_or_pure` | `browser_micro_profile` | 是（横切代表） | `B12-P1-eligibility-readonly` | `pending` |
| B12-70 | lockedAt 不显示为归档时间。 | `browser_micro_profile` | `backend_unit` | 是 | `B12-P1-eligibility-readonly` | `pending` |
| B12-71 | 页面不存在 unlock。 | `static_gate` | `browser_micro_profile` | 是（横切代表） | `B12-P5-presentation-accessibility` | `pending` |
| B12-72 | 页面不存在 reopen / return / reject / withdraw。 | `static_gate` | `browser_micro_profile` | 是（横切代表） | `B12-P5-presentation-accessibility` | `pending` |
| B12-73 | 页面不存在 signature。 | `static_gate` | `browser_micro_profile` | 是（横切代表） | `B12-P5-presentation-accessibility` | `pending` |
| B12-74 | 页面不存在 archive / correct / void。 | `static_gate` | `browser_micro_profile` | 是（横切代表） | `B12-P5-presentation-accessibility` | `pending` |
| B12-75 | 页面不存在 PDF / 下载。 | `static_gate` | `browser_micro_profile` | 是（横切代表） | `B12-P5-presentation-accessibility` | `pending` |
| B12-76 | 页面不存在来源链锁定。 | `static_gate` | `browser_micro_profile` | 是（横切代表） | `B12-P5-presentation-accessibility` | `pending` |
| B12-77 | 页面不存在 AI 操作。 | `static_gate` | `browser_micro_profile` | 是（横切代表） | `B12-P5-presentation-accessibility` | `pending` |
| B12-78 | 页面不显示患者、访视或评分已锁定。 | `browser_micro_profile` | — | 是 | `B12-P5-presentation-accessibility` | `pending` |
| B12-79 | 页面不把 quality passed 显示为患者正常。 | `browser_micro_profile` | — | 是 | `B12-P5-presentation-accessibility` | `pending` |
| B12-80 | 页面不输出诊断结论。 | `browser_micro_profile` | — | 是 | `B12-P5-presentation-accessibility` | `pending` |
| B12-81 | 小屏幕锁定表单可用。 | `browser_micro_profile` | — | 是 | `B12-P5-presentation-accessibility` | `pending` |
| B12-82 | label、错误提示和交互状态反馈正确。 | `browser_micro_profile` | — | 是 | `B12-P5-presentation-accessibility` | `pending` |
| B12-83 | 没有第二次 `/auth/me`。 | `browser_micro_profile` | `frontend_static_or_pure` | 是 | `B12-P4-error-client-boundary` | `pending` |
| B12-84 | 没有新增路由。 | `frontend_static_or_pure` | — | 否 | `B12-P0-contract-state` | `passed` |
| B12-85 | 没有使用真实患者或锁定说明。 | `database_verifier` | `static_gate` | 否 | `B12-P6-final-smoke` | `pending` |
| B12-86 | lint 通过。 | `static_gate` | — | 否 | `B12-P6-final-smoke` | `pending` |
| B12-87 | typecheck 通过。 | `static_gate` | — | 否 | `B12-P6-final-smoke` | `pending` |
| B12-88 | build 通过。 | `static_gate` | — | 否 | `B12-P6-final-smoke` | `pending` |

## 10. B13～B15 后续设计规则

B13～B15 的稳定验证点与顺序保持不变。默认采用相同新方案：先分配主证据层，再划分微型 Profile；先完成非 Browser 证据；Browser 先执行 2～4 个 canary，canary 通过后才执行对应 Profile；每个 Profile 独立关闭 ID；最后执行轻量集成冒烟与静态门禁。

不得再创建批次专属大型 fixture、独立 evidence matrix、批次专属 runner/journal/aggregator，也不要求一次原子运行关闭整个批次。fixture 只制造合法最小前置，不改变下列验收意图。

### 10.1 B13 报告来源冻结：116 项

1. 未生成报告时无来源冻结区域写入口。
2. draft 报告不允许冻结来源。
3. pending_confirmation 不允许冻结来源。
4. confirmed 未锁定报告提示先锁报告。
5. confirmed 已锁定且 sourceFreeze=null 显示尚未冻结。
6. doctor 显示首次冻结入口。
7. admin 显示首次冻结入口。
8. nurse 不显示可用入口。
9. research_assistant 不显示可用入口。
10. system 不显示可用入口。
11. 没有第二次 `/auth/me`。
12. Visit draft 可首次发起。
13. Visit in_progress 可首次发起。
14. Visit completed 可首次发起。
15. Visit locked 不开放首次发起。
16. Visit voided 不开放首次发起。
17. sourceFreeze=in_progress 时允许 doctor / admin 恢复。
18. in_progress 恢复不因 Visit 后续 locked / voided 被前端擅自阻断。
19. 首次 freezeNote 少于 3 字不能提交。
20. freezeNote 超过 2000 字不能提交。
21. freezeNote 不自动生成。
22. lockNote 不自动填入 freezeNote。
23. confirmationNote 不自动填入 freezeNote。
24. 未勾选 checkbox 不能首次冻结。
25. freeze 请求只发送 confirm、freezeNote、expectedUpdatedAt。
26. 不发送来源 ID。
27. expectedUpdatedAt 来自 report.updatedAt。
28. POST 不自动重试。
29. POST 期间 edit / submit / confirm / lock / freeze 均禁用。
30. POST 期间报告仍可阅读。
31. POST 期间不显示虚假逐项实时进度。
32. 首次成功 sourceFreeze.state=completed。
33. 首次成功显示 alreadyFrozen=false。
34. 首次成功显示 resumedExisting=false。
35. 恢复成功显示 resumedExisting=true。
36. completed 幂等显示 alreadyFrozen=true。
37. alreadyFrozen 不再次写入。
38. sourceFreeze=null 显示来源尚未冻结。
39. in_progress 显示可能已有部分来源冻结。
40. in_progress 不显示已回滚。
41. in_progress 显示原 freezeId。
42. in_progress 显示原 freezeNote。
43. in_progress freezeNote 不可编辑。
44. in_progress 恢复使用服务端 freezeNote。
45. 恢复不生成新 freezeId。
46. 恢复不允许替换首次说明。
47. 恢复必须重新勾选 checkbox。
48. 恢复不自动 POST。
49. completed 不显示再次冻结入口。
50. completed 不显示恢复入口。
51. completed 展示 started / completed actor。
52. completed 展示 expectedCounts。
53. completed 展示 completedCounts。
54. completed 展示 newlyFrozenCounts。
55. completed 展示 previouslyFrozenCounts。
56. 五类来源名称正确。
57. totalSourceCount 正确展示。
58. 前端不重新统计来源。
59. 前端不计算完成百分比。
60. 前端不显示来源 ID。
61. 前端不显示 metadata。
62. sourceFreeze count 非安全整数显示一致性警告。
63. total 与五类之和不一致显示警告。
64. in_progress 包含 completedAt 时显示警告。
65. completed 缺 completedCounts 时显示警告。
66. completed expected / completed 不一致显示警告。
67. 一致性异常时不开放恢复或首次写操作。
68. conflict 保留首次 freezeNote。
69. conflict 清除 checkbox。
70. conflict 自动 latest 一次。
71. conflict 不自动 POST。
72. incomplete 自动 latest 一次。
73. incomplete 不显示已回滚。
74. incomplete latest=in_progress 时显示恢复入口。
75. failed 后保留 freezeNote。
76. failed 后不自动恢复。
77. scope invalid 不显示内部 ID 差异。
78. input invalid 不猜测具体来源。
79. audit unavailable 不猜测完成状态。
80. metadata unsupported 不显示 metadata。
81. 401 返回登录页。
82. action 403 保留报告和首次 freezeNote。
83. 网络错误保留 freezeNote。
84. 网络错误提示手工 latest 核对。
85. 首次 note 纳入 beforeunload。
86. 恢复的只读服务端 note 不额外触发文本 dirty。
87. sourceFreeze 草稿不写 localStorage。
88. 页面刷新后未提交首次 note 消失。
89. sourceFreeze receipt 刷新后消失。
90. 持久事实仍来自 report.sourceFreeze。
91. status 仍显示 confirmed。
92. report.lockedAt 仍表示报告自身锁定。
93. sourceFreeze 单独表示来源冻结。
94. isFinal 不作为来源冻结完成状态。
95. sourceLockedAt 不显示为 report.lockedAt。
96. 页面说明 A23 不是 Mongo transaction。
97. 页面说明 completed 前可能部分冻结。
98. 页面说明不自动解冻。
99. 页面说明不冻结 Patient。
100. 页面说明不冻结 Visit。
101. 页面说明不冻结 Storage。
102. 页面说明 CognitiveDomainResult 冻结不等于确认。
103. 页面不存在 unfreeze。
104. 页面不存在 rollback。
105. 页面不存在后台恢复开关。
106. 页面不存在 archive / correct / void。
107. 页面不存在 PDF / 下载。
108. 页面不存在 AI 操作。
109. 页面不输出诊断结论。
110. 小屏幕计数与确认表单可用。
111. label、错误提示和交互状态反馈正确。
112. 没有新增路由。
113. 没有使用真实患者或冻结说明。
114. lint 通过。
115. typecheck 通过。
116. build 通过。

### 10.2 B14 报告归档：115 项

1. 无报告时无归档入口。
2. draft 不显示归档入口。
3. pending_confirmation 不显示归档入口。
4. confirmed 未锁定不显示归档入口。
5. 已锁定但 sourceFreeze=null 不显示归档入口。
6. sourceFreeze=in_progress 不显示归档入口。
7. confirmed + locked + sourceFreeze completed 显示尚未归档。
8. doctor 显示归档入口。
9. admin 显示归档入口。
10. nurse 不显示可用入口。
11. research_assistant 不显示可用入口。
12. system 不显示可用入口。
13. 没有第二次 /auth/me。
14. Patient active 不作为前端条件。
15. Visit draft 可归档。
16. Visit in_progress 可归档。
17. Visit completed 可归档。
18. Visit locked 不阻断归档。
19. Visit voided 不被前端自行作为 A24 阻断。
20. archiveNote 少于 3 字不能提交。
21. archiveNote 超过 2000 字不能提交。
22. archiveNote 不自动生成。
23. freezeNote 不自动填入。
24. lockNote 不自动填入。
25. confirmationNote 不自动填入。
26. 未勾选 checkbox 不能归档。
27. 请求只发送 confirm、archiveNote、expectedUpdatedAt。
28. 不发送 status。
29. 不发送 archivedAt / archivedBy。
30. 不发送 metadata。
31. expectedUpdatedAt 来自 report.updatedAt。
32. POST 不自动重试。
33. POST 期间六类写操作均禁用。
34. POST 期间报告仍可阅读。
35. 归档成功使用完整服务端 report。
36. 归档成功 status=archived。
37. 归档成功 isFinal 使用服务端值。
38. 归档成功 archivedAt 非空。
39. 归档成功 archive 非空。
40. 首次成功显示 alreadyArchived=false。
41. 幂等成功显示 alreadyArchived=true。
42. alreadyArchived 不表示重复写入。
43. archived 后不显示再次归档入口。
44. archived 后不显示 edit。
45. archived 后不显示 submit。
46. archived 后不显示 confirm。
47. archived 后不显示 lock。
48. archived 后不显示 source-freeze。
49. archiveId 显示为归档追溯号。
50. archivedBy 显示姓名和角色。
51. operatorId 不作为主要业务字段。
52. archiveNote 显示为归档流程说明。
53. sourceFreezeId 显示为冻结锚点。
54. sourceFreezeCompletedAt 单独显示。
55. archivedAt 不显示为 lockedAt。
56. sourceFreezeCompletedAt 不显示为 archivedAt。
57. status、lockedAt、sourceFreeze、archivedAt 分开。
58. 完整 A24 anchor 与 sourceFreeze 一致。
59. anchor 不一致显示警告。
60. status=archived 但 archivedAt=null 显示警告。
61. archivedAt 非空但 archive=null 不开放归档。
62. archive 非空但 archivedAt=null 显示警告。
63. archive 时间与顶层不一致显示警告。
64. confirmed 但 archive 非空显示警告。
65. historical fallback archiveId=null 安全显示。
66. historical fallback role=unknown 安全显示。
67. historical fallback 不猜测说明。
68. historical fallback 不开放再次归档。
69. conflict 保留 archiveNote。
70. conflict 清除 checkbox。
71. conflict 自动 latest 一次。
72. conflict 不自动 POST。
73. latest 仍可归档时要求明确基于最新继续。
74. latest 已归档时本地说明保留。
75. latest 已归档时提示本地说明未写入。
76. failed 后保留 archiveNote。
77. failed 后 latest 一次。
78. failed 后不自动重试。
79. audit unavailable 不猜测归档事实。
80. metadata unsupported 不展示 metadata。
81. voided 不开放归档。
82. 401 返回登录页。
83. action 403 保留报告和 archiveNote。
84. 网络错误保留 archiveNote。
85. 网络错误提示 latest 核对。
86. archiveNote 纳入 beforeunload。
87. archive 草稿不写 localStorage。
88. 页面刷新后未提交 note 消失。
89. archiveReceipt 刷新后消失。
90. 持久事实来自 report.status / archivedAt / archive。
91. 不修改 lockedAt / lock。
92. 不修改 sourceFreeze。
93. 不修改 confirmation。
94. 不修改 narrative / snapshots / scope。
95. 不调用 A14–A19 检查。
96. 不修改 Patient / Visit。
97. 不实现 unarchive。
98. 不实现 restore confirmed。
99. 不实现 correction。
100. 不实现 void / delete。
101. 不实现 unlock / unfreeze。
102. 不实现 PDF / Word / 下载。
103. 不实现 AI。
104. 不显示“患者已归档”。
105. 不显示“访视已归档”。
106. 不显示“报告已删除”。
107. 不显示“PDF 已生成”。
108. 小屏幕归档表单和摘要可用。
109. label、错误提示和交互状态反馈正确。
110. 没有新增路由。
111. 没有新增依赖。
112. 没有使用真实医疗数据。
113. lint 通过。
114. typecheck 通过。
115. build 通过。

### 10.3 B14.1 工作流结构治理：当前仍待验部分

B14.1 的静态拆分合同已经验证：公开 options 9 个、result keys 99 个、七个 mode、组件消费、API Client 方向、单一 activeMode / writingAction / writingRef / mountedRef / beforeunload、唯一 latest 和报告更新入口均保持。当前待验的是拆分后的真实 Browser 行为等价性，不是重新执行静态行数审计。

Fixture 与 Browser 必须覆盖：

1. 公共 façade：七个 mode 仍互斥；路由报告身份变化会清理正确状态；一个 writingAction 期间不能打开或提交另一动作；成功报告只经统一入口应用。
2. Edit：open / update / no-change / save / conflict / 403 / receipt / stale / beforeunload 与 B11 一致；网络或冲突后保留三个本地字段。
3. Submit：readiness、submissionNote、checkbox、success / alreadySubmitted、conflict 与 pending read-only 一致；不自动重发。
4. Confirm：doctor / admin、confirmationNote、checkbox、success / alreadyConfirmed、conflict 与 403 文案一致；不模拟 lock。
5. Lock：doctor / admin、Visit draft / in_progress / completed、success / alreadyLocked、conflict、consistency warning 与 confirmed status 一致；lockNote 保留。
6. Source-freeze：start / resume、服务端持久 note、显式放弃本地内容、in_progress / incomplete / failed、alreadyFrozen / resumedExisting 与 no polling 一致；不自动进入恢复。
7. Archive：doctor / admin、不依赖 Patient active / Visit editable、Visit locked 不阻断、success / alreadyArchived、conflict、historical fallback 与 archived read-only 一致。
8. Browser 公共边界：真实 B11–B14 HTTP、Cookie / CORS、多操作者并发、网络中断后的服务端最终状态、唯一 beforeunload、窄屏、真实键盘和焦点行为。
9. 写请求最多各执行一次；latest 恢复最多一次；不得出现 Action 互相 import、组件直调 API、自动 retry、polling 或浏览器持久化草稿。

B16 / WP-02 已完成不能替代这组 B14.1 行为等价回归；只有 Batch D 实际覆盖上述项目后才能关闭。

### 10.4 B15 版本化更正：10 组

- 使用脱敏 doctor / admin 账号验证 archived V1 首次更正：原因 3–2000、摘要 3–4000、checkbox、Body 白名单与成功原地切换 V2；确认没有刷新、跳转或额外 latest。
- 使用脱敏 in_progress source 验证显式恢复：correctionId / No.、started actor / time、版本关系与 replacementReportId 可见；reason / summary 只读，必须重新勾选且不生成新 ID。
- 验证 completed 幂等：source 不显示再次发起 / 恢复；alreadyCreated 与 resumedExisting 三类成功文案准确，source 与 receipt 仅当前会话保留。
- 模拟 not correctable / not latest / conflict / incomplete / failed / not found / voided：最多 latest 一次，首次文本保留、checkbox 清除、stale，绝不重发 POST。latest 变 in_progress 时需明确放弃本地内容后恢复；变 corrected / replacement 时提示本地说明未写入。
- 模拟 401 / 403 / audit unavailable / replacement conflict / 网络中断：401 返回登录页；403 保留报告与输入；审计 / 关系冲突不可绕过；网络不确定只提供手工 latest。
- 分别以 doctor/admin 与 nurse/research_assistant 验证合法 V2：仅 doctor/admin 可 edit / submit / confirm；Patient inactive、Visit locked / voided 不阻断 A21；V1 既有角色与资格不放宽。
- 确认 V2 confirmed 后 correction Action 不自动发起或串联 A22–A24；安全 replacement 可以按 B16 显示当前阶段合法入口，但用户未明确操作前 Network 中没有 A22–A24 写请求，也不自动完成编辑、确认、锁定、冻结或归档。
- 验证 source / replacement 摘要没有虚假历史链接、metadata、原始 correctionRecords 或五类来源 ID；刷新后仅使用 replacementOf。
- 验证小屏纵向布局、可见 label / 字符计数、可见错误提示与交互状态反馈、键盘操作与 POST 期间全部报告写操作 disabled。
- 验证 beforeunload 只有一个监听器：start 模式 reason / summary trim 后非空触发；resume 只读文本本身不触发；不得写 localStorage / sessionStorage / IndexedDB / URL / Cookie。

## 11. Batch E：8 个真实设备或人工验收项目

以下 ID 必须逐项保留，不属于 Batch B 已完成的 135 项桌面范围，也不得被自然 viewport、响应式抽查、鼠标 Canvas、automated boundary 或普通原生控件抽样替代：

| 验证 ID | 当前处置 | 执行边界 |
|---|---|---|
| `B5-MV-008` | Batch E 待验 | 原合同分类为真实设备/人工项；不并入桌面 `media_file_validation` 结论 |
| `B5-MV-028` | Batch E 待验 | 原合同分类为真实设备/人工项；不由桌面 mouse-only handwriting 覆盖 |
| `B5-MV-029` | Batch E 待验 | 原合同分类为真实设备/人工项；不由桌面 mouse-only handwriting 覆盖 |
| `B5-MV-058` | Batch E 待验 | 后续重建时只恢复真实设备或人工验收意图；无桌面 fixture primary owner |
| `B5-MV-059` | Batch E 待验 | 后续重建时只恢复真实设备或人工验收意图；无桌面 fixture primary owner |
| `B5-MV-060` | Batch E 待验 | 后续重建时只恢复真实设备或人工验收意图；无桌面 fixture primary owner |
| `B5-MV-061` | Batch E 待验 | 后续重建时只恢复真实设备或人工验收意图；无桌面 fixture primary owner |
| `B5-MV-062` | Batch E 待验 | 后续重建时只恢复真实设备或人工验收意图；无桌面 fixture primary owner |

现有仓库只把这 8 个 ID 固定分类为桌面 Batch B 排除项；本文不凭空补写未在 active contract 中存在的细分描述。B5-MV-008、B5-MV-028、B5-MV-029 继续保留当前真实设备、媒体或手写边界；B5-MV-058–B5-MV-062 后续重建时只恢复真实设备或人工验收意图。执行 Batch E 时必须以这 8 个稳定 ID 建立明确步骤、真实设备或人工条件、人工签收人和证据，不得更换 ID、静默合并或恢复屏幕阅读器、live region 专项要求。

## 12. 静态门禁与最终轻量集成冒烟

最终前端代码态分别执行 `npm run test:browser:list`、`npm run test:browser:infra`、`npm run lint`、`npm run typecheck`、`npm run build`。test discovery 与 infrastructure 只能证明测试资产和通用能力可执行，不能关闭业务 Audit ID。

所有主证据与必要支持证据独立闭环后，P6 审核全部 B12 测试数据来源并执行最终 lint、typecheck、build，以关闭仍为 `pending` 的 B12-85～B12-88；同时执行一条核心端到端链路作为轻量集成冒烟。冒烟只发现跨层装配断裂、不新增 Audit ID、不重新执行全部验收点，也不能替代失败或未执行的主证据。本轮 P0 代码门禁不能冒充这些最终证据。

Browser 结果必须记录业务、fixture、测试资产修改和收口耗时，并清理本次创建的 Session、BrowserContext、Chromium、Node 进程、端口、runtime、test-results 与其他临时产物。数据库生命周期、最小 fixture、verifier 和 cleanup 的权威规则见 backend testing playbook。

roadmap 业务工作包状态不因 playbook 治理或测试资产退役自动变化。B12 保持未完成并暂停，下一任务先审查验收清单；审查完成前不启动 P1、P2 或新的 Browser 实现。B11 及以前状态不变；B13～B15 不因本手册重写而改变产品范围或验收意图。
