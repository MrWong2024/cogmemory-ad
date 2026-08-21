# CogMemory AD / 智忆评 前端验证手册

## 1. 文档定位与当前状态

本文档是验证候选的项目级生成来源、跨层分类与最低充分证据、Browser 验收规则、活动场景状态、Batch D 当前证据索引、B14.1 累计证据索引和 Batch E 待验范围的权威来源。产品范围与工作包状态由 `handoff-roadmap.md` 维护；数据库用途、fixture、verifier、cleanup 与后端定向命令由 `handoff-backend-testing-playbook.md` 维护；通用候选生成、任务归属和即时验收规则由 `docs/codex-instruction-spec.md` 3.9 维护；逐轮命令、执行耗时、失败过程、旧编号全文、迁移表和完整合同表由 Git 历史追溯。

| 范围 | 当前状态 | 详细入口 |
|---|---|---|
| WP-02 / B16 | 已完成 | 当前产品事实见 frontend snapshot / component map |
| WP-04 / B17 | 已完成 | 当前产品事实见 frontend snapshot / route map / component map |
| Batch A / B1–B3 | 已完成 | Git 历史与当前测试资产 |
| Batch B / B4–B6 | 桌面范围已完成 | Batch E 仍有 8 项待验 |
| Batch C / B7–B10 | 已完成 | Git 历史与当前测试资产 |
| Batch D / B11 | 70 项已完成，最终闭环 | Git 历史与 `frontend/test/browser-acceptance/b11/` |
| Batch D / B12 | `B12-U01`～`B12-U03`；`passed=3`、`pending=0`；P0 `gap=0`；最终门禁与 Browser 闭环完成 | “当前证据索引” |
| Batch D / B13 | `B13-U01`～`B13-U03`；`passed=3`、`pending=0`；P0 `gap=0`；最终门禁与 Browser 闭环完成 | “当前证据索引” |
| Batch D / B14 | `B14-U01`～`B14-U02`；`passed=2`、`pending=0`；P0 `gap=0`；最终门禁与 Browser 闭环完成 | “当前证据索引” |
| B14.1 | 累计证据索引，不是独立 Browser 批次，不拥有独立活动 ID | “B14.1 累计证据索引” |
| Batch D / B15 | `B15-U01`～`B15-U02`；`passed=2`、`pending=0`；P0 `gap=0`；最终门禁与 Browser 闭环完成 | “当前证据索引” |
| WP-03 / B18-A | 前端实现、原 47 项与新增 3 项 single-flight 非 Browser 合同完成 | “B18-A、B18-B1、B18-B2 与补充验证证据” |
| WP-03 / B18-B1 | 核心真实 Browser 阶段完成；`passed=6`、`pending=0`；证据复用 | “B18-A、B18-B1 与 B18-B2 证据” |
| WP-03 / B18-B2 | 剩余真实 Browser 阶段完成；P4/P5/P6 `passed=6`、`pending=0`；P0 `gap=0` | “B18-A、B18-B1 与 B18-B2 证据” |
| WP-03 / B18 补充验证 | P7 `passed=2`、P8 `passed=1`；single-flight contract、P3 与 P9 `passed`；自动化 `gap=0` | “B18-A、B18-B1、B18-B2 与补充验证证据” |
| WP-10-F1 | 完成；F1-P1 / F1-P2 各正式运行一次并通过，post verifier 与 cleanup 均闭合 | “WP-10-F1 最终证据与 Browser Audit 治理” |
| WP-10-F2 | 完成；F2-P1 正常 19 步与 F2-P2 recovery 均通过，staff Axe 阻断项已修复，最终仅保留 1 个非阻断结构规则 | “WP-10-F2 阶段与最终收口证据” |
| WP-10-F3 | 完成；正常作答复核主证据与 completed gate 后的定向 happy-path 回归、post verifier、cleanup 均已闭合 | “WP-10-F3 正常作答复核证据” |
| Batch E | 8 个真实设备或人工项目待验；最终主要归属 WP-08 | “Batch E：真实设备或人工验收” |

B11～B15 保持完成；B18 补充验证已闭合，自动化 `gap=0`，WP-03 已完成。WP-10-F2 的正常患者 MMSE 主流程与 recovery、WP-10-F3 的正常作答复核及 completed gate 回归均已完成，staff Axe 已取得 exact rule 并完成分类；WP-10 已完成。产品范围、工作包状态和当前主线以 `handoff-roadmap.md` 为准；Batch E 的 8 项真实设备或人工项目仍为 `pending`，最终主要归属为 WP-08。

## 2. 当前测试设计规则

长期分层总原则：能不用真实浏览器证明的事实，不使用 Browser 作为主证据；只有证据本身依赖真实浏览器语义，或必须证明 production 页面到真实 HTTP 的跨层 wiring，才进入 Browser。需要人判断是否清楚、自然、好用的事实由人工 smoke 负责。Browser 不是全量业务回归框架，也不是所有 UI 可达风险的默认最高层；本治理不减少自动化责任，减少的是低价值、重复、脆弱的 Browser 覆盖。最低充分不等于削弱安全、权限、数据完整性和关键业务合同，而是把自动化证据放到更稳定、职责更准确的层级。

### 2.1 验证候选的系统生成与即时闭环

通用候选治理时序以 `docs/codex-instruction-spec.md` 3.9 为唯一事实源。新 A#、B#、工作包子任务、跨层缺陷修复或其他实现单元在目标合同基本锁定后、生成实现 Codex 指令前，必须执行初始阶段 A、B、C：依据目标合同、当前既有资产和预计影响生成临时的 `初始验证风险候选集合`，治理必要性、可达性、证据复用和最低充分证据，并为候选分配当前任务、具名后续阶段、已有精确证据或人工边界。合同尚未锁定时先完成合同设计或拆分阶段；纯文档、纯格式和无行为变化的机械重构只做简化扫描。

项目级候选来源至少覆盖：

1. 业务角色、用户目标、正常/阻断路径和明确非目标。
2. 页面路由与入口、可见性、输入、writing / disabled、错误恢复、刷新、当前会话与持久状态。
3. 公开 API、DTO、Guard / Pipe、ownership、客户端可控字段、服务端生成字段与 mapper 隐私。
4. 状态机、readiness、幂等、合法并发、部分完成、显式恢复、网络结果不确定及版本/replacement 关系。
5. 数据副作用、audit、protected roots，以及 Patient / Visit / 来源 / Storage 等外部对象的不变量。
6. shared workflow、认证与权限、coordinator / writing lock / identity、Origin / CORS / Cookie 和构建时变量。
7. 已有 unit / HTTP E2E / Browser / verifier、已知回归，以及证据形成后相关实现是否变化。
8. Batch E 或其他人工、真实设备、相机、触控笔/手写、打印、硬件和专业判断边界。

默认采用“实现与即时验收一体化”：实现前写入 Codex 指令的是初始最低充分验收集合，不是封闭的最终清单；实现期间发现新风险时立即加入候选并治理；实现完成后必须依据基线至当前工作区的实际 diff、新增或删除资产、共享调用链和横切资产变化、数据或外部副作用及测试执行结果，执行增量阶段 A、B、C，再完成最终验收、候选覆盖完整性对账和证据收口。复杂任务可以按 3.9 拆为具名实现阶段和独立验收阶段，但当前阶段完成不得替代 A#、B# 或其他实现单元完成；实际影响或新增候选明显超出预计时，应拆出边界稳定的后续阶段，不得无界扩张。候选生成避免遗漏，后续治理避免过度测试；任何候选都必须有且只有一个主要归属，不得用“以后再看”替代明确阶段。分配到后续阶段、具名的其他实现单元或人工项目只表示已有归属，在对应验收实际通过、精确证据仍适用或其他正式关闭条件满足前不表示候选已经关闭。

候选集合只是 GPT 生成 Codex 指令期间的临时风险工作集，不要求完整输出给 Codex，不在 Playbook 保存新实现单元的候选全集，也不按候选建立永久 Audit ID 仓库。active / pending 阶段只持久化当前真实 `gap`、人工或真实设备项目和必要场景设计；完成后收缩为当前状态、精确证据资产、evidence commit 与长期合同摘要，逐轮生成、筛选、执行和治理过程由 Git 历史承担。

完成口径引用 `docs/codex-instruction-spec.md` 3.9，并在项目内分为三级：

- **当前任务或阶段完成**：本阶段实现和验收已完成，候选均有明确归属且状态/证据已同步；具名后续阶段或工作包最终收口候选仍 `pending` 时可以关闭当前子阶段，但不能据此宣布对应工作包完成。
- **A# / B# 或其他实现单元完成**：锁定范围内当前阻断候选、即时自动化验收及属于本单元完成门禁的后续阶段均已关闭，不存在未披露的阻断性 `gap`，mandatory 人工/真实设备项目满足当前范围，且最终覆盖对账和证据收口完成。仅允许保留经治理且具名归属到工作包最终收口的非阻断候选；它们在关闭前继续阻断对应工作包完成。
- **工作包或产品能力完成**：相关 A#、B#、跨层合同、联调和用户流程验收均按锁定范围关闭，manual / real-device 边界满足工作包合同并由 roadmap 按真实证据维护；Testing Playbook 不自行启动或关闭工作包。

A# 没有正式 UI 风险时不机械建立 Browser；UI 候选可以归属到同一工作包中具名的 B#，但在 B# 验收通过前仍是 open，只能准确表述 A# 的后端范围完成。B# 应复用当前代码态仍适用的 A# unit / HTTP E2E / verifier 精确证据，只为新增用户可见风险补最低充分 Browser；若 B# 改变后端合同或暴露新的公开调用路径，必须重新扫描后端候选，并明确由当前跨层实现单元或具名 A# 承担。

mandatory 人工或真实设备项目尚未签收时，不得无条件宣布完整范围完成；当前合同明确只覆盖桌面、自动化、后端或其他子范围时，必须使用准确限定语。Batch E 的现有状态和范围继续由第 6 节维护，本次规则补强不重新评定其阻断关系。

#### 2.1.1 阶段阻断与工作包最终收口

正常主流程优先：开发阶段先证明普通、预期、单用户或单写者的用户主链完整可用，再按风险补充异常组合。以下任一情况属于当前阶段阻断，必须当前关闭：普通主流程不可达；数据错误、丢失或重复；权限或隐私问题；正常单次操作持续出现未知 4xx / 5xx；用户无法继续；直接违反当前实现合同；或没有可信恢复路径。

低频并发恢复、多种异常组合、代表性但不影响核心操作的 accessibility 项、真实设备专项，以及已有 unit / HTTP E2E 强证据但尚缺高层补充验收的边缘恢复，可以治理为工作包最终收口候选，不阻断当前子阶段。此类候选必须写明具体工作包与复核时点，不得静默删除或无期限延期，并在工作包完成前重新核对。该判断沿用现有活动场景和 roadmap 语义，不新增 `core_complete`、`partial_complete`、`hardening_pending`、`acceptance_partial` 或其他状态，也不建立持久候选仓库。

### 2.2 可达性、风险与最低充分证据

系统生成后的候选风险必须先分类，再决定是否进入强制验收：

| 分类 | 判定边界 | 最低充分主证据 |
|---|---|---|
| `ui_reachable` | 当前正式页面可由正常人工操作触发；只说明风险可从 UI 触达，不等于必须使用 Browser | 先按待证明事实选择 frontend static / pure、HTTP E2E、database verifier、Browser 或人工 smoke；只有不可替代浏览器语义或 production 页面到真实 HTTP 的 wiring 才以 Browser 为主证据 |
| `public_api_reachable` | 页面无入口，但公开 API 可由 Postman、curl 或自编客户端调用 | HTTP E2E 验证认证、权限、DTO、ownership、状态门禁、错误码与数据库无非法副作用；不另建 Browser 场景 |
| `legitimate_concurrency` | 两个合法用户、标签页、Session 或请求可通过正式页面或公开 API 形成 | HTTP E2E 验证原子性、幂等、写入次数与数据库终态；仅在存在不可替代用户恢复交互时补最小 Browser |
| `internal_corruption_only` | 只能直接改库、伪造内部对象、篡改运行时或损坏历史数据形成 | 默认不进入业务批次；可保留廉价 pure/unit 防御证据，只有正式导入、迁移、兼容合同、已知事故或明确合规要求才升级 |
| `manual_or_real_device` | 自动化无法可靠替代的真实设备、相机、触控笔、手写、打印或专业判断 | Batch E 或明确人工验收；不得伪装为桌面 Browser 已通过 |
| `general_gate` | lint、typecheck、build、discovery、依赖、路由所有权、数据脱敏等 | 最终代码态或对应层变化后按影响范围执行；不创建业务 Audit ID |

设计顺序：

1. 先证明正常用户主流程，再证明真实 UI、公开 API、合法并发、正式导入或真实设备入口。
2. 判断风险是否涉及临床数据完整性、不可逆动作、权限、安全、隐私、恢复或已知回归，且是否足以阻断发布。
3. 检查相关代码、接口与配置未变化时是否已有可复用的精确证据。
4. 明确回答：“如果没有真实浏览器参与，哪一个产品事实将无法被可信证明？”无法指出真实 BrowserContext、Cookie、Storage、navigation / reload、focus / keyboard、文件选择、真实 CORS / credentials 或 production frontend → HTTP wiring 等不可替代事实时，不得仅因页面可达而升级为 Browser 主证据。
5. 在 `frontend_static_or_pure`、`backend_unit`、`backend_http_e2e`、`database_verifier`、`browser_micro_profile`、`static_gate` 与人工 smoke 中选择最低充分主证据，只为尚未被准确证明的事实补证。
6. 最后设计最小合法前置、场景和断言；禁止先扩张断言再反向建设 fixture。

Browser 验收按以下优先级执行；这是现有阶段 A/B/C 内的证据选择与执行顺序，不新增测试阶段或项目状态：

1. **Happy Path Smoke**：先证明正常用户按正常步骤从入口走到正常结束。happy path 未完成前，不持续扩大低频异常矩阵。
2. **高价值防御**：再选择真实 Cookie / Storage / Session 隔离、reload 恢复、关键 UI wiring、代表性凭证失效和确有不可替代页面恢复交互的少量场景。重复提交、权限绕过、stale write、合法并发和数据库终态以 HTTP E2E / verifier 为主证据；Browser 只补真实页面是否隐藏非法入口或产生正确请求的最小 wiring，不复制服务端非法调用矩阵。
3. **少量代表性恢复**：按实际合同选择 refresh、pause / resume 或 recovery 等代表性路径，不排列所有恢复组合，也不在每条主链重复已有低层精确证据。
4. **工作包最终收口**：非关键 Axe、真实设备、极低频组合和可用性细节在具名归属与复核时点下收口。第四层未全部完成时，不默认阻断下一业务功能，但在实际关闭前仍按 roadmap 合同阻断对应工作包完成。

业务风险守恒针对真实可达风险、不可替代状态语义和安全边界，不针对历史 Audit ID 数量、层级组合或顺序。同一风险只在最合适层作为主证据；代码阅读不等于动态通过，页面文本不替代数据库终态，fixture E2E 不冒充产品 Browser。Browser 收缩不得删除认证、授权、ownership、DTO 白名单、不可逆状态门禁、幂等、合法并发、隐私或数据库无副作用证据。

### 2.3 证据层职责

| 证据层 | 主职责 | 不可替代边界 |
|---|---|---|
| `backend_unit` | 局部判断、DTO、Service 分支、mapper、状态边界与廉价防御 | 不证明真实 HTTP、Guard 或数据库终态 |
| `backend_http_e2e` | 公开 API 绕过与合法并发的认证、权限、Pipe、Body、ownership、状态机、幂等、原子性和数据库终态 | 不证明页面真实交互 |
| `frontend_static_or_pure` | 展示映射、Action ownership、局部资格与非阻断防御 | 不证明真实输入、Browser API 或后端动态行为 |
| `browser_micro_profile` | BrowserContext、Cookie / Storage、navigation / reload、focus / keyboard、文件选择、真实 origin / CORS / credentials，以及 production 页面到真实 HTTP 的最小关键 wiring | 不替代服务端非法调用、服务端合同或数据库终态，也不承担普通 UI copy 与主观体验 |
| `database_verifier` | 仅在现有 HTTP E2E 不足时补充 Browser 写入次数、audit、protected roots 或持久终态 | 不重复准确 HTTP E2E，不替代页面体验 |
| `static_gate` | lint、typecheck、build、discovery、依赖与路由边界 | 不证明业务运行，不创建业务 Audit ID |

人工 smoke 是独立人工证据边界，不是新的自动化层、活动场景状态或自动化失败后的降级替代；其职责见 2.6。

backend unit、HTTP E2E、database verifier、fixture 与 cleanup 的具体规则以 backend testing playbook 为准。

### 2.4 按变化影响选择执行范围

- 纯文档变化只执行文档内容、链接、diff 与 Git 范围检查。
- 单个测试文件变化执行精确 discovery、定向测试和必要静态检查，不自动扩大到完整 E2E。
- 单模块生产代码变化执行受影响 unit / E2E 与对应层静态门禁。
- 只有认证、公共 Guard、Schema、通用 mapper、公共测试基础设施或跨模块合同变化，才按实际影响扩大回归。
- 是否执行完整 unit / E2E 由真实影响决定；“最终代码态”只决定已经证明有必要的完整回归何时执行，不构成扩大测试范围的理由。不得仅因达到最终代码态、“为了保险”或“为了更完整”而执行完整套件。
- 前端最终代码态按实际影响选择 `npm run test:browser:list`、`npm run test:browser:infra`、`npm run lint`、`npm run typecheck`、`npm run build`；discovery 和 infrastructure 不关闭业务场景。

### 2.5 微型 Browser Profile 与任务粒度

微型 Profile 原则上只包含 1～4 个紧密相关场景，具有单一主风险、最小合法前置、独立执行、独立证据、必要后置验证和精确 cleanup，并独立关闭自己拥有的活动场景。一个 Codex 任务可以包含多个风险一致、证据层相近且能分别收口的 Profile，但不因此共享可写 Report、BrowserContext、Session、数据库终态或 cleanup。

同一 Profile 保持证据原子性：同一 Git 代码态、同一最小前置、一次 Browser 执行、适用的 verifier 和一次精确 cleanup。Browser Profile 应有清晰单一职责；正常业务主链与低频 recovery / takeover / redo 等异常恢复原则上拆开，不用一条长 Profile 同时承担全部组合。已有低层测试充分覆盖的边缘恢复不要求在所有高层 Browser 主链重复排列。后续无关 Profile 失败，不得作废已经闭环的证据。禁止批次专属 runner、journal、aggregator 或完整 manifest，禁止把大量不相关状态塞入一次原子运行。

Browser Profile 不设置 assertion 数量 KPI。若一个 Profile 开始大量断言 API 非法组合、数据库内部状态、历史 revision、普通 copy、内部 count、fixture manifest 或其他不依赖真实浏览器的实现细节，必须重新评估并把对应事实下沉到更合适的 pure / unit、HTTP E2E、verifier 或 static gate；Profile 只保留与单一 Browser 主风险紧密相关的最小断言。

Profile 内的信息分为两类，不为此新增持久状态或第二套结果系统：

- **contract assertion**：本 Profile 明确负责的业务合同或 Browser 不变量；失败可以使 Profile fail。
- **diagnostic information**：为排错记录的内部 revision、事件计数、playback 计数或其他调试事实；若不是本 Profile 的正式合同，只能用于诊断，不能因为它与历史阶段的偶然值不同而使 Profile fail。

禁止把与业务合同无关的历史固定 revision、内部累计 count、合法产品行为产生的累计事件为 0，或与 Profile 主风险无关的内部统计设为门禁。真正的 cardinality 仍须精确验证，包括禁止副作用时新增数量必须为 0、at-most-once / exactly-once、重复提交只允许一次写入、禁止重复 Evidence，以及数量本身就是正式业务合同的情形；优先断言业务不变量、相对增量、actor / ownership、持久终态和受保护事实未漂移。

### 2.6 Browser 必须验证的行为与横切抽样

- Browser 准入必须满足 2.2 的不可替代事实问题，并使用 production frontend、真实 Browser test backend 和真实 HTTP；不得以 mock server、伪造响应或代码阅读替代。
- 高价值 Browser 事实包括：HttpOnly / SameSite / Secure / host 等真实 Session Cookie 语义；独立 BrowserContext 的身份、Cookie 与 Storage 隔离；登录、退出和 redirect 认证生命周期；reload 后从服务端权威事实恢复；原始 credential、entry code 或 token 不进入 URL、localStorage、sessionStorage、IndexedDB 等不应进入的客户端持久区域；浏览器文件选择与上传链；关键 keyboard / focus / role / accessible name 交互；真实 origin、CORS、credentials 和 Cookie 链；关键 UI 操作确实产生正确 HTTP 请求的最小 wiring；以及少量确需跨多层 UI 才能证明的黄金路径。只在相关能力变化或缺少可信现有证据时增加，不机械覆盖全部类型。
- 页面没有合法入口但公开 API 可直接调用的 401/403、Guard / Pipe、DTO whitelist、ownership、权限、状态门禁、重复提交、幂等、revision / CAS conflict、合法并发、原子写入、audit、数据库终态和非法调用无副作用，由 Backend HTTP E2E 承担主证据，不在 Browser 再模拟一次 HTTP 攻击。Browser 只在有价值时证明正常 UI 未暴露非法入口，或页面产生的请求 wiring 正确。
- `beforeunload` / refresh 不机械断言浏览器对话框是否出现、具体文案或浏览器 UI 形式。产品合同确实依赖离开保护时，优先验证未保存数据是否按合同保留、reload 后服务端权威状态是否恢复，以及是否发生真实数据丢失或无法继续；只有浏览器事件本身就是正式业务合同时才直接断言事件行为。
- 多角色或双 Session 使用独立 BrowserContext，不通过清除同一 Context Cookie 模拟隔离。
- 响应式代表范围为 390×844、800×1280、1280×800、1024×1366、1366×1024、1280×720、1536×864；宽表只允许局部滚动。
- 键盘证据使用真实 Tab、Shift+Tab、Enter、Space 与 `isTrusted=true` 事件，验证自然焦点顺序、focus-visible 和焦点进出。
- Axe 与 ARIA tree 用于代表性基础 A/AA、role、accessible name 和结构检查，不替代真实设备或专业判断，也不得机械把 `violationCount === 0` 设为所有业务阶段的统一完成条件。直接影响核心操作、表单 accessible name、键盘操作、标签或内容可理解性的 violation 必须当前关闭；非关键结构或语义项可以在明确风险与最终归属后进入工作包最终 accessibility 收口。

普通说明性 UI copy 不作为 Browser Profile 的阻断性 exact assertion，包括页面标题、副标题、帮助说明、普通 badge、介绍语和不构成正式稳定业务合同的操作提示。Selector 和断言优先使用 stable `data-testid`、role、对核心业务动作具有稳定语义的 accessible name、URL、Network、API 响应、服务端权威事实或必要 Browser state。安全确认、不可逆操作确认、用户必须据以判断关键业务状态的稳定文本、正式稳定错误合同，以及核心业务操作本身的稳定 accessible name，才可作为少数 exact 文本合同；普通 copy 变化不得触发 fixture、数据库 namespace 或整套 Browser runtime 重建。

不把浏览器品牌矩阵设为默认门禁。真实 Chrome / Edge 品牌兼容性、真实设备和主观操作体验默认归人工 smoke；只有存在明确浏览器品牌专属风险时，才按最低充分范围升级为自动化矩阵。

认证生命周期、logout/Cookie、Storage/URL 隐私、CORS、Console、DOM 敏感信息扫描、Axe、viewport、focus-visible 和不支持 Action 扫描，只在对应能力变化或缺少可信证据时附着少量真实流程；横切证据不得替代业务特有页面断言、错误恢复、请求次数或数据库终态。

GET aborted / canceled 本身不代表产品失败；只有必要读取因此无法取得且使业务状态不可达、用户无法继续或没有可信恢复路径时才阻断。Next prefetch、Playwright response / requestfailed 时序、内部取消顺序、测试鼠标坐标、runner 编排、Console 网络噪声或精确事件到达顺序，必须先归入对应测试层分类，不得在缺少稳定业务风险证据时反向要求 production 增加状态、锁、配置、API、重试或状态机。

#### 人工 smoke 独立职责

人工 smoke 负责自动化无法可靠判断的可理解性、可用性、真实操作感、视觉层级、布局和真实设备体验，包括用户是否知道下一步做什么、文案是否自然、关键流程是否令人困惑，音频、录音、手写、文件操作等真实体验，以及自动识别或辅助结果是否可能被误解为正式结论。重大用户流程、患者端、医护关键操作或交互模型发生实质变化时，应保留最低充分人工 smoke；纯后端、纯内部或没有用户可见行为变化的阶段不机械增加。

人工 smoke 不是自动化失败后的降级版，也不替代权限、DTO、状态机、并发、数据库终态或 Browser-only Cookie / Storage / Session 安全语义的自动化证据。人工实际使用 Chrome / Edge 或真实设备可以形成其明确范围内的人工证据，但不得虚报自动 Browser regression 已通过。

### 2.7 活动场景状态、失败与复杂度

活动场景只使用 `pending`、`passed`、`failed`、`blocked`、`not_executed`。只有全部必需子断言的主证据、必要支持证据、适用数据库终态与资源 cleanup 均实际通过，且无测试资产、环境或未执行项阻断时，场景才能标记 `passed`。

`unknown` 仅是命令已启动但没有可靠摘要、输出不完整或证据不足时的临时执行结论，不是活动场景状态；它不得关闭、通过或判失败场景。明确且持续的外部环境、工具或权限阻断才记 `blocked`；命令、选择器、权限或进程未启动导致目标没有实际执行时记 `not_executed`。exit code、测试文件存在、历史失败轮局部观察或 cleanup 成功均不能批量推导通过。

每轮先分类为 `product`、`spec/test`、`fixture`、`support/runner`、`environment`、`tool limitation` 或 `not_executed`，再修正对应层；这些是失败归因，不是新的活动场景状态，也不新增 `database/data-integrity` 平行来源：产品造成的数据完整性违例归 `product`，fixture 造成的测试数据错误归 `fixture`，数据库环境不可用归 `environment`。只有稳定复现且证明违反正式产品合同的行为才归类为产品缺陷。GET aborted、Next prefetch、Playwright response / requestfailed 时序、测试鼠标坐标和 runner 编排问题不能因自动化失败本身升级为产品 `gap`。

测试基础设施失败不等于产品失败，也不等于 Browser 通过。stale spec / fixture / support / runner、environment 或 tool limitation 不自动回退已经由其他仍适用证据证明的产品事实，但没有形成可信 Browser 证据时不得虚报 Browser passed：Browser-only 事实若已由仍适用的既有 Browser 证据或本轮可信人工真实浏览器 smoke 实际证明，可以准确记录“产品行为已验证；自动 Browser regression 未闭合，存在 test infrastructure debt”；若该 browser-dependent 行为没有任何可信实际证据，只能记录“未发现产品缺陷，但该 Browser 验证尚未形成可信证据”。该区分不新增项目持久状态枚举。

同一方案连续两轮因环境、fixture 或测试资产失败时不得第三轮同方案重跑；公共 support 连续影响两个场景或测试基础设施明显超过被测业务时停止扩张。每个 Profile 最多一次测试资产修复轮。首次失败已经可靠归类为同一类 stale test asset 时，可以在这唯一一次修复轮中，对当前 Profile 直接相关的 spec、support、selector 和 verifier 做边界明确的静态 sweep，一次清理同类 stale exact copy、失效 selector、历史 exact revision、过时内部 count 与已失效阶段边界假设，然后只重跑受影响 Profile 与必要关联证据。不得扫全仓库历史资产、越界重构 Browser infrastructure、把测试债务扩张成 production 状态机，或机械形成“发现一个旧字符串 → 单独任务 → 全 Profile 重跑”的循环；正式重跑若暴露稳定产品合同违例、数据完整性问题或另一类结构性 fixture / runner / environment 问题，再按现有止损规则停止并分类。

测试资产通用复杂度治理引用 `docs/codex-instruction-spec.md` 3.10。frontend/Browser 只补充：按职责内聚、重复基础设施、跨进程链路、独立状态、cleanup 责任、证据价值与维护成本判断；不得以物理行、非空行、净新增行或文件数量单独决定通过、失败、压缩或拆分。

## 3. Browser 专属稳定运行规则

### 3.1 Canonical Origin、Cookie 与构建输入

每个 Browser Profile 启动前必须核对页面 URL/origin、production frontend 实际构建使用的 `NEXT_PUBLIC_API_BASE_URL`、实际 API origin、后端 `CORS_ORIGIN`、Session Cookie host 和 backend health 地址：

| canonical host | 页面 origin | API origin / API Base | CORS origin | Cookie host | health |
|---|---|---|---|---|---|
| `localhost` | `http://localhost:3002` | `http://localhost:5002` | `http://localhost:3002` | `localhost` | `http://localhost:5002/health` |
| `127.0.0.1` | `http://127.0.0.1:3002` | `http://127.0.0.1:5002` | `http://127.0.0.1:3002` | `127.0.0.1` | `http://127.0.0.1:5002/health` |

- 同一认证链不得混用 `localhost` 与 `127.0.0.1`；CORS 必须精确匹配含 scheme 和端口的页面 origin。
- 当前 Session Cookie 未设置 `Domain`，属于 API 响应 host 的 host-only Cookie。只核对名称、host/domain、path、HttpOnly、SameSite、Secure 和是否存在，禁止输出 Cookie 值。
- `NEXT_PUBLIC_API_BASE_URL` 是 production build 的公开构建时输入；值变化后必须重新 build。只重启已有 server 不能证明新值生效，必须由实际 Network 请求确认。
- `BROWSER_ACCEPTANCE_FRONTEND_ORIGIN` 与 `BROWSER_ACCEPTANCE_BACKEND_ORIGIN` 只声明 runner 预期拓扑，不能覆盖已进入构建产物的 API Base。
- “前端生产代码发生变化”本身不是 fixture 修改或重建触发器。只有 DTO 必填字段、Schema、权限、服务端状态前置、seed / catalog 或其他合法数据前置合同真实变化时才调整 fixture；纯 UI copy、布局、selector、展示结构和不改变数据前置的普通交互变化，原则上只更新直接相关 spec / support。
- fixture 是否变化与 production build 是否 fresh 是两个独立判断。修改后的前端生产代码需要正式 Browser 动态验收时，必须基于当前最终代码态生成 fresh production build，并通过实际页面/Network 确认 Browser 正在运行该构建产物；不得因“不改 fixture”复用过期 frontend build，也不得因“需要 fresh build”反推 fixture 必须重建。

进入业务 Profile 前，在同一 BrowserContext 完成 health、页面 origin、登录 API origin/CORS、HttpOnly Cookie 存在以及 `GET /auth/me` 已认证读取的 preflight。任一项失败均不得进入业务场景；先修正环境与构建链，再按证据分类，不通过重试业务写请求或延长超时绕过。

### 3.2 进程、数据库与隐私边界

- production frontend 与 Playwright/Browser runner 的数据库用途必须为 `none`，不得直接连接 MongoDB。
- Browser test backend 使用 Browser app / `readWrite`；fixture、verifier、cleanup 使用 db_admin / `dbOwner`。具体数据库、进程与生命周期规则见 backend testing playbook。
- 每个 Profile 使用独立 BrowserContext；只关闭任务拥有的 Context、Session、Chromium、Node 进程、端口、runtime 和 test-results。
- 临床草稿、客户端可读凭据、内部 ID、完整响应和敏感对象不得进入 Storage、URL、DOM、Console、Network 日志、截图或产物。HttpOnly Cookie 只核对安全元数据。
- 不可逆 POST 不自动 retry、replay 或 polling。网络结果不确定时先只读核对服务端事实；只有明确用户动作才能再次写入。

### 3.3 正式运行结果持久化

正式 Browser 运行的最终状态不得只依赖 Codex 或终端 stdout。runner / support 应把当前 Profile 的最小、脱敏、可追溯结果写入 `.local/` 下该 Profile 独立的 runtime / result 位置，至少可靠保留 stdout / stderr 或等价运行日志和最终 exit code；确有必要时再增加最小机器可读 result summary。终端输出截断不得导致无法确认 runner 最终状态。

持久结果不得记录 Cookie、Session、token、数据库连接串、真实凭据、完整敏感响应或其他 Secret。本条是后续测试基础设施的长期实施要求；仅有本规则不证明当前 runner 已满足，也不得把尚未实施归类为产品缺陷或 Browser 已通过。

## 4. 当前证据索引

以下为已完成 Batch D 的紧凑索引。文件存在与本次只读核对只证明资产可定位，不表示本次重新动态执行；最终结果继承自所列 evidence commit 与 Git 历史。

| 批次 | 活动场景与最终状态 | P0 / 最终门禁 | 当前主要证据资产 | 最终 evidence commit | 持久合同摘要 |
|---|---|---|---|---|---|
| B12 | `B12-U01`～`B12-U03`；`passed=3`、`pending=0` | P0 `gap=0`；final gates 完成 | `backend/scripts/b12-u01-browser-fixtures.ts`；`frontend/test/browser-acceptance/b12/`；`frontend/test/browser-acceptance/contracts/b12-lock-non-browser.spec.ts`；`backend/test/clinical-report-lock.e2e-spec.ts` | `bba97ead5a2b7b673c002518ccdeeb44f08711d6` | 报告锁定闭环；认证失效和网络中止不自动重放；草稿仅在 React 内存 |
| B13 | `B13-U01`～`B13-U03`；`passed=3`、`pending=0` | P0 `gap=0`；final gates 完成 | `backend/scripts/b13-browser-fixtures.ts`；`frontend/test/browser-acceptance/b13/`；`frontend/test/browser-acceptance/contracts/b13-source-freeze-non-browser.spec.ts`；`backend/test/clinical-report-source-freeze.e2e-spec.ts` | `38b56daea38e53dbada0806863f9e13befac0c41` | `in_progress` 是正式恢复状态；精确 scope 与首次事实保真；网络不确定结果不自动 POST/latest |
| B14 | `B14-U01`～`B14-U02`；`passed=2`、`pending=0` | P0 `gap=0`；final gates 完成 | `backend/scripts/b14-browser-fixtures.ts`；`frontend/test/browser-acceptance/b14/`；`frontend/test/browser-acceptance/contracts/b14-archive-non-browser.spec.ts`；`backend/test/clinical-report-archive.e2e-spec.ts` | `335090c8ea5cb826c3f93e3419cb0c3980bb70fb` | A24 没有正式 `in_progress`；historical fallback 仅是兼容合同；首次归档与持久摘要闭环 |
| B15 | `B15-U01`～`B15-U02`；`passed=2`、`pending=0` | P0 `gap=0`；final gates 完成 | `backend/scripts/b15-browser-fixtures.ts`；`frontend/test/browser-acceptance/b15/`；`frontend/test/browser-acceptance/contracts/b15-correction-non-browser.spec.ts`；`backend/test/clinical-report-correction.e2e-spec.ts` | `6a5c55dbc926ddff534d1fb30e936395a531edae` | A25 正式 `in_progress` 恢复；correctionId 是内部标识，correctionNo 是用户可见业务序号；首次、更正恢复、network uncertain 与线性 replacement 均闭环 |
| B18-B1 | `B18-U01`～`B18-U03`；`passed=6`、`pending=0` | P0 `gap=0`；证据复用 | `backend/scripts/b18-browser-fixtures.ts`；`frontend/test/browser-acceptance/b18/`；B18-A 两个 contract spec；A29 / A30 既有 backend 证据 | 当前工作树（未提交） | trailing 自动保存、reload / beforeunload、双 Session 显式冲突选择、submit 生命周期关闭、offline/online 与响应丢失只读核对闭环 |
| B18-B2 | P4 / P5 / P6；`passed=6`、`pending=0` | P0 `gap=0`；final gates 完成 | `frontend/test/browser-acceptance/b18/p04-group-switch.spec.ts`、`p05-media-generation.spec.ts`、`p06-realtime-timing.spec.ts`；B18 局部精确 Gate；既有 fixture/verifier | 当前工作树（未提交）；P5 证据基线 `5479181da3840504fe0ddeeb15406e2e9b3e8010` | 切组 flush/无效草稿保留、媒体 generation 竞态、system/external timing 均闭环；B18 桌面自动化 `gap=0` |
| B18 补充验证 | P7 `passed=2`、P8 `passed=1`；single-flight contract `passed=3`；P3 `passed=2`；P9 `passed=1` | `gap=0`；验证闭合 | B18-A 两个 contract、P3/P9 spec、精确上传 abort support、既有 fixture/verifier；A29/A30 与 P1–P8 证据复用 | P9 基线 `e99c4a6dceab69aa2ab274dc99270a20a0797d39` 上的当前工作树 | reconciliation 采用逐题/attempt operation-level single-flight；P3 回归闭合；P9 证明上传网络中止后当前 React 会话文字与图片草稿保留，A14 独立保存且 A15 无副作用 |

### 4.1 B14.1 累计证据索引

B14.1 不是独立业务能力，不拥有独立 Browser 活动 ID，也不恢复大型组合 Browser suite。它只索引共享 façade、coordinator、reducer、identity isolation 与各业务动作的累计证据：

| 动作 / shared 合同 | 主证据归属 | 当前索引 |
|---|---|---|
| edit / submit / confirm | B11 | B11 当前 Browser 与合同证据 |
| lock | B12 | B12 Browser、lock Node-only 与 A22 HTTP E2E |
| source-freeze | B13 | B13 Browser、source-freeze Node-only 与 A23 HTTP E2E |
| archive | B14 | B14 Browser、Archive Node-only 与 A24 HTTP E2E |
| correction | B15 | B15 Browser、Correction Node-only 与 A25 HTTP E2E |

### 4.2 WP-10-F1 最终证据与 Browser Audit 治理

- 静态门禁：`presentation-assets:verify` 为 assets=22、steps=19、referencedAssets=22、assetHashes / stepBindings 均 ok；frontend 完整 lint、正式 `next typegen && tsc --noEmit` 与 `NEXT_PUBLIC_API_BASE_URL=http://localhost:5002` 的 production build 最终均 exit 0。typecheck / build 前确认 Node 与 3002 / 5002 listener 为 0，并以同一沙箱外身份写入 `.next`；没有 `EPERM`、未处理拒绝或异常。
- 审计治理：F1 曾过度追踪 GET abort 的 Browser 生命周期，现已删除 checkpoint、network snapshot identity、pending / deferred controlled abort、entryIndex ownership、候选与逐 stage 精确 abort 计数。F1 只在 Profile 结束前按各 BrowserContext 的完整 NetworkLedger / ConsoleAudit 结算业务合同，不修改公共 `network-ledger.ts` 或 `runtime-audit.ts`。
- canceled GET 只表示客户端取消，不再独立判为产品失败，也不按 path、initiator、resourceType 或次数细分；关键读取是否成功由 UI、HTTP response 与 post verifier 证明。mutation transport failure、GET timed_out / failed、任意 5xx、未知 4xx、未知 Console error 和 runtime / page error仍严格阻断。明确 expected 4xx 必须至少真实出现一次，不要求与 Console error 数量一一对应。
- F1-P1 正式运行唯一一次，1/1 通过：same-device create、七项本地准备、影响因素、preparation confirm 后真实 reload，并从服务端事实恢复“同设备不可逆安全交接”，随后 handoff、staff Session revoke、patient credential/current active、back fail-closed、Cookie/Storage/URL/DOM、accessibility、viewport、POST 次数与 F2/F3=0 均通过。staff audit 观察到 required GET 401 `/auth/me` 与 GET 404 staff root，无未知 HTTP / transport / Console / page failure；post 为 active revision 2，cleanup `residualCount=0`、runtime absent。
- F1-P2 正式运行唯一一次，1/1 通过：cross-device create、首患者兑换与本地准备、staff 看见 credential 后真实 reload，自动恢复 cross-device 且 same-device disabled；继续 preparation confirm、active、pause、resume、reissue、第二患者、resume、terminate。两次旧 credential 的 current 401 均恰好一次，超过一个 3 秒 poll 周期后仍为一次。staff / first patient / second patient 分别审计 required 401/404 或 current 401，无未知失败；post 为 terminated revision 8、完整 controlEvents，cleanup `residualCount=0`、runtime absent。
- 两个 Profile 均使用独立 namespace / BrowserContext、production frontend、真实 Browser backend、真实 HTTP 与 `cogmemory_ad_browser_test`；Storage=fake、ASR/LLM/SMS=stub。真实设备、真实麦克风和真实触控笔仍为 `not_executed`，桌面 Browser 的 unsupported / permission-unavailable 分支与 Pointer 练习不得冒充真实硬件验收。
| shared façade / coordinator / reducer / identity isolation | 跨 B11～B15 | `frontend/test/browser-acceptance/contracts/clinical-report-workflow-shared-non-browser.spec.ts`；稳定 `reportId`、route RESET、unexpected identity 隔离、expected correction transition 保真、identity generation、layout barrier、单一 writingRef/latest/beforeunload |

### 4.3 WP-10-F2 阶段与最终收口证据

- F2-P1 已实际完成正常 MMSE 19 步正式患者施测主流程：服务端权威 currentStep、一步一屏、private image / frozen MP3、guidance / stimulus 播放边界、MediaRecorder 语音证据、handwriting / photo、patient / staff complete 与 completed 安全结束均通过正式 Browser 业务链。
- P1 post verifier 已通过：患者会话 `completed`，有效 capture 为 19/19，`MediaEvidence=17`（audio=15、handwriting=1、photo=1），`ItemResponse` 与 `ScaleInstance` 事实 unchanged，score / domain / report 等 downstream=0。F2 未写正式 ItemResponse，也未调用 F3 review / ASR / submit / scoring / report。
- technical replay 的持久授权事实与 current response 投影已由 backend unit / HTTP E2E 证明 `false → authorize → true → replay → false`；frontend 已消费显式 `technicalReplayAuthorized`。该边缘状态已有最低充分低层证据，不为 F2 增加第三个 Browser Profile；真实人机体验可在最终真实设备 smoke 观察。
- F2/F3 阶段隔离已收紧：`PatientAdministrationStaffPanel` 只把最新服务端权威 session status（无 session 时为 `null`）通过可选 callback 通知父页面；父页面在 patient / visit / scaleInstance 身份变化时先重置，并仅在 status=`completed` 时挂载 `PatientAdministrationReviewPanel`。没有新增 GET、API、轮询、Context/store 或第二份 session 状态源；ReviewPanel 原有一次加载 + 手动刷新逻辑不变。
- 最终静态门禁：frontend `npm run lint`、正式 `npm run typecheck`（`next typegen && tsc --noEmit`）与 `NEXT_PUBLIC_API_BASE_URL=http://localhost:5002` 的 production build 均 exit 0；typecheck/build 前 Node/Next 与 3002/5002 listener=0，二者使用同一沙箱外身份写 `.next`，输出无 `EPERM`、Unhandled Rejection 或 uncaughtException。F2 fixture 因实际暴露共享 canonical MMSE seed conflict 做最低修复后，定向 ESLint 与 backend `npm run typecheck` 均 exit 0；未修改 backend `src`。
- discovery：F2-P2 与 F3 happy path 各自 `npm run test:browser:list -- <exact spec>` 均 exit 0，分别精确发现 1 file / 1 test，没有带入 P1、F1 或其他 Browser suite。
- fixture 诊断与修复：旧 F2 fixture 对已经物化且与 current seed 有差异的共享 MMSE 1.0 再执行 materialize，实际返回 `SCALE_CATALOG_VERSION_CONFLICT`；失败轮均先只读核对 namespace 根记录为 0。最终 fixture 只读解析并验证既有 active MMSE 1.0 catalog，再通过现有 execution plan 创建 namespace-owned instance/items；不修改共享 catalog，cleanup 仍只删除本 namespace。该修复没有建立新 fixture framework、API、Schema 或生产状态机。
- F2-P2 最终正式 Profile 使用 fresh namespace `f2p2f83a7d2e`，production frontend、真实 Browser backend、Chromium、真实 HTTP 与 `cogmemory_ad_browser_test`，1/1 通过（47.0s）。upload 成功但 Step 1 未完成时真实 reload，随后从服务端 current 恢复且 Evidence upload 总数不重复；localStorage/sessionStorage/IndexedDB 无业务草稿或凭据。Step 2 pause + takeover 后恢复，Step 3 新 run 上传并完成，pause + redo 后旧 run 失效且旧 Evidence 不自动上传或满足新 run，最后 terminate 并使患者 credential 失效、超过 poll 周期不再继续 current。
- F2 全流程的 review GET、transcribe、adopt、A14、readiness 与 A16 均为 0；既有 mutation 次数/body-key、NetworkLedger 与 ConsoleAudit 全部通过。由此证明 prepared / active / paused / terminated F2 不进入 F3。
- staff Axe 首轮实际为 `color-contrast` / serious / nodeCount=135 与 `definition-list` / serious / nodeCount=1。`color-contrast` 直接影响文字可理解性，分类为阻断：最低修复 blocking submission detail 的前景色、active 分组次级文字和 warning token，fresh F2-P2 复验后该 rule 消失。最终为 `violationCount=1`，仅 `definition-list` / serious / nodeCount=1；它对应信息卡 `<dl>` 内的分组 `<div>`，不影响核心操作、accessible name、键盘、标签、焦点或内容理解，分类为非阻断结构语义项并保留，不以 Axe=0 为目标重构页面。
- F2 final post verifier exit 0：session=`terminated`、revision=21、capture=3（valid=2、invalidated=1）、`MediaEvidence=2`、duplicate=0、takeover / redo / terminated 控制事实齐全、原 run invalidated、`ItemResponse` / `ScaleInstance` unchanged、downstream=0。服务停止后精确 cleanup 删除 namespace-owned 记录，`residualCount=0`、runtime descriptor absent；3002/5002 listener=0。
- 真实设备、真实麦克风、真实触控笔及真实 OSS 患者上传仍不由桌面 synthetic microphone Browser 冒充；设备与人工验收继续归属既有 Batch E / WP-08。真实 ASR 不属于 F2 完成门禁。

F2 阶段完成当时“下一阶段为 F3”的历史语义已经由 4.5 的 F3 证据兑现；截至本最终收口，F2-P2、staff Axe、completed gate 后 F3 回归与全部 verifier / cleanup 均已闭合，WP-10 已完成，下一工作包为仍待开始的 WP-11。

### 4.4 WP-10 F3 前最低实现对齐证据

- `f2-p1-mmse-complete.spec.ts` 已同步长期 happy path 合同：第 14 步录音 evidence 后 patient complete，第 16 步保持“请闭上您的眼睛”、无录音与无新 audio POST 后 patient complete，第 17 步 stimulus 正常播放、无 evidence upload 后 patient complete；ledger 长期期望为 patient complete=19、staff complete=0。
- 本对齐不重跑完整 F2 Browser，不重做 F2 Audit、不修改 Axe、不运行 P2，F2 仍为完成。底层行为由 backend 定向 unit / HTTP E2E 证明；frontend lint、含 `next typegen` 的正式 typecheck 与 canonical production build 均退出 0。
- Windows `.next` 写入门禁中，执行前沙箱外只读核对本项目 Node/Next 进程为 0、3002 监听为 0；typecheck 与 build 随后均以同一沙箱外执行身份写入 `.next`，输出无 `EPERM`、Unhandled Rejection 或 uncaughtException。
- 结论（F3-pre 当轮历史）：该轮只完成 F3 前最低实现对齐、未实施 F3；F3 的后续完成证据见 4.5。当时 WP-10 尚待 F2-P2 与 staff Axe，现已由 4.3 的最终证据闭合。

### 4.5 WP-10-F3 正常作答复核证据

- 静态门禁：frontend `npm run lint`、正式 `npm run typecheck`（`next typegen && tsc --noEmit`）与 `npm run build` 均 exit 0；backend 新增 fixture 的定向 lint 与正式 `npm run typecheck` 均 exit 0。`.next` 写入前有效只读探针确认 Node=0、3002/5002 listener=0，typecheck / build 使用同一沙箱外身份；输出无 `EPERM`、Unhandled Rejection 或 uncaughtException。
- discovery：`npm run test:browser:list -- test/browser-acceptance/wp10-f3/f3-happy-path.spec.ts` exit 0，精确发现 1 file / 1 test，没有 F1/F2 或其他 profile。
- fixture：使用 namespace `f3a0811`、同一 Git ignored 固定测试密码与 `cogmemory_ad_browser_test` 管理身份；prepare / verify-prepared 均通过，前置为 11 个 ItemResponse、19 个 review step、17 个既有 MediaEvidence（audio=15、handwriting=1、photo=1）和 completed Session。共享 Browser MMSE 目录未被覆盖；fixture 使用当前 seed 建立 namespace-owned 临时 ScaleVersion，并在 cleanup 精确删除。
- 运行拓扑：production frontend `http://localhost:3002`、真实 Browser backend `http://localhost:5002`、Chromium 与真实 HTTP；backend 使用 Browser app 身份、Storage=fake、ASR/LLM/SMS=stub。runner / frontend 显式不继承数据库变量或 fixture password，登录只注入同一固定 secret 且不输出值。两项 health/readiness 均为 200。
- 唯一 happy path 最终 1/1 通过（9.1s）：初始 review 仅 GET 一次且无 polling，操作前 transcribe/access-url/adopt 均为 0；页面展示 completed session、影响因素、19 step、15 audio、1 photo、1 handwriting、`staff_observation` responseMode，正常 reading-command 没有伪造 `staffObservation`。用户显式产生 1 个 transcribe POST、1 个 access-url GET、1 个 adopt POST；ASR 候选明确不是正式答案，adoption 复用同一 Evidence 并更新父页面 requirement / readiness stale，两者都不触发 A14。
- 正式编辑 / 提交：定位 drawing 与 reading 的既有 ItemResponseEditor，reading 通过现有 A14 以 `expectedRevision,markAsAnswered,rawResponse` 单次 PATCH 保存；readiness 由既有 SubmissionPanel 返回 ready / canSubmitNow 且 blocking=0；A16 以 `{confirm}` 单次 POST 完成实例。completed 后 review 仍可读，ASR / adopt 按钮禁用；只发生预期 latest score GET 404，没有评分、认知域或报告写入。transcribe / adopt Body 为空且所有目标写请求均无自动 retry。
- post verifier exit 0：ScaleInstance=completed、Session 权威事实不变、MediaEvidence 仍为 17 且没有新建、仅目标录音 transcription 改变一次、adoption 引用精确复用原 Evidence ID且答案/status/revision 不变、reading 为 raw=true / answered / revision+1、其余 9 题答案事实不变、downstream=0、namespace 外事实不变。
- cleanup：先由原运行句柄停止 frontend/backend，随后确认 Node=0、3002/5002 listener=0；精确 cleanup 删除 namespace-owned user/patient/visit/instance、11 items、1 patient Session、17 media、1 auth Session 与 1 临时 ScaleVersion，`residualCount=0`、runtime descriptor absent。该 F3 首轮当时未执行 F2-P2、staff Axe、完整 Browser suite、F2 19 步 UI 重放、真实 OSS、真实 ASR、真实设备与无关 backend 全量回归；F2-P2 与 staff Axe 的后续证据见 4.3，其余边界保持原归属。
- completed gate 受影响回归：最终代码态使用独立 namespace `f3g6c2d9a1e` prepare / verify-prepared 后，StaffPanel 读取 completed session 并回传 status，ReviewPanel 正常出现且 review GET 正常发生；既有 happy path 1/1 通过（8.6s），显式 ASR、on-demand access-url、same Evidence adoption、定位既有 ItemResponseEditor、A14、readiness 与 A16 均保持。post verifier 为 ScaleInstance=completed、Session unchanged、MediaEvidence=17/new=0、目标 transcription=1、same Evidence adoption、reading revision+1、其他 9 题 unchanged、downstream=0、namespace 外 unchanged；cleanup `residualCount=0`、runtime absent。

## 5. B18-A、B18-B1、B18-B2 与补充验证证据

- 精确 contract discovery：`b18-item-response-autosave.contract.spec.ts` 为 30 项，原 27 项没有删除或弱化；与 20 项 `b18-item-response-timer.contract.spec.ts` 合计 50 项。两个文件不声明 page、context、browser 或 browserName fixture。
- Autosave contract：`frontend/test/browser-acceptance/contracts/b18-item-response-autosave.contract.spec.ts`，30/30 通过。除既有 debounce / max wait / 串行 / trailing / cleanup、序列化、冲突与网络分类外，新增 3 项正式证明 pending single-flight、读取失败后的显式重试释放和 initialize stale run 失效；没有真实 HTTP。
- Timer contract：`frontend/test/browser-acceptance/contracts/b18-item-response-timer.contract.spec.ts`，20 项通过。使用普通对象与固定 wall-clock 验证状态转换、elapsed、checkpoint、manual / imported 和同一逐题队列；没有启动 Browser。
- 本次静态门禁：frontend `npm run lint`、正式 `npm run typecheck`、固定 API Base 的 production `npm run build` 均 exit 0；P9 精确 discovery 为 1 file / 1 test，完整 Browser discovery 为 172 tests / 39 files。正式 typecheck / build 前确认系统 Node / Next 与 3002 / 5002 listener 均为 0，并以同一沙箱外身份写入 `.next`；输出未出现 `EPERM`、未处理拒绝或异常。backend `src`、fixture、P1–P8/support 均未修改，因此未机械重跑 backend 静态、unit 或 HTTP E2E。
- 数据与运行边界：P3/P9 使用 production frontend、真实 Browser backend、Chromium、公开 HTTP 与 `cogmemory_ad_browser_test`；runner/frontend 未继承数据库变量或 fixture Secret。A29 / A30 后端 unit、HTTP E2E、CAS、媒体隔离、提交屏障与隐私证据直接复用。托管服务单元终止后遗留的本任务 Node 子进程均先按 PID、启动时间、命令和端口核对归属，再精确停止；最终端口、进程、runtime 与 namespace residual 为 0。
- B18-B1 discovery 与 Profile：三个目标 spec 精确发现 6 项，分布为 P1=1、P2=3、P3=2；三个 Profile 分别使用独立 namespace、production frontend、Browser test backend、真实 HTTP 与 `cogmemory_ad_browser_test`，均完成 prepare、prepared verify、Browser、post verify、cleanup，最终 runtime / namespace / 端口 / 进程 / test-results residual=0。
- P1 核心自动保存：真实 gate 证明单题最多一个 active PATCH，trailing edit 形成第二个 PATCH，两个请求均只含 `expectedRevision` / `responseText` 且状态 200，revision `0→1→2`；dirty navigation 触发 beforeunload 并 dismiss，clean reload 无对话框，reload 只恢复服务器事实，Storage / Cookie / URL 无草稿持久化。
- P2 冲突与生命周期：两个真实独立 Session 形成 409 冲突；server choice 不补写，local choice 仅以最新 revision 显式补写一次且无 retry loop。代表性 390×844 冲突 UI 无全局横向溢出，键盘事件可信、focus-visible 生效、alert / 非颜色状态明确，focused Axe serious / critical 为 0。readiness=true 场景中 doctor 只提交一次，nurse 延迟 PATCH 得到 `SCALE_INSTANCE_NOT_EDITABLE`，本地值保留且控件只读；verifier 确认 completed、唯一 doctor submission audit、目标草稿业务状态未变且无评分 / 认知域 / 报告副作用。
- P3 网络恢复本次回归：全新 Profile 2/2 通过。真实 `BrowserContext` offline/online 各触发一次事件；离线期间 PATCH=0，联网后仅 PATCH=1。响应丢失场景上游 PATCH=1 且 200、浏览器写尝试=1、首次 reconciliation GET 受控中止=1、人工 reconciliation GET=1，最终 revision+1，全程无 PATCH replay 或伪造 business response。prepared/post verifier 均通过，两个场景实例仍为 draft，score/domain/report/media 均为 0，cleanup `residualCount=0`、runtime absent。
- P4 切组：2/2 通过；valid 场景对目标题目的精确 PATCH URL 与 `expectedRevision` / `responseText` 白名单 Body 使用 one-shot Gate，summary 为 matched=1、continued=1、aborted=0。切组时目标草稿立即 flush，目标请求持有期间已进入另一分组，两个独立题目各一次 PATCH、各 revision+1、各自最大 active PATCH=1；invalid 场景首次切组 PATCH=0，合法原因补齐后恰好一次 PATCH、revision+1，未自动 answered。prepared/post verifier 与 cleanup `residualCount=0`。
- P5 媒体 generation：不机械重跑；只读确认 `p05-media-generation.spec.ts`、`b18-upstream-response-gate.ts`、`b18-browser-fixtures.ts`、媒体生产代码与公共 Browser support 相对完整基线 `5479181da3840504fe0ddeeb15406e2e9b3e8010` 均零变化，复用该基线已锁定的 2/2 Browser、prepared/post verifier、cleanup `residualCount=0` 证据。两个 A14 上游各一次且 200，upload、void、reupload 通过真实公开 UI/HTTP，revision 各+1，最终 active MediaEvidence=1，旧媒体 voided、新媒体 attached，evidenceRef 与相邻/受保护事实保持。
- P6 实时计时：2/2 通过；system 精确 Body Gate 只匹配 `expectedRevision=R+1` 且 running/system、durationMs≥15000、锚点完整的 checkpoint，trailing pause 不计入 summary；实际 checkpoint wall-clock 为 15,694ms，5 次 PATCH 依次为 start、checkpoint、pause、resume、complete，revision+5、最大 active PATCH=1。external 两次 reset 均发送 timing=null，manual/imported 只形成 completed，revision+5；键盘、focus-visible、800×1280 viewport 与 focused Axe 通过。prepared/post verifier 与 cleanup `residualCount=0`。
- Reconciliation single-flight：`AutosaveEntry` 以内存 `{attemptId,promise}` 标识活动 run，同 attempt 的自动核对、两次 retry 与一次 online 复用同一操作。正式 contract 证明 pending 期间 `readLatest=1`、PATCH=1、committed 接受=1，最终 clean 且服务器 revision=5；首次读取已失败后一次显式 retry 启动第二次读取，第二次 pending 的重复 retry/online 不启动第三次；initialize 会 abort 旧 Controller，旧结果不调用 summary/accept，也不覆盖 revision=20 的新基线，新 entry 随后可正常完成新 run。single-flight 产品 gap 已关闭。
- P7 显式操作：2/2 通过且未使用资产修复轮。“保存草稿”在 debounce 前仅发送一次 A14 PATCH，Body keys 为 `expectedRevision,responseText`，revision+1，status 仅从 not_started 进入 in_progress，answered/progress 不变，重载恢复服务端事实且无第二次 PATCH。“保存并标记本题完成”直接使用合法预保存草稿，仅发送一次 `expectedRevision,markAsAnswered`，revision+1、status=answered、answeredItemCount+1，无 trailing、submit、score、domain 或 report。两个独立业务根的 post verifier 均通过，cleanup `residualCount=0`。
- P8 running 重载：首次执行因公开 API 将数据库 timing=null 规范化为 idle/none 对象而在首写前失败；使用唯一一次测试资产修复轮后 1/1 通过。start/reload/checkpoint/pause 的 PATCH 数为 3，`expectedRevision=[R,R+1,R+2]`，重载保持服务器 startedAt/lastResumedAt 且不二次 start，显示继续增加；checkpoint wall-clock=15,214ms，最终 paused/system、revision+3、最大 active PATCH=1。post verifier 证明 answered 不变、实例 draft、衍生产物为 0，cleanup `residualCount=0`。
- P9 媒体失败：1/1 Browser 通过。图片采集区从目标题目内 exact 可访问文件输入“选择已有图片”开始，断言输入 count=1，再以 `xpath=ancestor::section[1]` 取得最近祖先 section 并断言 count=1；exact level-5 heading、待上传预览和上传按钮均限定在该 section。证据要求继续从当前 article 内 exact region“证据要求”取得唯一 photo listitem，并核对 exact“图片”“待记录”“服务端标识：未关联”。真实上传 POST=1，精确 abort matched=1 / aborted=1 / continued=0，Browser backend upload response=0，requestfailed=1；错误 alert 可见，文字值、已处理图片草稿与预览保留，上传按钮恢复 enabled。A14 PATCH=1、status=200、Body keys 仅为 `expectedRevision,responseText`、revisionDelta=1，超过 debounce 后无第二次 PATCH。prepared/post verifier 均通过：MediaEvidence=0、evidenceRefs 不变、photo requirement=pending、answeredItemCount 不变、实例保持 draft，score/domain/report=0，protected/adjacent facts matched；cleanup `residualCount=0`、runtime absent。
- 最低充分 Storage 证据：development / Browser fake Storage 是进程内测试 Driver，产品没有公开 Storage 管理或对象计数 API；A30 HTTP E2E 已提供 fake Storage 调用集与补偿证据，P5 Browser 已提供真实上传、MediaEvidence、evidenceRef 与终态证据。因此不增加 test-only endpoint、生产 hook、Driver introspection 或跨进程对象计数；该候选按已有精确证据复用关闭，不构成独立剩余产品 gap。
- 完成边界：A29/A30、B18-A 原 47 项、B18-B1 P1/P2、B18-B2 P4–P6、P7 2 项与 P8 1 项继续复用；single-flight 3 项、P3 2 项与本次 P9 1 项均已关闭，自动化 `gap=0`。B18 补充验证闭合，WP-03 按当前 roadmap 锁定范围完成；Batch E 的 8 项真实设备或人工项目保持原 ID 和待验状态，最终主要归属为 WP-08。

## 6. Batch E：真实设备或人工验收

以下稳定 ID 不属于桌面自动化范围，也不得被桌面 viewport、鼠标 Canvas 或普通 automated 测试替代；它们与当前 B18 自动化 gap 分离，全部保持 `pending`，当前主要归属为 WP-08。它们是历史待验候选，不是 WP-08 永久且完整的最终清单：

| 验证 ID | 当前状态 | 执行边界 |
|---|---|---|
| `B5-MV-008` | 待验 | 原合同分类为真实设备/人工项，不并入桌面媒体校验结论 |
| `B5-MV-028` | 待验 | 原合同分类为真实设备/人工项，不由桌面 mouse-only handwriting 覆盖 |
| `B5-MV-029` | 待验 | 原合同分类为真实设备/人工项，不由桌面 mouse-only handwriting 覆盖 |
| `B5-MV-058` | 待验 | 只恢复当前合同已有的真实设备或人工验收意图 |
| `B5-MV-059` | 待验 | 只恢复当前合同已有的真实设备或人工验收意图 |
| `B5-MV-060` | 待验 | 只恢复当前合同已有的真实设备或人工验收意图 |
| `B5-MV-061` | 待验 | 只恢复当前合同已有的真实设备或人工验收意图 |
| `B5-MV-062` | 待验 | 只恢复当前合同已有的真实设备或人工验收意图 |

WP-08 启动时必须依据 WP-10、WP-11、WP-12 的最终患者施测合同、标准触控设备和真实使用流程重新执行真实设备与人工候选的阶段 A/B/C。当前仍适用的项目保留原 ID；被新流程替代、与新增候选重复或已不可达的项目可以明确标记为 `superseded` 或 `retired`，但必须记录原因和替代证据；患者语音、具备触摸功能的电脑大屏、跨设备安全进入、医生接管、患者可读性等新增必要候选按最终合同纳入。不得静默删除、更换或合并历史 ID。WP-08 的完成标准是最终适用候选全部关闭，不是机械关闭当前 8 项；本次治理不改变这 8 项的当前数量、`pending` 状态、历史 ID 或既有 evidence。

## 7. 后续维护规则

- 只有 active / pending 批次保留详细场景设计；批次完成后收缩为当前状态、证据资产、evidence commit 与持久合同摘要。
- 逐轮命令、精确耗时、失败过程、旧编号全文、迁移表和完整合同表由 Git 历史承担，不搬入新文档。
- 只有影响性产品代码、接口、配置、测试基础设施或产品合同变化时，才按实际影响重新展开风险与证据设计；未变化事实复用现有精确证据。
- Browser 活动场景的主证据、必要支持证据、适用 verifier 和 cleanup 均通过后才能关闭；静态存在核对不得冒充动态通过。
- 数据库用途、fixture、verifier、cleanup、Stage 和后端定向命令以 backend testing playbook 为准。
- testing playbook 与 roadmap 已同步：B18 补充验证闭合、自动化 `gap=0`，WP-03 已完成；Batch E 的 8 项保持 `pending` 并主要归属 WP-08。
