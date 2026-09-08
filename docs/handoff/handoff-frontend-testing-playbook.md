# CogMemory AD / 智忆评 前端验证手册

## 1. Scope / Owner

本文是 CogMemory AD 前端项目级 Risk Classification、evidence hierarchy、Browser evidence、scripted / Agent-assisted / Human execution mode、Browser profile admission、Failure Attribution、Browser stop-loss 与当前人工 / real-device 验收边界的 Owner。通用验证候选生成、初始 / 增量 A/B/C、候选归属、即时验收、覆盖对账及实现单元 / 工作包完成治理由 [Codex instruction spec](../codex-instruction-spec.md) §3.9 维护；本文不复制其完整规则。

Browser/test infrastructure 的通用复杂度治理由 [Codex instruction spec](../codex-instruction-spec.md) §3.10 统一维护；本文只维护前端 / Browser 项目级准入、执行模式和 stop-loss，不复制其通用正文。

后端 Jest / HTTP E2E runner 与命令、Database Purpose、fixture、verifier 和 cleanup 由 [Backend Testing Playbook](./handoff-backend-testing-playbook.md) 维护；产品范围、WP 状态与当前主线由 [Roadmap](./handoff-roadmap.md) 维护。当前 route、组件与 UI/UX 事实分别见 [Frontend Route Map](./handoff-frontend-route-map.md)、[Frontend Component Map](./handoff-frontend-component-map.md) 与 [Frontend Design Baseline](./handoff-frontend-design-baseline.md)。

本文维护当前证据职责和选择规则，不维护逐轮执行日志、完整 historical evidence index、完整 spec inventory 或 deterministic CI / Browser 历史通过台账。

当前 physical Browser baseline：

- `@playwright/test` 当前仅运行 `frontend/test/contracts/` 的 pure/static contracts，不启动 Browser；current scripted deterministic real-Browser executable inventory = 0。
- future scripted Browser 候选须按 §2.5 重新 qualification 后，建立最低充分 non-UI Browser semantic micro-profile；canonical path 为 `frontend/test/browser-semantics/`，当前该目录不存在，也没有必须长期保留的合格 executable。
- 已退役 scripted UI / historical Browser framework 不属于 current executable inventory，不恢复其 scripted UI body；历史作用与历史通过由 Git 追溯，不作为 current dynamic green。
- objective production UI 默认使用 Agent-assisted；subjective / professional / real-device 使用 Human，具体资格、执行模式与 stop-loss 见 §2。

## 2. 当前测试设计规则

长期分层总原则：能不用真实浏览器证明的事实，不使用 Browser 作为主证据；只有证据本身依赖真实浏览器语义，或必须证明 production 页面到真实 HTTP 的最低充分 wiring，才进入 Browser。进入 Browser 后仍先区分 assertion target：non-UI Browser semantic 才可评估 scripted deterministic regression；客观 production UI semantic 默认使用 Agent-assisted interactive Browser smoke；可理解性、自然性、视觉层级、专业判断与真实设备 / 硬件体验由 human manual / real-device smoke 负责。Browser 不是全量业务回归框架，也不是所有 UI 可达风险的默认最高层；最低充分不等于削弱安全、权限、数据完整性和关键业务合同，而是把自动化证据放到职责准确的层级。

### 2.1 通用候选与完成治理引用

通用验证候选生成、必要性、可达性、已有证据复用、初始 / 增量 A/B/C、候选归属、完成治理与覆盖对账统一遵循 [Codex instruction spec](../codex-instruction-spec.md) §3.9；本文不维护第二套候选来源 checklist、A/B/C lifecycle 或完成合同。

Frontend Testing Playbook 只在 §2.2 及后续章节维护 CogMemory AD 前端项目级 Risk Classification、evidence classes、Browser qualification、execution mode 与 Human / real-device 边界。

### 2.2 可达性、风险与最低充分证据

系统生成后的候选风险必须先分类，再决定是否进入强制验收：

| 分类 | 判定边界 | 最低充分主证据 |
|---|---|---|
| `ui_reachable` | 当前正式页面可由正常人工操作触发；只说明风险可从 UI 触达，不等于允许 scripted Browser | 先按待证明事实选择 frontend static / pure、HTTP E2E、database verifier 或 Browser evidence；客观 production UI Browser evidence 默认 Agent-assisted，主观 / 专业 / 真实设备事实归 human |
| `public_api_reachable` | 页面无入口，但公开 API 可由 Postman、curl 或自编客户端调用 | HTTP E2E 验证认证、权限、DTO、ownership、状态门禁、错误码与数据库无非法副作用；不另建 Browser 场景 |
| `legitimate_concurrency` | 两个合法用户、标签页、Session 或请求可通过正式页面或公开 API 形成 | HTTP E2E 验证原子性、幂等、写入次数与数据库终态；不可替代的客观 UI 恢复交互默认由 Agent-assisted 补证 |
| `internal_corruption_only` | 只能直接改库、伪造内部对象、篡改运行时或损坏历史数据形成 | 默认不进入业务批次；可保留廉价 pure/unit 防御证据，只有正式导入、迁移、兼容合同、已知事故或明确合规要求才升级 |
| `manual_or_real_device` | 自动化无法可靠替代的真实设备、相机、触控笔、手写、打印或专业判断 | 明确的 human manual / real-device 验收；不得伪装为桌面 Browser 已通过 |
| `general_gate` | lint、typecheck、build、discovery、依赖、路由所有权、数据脱敏等 | 最终代码态或对应层变化后按影响范围执行；不创建业务 Audit ID |

通用候选必要性、可达性、已有证据复用与验收优先级遵循 [Codex instruction spec](../codex-instruction-spec.md) §3.9；前端 / Browser evidence 选择顺序：

1. 判断风险是否涉及临床数据完整性、不可逆动作、权限、安全、隐私、恢复或已知回归，且是否足以阻断发布。
2. Q1：不用真实 Browser 能证明吗？能则选择 lower layer；不能才进入 Browser evidence。
3. Q2：必须 Browser 时，assertion target 是 Browser semantic 还是 UI semantic？BrowserContext、Cookie / Storage、origin、CORS / credentials、必要 lifecycle 或独立 Browser-native primitive 等 non-UI semantic 可以继续评估 scripted；页面结构、控件、文案、locator、interaction topology、用户 workflow 或页面级 restore 体验等客观 UI semantic 默认 Agent-assisted。
4. Q3：是否需要可理解性、自然性、视觉层级、专业判断或真实设备 / 硬件体验？需要则归 human manual / real-device；Agent 不可用或 manual 本身是合同要求时，客观 UI 也按实际 execution mode 由 human 执行。
5. 最后设计最小合法前置、场景和断言；禁止先扩张断言再反向建设 fixture。

Browser evidence 的项目级职责：

- **Happy Path UI Smoke**：需要真实 production UI 的客观正常主链默认由 Agent-assisted 执行；主观、专业或真实设备部分由 human 执行。
- **高价值 non-UI Browser 防御**：真实 Cookie / Storage / Session / BrowserContext isolation、CORS / credentials 和必要 lifecycle 可由薄 scripted profile 证明；页面级 reload 恢复、关键 UI wiring、凭证失效后的用户操作与页面恢复交互属于 UI，默认由 Agent-assisted 补证。重复提交、权限绕过、stale write、合法并发和数据库终态以 HTTP E2E / verifier 为主证据。
- **少量代表性恢复**：按实际合同选择 refresh、pause / resume 或 recovery 等代表性路径，不排列所有恢复组合，也不在每条主链重复已有低层精确证据。

业务风险守恒针对真实可达风险、不可替代状态语义和安全边界，不针对历史 Audit ID 数量、层级组合或顺序。同一风险只在最合适层作为主证据；代码阅读不等于动态通过，页面文本不替代数据库终态，fixture E2E 不冒充产品 Browser。Browser 收缩不得删除认证、授权、ownership、DTO 白名单、不可逆状态门禁、幂等、合法并发、隐私或数据库无副作用证据。

### 2.3 证据层职责

| 证据层 | 主职责 | 不可替代边界 |
|---|---|---|
| `backend_unit` | 局部判断、DTO、Service 分支、mapper、状态边界与廉价防御 | 不证明真实 HTTP、Guard 或数据库终态 |
| `backend_http_e2e` | 公开 API 绕过与合法并发的认证、权限、Pipe、Body、ownership、状态机、幂等、原子性和数据库终态 | 不证明页面真实交互 |
| `frontend_static_or_pure` | 展示映射、Action ownership、局部资格与非阻断防御 | 不证明真实输入、Browser API 或后端动态行为 |
| `browser_evidence` | non-UI BrowserContext / Cookie / Storage / origin / CORS / credentials / lifecycle / Browser-native primitive，或必须由 production UI 观察的客观行为与真实设备事实 | 先区分 Browser semantic 与 UI semantic，再选择 scripted、Agent-assisted 或 human；不替代服务端非法调用、服务端合同或数据库终态 |
| `database_verifier` | 仅在现有 HTTP E2E 不足时补充 Browser 写入次数、audit、protected roots 或持久终态 | 不重复准确 HTTP E2E，不替代页面体验 |
| `static_gate` | lint、typecheck、build、discovery、依赖与路由边界 | 不证明业务运行，不创建业务 Audit ID |

#### Browser 证据的执行模式

Browser evidence requirement 与 execution mode 分离：“需要真实 Browser 参与”不自动要求维护 Playwright 或其他 scripted regression。项目使用以下三种模式；它们不是新的活动场景状态，场景仍只使用 2.7 的既有状态：

| 执行模式 | 适用价值 | 证据语义与边界 |
|---|---|---|
| scripted deterministic Browser regression | 仅用于 non-UI Browser runtime / network / origin / isolation semantic，包括独立 BrowserContext / Cookie / Storage、CORS / credentials、必要 lifecycle、独立 Browser-native primitive 与最低充分真实 topology wiring | main assertion 不得依赖 production UI structure、copy、locator、component hierarchy、interaction topology 或 user workflow；稳定 UI、短流程、可靠 selector、golden path 或 CI 要求均不构成例外 |
| Agent-assisted interactive Browser smoke | 当前 Codex / Agent 工具环境确实提供可控制的真实交互式 Browser 时，按 frozen independent contract 执行 objective production UI Browser evidence；即使 UI 稳定仍是客观 UI 的默认 mode | Agent 可适应布局、DOM ancestor、展开结构、动态控件和不改变合同的普通 copy 变化，但不能根据 current production 改 expected contract；通过不得写成 scripted / CI / reusable evidence |
| human manual / real-device smoke | subjective / professional / real-device 的唯一 owner；Agent 不可用或 manual 本身是合同要求时，也可以执行客观 UI flow | 必须按实际模式记录，不与 Agent-assisted / scripted 混称；不替代独立 non-UI Browser security semantics |

Agent-assisted smoke 的适应性不授权改变 expected contract：按钮名称、DOM ancestor 或页面结构变化时可以寻找语义等价入口，但不得依据 current production 表现降低业务目标；发现真实合同违例必须停止并报告。CI / persistent automation 要求不自动授权 scripted UI regression；必须先把业务不变量、non-UI Browser semantic 与剩余 UI behavior 分层，若合同仍不可拆分地要求 deterministic scripted UI workflow，则停止并报告合同冲突，由用户决定是否建立显式项目例外。

Codex/Agent 控制的内置 Browser 与系统 Chrome 在 Agent-assisted interactive Browser smoke 证据类别上相同，不因 Browser 品牌产生更高业务证据等级。需要隔离、干净 Browser state 时优先内置 Browser；需要真实 Chrome profile、扩展、已有登录态、品牌特有行为、系统权限或用户实际环境时优先系统 Chrome。没有品牌专属风险时，不建立 Chrome / Edge 自动矩阵。

人工 smoke 是独立人工证据边界，不是新的自动化层、活动场景状态或自动化失败后的降级替代；其职责见 2.6。

backend unit、HTTP E2E、database verifier、fixture 与 cleanup 的具体规则以 backend testing playbook 为准。

### 2.4 命令、discovery 与执行范围 Owner

命令生成期核验、discovery、定向执行、目标集合精确匹配、`not_executed` 判定与是否扩大回归统一遵循 [Codex instruction spec](../codex-instruction-spec.md) §3.8 / §3.9；本文只保留 CogMemory AD 当前真实 runner 与命令入口。

Frontend Testing Playbook 不维护第二套 doc-only / 单文件 / 单模块 / full regression 选择矩阵；本文件只维护当前 Frontend evidence capability、Browser qualification 与真实项目级 runner / asset facts。

当前 contracts runner 与 Browser executable 边界见 §1；从 `frontend` 目录执行的 pure/static contracts discovery 命令为 `npm run test:contracts:list`，执行命令为 `npm run test:contracts`。当前没有 Browser semantic runner 或 script；future Browser candidate 只有通过 §2.5 qualification 后才建立对应最低充分 runner / discovery / execution。

### 2.5 Scripted Non-UI Browser Micro-Profile 与任务粒度

Playwright 是高价值的确定性回归工具，但 scripted Browser micro-profile 只有同时满足以下条件才长期建设 / 保留：事实无法由 lower layer 证明；assertion target 本身属于 non-UI Browser runtime / network / origin / isolation semantic；可以不依赖 production UI workflow 独立证明；profile 短；fixture / support 成本与风险成比例。BrowserContext / Cookie / Storage isolation、CORS / credentials、必要 Browser lifecycle、独立 Browser-native file / blob / object URL 或其它 primitive，以及最低充分真实 topology wiring 可以准入；产品 UI workflow 一律不因稳定、短、重要、selector 可靠或长期价值高进入本节的 scripted 资格。

`frontend/test/browser-semantics/` 是 future v1.20 scripted non-UI Browser semantic 的 canonical path；当前目录不存在。只有具体候选通过上述 qualification 后，才按最低充分原则从零创建该路径及必要 spec / config / support，不复用已退役 `browser-acceptance` framework，也不自动把 current contract-runner config 扩成 Browser config。

MediaRecorder、Canvas、Pointer、file input、focus、keyboard、clipboard 和 permissions 不因 Browser API 身份自动准入。只有独立于 production UI topology 的 Browser primitive 可以按上段 scripted；“点击录音 / 停止 / 试听 / 完成”“点击上传 / 选择文件 / 预览 / 确认”“画布书写后继续”“真实 tab order / modal focus”等产品 UI 行为归 Agent-assisted 或 human。navigation / reload 只有在证明 Cookie / Storage / Context 等 lifecycle 本身时可 scripted；业务页面 reload 后题目、按钮、面板、提示与继续操作正确属于 UI。

Browser spec 的 expected behavior 不得主要从 current production 反推。发生 substantive contract change、旧 scripted Profile 与 current 行为广泛漂移，或准备重写 / 替换 spec 主体时，GPT 必须先从已锁定产品合同、roadmap current contract、正式 API / DTO、领域原始需求或用户明确决策冻结 independent expected contract，再读取 production code 获取 selector、testid、route、控件结构和 wiring。该冻结默认是生成期临时设计工作，不机械新增 audit task、JSON、hash 或长期文档；只有合同来源矛盾、旧测试与 current 合同严重冲突或重写依据不明确时，才建立具名 read-only independent contract audit。

现有 Profile 的资产策略先过 v1.20 eligibility gate。主要 assertion target 是 UI semantic 时，直接 `retire scripted profile / switch current UI evidence to Agent-assisted or human`，不再 patch selector 或 rewrite scripted UI body；历史通过仍按形成时有效的 historical evidence 保留。只有 `ELIGIBLE_NON_UI_SCRIPTED` Profile 才根据合同不变下的局部实现漂移选择 `patch`，或在主职责仍正确但 non-UI body 实质变化时选择 `rewrite body / keep path`。Browser-only 技术事实被长 UI flow 包裹时，先尝试下沉 lower layer 或建立最低充分薄 non-UI profile；不得为了保住 Playwright 扩张 fixture、support、testid、test-only UI hook、复杂 harness 或第二套业务状态模型，无法合理薄化时由 Agent-assisted 验证整个 UI flow。

scripted non-UI 微型 Profile 原则上只包含 1～4 个紧密相关 Browser semantic 场景，具有单一主风险、最小合法前置、独立执行、独立证据、必要后置验证和精确 cleanup，并独立关闭自己拥有的活动场景。一个 Codex 任务可以包含多个风险一致、证据层相近且能分别收口的 non-UI Profile，但不因此共享可写 Report、BrowserContext、Session、数据库终态或 cleanup。

同一 non-UI Profile 保持证据原子性：同一 Git 代码态、同一最小前置、一次 Browser 执行、适用的 verifier 和一次精确 cleanup。Profile 应有清晰单一 Browser semantic 职责，不把业务 UI 主链、recovery / takeover / redo 等用户 workflow 塞入 scripted body；这些 UI flow 按 Agent-assisted / human 执行。后续无关 Profile 失败，不得作废已经闭环的证据。禁止批次专属 runner、journal、aggregator 或完整 manifest，禁止把大量不相关状态塞入一次原子运行。

scripted non-UI Profile 不设置 assertion 数量 KPI。若一个 Profile 开始大量断言 API 非法组合、数据库内部状态、历史 revision、普通 copy、内部 count、fixture manifest 或其他不依赖真实浏览器的实现细节，必须重新评估并把对应事实下沉到更合适的 pure / unit、HTTP E2E、verifier 或 static gate；Profile 只保留与单一 non-UI Browser 主风险紧密相关的最小断言。

Profile 内的信息分为两类，不为此新增持久状态或第二套结果系统：

- **contract assertion**：本 Profile 明确负责的业务合同或 Browser 不变量；失败可以使 Profile fail。
- **diagnostic information**：为排错记录的内部 revision、事件计数、playback 计数或其他调试事实；若不是本 Profile 的正式合同，只能用于诊断，不能因为它与历史阶段的偶然值不同而使 Profile fail。

禁止把与业务合同无关的历史固定 revision、内部累计 count、合法产品行为产生的累计事件为 0，或与 Profile 主风险无关的内部统计设为门禁。真正的 cardinality 仍须精确验证，包括禁止副作用时新增数量必须为 0、at-most-once / exactly-once、重复提交只允许一次写入、禁止重复 Evidence，以及数量本身就是正式业务合同的情形；优先断言业务不变量、相对增量、actor / ownership、持久终态和受保护事实未漂移。

### 2.6 Browser Evidence 行为与横切抽样

- 产品 Browser evidence 准入必须满足 2.2 的不可替代事实问题，并使用 production frontend、真实 Browser test backend 和真实 HTTP；不得以 mock server、伪造响应或代码阅读替代。未来通过 qualification 的独立 runner / support primitive 自检可以使用自有 synthetic HTML，但只证明对应 Browser semantic，不得冒充 production UI evidence。
- 可 scripted 的高价值事实限于 non-UI Browser semantic：HttpOnly / SameSite / Secure / host 等真实 Session Cookie 语义；独立 BrowserContext 的身份、Cookie 与 Storage isolation；Browser 层登录 / 退出 / redirect lifecycle；reload 对 Cookie / Storage / Context 的影响；credential、entry code 或 token 不进入 URL 与 Browser storage；独立 file / blob / object URL 或其它 Browser-native primitive；真实 origin、CORS、credentials、Cookie 链；以及不依赖复杂 UI 点击的最低充分 production build / HTTP topology wiring。产品页面上的上传链、keyboard / focus / role / accessible name、UI reload / resume、关键操作 wiring 与黄金路径属于 UI evidence，客观部分默认 Agent-assisted，主观 / 专业 / 真实设备部分归 human。
- 页面没有合法入口但公开 API 可直接调用的 401/403、Guard / Pipe、DTO whitelist、ownership、权限、状态门禁、重复提交、幂等、revision / CAS conflict、合法并发、原子写入、audit、数据库终态和非法调用无副作用，由 Backend HTTP E2E 承担主证据，不在 Browser 再模拟一次 HTTP 攻击。Browser 只在有价值时证明正常 UI 未暴露非法入口，或页面产生的请求 wiring 正确。
- `beforeunload` / refresh 的独立 Browser event / lifecycle primitive 可以在薄 non-UI profile 中 scripted；产品对话框文案、未保存提示、页面恢复后的控件 / 面板 / 当前题与继续操作属于 UI，客观行为默认 Agent-assisted。服务端权威状态与数据不变量优先由 HTTP E2E / verifier 证明。
- 多角色或双 Session 使用独立 BrowserContext，不通过清除同一 Context Cookie 模拟隔离。
- 响应式代表范围仍为 390×844、800×1280、1280×800、1024×1366、1366×1024、1280×720、1536×864；production UI 的布局、局部滚动与视觉层级由 Agent-assisted / human 按事实性质验证，不建立 scripted UI viewport matrix。
- production UI 的键盘顺序、focus-visible、焦点进出、role、accessible name、Axe 与 ARIA tree 属于 UI / accessibility evidence：客观机器可观察项默认 Agent-assisted，真实操作与可理解性判断归 human。不得把 `violationCount === 0` 机械设为所有业务阶段的统一完成条件；直接影响核心操作、表单 accessible name、键盘操作、标签或内容可理解性的 violation 必须当前关闭，非关键项按明确归属收口。

普通说明性 UI copy 不自动成为 frozen expected contract，包括页面标题、副标题、帮助说明、普通 badge、介绍语和不构成正式稳定业务合同的操作提示。Agent-assisted 可以适应不改变合同的普通 copy、布局、DOM ancestor 与语义等价入口；安全确认、不可逆操作确认、用户必须据以判断关键状态的稳定文本、正式错误合同和核心业务动作仍以 independent contract 为准。UI 文案或 selector 变化不得触发 fixture、数据库 namespace 或整套 Browser runtime 重建，也不得成为恢复 scripted UI regression 的理由。

不把浏览器品牌矩阵设为默认门禁。Agent 控制的内置 Browser / 系统 Chrome 按 2.3 的风险选择，不因系统 Chrome 本身提升证据等级；真实设备和主观操作体验仍归人工 smoke。只有存在明确浏览器品牌专属风险时，才按最低充分范围升级为自动化矩阵。

认证 lifecycle、logout / Cookie、Storage / URL 隐私、CORS 与无需 production UI interaction topology 的 runtime / Network / Console 边界，可以按 non-UI assertion target 形成薄 scripted evidence；DOM 敏感信息、Axe、viewport、focus-visible 和不支持 Action 等 production UI 观察由 Agent-assisted / human 按事实性质执行。横切证据不得替代业务特有页面行为、错误恢复、请求次数或数据库终态。

GET aborted / canceled 本身不代表产品失败；只有必要读取因此无法取得且使业务状态不可达、用户无法继续或没有可信恢复路径时才阻断。Next prefetch、Playwright response / requestfailed 时序、内部取消顺序、测试鼠标坐标、runner 编排、Console 网络噪声或精确事件到达顺序，必须先归入对应测试层分类，不得在缺少稳定业务风险证据时反向要求 production 增加状态、锁、配置、API、重试或状态机。

#### 人工 smoke 独立职责

人工 smoke 负责自动化无法可靠判断的可理解性、可用性、真实操作感、视觉层级、布局和真实设备体验，包括用户是否知道下一步做什么、文案是否自然、关键流程是否令人困惑，音频、录音、手写、文件操作等真实体验，以及自动识别或辅助结果是否可能被误解为正式结论。重大用户流程、患者端、医护关键操作或交互模型发生实质变化时，应保留最低充分人工 smoke；纯后端、纯内部或没有用户可见行为变化的阶段不机械增加。

人工 smoke 不是自动化失败后的降级版，也不替代权限、DTO、状态机、并发、数据库终态或 Browser-only Cookie / Storage / Session 安全语义的自动化证据。它与 Agent-assisted interactive Browser smoke 分属不同执行模式；人工实际使用 Chrome / Edge 或真实设备可以形成其明确范围内的人工证据，但不得虚报 Agent-assisted 或 scripted Browser regression 已通过。

### 2.7 活动场景状态、失败与复杂度

活动场景只使用 `pending`、`passed`、`failed`、`blocked`、`not_executed`。只有全部必需子断言的主证据、必要支持证据、适用数据库终态与资源 cleanup 均实际通过，且无测试资产、环境或未执行项阻断时，场景才能标记 `passed`。

`not_executed` 是活动场景状态之一；其“目标是否形成有效执行”的通用判定遵循 [Codex instruction spec](../codex-instruction-spec.md) §3.8。

`unknown` 不是活动场景状态，只是 [Codex instruction spec](../codex-instruction-spec.md) §3.8 定义的临时执行结论，不能关闭、通过或判失败场景。

明确且持续的外部环境、工具或权限阻断才记 `blocked`。exit code、测试文件存在、历史失败轮局部观察或 cleanup 成功均不能批量推导通过。

每轮先分类为 `product`、`spec/test`、`fixture`、`support/runner`、`environment`、`tool limitation` 或 `not_executed`，再修正对应层；这些是失败归因，不是新的活动场景状态，也不新增 `database/data-integrity` 平行来源：产品造成的数据完整性违例归 `product`，fixture 造成的测试数据错误归 `fixture`，数据库环境不可用归 `environment`。只有稳定复现且证明违反正式产品合同的行为才归类为产品缺陷。GET aborted、Next prefetch、Playwright response / requestfailed 时序、测试鼠标坐标和 runner 编排问题不能因自动化失败本身升级为产品 `gap`。

测试基础设施失败不等于产品失败，也不等于 Browser 通过。stale spec / fixture / support / runner、environment 或 tool limitation 不自动回退已经由其他仍适用证据证明的产品事实，但没有形成可信 Browser 证据时不得虚报 Browser passed：Browser-only 事实若已由仍适用的既有 Browser 证据，或本轮可信 Agent-assisted / human manual 真实浏览器 smoke 实际证明，可以按实际模式准确记录“产品行为已验证；scripted Browser regression 未闭合，存在 test infrastructure debt”；若该 browser-dependent 行为没有任何可信实际证据，只能记录“未发现产品缺陷，但该 Browser 验证尚未形成可信证据”。该区分不新增项目持久状态枚举，且不得把 Agent-assisted 与人工结果混称。

UI scripted Profile 不等待失败两轮：静态审计证明主要 assertion target 是 UI semantic 时，直接判定不符合 v1.20，不再执行、patch selector 或 rewrite scripted UI body。连续两轮止损只继续约束真正 `ELIGIBLE_NON_UI_SCRIPTED` 的测试资产：同一 execution mode 与资产方案因 `spec/test`、fixture、support/runner、environment 或 tool limitation 连续两轮失败时，不得第三轮同方案 patch / rerun，必须在修复或重写合格的 non-UI Profile、退役 Profile、Agent-assisted smoke、manual / real-device smoke 中重新选择最低充分方案。公共 support 连续影响两个场景或测试基础设施明显超过被测风险时同样停止扩张。每个合格 non-UI Profile 最多一次测试资产修复轮；不得扫全仓库历史资产、越界重构 future Browser framework、把测试债务扩张成 production 状态机。若证据明确证明 production contract violation，仍按 product `gap` 处理，不用 execution-mode 重选掩盖。

测试资产通用复杂度治理引用 [Codex instruction spec](../codex-instruction-spec.md) §3.10；Frontend / Browser 只补充 §2.5 的项目级准入与本节的具体 stop-loss。

## 3. Browser 专属稳定运行规则

### 3.1 Canonical Origin、Cookie 与构建输入

每个 production-connected Browser evidence 启动前必须核对页面 URL/origin、production frontend 实际构建使用的 `NEXT_PUBLIC_API_BASE_URL`、实际 API origin、后端 `CORS_ORIGIN`、Session Cookie host 和 backend health 地址：

| canonical host | 页面 origin | API origin / API Base | CORS origin | Cookie host | health |
|---|---|---|---|---|---|
| `localhost` | `http://localhost:3002` | `http://localhost:5002` | `http://localhost:3002` | `localhost` | `http://localhost:5002/health` |
| `127.0.0.1` | `http://127.0.0.1:3002` | `http://127.0.0.1:5002` | `http://127.0.0.1:3002` | `127.0.0.1` | `http://127.0.0.1:5002/health` |

上表维护默认 canonical topology；`3002 / 5002` 是默认端口，不是测试运行必须抢占的固定端口。

- 默认 frontend 或 backend 端口被现有非本任务进程占用时，不得杀掉、停止、接管或干扰该进程；当前测试运行可以分别选择空闲替代端口，例如 frontend `3003`、backend `5003`，不要求为了形式机械同时加 1。
- 使用替代端口时，当前运行必须记录并始终使用同一套实际 topology，使 frontend listen origin、backend listen origin、`NEXT_PUBLIC_API_BASE_URL`、backend `CORS_ORIGIN`、Browser / Agent runner 预期 frontend / backend origin 和 backend health URL 与实际端口一致。
- 替代端口只是 execution-time fallback，不要求修改 tracked 产品配置、创建永久端口配置或维护第二套 topology。
- 同一认证链不得混用 `localhost` 与 `127.0.0.1`；CORS 必须精确匹配含 scheme 和端口的页面 origin。
- 当前 Session Cookie 未设置 `Domain`，属于 API 响应 host 的 host-only Cookie。只核对名称、host/domain、path、HttpOnly、SameSite、Secure 和是否存在，禁止输出 Cookie 值。
- `NEXT_PUBLIC_API_BASE_URL` 是 production build 的公开构建时输入；值变化后必须 fresh build。只重启已有 server 不能证明新值生效，必须由实际 Network 请求确认当前 Browser 使用的 API origin。仅 frontend listen port 变化且该构建时输入未变化时，不机械要求因此重建；其它 fresh build 判断仍服从实际构建时输入和当前最终代码态。
- `BROWSER_ACCEPTANCE_FRONTEND_ORIGIN` 与 `BROWSER_ACCEPTANCE_BACKEND_ORIGIN` 只声明 runner 预期拓扑，不能覆盖已进入构建产物的 API Base。
- “前端生产代码发生变化”本身不是 fixture 修改或重建触发器。只有 DTO 必填字段、Schema、权限、服务端状态前置、seed / catalog 或其他合法数据前置合同真实变化时才调整 fixture；纯 UI copy、布局、selector、展示结构和不改变数据前置的普通交互变化，只影响 frozen contract 下的 Agent-assisted / human 执行说明或观察，不 patch 已被 v1.20 取消资格的 scripted UI spec / support。
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

## 4. Current asset 与 historical evidence 边界

- current frontend test asset 以当前 commit 的 tracked files、package / Playwright 配置和实际 discovery 为准；本文不维护完整 spec inventory、historical evidence index 或 aggregate test count。
- historical Browser green、旧 Batch/WP evidence、旧 fixture / support / executable、evidence commit、历史 verifier / cleanup 和逐轮执行日志由 Git history 追溯，不代表当前代码态 dynamic green；历史 desktop Browser evidence 不替代真实设备、主观或专业判断。
- 测试文件存在、历史通过或历史 product green 本身不能替代本次应执行的验证；historical evidence 是否仍可复用，须依据当前 diff、合同和资产判断。
- 已退役 scripted Browser 资产不能冒充 current executable；测试资产退役本身不自动回退 Roadmap / current contract 已确认的产品状态。
- 当前任务实际执行的 pure/static、scripted Browser、Agent-assisted、Human / real-device evidence 及结果由当前任务最终报告记录，不回写为长期阶段台账。
- completed Batch/WP 的逐轮 evidence 不在 Playbook 长期保存；仍 active / pending 且会直接决定后续验收的人工 / real-device 项目可以继续以 current scope 维护。

## 5. 后续维护规则

- active / pending 且会直接影响后续验收的场景可以保留当前范围、状态、必要场景设计与 Owner；场景完成后，不再长期维护逐轮 evidence、historical executable、evidence commit 或 aggregate count，历史由 Git 追溯。
- 当前 test asset 由 current commit + discovery 判断；历史资产存在和历史通过不冒充 current executable / dynamic green。
- 逐轮命令、精确耗时、失败过程、旧编号全文、迁移过程、历史 verifier / cleanup 和完整 evidence table 由 Git history 承担，不搬入新文档。
- 风险重新展开、已有证据复用、候选归属和验收范围变化统一遵循 [Codex instruction spec](../codex-instruction-spec.md) §3.9。
- Browser 活动场景的主证据、必要支持证据、适用 verifier 和 cleanup 均通过后才能关闭；静态存在核对不得冒充动态通过。
- 数据库用途、fixture、verifier、cleanup、Stage 和后端定向命令以 backend testing playbook 为准。
- 产品 / WP 状态由 Roadmap 维护；Testing Playbook 不自行启动或关闭工作包。
- 当前任务实际验证由 task final report 记录，不累计成永久 historical ledger。
