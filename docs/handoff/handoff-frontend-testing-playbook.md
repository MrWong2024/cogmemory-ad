# CogMemory AD / 智忆评 前端验证手册

## 1. 文档定位与当前状态

本文档是跨层测试设计、Browser 验收策略、场景级活动 Audit 清单和当前验证状态的权威来源。它只维护当前有效规则与待验合同；roadmap 继续维护产品范围和工作包状态，Git 历史负责旧命令、旧清单、旧结果与失败过程。

> B12-P1 eligibility-readonly、R1、A3、A3-R2 已退役。约 70 小时投入后，专属 fixture/support 复杂度超过业务；未新增关闭 Audit ID，代码全删。B12 已完成第二次清单收缩：历史通过证据继续作为合同或防御证据保留，活动关闭清单只剩 3 个用户可达 Browser 场景。U01～U03 已复用一个自包含最小 fixture CLI，分别完成只读入口、首次真实锁定，以及认证失效、网络中断、草稿与代表性可用性验收，仍未恢复旧 B12 fixture/support。

| 范围 | 当前状态 |
|---|---|
| WP-02 / B16 | 已完成，既有状态不变 |
| WP-04 / B17 | 已完成，既有状态不变 |
| Batch A / B1–B3 | 已完成，既有状态不变 |
| Batch B / B4–B6 | 桌面范围已完成，Batch E 仍保留 8 项 |
| Batch C / B7–B10 | 已完成；B7、B8、B9、B10 各自既有最终处置不变 |
| Batch D / B11 | 70 项已完成，状态不变 |
| Batch D / B12 | 合同前置与防御证据保留；`B12-U01`～`B12-U03` 三个活动用户场景与最终通用门禁均已完成，状态 `passed=3`、`pending=0`、`failed=0`、`blocked=0`、`not_executed=0`；B12 Browser 验收闭环完成 |
| Batch D / B13 | `B13-U01` 三种持久状态入口与人工角色 Browser 验收已完成；`B13-U02`、`B13-U03` 保持待验，状态 `passed=1`、`pending=2`、`failed=0`、`blocked=0`、`not_executed=0`；`B13-P0-contract-evidence` 继续完成且 `gap=0` |
| Batch D / B14–B15（含 B14.1） | 候选断言和历史设计输入保留，尚未执行；正式设计活动清单前须先完成可达性、风险与证据复用审查 |

B12 治理前有 17 个混合层级活动场景，汇总为 `passed=4`、`pending=13`；治理后只保留 `B12-U01`～`B12-U03` 三个 `ui_reachable` Browser 场景，初始汇总为 `passed=0`、`pending=3`。U01～U03 完成后最终汇总为 `passed=3`、`pending=0`。这不是历史证据倒退：原已通过事实和当前精确测试继续有效，但迁入不分配 B12 活动 ID 的合同前置证据、非阻断防御证据或最终通用门禁，不再计作活动 Browser 业务场景。

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

以下三个 `ui_reachable` 场景是 B12 当前唯一活动关闭清单。每个场景的必需事实均已实际执行并分别记录，U01～U03 均已完成。

#### B12-U01 页面资格、人工角色与锁定后只读

- 起始状态：分别使用 confirmed、未锁定、合同完整的合法报告，以及已锁定但 status 仍为 confirmed 的报告。
- 人工角色：doctor；代表性非授权人工角色 nurse。
- 入口边界：正式报告页面的当前 workflow 区域。
- 实际操作：doctor 查看并使用锁定入口；nurse 查看同类报告；随后查看已锁定报告及所有报告写入口。
- 实际经过的接口：页面认证链及 `GET /patients/:patientId/visits/:visitId/clinical-reports/latest`；本场景不发锁定写请求。
- 预期业务结果：doctor 在合法报告上看到并可使用锁定入口；nurse 不显示可用锁定入口；已锁定报告不再开放 edit、submit、confirm 或 lock；页面仍准确显示 report status 为 confirmed；lockedAt 不冒充 archivedAt。完整角色矩阵和完整状态矩阵引用 pure / backend HTTP E2E，不在 Browser 重复。
- 发布阻断理由：错误入口或锁定后重新开放写操作会破坏不可逆报告事实，错误术语会误导临床用户。
- Profile / 状态：`B12-P1-user-entry-readonly` / `passed`。
- 执行事实：doctor 在 confirmed、未锁定报告上看到可用锁定入口，打开“二次确认不可逆锁定”后取消并返回入口；代表性 nurse 可读报告、无可用锁定按钮，并看到锁定需由医生或管理员执行的说明；doctor 查看 confirmed、已锁定且未归档报告时，正文与锁定事实可读，页面准确显示“已确认报告”“已锁定”“报告尚未归档”，且不再提供 edit、submit、confirm、lock 入口。
- 证据收口：doctor/nurse 使用独立 BrowserContext 与真实 HttpOnly Cookie Session；U01 业务阶段报告写请求计数为 0；prepared verify 与 post-browser verify 均匹配报告、来源集合、metadata、confirmation、updatedAt 和既有锁定事实的安全基线；两次精确 cleanup 均为 `residualCount=0`。完整角色矩阵和状态矩阵继续复用既有 pure / backend HTTP E2E 证据。

#### B12-U02 首次锁定表单、真实写入与用户回执

- 起始状态：doctor 已登录，当前为 confirmed、未锁定、合同完整且可首次锁定的合法报告。
- 人工角色：doctor。
- 入口边界：正式报告页面的锁定表单。
- 实际操作：核对不可逆说明，输入 lockNote，完成 checkbox 与最小必要边界校验，只提交一次真实锁定，观察请求期间与成功回执，再刷新页面。
- 实际经过的接口：一次 `POST /patients/:patientId/visits/:visitId/clinical-reports/:reportId/lock`，刷新后由既有 latest GET 重新取得持久事实。expectedUpdatedAt 与请求 Body 合同引用既有前后端证据，不在 Browser 重复穷举。
- 预期业务结果：说明准确表达不可逆且只锁定报告自身；lockNote、checkbox 和最小必要边界校验成立；真实 lock POST 只执行一次；请求期间防止重复写操作且报告正文仍可阅读；成功后应用服务端完整 report 和回执，status 仍为 confirmed；页面不把 lockNote 当报告正文，不生成诊断结论；Network 不自动触发 freeze、archive、correction、void、PDF 或 AI；刷新后持久事实来自服务端。
- 发布阻断理由：重复或串联写入、错误回执、正文污染或持久事实不一致会破坏不可逆操作的完整性与临床可追溯性。
- Profile / 状态：`B12-P2-first-lock` / `passed`。
- 执行事实：一个 doctor BrowserContext 通过真实登录、HttpOnly Session Cookie 与 `/auth/me` 进入既有 `unlocked-confirmed`；trim 后 2 字符与 checkbox 重置校验成立。一次真实 lock POST 在 `ControlledRequestGate` 有界暂停期间保持按钮、textarea、checkbox 禁用且正文可读，放行后返回 HTTP 200、完整 report 与首次锁定回执；未串联 edit、submit、confirm、freeze、archive、correction、void、PDF、download 或 AI。
- 证据收口：刷新后当前会话锁定回执消失，服务端持久锁定摘要、confirmed status、未归档、来源未冻结与原正文 marker 保留；`u02-post-lock` 验证唯一 A22 namespace、无独立 AuditLog、新锁定 actor/note、受保护正文与来源 hash 未污染且 U01 控制场景未变；两次精确 cleanup 均为 `residualCount=0`。

#### B12-U03 认证失效、网络失败、草稿与代表性可用性

- 起始状态：doctor 已打开合法首次锁定表单并在 React 内存输入未提交 lockNote；分别通过同一 BrowserContext 的兄弟页面正式退出登录，以及对当前报告真实 lock POST 的单次网络中止制造恢复路径。
- 人工角色：doctor。
- 入口边界：正式报告页面、真实认证 Session 与真实 lock 请求；可用性检查使用一个代表性小屏。
- 实际操作：触发 401 并观察返回登录流程；在真实请求失败时核对本地输入、Network 次数、beforeunload 与 Storage；刷新页面；用键盘完成代表性相关操作并执行一次代表性 Axe。
- 实际经过的接口：认证链的 `GET /auth/me`、兄弟页面正式 `POST /auth/logout`，以及返回 401 或被网络层中止的 `POST /patients/:patientId/visits/:visitId/clinical-reports/:reportId/lock`；写请求均未自动重发。
- 预期业务结果：Session 过期 401 返回登录流程；请求延迟、中断或网络失败时保留当前内存中的 lockNote 且不自动重发；未提交内容纳入 beforeunload；不写 localStorage、sessionStorage 或 IndexedDB；刷新后未提交内容消失；代表性小屏可完成相关操作；必要 label、错误提示、键盘、焦点和一次代表性 Axe 成立。
- 发布阻断理由：认证失效误处理、自动重发或草稿泄露会造成不可逆重复操作、隐私风险或无法恢复的用户输入损失。
- Profile / 状态：`B12-P3-reachable-recovery` / `passed`。
- 执行事实：两条测试各自使用独立 doctor BrowserContext。Session 失效路径在同一 Context 的兄弟页面点击正式“退出登录”，真实 logout POST 返回 201；原页面随后恰好一次真实 lock POST 返回 401，进入 `/login`，无自动 retry、无成功回执。网络路径在 390×844 竖屏以真实 Tab / Enter / Space 完成表单；`OneShotRequestAbort` 对当前 report 的 POST `/lock` 恰好 `matched=1`、`aborted=1`、`continued=0`，页面稳定显示“报告服务暂时不可用，请稍后手工重试。”，lockNote 与 checkbox 留在当前 React 内存，lock POST 保持一次且无成功回执。
- 证据收口：textarea 与 checkbox 的 label / accessible name、自然键盘焦点与 focus-visible 均通过；局部 Axe 仅 include `section[aria-labelledby="clinical-report-lock-heading"]` 且 0 violation。真实顶层离页第一次产生 `beforeunload` dialog 并 dismiss，页面与草稿保持；真实 reload 第二次产生同类型 dialog 并 accept，刷新后 lockNote、checkbox 和表单草稿消失，“准备锁定报告”仍可用。请求前、网络中止后和刷新后的 localStorage、sessionStorage、IndexedDB、URL query/hash 均无锁定草稿；post-browser verify 匹配两份报告、updatedAt、正文、confirmation、metadata 与来源基线，证明无报告业务写入；两次 cleanup 均为 `residualCount=0`。

B12 活动用户场景最终汇总恰好为：`passed=3`、`pending=0`、`failed=0`、`blocked=0`、`not_executed=0`。

### 9.2 不分配 B12 活动 ID 的合同前置证据

下表状态定义如下；这些状态只描述已有证据与后续测试必要性，不表示本次纯文档任务重新动态执行：

- `covered`：单一现有测试层已经精确覆盖风险。
- `covered_by_layered_evidence`：Guard、Validation、unit、HTTP E2E、状态门禁与代表性数据库终态共同形成最低充分证据。
- `duplicate_or_covered`：候选测试重复现有状态门禁、幂等合同或同一路径证据，没有独立代码分支或独立风险。
- `covered_representatively + general_gate`：业务模块已有代表性安全断言，完整敏感字段与 Secret 边界由公共 mapper、异常过滤、序列化和通用安全门禁承担。
- `gap`：风险真实可达、足以阻断发布、当前最低充分证据确实缺失、其他层证据不能合理覆盖，且确实需要后续新增或修改测试。

只有 `gap` 表示需要后续新增或修改测试；没有穷举全部角色、错误码、字段组合或数据库快照不构成 `gap`。表中项目不分配 B12 活动 ID，也不为页面不可达的 API 绕过另建 Browser 场景。

| 合同风险 | 精确现有测试文件 | 精确测试名称或可定位描述 | 结果 | 需要后续定向后端任务 |
|---|---|---|---|---|
| A22 未认证与非授权角色直接调用公开 lock API | `backend/test/clinical-report-lock.e2e-spec.ts` | `enforces authentication and doctor/admin roles` | `covered` | 否 |
| A22 DTO 白名单、显式确认、lockNote 与 expectedUpdatedAt 边界；伪造 status / actor / time / metadata 等字段 | `backend/test/clinical-report-lock.e2e-spec.ts`；`backend/src/modules/reports/dto/clinical-report-lock-dto.spec.ts` | HTTP E2E `locks once, returns safe public audit, and repeats idempotently` 的代表性额外字段拒绝；DTO spec `rejects malformed input %#`、`rejects all extra client-controlled fields` | `covered` | 否 |
| A22 readiness、confirmed 状态保持、lockedAt/lock 形成、正文/快照不变与首次原子更新 | `backend/test/clinical-report-lock.e2e-spec.ts` | `locks once, returns safe public audit, and repeats idempotently`；`returns stable state, ownership and optimistic concurrency errors` | `covered` | 否 |
| A22 完整 readiness、A20/A21 audit、一致性与锁定领域不变量 | `backend/src/modules/reports/lib/clinical-report-lock.spec.ts` | `accepts a complete confirmed report and detects stale updatedAt`；`requires supported A20/A21 metadata and consistent confirmation audit`；`builds one immutable audit namespace while preserving existing metadata` | `covered` | 否 |
| A22 Service 角色、ownership、原子 race、幂等与稳定错误 | `backend/src/modules/reports/services/clinical-report-lock-workflow.service.spec.ts` | `enforces doctor/admin actors in addition to the route guard`；`recovers an atomic race as idempotent or a stable conflict`；`keeps ownership failures indistinguishable from missing reports` | `covered` | 否 |
| cross-ownership 与不满足状态门禁的报告被公开 API 拒绝 | `backend/test/clinical-report-lock.e2e-spec.ts` | `returns stable state, ownership and optimistic concurrency errors` | `covered` | 否 |
| 非授权角色、额外字段、cross-ownership 与状态门禁拒绝后，逐类证明目标数据库无非法变化 | `backend/test/clinical-report-lock.e2e-spec.ts`；`backend/src/modules/reports/dto/clinical-report-lock-dto.spec.ts`；`backend/src/modules/reports/services/clinical-report-lock-workflow.service.spec.ts` | 认证、角色与 DTO 请求分别由真实 HTTP、Guard 和 Validation 在潜在写入前拒绝；`enforces authentication and doctor/admin roles`、额外字段 400、DTO `rejects all extra client-controlled fields`、Service `enforces doctor/admin actors in addition to the route guard` / `keeps ownership failures indistinguishable from missing reports`，以及 `returns stable state, ownership and optimistic concurrency errors` 和代表性 audit/metadata 无写入终态，共同覆盖 ownership、状态门禁、stale conflict 与拒绝分支。不为每类拒绝机械复制数据库前后快照；将来某一路径进入新的潜在写入分支时再定向补证。 | `covered_by_layered_evidence` | 否 |
| 锁定后直接调用仍公开的 A21 edit / submit / confirm API，逐项证明无非法变化 | `backend/test/clinical-report-review.e2e-spec.ts`；`backend/test/clinical-report-lock.e2e-spec.ts`；`backend/src/modules/reports/services/clinical-report-review-workflow.service.spec.ts` | edit 的 confirmed 状态拒绝由 `rejects confirmed edit state` 覆盖；submit 与 confirm 的最终状态幂等由 `submits once and returns the stable existing receipt`、`returns the safe existing submission actor for confirmed reports`、`requires doctor/admin and confirms without locking` 及 HTTP E2E 重复提交/确认覆盖；A22 `locks once, returns safe public audit, and repeats idempotently` 证明锁定后 status 仍为 confirmed。只读实现核对未发现 A21 针对已锁定报告的独立写入分支或不同合同；`lockedAt` 仅参与通用可编辑/lineage 合法性谓词，而 confirmed 状态已触发 edit 门禁。U01 负责页面不重新开放写入口，不再以 locked report 重复执行三个 A21 API 的完整矩阵。 | `duplicate_or_covered` | 否 |
| 重复锁定不产生第二次写入 | `backend/test/clinical-report-lock.e2e-spec.ts` | `locks once, returns safe public audit, and repeats idempotently` | `covered` | 否 |
| 两个合法请求真实并发锁定时只写一次并形成唯一终态 | `backend/test/clinical-report-lock.e2e-spec.ts` | `locks exactly once under two concurrent authenticated HTTP requests`：doctorAgent 与 adminAgent 两个独立合法认证 Session 使用同一份未锁定报告和同一个 expectedUpdatedAt，通过同一个 Promise.all 真实并发请求；两个响应均为 200，恰好一次 alreadyLocked=false、一次 alreadyLocked=true，返回相同首次 lockId、lockedAt、actor、lockNote 与 report.lock；loser note 未覆盖 winner，MongoDB 最终只有一份 version=1 A22 audit 和唯一一致锁定终态，auditLogRefs、正文/快照及 future namespace 保持不变。 | `covered` | 否 |
| A22 安全公开 mapper 不泄露 metadata、原始 lockedBy、内部 audit 或不安全历史字段 | `backend/src/modules/reports/services/clinical-report-public.mapper.spec.ts` | `maps only the explicit public report contract`；`maps a safe A22 lock summary and never exposes raw lockedBy`；`uses historical fallback and safely ignores invalid A22 metadata` | `covered` | 否 |
| 锁定请求失败不泄露 metadata、正文、actor 内部字段或 Secret | `backend/test/clinical-report-lock.e2e-spec.ts`；`backend/src/modules/reports/services/clinical-report-lock-workflow.service.spec.ts`；`backend/src/modules/reports/services/clinical-report-public.mapper.spec.ts` | A22 mapper 的 `maps only the explicit public report contract`、`maps a safe A22 lock summary and never exposes raw lockedBy` 与 invalid metadata fallback 验证公开字段白名单；E2E `rejects incomplete lock audit without guessing or writing`、`rejects unsupported metadata without exposing it or writing` 代表性验证错误响应不回显内部 audit/metadata 值，Service 还验证稳定失败不泄露 metadata。完整 Secret 边界由通用异常与序列化安全承担，不要求每个 A22 错误码同时枚举正文、actor 全部内部字段和所有 Secret；只有 mapper、异常过滤器或公共响应合同变化时才扩大安全回归。 | `covered_representatively + general_gate` | 否 |
| A23 只冻结精确来源、保持报告 status=confirmed、幂等不重复冻结并保留原说明 | `backend/test/clinical-report-source-freeze.e2e-spec.ts` | `freezes the exact report source chain and is idempotent`；`resumes an in-progress audit using the persisted scope and original note` | `covered` | 否 |

当前 B12 后端合同前置证据已无确认 `gap`；`B12-U01`～`B12-U03` 三个用户可达 Browser 场景均已完成，最终保持 `passed=3`、`pending=0`。

### 9.3 非阻断防御性证据

原 S11 的 audit/metadata 损坏状态属于 `internal_corruption_only`：当前没有正式页面或公开 API 能把合法报告制造为该损坏形态，因此不再阻断 B12。`backend/test/clinical-report-lock.e2e-spec.ts` 中 `rejects incomplete lock audit without guessing or writing`、`rejects unsupported metadata without exposing it or writing`，以及 `frontend/test/browser-acceptance/contracts/b12-lock-non-browser.spec.ts` 中两个 B12-S11 pure/static 测试可以继续作为 `supplemental_defensive` 回归保留。是否删除直接改库 E2E 由后续独立代码治理任务决定，本次不删除测试资产。

### 9.4 原 B12-S01～S17 迁移

| 原场景 | 迁移或处置 |
|---|---|
| S01、S02、S14 | 并入 `B12-U01`；完整角色与状态矩阵引用 pure / HTTP E2E。 |
| S04、S06、S07、S15、S16，以及 S17 的写入页面部分 | 并入 `B12-U02`。 |
| S12 的 401 / 网络失败、S13，以及 S17 的错误恢复与代表性可用性部分 | 并入 `B12-U03`。 |
| S03、S05 | 迁入 9.2 合同前置证据，不分配活动 ID。 |
| S08 | 重复锁定迁入 9.2 的幂等合同；真实合法 HTTP 并发已由同节现有 A22 E2E 文件精确覆盖，不再需要后续定向后端任务。 |
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

`B12-P4-final-gates` 已在 U03 最终代码态完成：U03 是本轮唯一轻量跨层 Browser 冒烟，定向 discovery 恰好发现 1 个文件、2 条测试，正式 Chromium headless 以 workers=1、retries=0 通过 2/2；测试数据全部脱敏，未新增依赖、package/锁文件变化或无合同路由，frontend 全量 lint、正式 typecheck 与 production build 均通过。B12 三个用户可达活动场景、合同前置证据和最终通用门禁均已完成，B12 Browser 验收闭环完成。

## 10. B13 已治理；B14～B15 后续设计规则

B13 已按当前 A23 后端合同、当前前端实现、当前测试证据和现行分层治理规则独立重新生成，不再把原 116 个混合层级条目当作活动关闭对象。B14 的 115 项、B14.1 行为范围和 B15 的 10 组仍是未经治理的候选断言与历史设计输入；其正文和状态本次保持不变。

B13 采用“先生成当前最小活动设计，再反向迁移旧编号”的顺序。活动 ID 只分配给真实页面可达、风险不可互换、足以阻断发布且尚需 Browser 验证的用户场景；认证、权限、DTO、ownership、状态机、精确 scope、幂等、合法并发、pure/static、防御分支和通用门禁分别归入最低充分证据层。原逐条正文由 Git 历史追溯，当前文档只保留紧凑迁移表。

`B13-P0-contract-evidence` 已完成，合同前置证据无确认 gap；`B13-U01` 已完成最小 Browser 验收，下一活动场景为 `B13-U02`。B14～B15 正式设计时继续遵循第 2～8 节规则。

### 10.1 B13 报告来源冻结：重新生成后的活动验收设计

#### 10.1.1 设计结论与活动汇总

当前 A23 不可替代的用户可见风险收敛为三个场景，不增加第四个活动场景。完整角色、V1/V2+、Visit 状态、API 绕过、并发、数据库终态和防御分支由非 Browser 证据承担；一个场景内任一必需子断言未执行或失败，整个场景均不得标记为 `passed`。

| 活动场景 | 分类 | Profile | 状态 |
|---|---|---|---|
| `B13-U01` 页面入口、人工角色与三种来源冻结持久状态 | `ui_reachable` | `B13-P1-entry-persisted-states` | `passed` |
| `B13-U02` 首次真实来源冻结、精确 scope 与持久摘要 | `ui_reachable` | `B13-P2-first-freeze` | `pending` |
| `B13-U03` 显式恢复 in_progress 与不确定结果处理 | `ui_reachable` | `B13-P3-resume-uncertain-result` | `pending` |

活动汇总更新为：`passed=1`、`pending=2`、`failed=0`、`blocked=0`、`not_executed=0`。`B13-U01` 已通过；`B13-U02`、`B13-U03` 尚未执行其独立真实写入与恢复风险，继续保持 `pending`。Node-only contract spec 仍属于不分配活动 ID 的 P0 合同证据。

#### 10.1.2 `B13-U01` 页面入口、人工角色与三种来源冻结持久状态

- 分类与 Profile：`ui_reachable`；`B13-P1-entry-persisted-states`；状态 `passed`。
- 真实起始状态：同一正式报告页分别加载（1）confirmed、已完成报告自身锁定、`sourceFreeze=null`，（2）合法 `sourceFreeze=in_progress`，（3）合法 `sourceFreeze=completed`。人工角色使用 doctor 和代表性非授权人工角色 nurse。
- 真实触发路径：doctor 或 nurse 登录后进入当前访视详情的报告正文与工作流区域；不直接调用 API，不篡改运行时或数据库。
- 必需断言：doctor 在合法 `sourceFreeze=null` 报告看到可用首次冻结入口；nurse 可阅读报告但没有可用首次冻结或恢复入口，Browser 不为了制造 403 暴露隐藏操作，完整权限矩阵引用 HTTP E2E。
- 必需断言：`in_progress` 明确提示部分来源可能已经冻结且未自动回滚，展示原 `freezeId` 和原服务端 `freezeNote`；原说明只读，只能由用户显式进入恢复，不自动 POST。
- 必需断言：`completed` 只读，不再显示首次冻结或恢复入口；展示安全 actor、时间及服务端计数摘要，不公开 metadata、内部 scope、来源 ID、ItemResponse ID 或原始 Schema actor 字段。
- 必需断言：页面明确区分“报告已确认”“报告自身已锁定”“来源冻结未开始/未完成/已完成”“尚未归档/已经归档”；合法后续 archive 入口可以存在，不能因 B14 已实现而失败；报告正文始终可阅读。
- 发布阻断风险：错误开放不可逆入口、把正式恢复状态误报为完成或回滚、泄露内部来源，或混淆锁定/冻结/归档事实，都会破坏权限、恢复能力、隐私或临床事实表达。

Browser 只取 doctor、nurse、`sourceFreeze=null`、`in_progress`、`completed` 五个代表性维度；完整 V1/V2+、角色和 Visit 状态矩阵由非 Browser 证据负责。

执行结果（2026-08-02）：doctor 在 null 状态看到首次冻结入口并仅在本地打开、取消二次确认；nurse 对同一报告保持代表性只读。正式 `in_progress` 持久事实展示原 freezeId、服务端只读 freezeNote、部分完成与未自动回滚提示，doctor 可打开并取消恢复确认，nurse 等待医生或管理员明确继续；`completed` 对 doctor 只读并展示 actor、时间、说明和五类安全计数。页面正确区分 report confirmed、报告自身 `lockedAt`、`sourceFreeze` 与 `archivedAt`，报告正文保持可读，合法独立归档入口不构成失败。全程 freeze-sources POST 与其他报告业务写入均为 0；prepared verify、post-browser verify 均通过，两次 cleanup 均为 `residualCount=0`。完整角色、状态、资格与恢复合同继续复用 `B13-P0-contract-evidence` 的非 Browser 证据；下一活动场景为 `B13-U02`。

#### 10.1.3 `B13-U02` 首次真实来源冻结、精确 scope 与持久摘要

- 分类与 Profile：`ui_reachable`；`B13-P2-first-freeze`；状态 `pending`。
- 真实起始状态与触发路径：doctor 打开 confirmed、已完成报告自身锁定、`sourceFreeze=null` 的合法报告，通过正式来源冻结表单提交一次真实 `freeze-sources` POST。
- 表单与请求：首次 `freezeNote` 为空，不自动生成、预填或复制 `lockNote` / `confirmationNote`；checkbox 初始未选中，trim 后最小无效值不能提交，只有有效脱敏说明并显式勾选后才可提交；请求只发生一次。
- 写入期间：相关报告写入口互斥，报告正文仍可阅读；页面不显示虚假逐项百分比、实时进度、轮询或自动重试。
- 成功事实：回执为 `state=completed`、`alreadyFrozen=false`、`resumedExisting=false`；页面应用完整服务端 `report` 与 `sourceFreezeReceipt`。
- 安全摘要：五类来源名称正确；expected、completed、newlyFrozen、previouslyFrozen 和 total 均来自服务端，前端不重新统计来源、不计算完成百分比；不显示来源 ID、内部 scope 或 metadata。
- 生命周期隔离：report status 仍为 confirmed，`report.lockedAt` 不被 `sourceLockedAt` 替换；冻结 POST 不自动触发 archive、correction、void、PDF、下载或 AI。刷新后当前会话 receipt 消失，持久 summary 继续来自服务端 `report.sourceFreeze`。
- 后置数据库证据义务：后续 verifier 或可复用的精确既有 fixture verify 必须证明只冻结报告精确 scope、scope 外来源不变、五类目标来源按合同转换，Patient、Visit 与 Storage 不变；report narrative、snapshots、confirmation、lock、`archivedAt`、`correctionRecords` 不变；只形成一个合法 `a23SourceFreeze`，没有独立 A23 AuditLog，completed counts 与唯一实际终态一致。
- 发布阻断风险：首次不可逆冻结若扩大/缩小 scope、重复写入、伪造计数、泄露来源、覆盖报告事实或自动串联后续生命周期，会直接破坏临床来源完整性和发布安全。

#### 10.1.4 `B13-U03` 显式恢复 in_progress 与不确定结果处理

- 分类与 Profile：`ui_reachable`；`B13-P3-resume-uncertain-result`；状态 `pending`。两个路径共同验证不可逆多集合操作的用户恢复能力，仍只使用一个活动 ID。
- 路径 A 起始状态：报告具有 A23 正式合同定义的合法 `in_progress` 持久事实，scope 中允许已有部分来源完成冻结。页面提示部分完成风险，展示原 `freezeId` 但不泄露内部 scope，服务端原 `freezeNote` 只读且不可替换。
- 路径 A 操作与结果：恢复 checkbox 初始未选中；不自动恢复、不轮询、不自动 POST。用户显式确认后只发送一次真实恢复请求；Body 仍只含合同允许字段，客户端不提交 freezeId 或 scope，由服务端沿用既有说明、`freezeId` 和 scope。成功回执必须为 `resumedExisting=true`、`alreadyFrozen=false`，`freezeId`、原 `freezeNote`、started actor 均不变，completed actor 按当前服务端合同保留原 started actor，最终 `state=completed`，counts 与数据库唯一终态一致。
- 路径 B 起始状态：doctor 在首次冻结表单输入未提交的脱敏 `freezeNote`。网络层中止一次真实 `freeze-sources` 请求，不伪造响应；当前 React 内存保留说明，不自动 retry、不自动转入恢复，页面只提示手工读取最新状态，不显示已完成或已回滚。
- 路径 B 刷新边界：刷新后未提交本地说明消失，且不写入 localStorage、sessionStorage 或 IndexedDB。
- 复用边界：B12 已完成完整 401、beforeunload、Storage、键盘、焦点和 Axe 恢复模式；B13 不复制认证失效和全套可访问性矩阵，只在来源冻结表单附着最低必要 label、代表性小屏及错误反馈验证。
- 发布阻断风险：自动重放不可逆 POST、覆盖首次事实、误报回滚/完成、丢失不确定结果恢复入口或持久化本地临床说明，都足以阻断发布。

#### 10.1.5 B13 Profile 职责

| Profile | 职责 | Browser / 活动 ID |
|---|---|---|
| `B13-P0-contract-evidence` | 已完成：后端合同、frontend pure/static 与非阻断防御证据已收口，合同前置证据无确认 gap | 不执行 Browser；不拥有活动 ID |
| `B13-P1-entry-persisted-states` | 执行 `B13-U01` | Browser；只拥有 `B13-U01` |
| `B13-P2-first-freeze` | 执行 `B13-U02` | Browser；只拥有 `B13-U02` |
| `B13-P3-resume-uncertain-result` | 执行 `B13-U03` | Browser；只拥有 `B13-U03` |
| `B13-P4-final-gates` | 在 B13 最终代码态只执行一次通用最终门禁 | 不拥有新的业务活动 ID |

不得恢复原 116 项对应的 Profile 数量；本设计不决定 fixture 文件、Stage、runner、manifest、Browser spec 数量或 selector。

#### 10.1.6 不分配 B13 活动 ID 的合同与非 Browser 证据

下表是 B13 合同证据与缺口的权威来源。“covered”只表示当前仓库存在可定位且直接对应的动态证据；“covered_by_layered_evidence”表示多个现有层共同达到最低充分边界。本次以 exact test-name pattern 定向执行 A23 双 Session 真实 HTTP 并发 E2E，最终修正版已获得一次完整绿色运行。

| # | 风险或合同 | 可达性分类 | 最低充分证据层 | 当前精确测试文件及测试名称 | 当前状态 | 后续定向任务 | 简要缺口说明 |
|---|---|---|---|---|---|---|---|
| 1 | 401；doctor/admin 与 nurse/research_assistant/system 角色边界 | `public_api_reachable` | `backend_http_e2e` | `backend/test/clinical-report-source-freeze.e2e-spec.ts`：`enforces authentication and doctor/admin roles`、`freezes the exact report source chain and is idempotent`、`allows admin to freeze a separate locked report` | `covered` | 否 | 401、三个禁止角色及 doctor/admin 成功路径均有精确现有证据；不为每个角色创建 Browser ID。 |
| 2 | DTO 白名单、`confirm: true`、trim 后 3～2000 字 freezeNote、strict ISO `expectedUpdatedAt` | `public_api_reachable` | `backend_unit` + `backend_http_e2e` | `backend/src/modules/reports/dto/clinical-report-source-freeze-dto.spec.ts`：`accepts confirmation and trims the freeze note`、`leaves missing, false and string confirmation to the workflow`、`rejects malformed input %#`、`rejects client-controlled source and operation fields`；`backend/test/clinical-report-source-freeze.e2e-spec.ts`：`freezes the exact report source chain and is idempotent` | `covered` | 否 | ValidationPipe 白名单与 workflow 显式确认边界已有直接分层证据。 |
| 3 | ownership、V1 readiness 与 V2+ replacement lineage；合法 V2+ 不因历史 Patient/Visit 被错误阻断 | `public_api_reachable` | `backend_http_e2e` + `backend_unit` | `backend/src/modules/reports/services/reports.service.spec.ts`：`uses complete ownership for direct report lookup`、`bypasses V1 and scopes a V2 predecessor lookup to current ownership`；`backend/src/modules/reports/lib/clinical-report-source-freeze.spec.ts`：`accepts only a complete locked report with the current updatedAt`；`backend/src/modules/reports/lib/clinical-report-replacement-lineage.spec.ts`：`accepts legal V2 and V3 links and bypasses V1`、`rejects missing or malformed replacement metadata and versions`、`rejects a predecessor that is not corrected or not completed`、`rejects correction mismatches and forged one-sided relationships`；`backend/test/clinical-report-correction.e2e-spec.ts`：`runs V2 and V3 lifecycles without rewriting shared frozen sources`、`rejects incomplete V2 replacement lineage with the stable conflict` | `covered_by_layered_evidence` | 否 | ownership、V1 资格和完整 replacement lineage 由共享查询、pure 与 A26 真实生命周期分层证明；缺少排列组合不构成独立 gap。 |
| 4 | 精确 report scope，以及纳入 ScaleInstance 下的全部 ItemResponse | `public_api_reachable` | `backend_http_e2e` | `backend/test/clinical-report-source-freeze.e2e-spec.ts`：`freezes every ItemResponse in the report scale-instance scope and leaves outside items unchanged`、`freezes the exact report source chain and is idempotent`；`backend/src/modules/reports/lib/clinical-report-source-freeze.spec.ts`：`normalizes stable scope and rejects duplicate IDs` | `covered` | 否 | 定向 HTTP E2E 以同一目标 ScaleInstance 下两条 ItemResponse 和 scope 外一条 ItemResponse 调用正式 API；回执为 `itemResponseCount=2`、`totalSourceCount=6`，数据库终态证明两条目标记录以同一来源冻结事实锁定、outside 记录不变，响应不公开内部 scope 或 ItemResponse ID。 |
| 5 | ScaleInstance、ItemResponse、ScoreResult、CognitiveDomainResult、MediaEvidence 五类状态转换 | `public_api_reachable` | `backend_http_e2e` | `backend/test/clinical-report-source-freeze.e2e-spec.ts`：`freezes the exact report source chain and is idempotent` | `covered` | 否 | 同一真实 POST 后直接核对五个集合的状态与 `lockedAt`。 |
| 6 | scope 外 ScaleInstance、MediaEvidence 等非目标来源不变 | `public_api_reachable` | `backend_http_e2e` | `backend/test/clinical-report-source-freeze.e2e-spec.ts`：`freezes the exact report source chain and is idempotent` | `covered` | 否 | 现有测试直接核对未引用 MediaEvidence 与外部 ScaleInstance 未变。 |
| 7 | Patient、Visit、ScaleDefinition/ScaleVersion 与 Storage 不被冻结 | `public_api_reachable` | `backend_http_e2e` + `backend_unit` | `backend/test/clinical-report-source-freeze.e2e-spec.ts`：`freezes the exact report source chain and is idempotent`；`backend/src/modules/reports/services/clinical-report-source-freeze-workflow.service.ts` 仅批量更新五类来源，E2E 同时核对 Patient、Visit 和 Storage objectKey / storageStatus | `covered_by_layered_evidence` | 否 | Patient/Visit/Storage 有直接终态；ScaleDefinition/Version 不在 workflow 写依赖或 scope 中，结构性分层证据足够，不为“未调用的模型”虚构测试。 |
| 8 | report status、lock、confirmation、narrative、snapshots、archive/correction 事实不被 A23 修改 | `public_api_reachable` | `backend_http_e2e` + `backend_unit` | `backend/test/clinical-report-source-freeze.e2e-spec.ts`：`freezes the exact report source chain and is idempotent`；`backend/src/modules/reports/services/reports.service.spec.ts`：`atomically starts source freeze only for the unchanged locked report`、`atomically completes only the matching in-progress freeze audit` | `covered_by_layered_evidence` | 否 | E2E 直接核对 status 与原 `lockedAt`；两个原子更新 spec 精确证明 report 只 `$set` metadata。U02 后续 verifier 仍须把所有保护根列入该次 Browser 写入终态。 |
| 9 | completed 幂等保留原 freezeId、note、actor 且不重复写入 | `public_api_reachable` | `backend_http_e2e` + `backend_unit` | `backend/test/clinical-report-source-freeze.e2e-spec.ts`：`freezes the exact report source chain and is idempotent`；`backend/src/modules/reports/services/clinical-report-source-freeze-workflow.service.spec.ts`：`returns a completed audit idempotently without touching source rows` | `covered` | 否 | 顺序重复请求返回原事实并跳过来源写入；这不等于真实并发证据。 |
| 10 | 合法 `in_progress` 沿用原 scope、freezeId、note 和 started actor，完成后 `resumedExisting=true` | `public_api_reachable` | `backend_http_e2e` + `backend_unit` | `backend/test/clinical-report-source-freeze.e2e-spec.ts`：`resumes an in-progress audit using the persisted scope and original note`；`backend/src/modules/reports/lib/clinical-report-source-freeze.spec.ts`：`builds immutable in-progress and completed audit while preserving metadata` | `covered` | 否 | E2E 从合法部分完成持久事实恢复为 completed，并核对原 freezeId/note/started actor。 |
| 11 | public response / mapper 不泄露 metadata、内部 scope、来源 ID 或 ItemResponse ID | `public_api_reachable` | `backend_http_e2e` + `backend_unit` | `backend/test/clinical-report-source-freeze.e2e-spec.ts`：`freezes the exact report source chain and is idempotent`；`backend/src/modules/reports/services/clinical-report-public.mapper.spec.ts`：`maps only the explicit public report contract`、`maps full A24 archive summary, historical fallback and invalid audit safely` | `covered_by_layered_evidence` | 否 | A23 HTTP 响应直接断言无 metadata、回执无 scope；公共 mapper 白名单与类型只返回安全摘要，不复制内部 scope/ID。页面另由 U01 验证不展示原始 Schema actor 字段。 |
| 12 | A14、A15、A16、A18 在真实来源冻结后拒绝公开 API 写入 | `public_api_reachable` | `backend_http_e2e` + `backend_unit` + 原子写入过滤 | A23：`backend/test/clinical-report-source-freeze.e2e-spec.ts`：`freezes the exact report source chain and is idempotent`；A14：`backend/test/item-response-draft.e2e-spec.ts`：`rejects patient, visit, scale-instance, and item non-editable states`；A15：`backend/test/media-evidence.e2e-spec.ts`：`blocks upload and void for every non-editable visit, instance and item state`；A16：`backend/test/scale-instance-submission.e2e-spec.ts`：`enforces first-submission patient, visit and instance state boundaries`；A18：`backend/test/manual-score-review.e2e-spec.ts`：`reviews every pending item, re-derives totals and confirms idempotently`；对应 unit 精确断言各写入的状态、ownership 与 `lockedAt: null` 原子 filter | `covered_by_layered_evidence` | 否 | A23 E2E 已证明五类来源进入正式冻结状态；A14/A15/A16/A18 在相同 status/`lockedAt` 上做 service 门禁和原子过滤，A18 confirmed 路径只读幂等；只读搜索未发现 A23 专属特殊写入分支，因此不新增跨模块串联矩阵。 |
| 13 | 两个合法 HTTP 请求真实并发 `freeze-sources` 时只有一个 start/completed 事实 | `legitimate_concurrency` | `backend_http_e2e` | `backend/test/clinical-report-source-freeze.e2e-spec.ts`：`creates one source-freeze fact under two concurrent authenticated HTTP requests`；`backend/src/modules/reports/services/reports.service.spec.ts`：`atomically starts source freeze only for the unchanged locked report`、`atomically completes only the matching in-progress freeze audit` | `covered` | 否 | exact test-name pattern 定向绿色运行证明 doctor/admin 两个独立认证 Session 基于同一 `expectedUpdatedAt` 真实并发；两个响应均为 200，且动态核对唯一首次 start、同一 freezeId/actor/note/counts、loser 不覆盖首次事实、唯一 completed MongoDB audit、五类来源唯一终态及 scope 外与受保护事实不变。 |
| 14 | 跨集合部分失败、无 Mongo transaction、无 rollback/unfreeze 与显式恢复语义 | `public_api_reachable` | `backend_http_e2e` + `backend_unit` | `backend/test/clinical-report-source-freeze.e2e-spec.ts`：`resumes an in-progress audit using the persisted scope and original note`；`backend/src/modules/reports/lib/clinical-report-source-freeze.spec.ts`：`builds immutable in-progress and completed audit while preserving metadata`；`backend/src/modules/reports/services/clinical-report-source-freeze-workflow.service.ts` 依次处理五类集合并保留 `in_progress` | `covered_by_layered_evidence` | 否 | 现有 E2E 以合法部分完成持久事实证明可恢复终态，pure/实现证明原事实保留和无自动回滚；合法 `in_progress` 不是损坏数据。 |
| 15 | A26 replacement 的 `previouslyFrozen` 兼容计数与共享来源不重复修改 | `public_api_reachable` | `backend_http_e2e` | `backend/test/clinical-report-correction.e2e-spec.ts`：`runs V2 and V3 lifecycles without rewriting shared frozen sources` | `covered` | 否 | V2/V3 真实生命周期直接核对 previous/new counts、幂等与共享来源事实不变。 |
| 16 | 前端资格、请求构造、计数一致性和恢复草稿 pure/static 合同 | `ui_reachable` | `frontend_static_or_pure` | `frontend/test/browser-acceptance/contracts/b13-source-freeze-non-browser.spec.ts`：`G4 preserves representative start eligibility, lineage, and role boundaries`、`G4 allows safe in-progress resume and keeps completed or unsafe reports read-only`、`G4 preserves start and resume draft semantics and validation`、`G4 keeps the request whitelist and safe count composition`、`G4 keeps latest continuation faithful for start and resume drafts` | `covered` | 否 | Node-only spec 直接调用生产资格、生命周期、草稿、Body、计数和 latest continuation 纯函数，证明代表性 V1/V2+ 入口、start/resume 保真、请求白名单与服务端安全摘要边界；不复制完整角色、Visit 或损坏状态矩阵。 |
| 17 | 网络失败与受控错误最多读取 latest 一次，且不自动重放 POST | `ui_reachable` | `frontend_static_or_pure` | `frontend/test/browser-acceptance/contracts/b13-source-freeze-non-browser.spec.ts`：`G5 classifies latest refresh and write prohibition without replay`、`G5 keeps one production POST path and separates automatic and manual recovery` | `covered` | 否 | 共享恢复函数动态证明受控错误每次最多读取 latest 一次、网络错误读取 0 次、scope/input/audit 异常禁止安全写入；有界源码检查证明 Action 只有一处生产 API 调用、一次 `coordinator.execute` 请求、一次 onError 恢复调用，手工 latest 与自动错误链分离且无自动重放 POST。用户可见网络中止仍由 `B13-U03` Browser 验证，但不再构成合同证据 gap。 |
| 18 | 非安全 count、组合不一致、非法 audit/scope/metadata 及只能损坏内部结构形成的状态 | `internal_corruption_only` | `backend_unit` / `frontend_static_or_pure` | `backend/src/modules/reports/lib/clinical-report-source-freeze.spec.ts`：`rejects malformed or drifted A23 audit`；现有前端实现含一致性防御，但无 B13 专属测试 | `supplemental_defensive` | 否 | 已有廉价测试可保留；缺少分支排列不阻断 U01～U03，也不创建 Browser ID。若正式导入、迁移或生产事故使其可达，再另行升级。 |
| 19 | 原 68～71 generic conflict：只改变 report.updatedAt 且仍保持同一报告可首次冻结 | `ui_reachable` / `public_api_reachable` 可达性核对 | 无；当前退役 | `backend/src/modules/reports/controllers/clinical-reports.controller.ts` 当前写路由只含 draft/review、lock、freeze、archive、correction；锁定后的合法 archive/correction 会改变生命周期资格，未发现只改 updatedAt 且仍可首次冻结的正式页面或公开 API 链 | `retired_currently_unreachable` | 否 | 合法并发形成的 in_progress/completed 已归入第 13 行与 U03，不能伪装为 generic conflict Browser 场景；若未来出现真实触发链再重新评估。 |

分类汇总：`covered=11`、`covered_by_layered_evidence=6`、`gap=0`、`supplemental_defensive=1`、`retired_currently_unreachable=1`、`duplicate_or_covered=0`。19 行合同前置证据已无确认 gap。

#### 10.1.7 合同前置证据收口与下一步

G4 与 G5 已由同一份 `frontend/test/browser-acceptance/contracts/b13-source-freeze-non-browser.spec.ts` 闭合；`B13-P0-contract-evidence` 已完成，当前合同前置证据无确认 gap。`B13-U01` 已完成最小 Browser 验收；`B13-U02`、`B13-U03` 保持 `pending`，活动汇总为 `passed=1`、`pending=2`、`failed=0`、`blocked=0`、`not_executed=0`，下一活动场景为 `B13-U02`。

#### 10.1.8 非阻断防御性证据

以下均不分配 B13 活动 ID，统一归入 `supplemental_defensive`：count 不是非负安全整数；total 与五类之和不一致；`in_progress` 却存在 `completedAt`；completed 缺少 `completedCounts`；expected、completed、newly、previously 无法组合；metadata 根结构不受支持；A23 audit 缺失或不一致；scope 包含非法或不可解析内部 ID；服务端内部来源数据不一致；以及只有直接改库或损坏内部结构才能形成的状态。

已有廉价 pure/unit/代表性 E2E 可以保留，但这些分支不建立 Browser 场景、不阻断 B13 用户活动场景关闭。若正式导入、迁移或生产事故使其成为真实业务路径，再另行升级。合法 `in_progress` 是 A23 的正式持久恢复锚点，保留原 freezeId、原 freezeNote、原 started actor 和原 scope，绝不归入本类。

#### 10.1.9 B13 通用最终门禁

以下门禁不分配业务 Audit ID，只由 `B13-P4-final-gates` 在 B13 最终代码态执行一次：

- 不产生第二次 `/auth/me`。
- 不新增无合同依据的路由。
- 不新增依赖。
- 不使用真实患者、真实来源或真实冻结说明。
- lint。
- typecheck。
- build。
- 一条轻量跨层 Browser 冒烟。

响应式、label、键盘、焦点与 Axe 附着在 U02 或 U03 的真实流程中，不建立独立 Profile。PDF、下载与 AI 仅作为 A23 非目标及 Network 边界，不分配活动 ID。

#### 10.1.10 原 B13-01～B13-116 反向迁移

原逐条正文已从当前权威文档移除，由 Git 历史继续追溯。下表每个编号只出现于一个连续范围，不同时作为活动场景和退役项。

| 原编号或连续范围 | 新归属 | 分类 | 处理理由 |
|---|---|---|---|
| 1～5 | `B13-U01` + frontend pure/static + backend readiness/lineage | `ui_reachable` / 分层合同 | 页面只取代表性 null 状态；草稿、待确认、未锁定和版本资格由资格函数与后端门禁承担。 |
| 6～10 | `B13-U01` + 后端角色合同 | `ui_reachable` / `public_api_reachable` | Browser 只用 doctor 与 nurse；admin 成功及完整 403 矩阵复用 HTTP E2E。 |
| 11 | `B13-P4-final-gates` | `general_gate` | `/auth/me` 请求数是通用门禁，不是业务活动。 |
| 12～18 | `B13-U01` + backend readiness/lineage/recovery | `ui_reachable` / 分层合同 | 代表性 persisted states 进 U01；完整 Visit/V1/V2+ 与正式恢复资格由非 Browser 证据负责。 |
| 19～31 | `B13-U02` + request/validation pure/static + backend DTO | `ui_reachable` / 分层合同 | 表单、一次 POST 和可读性合并为首次真实冻结；字段逐项不拆活动 ID。 |
| 32～34 | `B13-U02` | `ui_reachable` | 首次成功的 state 与两个布尔值是同一用户结果。 |
| 35 | `B13-U03` | `ui_reachable` | `resumedExisting=true` 属于显式恢复成功。 |
| 36～37 | 后端 completed 幂等合同 | `public_api_reachable` | 顺序幂等由 HTTP E2E/unit 负责，不另建 Browser 场景。 |
| 38～50 | `B13-U01` + `B13-U03` + persisted-state pure/static | `ui_reachable` / 分层合同 | null/in_progress/completed 展示进 U01；恢复保真和显式确认进 U03；结构防御归 pure/static。 |
| 51～61 | `B13-U01` / `B13-U02` / `B13-U03` 安全摘要 + mapper/pure/static | `ui_reachable` / 分层合同 | 页面只验完整安全摘要，计数与隐私的结构合同由 mapper/pure/static 支撑。 |
| 62～67 | 非阻断防御性证据 | `supplemental_defensive` | 只能由异常内部摘要形成，不建立 Browser 场景。 |
| 68～71 | 当前退役；合法并发另归合同第 13 行与 U03 | `retired_currently_unreachable` | 未发现只改变 report.updatedAt 且仍保持首次可冻结的正式 UI/API 链；不机械保留 generic conflict Browser。 |
| 72～76 | `B13-U03` + backend incomplete/failed + frontend recovery pure/static | `ui_reachable` / 分层合同 | 合并为正式 in_progress 恢复和不确定结果的用户恢复风险。 |
| 77～80 | 非阻断防御性证据 | `supplemental_defensive` | 内部 scope/input/audit/metadata 细节不向 Browser 拆分。 |
| 81 | B12 共享认证 Browser + A23 HTTP 401 | `duplicate_or_covered` | 不复制 B12 完整认证失效路径，不创建 B13 独立活动 ID。 |
| 82 | A23 HTTP 403 角色合同 | `public_api_reachable` | 页面不制造 403，首次本地说明保留由 U03/前端恢复合同覆盖。 |
| 83～84 | `B13-U03` 路径 B | `ui_reachable` | 一次真实网络中止与手工 latest 提示是不可替代用户恢复风险。 |
| 85～90 | `B13-U02` / `B13-U03` + B12 shared beforeunload/Storage/receipt | `ui_reachable` / `duplicate_or_covered` | B13 只验来源冻结特有的内存说明与持久摘要；共享恢复模式复用 B12。 |
| 91～102 | `B13-U01` / `B13-U02` / `B13-U03` 生命周期术语 + static/contract | `ui_reachable` / 分层合同 | 合并验证确认、报告锁定、来源冻结、归档和非 transaction/非目标边界。 |
| 103～105 | `B13-U03` + A23 非目标边界 | `ui_reachable` / `duplicate_or_covered` | 不自动 unfreeze、rollback 或后台恢复是同一恢复语义，不拆独立活动 ID。 |
| 106 | 退役 | `retired_obsolete` | B14、B15 已实现；只保留 freeze-sources 不得自动触发 archive/correction/void。 |
| 107～109 | A23 非目标、Network 或静态边界 | `duplicate_or_covered` | PDF、下载、AI 和诊断输出不生成独立 Browser 活动 ID。 |
| 110～111 | 附着于 `B13-U02` 或 `B13-U03` | `ui_reachable` | 代表性小屏、label 与错误反馈随真实流程验证，不建独立 Profile。 |
| 112～116 | `B13-P4-final-gates` | `general_gate` | 路由、脱敏、lint、typecheck、build 只执行一次。 |

只读编号覆盖核对的验收目标为：覆盖 116 个、缺号 0 个、重复 0 个；第 106 项唯一归入 `retired_obsolete`。任何迁移归属都不代表本次动态通过。

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

roadmap 业务工作包状态不因 playbook 治理或测试资产退役自动变化。B12 二次收缩后的 U01～U03 与最终通用门禁均已完成，B12 Browser 验收闭环完成。本手册不恢复旧 P1 canary，仍禁止未经确认重建大型 B12 专属 fixture/support。B11 及以前状态不变；B13～B15 的具体候选条目与产品语义不因本手册改变。
