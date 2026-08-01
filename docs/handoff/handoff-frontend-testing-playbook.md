# CogMemory AD / 智忆评 前端验证手册

## 1. 文档定位与当前状态

本文档是跨层测试设计、Browser 验收策略、场景级活动 Audit 清单和当前验证状态的权威来源。它只维护当前有效规则与待验合同；roadmap 继续维护产品范围和工作包状态，Git 历史负责旧命令、旧清单、旧结果与失败过程。

> B12-P1 eligibility-readonly、R1、A3、A3-R2 已退役。约 70 小时投入后，专属 fixture/support 复杂度超过业务；未新增关闭 Audit ID，代码全删。B12 已完成第二次清单收缩：历史通过证据继续作为合同或防御证据保留，活动关闭清单只剩 3 个用户可达 Browser 场景；本次纯文档治理没有执行 B12 Browser，也不重建 B12 专属 fixture/support。

| 范围 | 当前状态 |
|---|---|
| WP-02 / B16 | 已完成，既有状态不变 |
| WP-04 / B17 | 已完成，既有状态不变 |
| Batch A / B1–B3 | 已完成，既有状态不变 |
| Batch B / B4–B6 | 桌面范围已完成，Batch E 仍保留 8 项 |
| Batch C / B7–B10 | 已完成；B7、B8、B9、B10 各自既有最终处置不变 |
| Batch D / B11 | 70 项已完成，状态不变 |
| Batch D / B12 | 合同前置与防御证据保留；活动用户场景为 `B12-U01`～`B12-U03`，状态 `passed=0`、`pending=3`、`failed=0`、`blocked=0`、`not_executed=0` |
| Batch D / B13–B15（含 B14.1） | 候选断言和历史设计输入保留，尚未执行；正式设计活动清单前须先完成可达性、风险与证据复用审查 |

B12 治理前有 17 个混合层级活动场景，汇总为 `passed=4`、`pending=13`；治理后只保留 `B12-U01`～`B12-U03` 三个尚需执行的 `ui_reachable` Browser 场景，汇总为 `passed=0`、`pending=3`。这不是历史证据倒退：原已通过事实和当前精确测试继续有效，但迁入不分配 B12 活动 ID 的合同前置证据、非阻断防御证据或最终通用门禁，不再计作活动 Browser 业务场景。

原 88 个 ID 和原 B12-S01～S17 都不再作为活动关闭对象；其语义迁移、不可达退役与既有证据归属见第 9 节。需要保留的是仍真实可达且尚无可信证据的风险，不是历史 ID、层级组合或执行次数。

## 2. 强制测试设计理念

### 2.1 可达性、风险与证据复用

候选断言必须先分类，再决定是否成为强制验收：

| 分类 | 判定边界 | 最低充分主证据 |
|---|---|---|
| `ui_reachable` | 当前正式页面可由正常人工操作触发 | Browser 验证入口、控件、输入、提示、刷新、浏览器状态与可访问性 |
| `public_api_reachable` | 页面无入口，但公开 API 可被 Postman、curl 或自编客户端调用 | HTTP E2E 验证认证、权限、DTO、ownership、状态门禁、错误码与数据库无副作用；不另建 Browser 场景 |
| `legitimate_concurrency` | 两个合法用户、标签页、Session 或请求可通过正式页面或公开 API 真实形成 | HTTP E2E 验证原子性、幂等、写入次数和数据库终态；仅在存在不可替代的用户可见恢复交互时增加最小 Browser 证据 |
| `internal_corruption_only` | 只能直接改库、伪造内部对象、篡改运行时状态、损坏历史数据或依赖未实现未来功能形成 | 默认不进入业务批次强制验收；廉价 pure/unit 防御测试可保留，只有正式导入、迁移、兼容合同、已知生产事故或明确合规要求才升级为阻断性测试 |
| `manual_or_real_device` | 自动化无法可靠替代的真实设备、相机、触控笔、手写、打印或专业判断 | Batch E 或明确人工验收；不得伪装为桌面 Browser 已通过 |
| `general_gate` | lint、typecheck、build、test discovery、依赖、路由所有权、测试数据脱敏等 | 只在最终代码态或对应层发生变化后按影响范围执行；不创建业务 Audit ID |

设计顺序必须是：

1. 证明候选风险可由正式 UI、公开 API、合法并发、正式导入或真实设备触发。
2. 判断风险是否涉及临床数据完整性、不可逆动作、权限、安全、隐私、用户恢复或已知回归，及其是否足以阻断发布。
3. 检查相关代码、接口与配置未变化时是否已有可复用的精确证据。
4. 选择覆盖该风险的最低充分证据层，只为尚未被准确证明的事实补证。
5. 最后才设计最小合法前置、fixture 和断言；禁止先写大量断言，再反向建设 fixture。

每个拟纳入强制验收的场景必须记录起始状态、人工或调用方角色、入口边界、实际操作、实际经过的接口、预期业务结果，以及该风险为何需要阻断发布。无法写出真实入口、只能依靠直接改库制造的场景不得进入强制业务验收。

### 2.2 业务风险守恒与分层取证

- 守恒对象是仍真实可达的核心业务风险、不可替代状态语义和安全边界，不是历史 Audit ID 的数量、层级组合或顺序。
- 一个风险只在最合适层作为主证据；其他层只承担不可替代的支持事实。代码阅读不能记为动态测试通过，页面文本不能替代数据库终态，fixture E2E 不能冒充产品 Browser。
- 同一风险已有准确证据，且相关代码、接口和配置未变化时，引用既有证据，不重复编写或执行 Browser、HTTP E2E、verifier，也不创建多个 Audit ID。
- 认证、授权、ownership、DTO 白名单、不可逆状态门禁、幂等、合法并发、隐私和数据库无副作用不得因 Browser 收缩而删除；页面不可达的公开 API 绕过交给 HTTP E2E。
- 阶段性“不存在后续功能”只在对应阶段有效；后续能力落地后退役旧断言，只保留当前仍成立的动作隔离和不自动串联边界。

## 3. 证据层级与最低充分证据

| 证据层 | 主职责 | 不可替代边界 |
|---|---|---|
| `backend_unit` | 局部判断、mapper、DTO 与 Service 分支，以及 `internal_corruption_only` 的廉价非阻断防御 | 不证明真实 HTTP、Guard 或数据库终态 |
| `backend_http_e2e` | `public_api_reachable` 与 `legitimate_concurrency` 的认证、权限、ValidationPipe、Body、ownership、错误码、状态机、幂等、原子性和真实数据库终态 | 不证明页面真实交互 |
| `frontend_static_or_pure` | 纯展示映射、action ownership、局部资格与非阻断防御分支 | 不证明真实输入、Browser API 或后端动态行为 |
| `browser_micro_profile` | 仅验证 `ui_reachable` 的页面入口、控件、输入、提示、刷新、beforeunload、Storage、Cookie、错误恢复、focus、keyboard、viewport 与 Axe | 不替代服务端合同或数据库终态 |
| `database_verifier` | 仅当 Browser 写入结果无法由现有 HTTP E2E 充分证明时，补充写入次数、audit、protected roots 或持久终态 | 不重复已有准确 HTTP E2E，也不替代页面体验 |
| `static_gate` | `general_gate`，包括 lint、typecheck、build、test discovery、依赖与路由边界 | 不证明业务运行通过，不创建业务 Audit ID |

主证据与确有必要的支持证据都实际通过后才具备关闭资格。已有历史通过证据在相关代码、接口和配置未变化时可以复用；本次只读核对不得把代码存在或测试名称存在写成“本次动态测试已通过”。

### 3.1 按变化影响选择执行范围

- 纯文档变化只执行文档内容、diff 与 Git 范围检查。
- 单个测试文件变化执行 discovery、定向测试及必要静态检查，不自动要求完整 E2E。
- 单模块生产代码变化执行受影响 unit / E2E 与对应层静态门禁。
- 只有认证、公共 Guard、Schema、通用 mapper、公共测试基础设施或跨模块合同变化，才按实际影响扩大回归范围。
- 完整 unit / E2E 原则上在批次最终代码态执行一次，或在存在明确跨模块影响时执行；不在每个微型 Profile 后重复。
- Codex 指令要求完整套件时必须写明具体影响依据，不能只写“为了保险”。

## 4. 微型 Browser Profile

微型 Profile 原则上只包含 1～4 个紧密相关业务场景，具有单一主风险、最小合法前置、独立执行、独立证据、必要后置验证和精确 cleanup，并能独立关闭所拥有的 Audit ID。

每个微型 Profile 内保持证据原子性：同一 Git 代码态、同一最小前置、同一次 Browser 执行、同一次对应 verifier 和同一次 cleanup。后一个无关 Profile 失败，不得作废前一个已经闭环的有效证据。

禁止一个 Profile 混入十几个以上无关状态、让单次失败使整个批次证据归零、建设批次专属 runner/journal/aggregator/完整 manifest，或让所有 Profile 共享超长服务生命周期。

### 4.1 Codex 任务、证据包与微型 Profile 的粒度

Codex 任务默认按业务风险一致、证据类型相近、能在合理时间内完成和收口的完整业务风险包规划；非 Browser 证据可以在同一证据包内批量执行。单个场景 ID 或单个微型 Profile 都不是默认任务边界，一个 Codex 任务可以包含多个相互独立的微型 Profile。不得为了减少 Codex 数量而合并不可互换的业务语义，也不得为了形式上的独立性将每个子断言机械拆成单独任务。

活动清单使用场景级 Audit ID。同一场景可以包含多个紧密耦合的明确子断言；每个必需子断言必须分别记录实际结果，但不要求机械拆成独立 ID。任一必需子断言为失败、阻断或未执行时，整个场景不得标记为 `passed`；同一证据包覆盖多个场景时也不得批量推定通过。

Browser 场景继续按微型 Profile 隔离执行。每个 Profile 必须独立拥有最小合法前置、业务特有断言、必要后置验证、适用的 verifier、cleanup 和证据结果。同一 Codex 包含多个 Profile，不表示这些 Profile 必须共享 fixture、namespace、可写 Report、BrowserContext 或 Session，也不表示可以跨 Profile 拼接数据库终态证据或形成一次大型原子运行。后续无关 Profile 失败，不得作废此前已经完成业务证据、必要 verifier 和 cleanup 的 Profile。

Codex 任务规模取决于业务风险是否一致、证据层是否相近、前置状态是否兼容、写入和并发是否需要隔离，以及能否在合理时间内完成和收口；不再以“一个 Codex 处理 5～25 个 Audit ID”作为主要规划尺度。

### 4.2 B12 Profile 基线

- `B12-P1-user-entry-readonly`：只执行 `B12-U01`。
- `B12-P2-first-lock`：只执行 `B12-U02`。
- `B12-P3-reachable-recovery`：只执行 `B12-U03`。
- `B12-P4-final-gates`：只在最终代码态执行一次通用门禁，不拥有业务场景 ID。

旧 P0、P2A、P2B、P3 conflict、P4 error、P5 accessibility 及 P6 表达不再是活动 Profile。其历史证据按第 9 节迁入合同前置、防御证据或最终门禁；响应式、键盘、焦点和 Axe 附着在 U03 的代表性真实流程，不单独建设业务 Profile。

## 5. Browser 必须验证的行为

- 使用 production frontend、真实 Browser test backend 和真实 HTTP；不得以 mock server、伪造成功响应或代码阅读替代。
- 验证 `ui_reachable` 的页面入口、角色可见性、控件 enabled/disabled、真实输入、请求次数与状态，以及实际可达的成功或错误恢复；页面无入口的 403、DTO 或 ownership 绕过不强制制造 Browser 场景。
- 验证刷新、beforeunload、localStorage、sessionStorage、IndexedDB、Cookie、URL、Console、DOM 和 Network 隐私边界。
- 多角色或双 Session 使用独立 BrowserContext；不得通过清除同一 Context Cookie 模拟隔离。
- 响应式代表覆盖 390×844、800×1280、1280×800、1024×1366、1366×1024、1280×720、1536×864；宽表只允许局部滚动。
- 键盘证据使用真实 Tab、Shift+Tab、Enter、Space 与 `isTrusted=true` 事件，验证自然焦点顺序、focus-visible 和焦点进出。
- Axe 与 ARIA tree 用于基础 A/AA、role、accessible name 和结构；不能替代真实设备或专业判断。

## 6. 横切能力代表性验证

认证生命周期、logout/Cookie、Storage/URL 隐私、CORS、通用 Console、通用 DOM 敏感信息扫描、Axe、viewport、focus-visible 和不支持 Action 扫描，只在本批次实际修改或尚无可信证据时附着于少量真实流程。不得机械要求每批次都覆盖“正常只读、真实写入、权限失败、错误或冲突”四种组合。

页面没有入口的角色权限失败由 HTTP E2E 负责，不为了制造 Browser 403 暴露隐藏控件或伪造响应。响应式、键盘、焦点和 Axe 附着于代表性真实操作，不单独建设业务 Profile。横切证据不得替代业务特有页面断言、实际可达的错误恢复、请求次数或数据库终态。

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

只对当前活动场景 ID 维护 `pending`、`passed`、`failed`、`blocked`、`not_executed` 状态；旧 ID 迁移表不参与活动数量统计。`obsolete` 只用于已经失去适用前提的历史断言，不是活动场景的通过或失败状态。

一个活动场景只有在全部必需子断言的主证据、必要支持证据、适用的数据库终态和资源 cleanup 均实际通过，且没有测试资产、环境或未执行项阻断时，才能标记为 `passed`。场景合并后可以复用局部已有证据，但缺少任一必需子断言的完整证据时仍保持 `pending` 或按实际结果记录其他非通过状态。

`unknown` 仅是命令已启动但没有可靠摘要或证据不足时的临时测试结论，不属于允许的 Audit ID 状态，也不得写入 Audit 清单。相关 Audit ID 不得据此关闭、通过或失败；尚未形成有效证据时通常保持原有 `pending`。只有存在符合既有定义的明确且持续外部环境、工具或权限阻断时才使用 `blocked`；目标测试因命令、选择器、权限或进程未启动而没有实际执行时，按既有规则使用 `not_executed`。

不得根据 Playwright exit code、测试代码已存在、历史失败轮局部观察或 cleanup 成功批量关闭；`blocked` 和 `not_executed` 不得写成 `passed`。每个 Profile 独立关闭自己拥有的活动场景；只有真实可达、风险不可互换且当前证据未覆盖的角色、认证、幂等、并发或恢复差异才需要分别记录，不得机械扩张组合矩阵。

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

## 9. B12 验收清单（二次收缩后）

### 9.1 唯一活动用户场景

以下三个 `ui_reachable` 场景是 B12 当前唯一活动关闭清单。每个场景的必需事实都必须实际执行并分别记录；本次纯文档治理没有执行它们。

#### B12-U01 页面资格、人工角色与锁定后只读

- 起始状态：分别使用 confirmed、未锁定、合同完整的合法报告，以及已锁定但 status 仍为 confirmed 的报告。
- 人工角色：doctor；代表性非授权人工角色 nurse。
- 入口边界：正式报告页面的当前 workflow 区域。
- 实际操作：doctor 查看并使用锁定入口；nurse 查看同类报告；随后查看已锁定报告及所有报告写入口。
- 实际经过的接口：页面认证链及 `GET /patients/:patientId/visits/:visitId/clinical-reports/latest`；本场景不发锁定写请求。
- 预期业务结果：doctor 在合法报告上看到并可使用锁定入口；nurse 不显示可用锁定入口；已锁定报告不再开放 edit、submit、confirm 或 lock；页面仍准确显示 report status 为 confirmed；lockedAt 不冒充 archivedAt。完整角色矩阵和完整状态矩阵引用 pure / backend HTTP E2E，不在 Browser 重复。
- 发布阻断理由：错误入口或锁定后重新开放写操作会破坏不可逆报告事实，错误术语会误导临床用户。
- Profile / 状态：`B12-P1-user-entry-readonly` / `pending`。

#### B12-U02 首次锁定表单、真实写入与用户回执

- 起始状态：doctor 已登录，当前为 confirmed、未锁定、合同完整且可首次锁定的合法报告。
- 人工角色：doctor。
- 入口边界：正式报告页面的锁定表单。
- 实际操作：核对不可逆说明，输入 lockNote，完成 checkbox 与最小必要边界校验，只提交一次真实锁定，观察请求期间与成功回执，再刷新页面。
- 实际经过的接口：一次 `POST /patients/:patientId/visits/:visitId/clinical-reports/:reportId/lock`，刷新后由既有 latest GET 重新取得持久事实。expectedUpdatedAt 与请求 Body 合同引用既有前后端证据，不在 Browser 重复穷举。
- 预期业务结果：说明准确表达不可逆且只锁定报告自身；lockNote、checkbox 和最小必要边界校验成立；真实 lock POST 只执行一次；请求期间防止重复写操作且报告正文仍可阅读；成功后应用服务端完整 report 和回执，status 仍为 confirmed；页面不把 lockNote 当报告正文，不生成诊断结论；Network 不自动触发 freeze、archive、correction、void、PDF 或 AI；刷新后持久事实来自服务端。
- 发布阻断理由：重复或串联写入、错误回执、正文污染或持久事实不一致会破坏不可逆操作的完整性与临床可追溯性。
- Profile / 状态：`B12-P2-first-lock` / `pending`。

#### B12-U03 认证失效、网络失败、草稿与代表性可用性

- 起始状态：doctor 已打开合法首次锁定表单并在 React 内存输入未提交 lockNote；分别制造真实 Session 过期和有界请求延迟、中断或网络失败。
- 人工角色：doctor。
- 入口边界：正式报告页面、真实认证 Session 与真实 lock 请求；可用性检查使用一个代表性小屏。
- 实际操作：触发 401 并观察返回登录流程；在真实请求失败时核对本地输入、Network 次数、beforeunload 与 Storage；刷新页面；用键盘完成代表性相关操作并执行一次代表性 Axe。
- 实际经过的接口：认证链的 `GET /auth/me`，以及失败或中断的 `POST /patients/:patientId/visits/:visitId/clinical-reports/:reportId/lock`；不得自动重发写请求。
- 预期业务结果：Session 过期 401 返回登录流程；请求延迟、中断或网络失败时保留当前内存中的 lockNote 且不自动重发；未提交内容纳入 beforeunload；不写 localStorage、sessionStorage 或 IndexedDB；刷新后未提交内容消失；代表性小屏可完成相关操作；必要 label、错误提示、键盘、焦点和一次代表性 Axe 成立。
- 发布阻断理由：认证失效误处理、自动重发或草稿泄露会造成不可逆重复操作、隐私风险或无法恢复的用户输入损失。
- Profile / 状态：`B12-P3-reachable-recovery` / `pending`。

B12 活动用户场景汇总恰好为：`passed=0`、`pending=3`、`failed=0`、`blocked=0`、`not_executed=0`。这不是历史证据倒退；活动计数只保留尚需执行的用户可达 Browser 场景。

### 9.2 不分配 B12 活动 ID 的合同前置证据

下表中的 `covered` 表示仓库中存在精确测试断言且历史证据继续保留，不表示本次纯文档任务重新动态执行；`gap` 表示只读核对未找到最低充分的精确动态覆盖。表中项目不分配 B12 活动 ID，也不为页面不可达的 API 绕过另建 Browser 场景。

| 合同风险 | 精确现有测试文件 | 精确测试名称或可定位描述 | 结果 | 需要后续定向后端任务 |
|---|---|---|---|---|
| A22 未认证与非授权角色直接调用公开 lock API | `backend/test/clinical-report-lock.e2e-spec.ts` | `enforces authentication and doctor/admin roles` | `covered` | 否 |
| A22 DTO 白名单、显式确认、lockNote 与 expectedUpdatedAt 边界；伪造 status / actor / time / metadata 等字段 | `backend/test/clinical-report-lock.e2e-spec.ts`；`backend/src/modules/reports/dto/clinical-report-lock-dto.spec.ts` | HTTP E2E `locks once, returns safe public audit, and repeats idempotently` 的代表性额外字段拒绝；DTO spec `rejects malformed input %#`、`rejects all extra client-controlled fields` | `covered` | 否 |
| A22 readiness、confirmed 状态保持、lockedAt/lock 形成、正文/快照不变与首次原子更新 | `backend/test/clinical-report-lock.e2e-spec.ts` | `locks once, returns safe public audit, and repeats idempotently`；`returns stable state, ownership and optimistic concurrency errors` | `covered` | 否 |
| A22 完整 readiness、A20/A21 audit、一致性与锁定领域不变量 | `backend/src/modules/reports/lib/clinical-report-lock.spec.ts` | `accepts a complete confirmed report and detects stale updatedAt`；`requires supported A20/A21 metadata and consistent confirmation audit`；`builds one immutable audit namespace while preserving existing metadata` | `covered` | 否 |
| A22 Service 角色、ownership、原子 race、幂等与稳定错误 | `backend/src/modules/reports/services/clinical-report-lock-workflow.service.spec.ts` | `enforces doctor/admin actors in addition to the route guard`；`recovers an atomic race as idempotent or a stable conflict`；`keeps ownership failures indistinguishable from missing reports` | `covered` | 否 |
| cross-ownership 与不满足状态门禁的报告被公开 API 拒绝 | `backend/test/clinical-report-lock.e2e-spec.ts` | `returns stable state, ownership and optimistic concurrency errors` | `covered` | 否 |
| 非授权角色、额外字段、cross-ownership 与状态门禁拒绝后，逐类证明目标数据库无非法变化 | `backend/test/clinical-report-lock.e2e-spec.ts` | 现有主流程显式核对 stale conflict 与损坏 audit/metadata 拒绝后的无写入；没有对全部公开拒绝类别逐类核对数据库终态 | `gap` | 是 |
| 锁定后直接调用仍公开的 A21 edit / submit / confirm API，逐项证明无非法变化 | `backend/test/clinical-report-review.e2e-spec.ts`；`backend/test/clinical-report-lock.e2e-spec.ts`；`backend/src/modules/reports/services/clinical-report-review-workflow.service.spec.ts` | 已有 A21 `edits, submits and confirms one controlled report without changing sources`、A22 锁定主流程，以及 unit 的 confirmed edit 拒绝和 final submit/confirm 幂等；没有以已锁定报告逐一调用三个 A21 API 的 HTTP E2E | `gap` | 是 |
| 重复锁定不产生第二次写入 | `backend/test/clinical-report-lock.e2e-spec.ts` | `locks once, returns safe public audit, and repeats idempotently` | `covered` | 否 |
| 两个合法请求真实并发锁定时只写一次并形成唯一终态 | `backend/test/clinical-report-lock.e2e-spec.ts`；`backend/src/modules/reports/services/clinical-report-lock-workflow.service.spec.ts` | 已有 stale updatedAt HTTP 冲突和 mocked atomic race；没有两个合法 HTTP 请求真实并发的精确用例 | `gap` | 是 |
| A22 安全公开 mapper 不泄露 metadata、原始 lockedBy、内部 audit 或不安全历史字段 | `backend/src/modules/reports/services/clinical-report-public.mapper.spec.ts` | `maps only the explicit public report contract`；`maps a safe A22 lock summary and never exposes raw lockedBy`；`uses historical fallback and safely ignores invalid A22 metadata` | `covered` | 否 |
| 锁定请求失败不泄露 metadata、正文、actor 内部字段或 Secret | `backend/test/clinical-report-lock.e2e-spec.ts`；`backend/src/modules/reports/services/clinical-report-lock-workflow.service.spec.ts` | E2E `rejects incomplete lock audit without guessing or writing`、`rejects unsupported metadata without exposing it or writing`；unit `returns stable audit and persistence failures without leaking metadata`；现有断言未同时枚举正文、actor 内部字段与 Secret | `gap` | 是 |
| A23 只冻结精确来源、保持报告 status=confirmed、幂等不重复冻结并保留原说明 | `backend/test/clinical-report-source-freeze.e2e-spec.ts` | `freezes the exact report source chain and is idempotent`；`resumes an in-progress audit using the persisted scope and original note` | `covered` | 否 |

### 9.3 非阻断防御性证据

原 S11 的 audit/metadata 损坏状态属于 `internal_corruption_only`：当前没有正式页面或公开 API 能把合法报告制造为该损坏形态，因此不再阻断 B12。`backend/test/clinical-report-lock.e2e-spec.ts` 中 `rejects incomplete lock audit without guessing or writing`、`rejects unsupported metadata without exposing it or writing`，以及 `frontend/test/browser-acceptance/contracts/b12-lock-non-browser.spec.ts` 中两个 B12-S11 pure/static 测试可以继续作为 `supplemental_defensive` 回归保留。是否删除直接改库 E2E 由后续独立代码治理任务决定，本次不删除测试资产。

### 9.4 原 B12-S01～S17 迁移

| 原场景 | 迁移或处置 |
|---|---|
| S01、S02、S14 | 并入 `B12-U01`；完整角色与状态矩阵引用 pure / HTTP E2E。 |
| S04、S06、S07、S15、S16，以及 S17 的写入页面部分 | 并入 `B12-U02`。 |
| S12 的 401 / 网络失败、S13，以及 S17 的错误恢复与代表性可用性部分 | 并入 `B12-U03`。 |
| S03、S05 | 迁入 9.2 合同前置证据，不分配活动 ID。 |
| S08 | 重复锁定迁入 9.2 的幂等合同；真实合法并发仍为 `gap`，交由后续定向后端任务。 |
| S09 | `retired_currently_unreachable`：当前没有已确认的正式页面或公开 API 操作能够只改变 updatedAt，同时仍保持报告可首次锁定；将来新增真实可达路径时再纳入。 |
| S10 | 已锁定后不重新开放入口的语义并入 U01，重复锁定语义并入幂等合同；“先 conflict、再 latest 已锁定”的独立链路为 `retired_currently_unreachable`。 |
| S11 | `supplemental_defensive`：损坏 audit/metadata 不再阻断 B12，既有 pure/E2E 可保留。 |
| S12 的 403 | 迁入后端公开 API 权限证据，不要求 Browser。 |
| S17 | 不再作为独立业务场景，按真实操作分别附着于 U02、U03。 |

原 88 个 ID 继续由 Git 历史和既有迁移记录追溯，不恢复为活动关闭对象。原 7 个 `passed` 事实没有失效：领域不变量、Body 与 expectedUpdatedAt、无新增路由等分别保留在 9.2 合同证据或 9.5 通用门禁中。

### 9.5 B12 通用最终门禁

以下门禁不分配新的业务 Audit ID，只在 B12 最终代码态执行一次，不为每个业务场景重复执行：

- 不产生第二次 `/auth/me`。
- 不新增无合同依据的路由。
- 不使用真实患者、真实医疗数据或真实锁定说明。
- 不新增依赖。
- lint。
- typecheck。
- build。
- 一条轻量跨层 Browser 冒烟。

既有 B12-84 `passed` 证据继续有效；`B12-P4-final-gates` 仅在最终代码态按影响范围执行本节一次。轻量冒烟只发现跨层装配断裂，不新增业务场景 ID，也不能替代任何失败、阻断或未执行的场景证据。

## 10. B13～B15 后续设计规则

B13 的 116 项、B14 的 115 项、B14.1 行为范围和 B15 的 10 组属于未经治理的候选断言与历史设计输入，不是不可合并、不可迁移的永久活动 ID。它们的具体条目与产品语义在本次 B12 文档治理中保持原样；条目存在不表示必须执行，也不推定任何结果。

正式设计各批次活动清单前，每个候选断言必须先标记 `ui_reachable`、`public_api_reachable`、`legitimate_concurrency`、`internal_corruption_only`、`manual_or_real_device`、`general_gate` 或 `duplicate_or_covered`。随后按真实触发路径、发布风险和已有证据完成场景化审查：合并重复或已有覆盖的断言，迁移通用门禁，退役失去阶段前提的断言，并为剩余风险分配最低充分证据层。审查必须保留核心业务风险、不可替代语义、旧条目映射和已有有效证据，但不得冻结历史数量或顺序。

场景化审查完成并经确认后，再划分微型 Profile：先完成非 Browser 证据；Browser 先执行 2～4 个 canary，canary 通过后才执行对应 Profile；每个 Profile 独立关闭活动场景；最后执行轻量集成冒烟与通用静态门禁。

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

所有活动场景的主证据与必要支持证据独立闭环后，`B12-P4-final-gates` 只在最终代码态执行一次 9.5 的通用最终门禁；这些门禁不拥有新的业务 Audit ID，也不改变活动场景的子断言结果。轻量集成冒烟只发现跨层装配断裂，不新增场景、不重新执行全部验收点，也不能替代失败、阻断或未执行的主证据。既有静态证据可以复用，但不能冒充尚未执行的最终代码态门禁。

Browser 结果必须记录业务、fixture、测试资产修改和收口耗时，并清理本次创建的 Session、BrowserContext、Chromium、Node 进程、端口、runtime、test-results 与其他临时产物。数据库生命周期、最小 fixture、verifier 和 cleanup 的权威规则见 backend testing playbook。

roadmap 业务工作包状态不因 playbook 治理或测试资产退役自动变化。B12 二次收缩已完成，U01～U03 仍为 `pending`，本手册不声明旧 P1 canary 为下一阶段；任何后续执行必须按三个当前 Profile 另行形成最小方案，仍禁止未经确认重建 B12 专属 fixture/support。B11 及以前状态不变；B13～B15 的具体候选条目与产品语义不因本手册治理而改变。
