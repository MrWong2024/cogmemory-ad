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
| Batch E | 8 个真实设备或人工项目待验 | “Batch E：真实设备或人工验收” |

B11～B15 保持完成；B18 补充验证已闭合，自动化 `gap=0`，WP-03 已完成。当前无活动工作包，下一业务工作包尚未选择；Batch E 的 8 项真实设备或人工项目继续独立待验。

## 2. 当前测试设计规则

### 2.1 验证候选的系统生成与即时闭环

新 A#、B#、工作包子任务、跨层缺陷修复或其他实现单元在业务和接口合同基本锁定后、生成实现 Codex 指令前，必须按 `docs/codex-instruction-spec.md` 3.9 生成临时的 `初始验证风险候选集合`；发生影响性需求或产品代码变化时按变化范围重新扫描。合同尚未锁定时先完成合同设计或拆分阶段，纯文档、纯格式和无行为变化的机械重构只做简化扫描。

项目级候选来源至少覆盖：

1. 业务角色、用户目标、正常/阻断路径和明确非目标。
2. 页面路由与入口、可见性、输入、writing / disabled、错误恢复、刷新、当前会话与持久状态。
3. 公开 API、DTO、Guard / Pipe、ownership、客户端可控字段、服务端生成字段与 mapper 隐私。
4. 状态机、readiness、幂等、合法并发、部分完成、显式恢复、网络结果不确定及版本/replacement 关系。
5. 数据副作用、audit、protected roots，以及 Patient / Visit / 来源 / Storage 等外部对象的不变量。
6. shared workflow、认证与权限、coordinator / writing lock / identity、Origin / CORS / Cookie 和构建时变量。
7. 已有 unit / HTTP E2E / Browser / verifier、已知回归，以及证据形成后相关实现是否变化。
8. Batch E 或其他人工、真实设备、相机、触控笔/手写、打印、硬件和专业判断边界。

默认即时闭环为：`设计实现单元` → `生成候选集合` → `按本节后续规则分类、去重、复用证据并选择最低充分层` → `写入当前实现单元的明确阶段，或同一工作包中具名的其他实现单元 Codex 指令` → `实现后由 Codex 立即执行可自动化验收` → `最终覆盖完整性核对和证据收口`。候选生成避免遗漏，后续治理避免过度测试；任何候选都必须有且只有一个主要归属，不得用“以后再看”替代明确阶段。分配到后续阶段、具名的其他实现单元或人工项目只表示已有归属，在对应验收实际通过、精确证据仍适用或其他正式关闭条件满足前不表示候选已经关闭。

候选集合只是 GPT 生成 Codex 指令期间的临时风险工作集，不要求完整输出给 Codex，不在 Playbook 保存新实现单元的候选全集，也不按候选建立永久 Audit ID 仓库。active / pending 阶段只持久化当前真实 `gap`、人工或真实设备项目和必要场景设计；完成后收缩为当前状态、精确证据资产、evidence commit 与长期合同摘要，逐轮生成、筛选、执行和治理过程由 Git 历史承担。

完成口径引用 `docs/codex-instruction-spec.md` 3.9，并在项目内分为三级：

- **当前任务或阶段完成**：本阶段实现和验收已完成，候选均有明确归属且状态/证据已同步；后续自动化阶段仍 `pending` 时只能关闭当前阶段，不能宣布对应实现单元完成。
- **A# / B# 或其他实现单元完成**：锁定范围内全部自动化候选和后续阶段均已关闭，不存在本单元 `pending` 自动化验收或阻断性 `gap`，mandatory 人工/真实设备项目满足当前范围，且最终覆盖对账和证据收口完成。
- **工作包或产品能力完成**：相关 A#、B#、跨层合同、联调和用户流程验收均按锁定范围关闭，manual / real-device 边界满足工作包合同并由 roadmap 按真实证据维护；Testing Playbook 不自行启动或关闭工作包。

A# 没有正式 UI 风险时不机械建立 Browser；UI 候选可以归属到同一工作包中具名的 B#，但在 B# 验收通过前仍是 open，只能准确表述 A# 的后端范围完成。B# 应复用当前代码态仍适用的 A# unit / HTTP E2E / verifier 精确证据，只为新增用户可见风险补最低充分 Browser；若 B# 改变后端合同或暴露新的公开调用路径，必须重新扫描后端候选，并明确由当前跨层实现单元或具名 A# 承担。

mandatory 人工或真实设备项目尚未签收时，不得无条件宣布完整范围完成；当前合同明确只覆盖桌面、自动化、后端或其他子范围时，必须使用准确限定语。Batch E 的现有状态和范围继续由第 5 节维护，本次规则补强不重新评定其阻断关系。

### 2.2 可达性、风险与最低充分证据

系统生成后的候选风险必须先分类，再决定是否进入强制验收：

| 分类 | 判定边界 | 最低充分主证据 |
|---|---|---|
| `ui_reachable` | 当前正式页面可由正常人工操作触发 | Browser 验证入口、控件、输入、提示、刷新、Browser 状态与代表性可访问性 |
| `public_api_reachable` | 页面无入口，但公开 API 可由 Postman、curl 或自编客户端调用 | HTTP E2E 验证认证、权限、DTO、ownership、状态门禁、错误码与数据库无非法副作用；不另建 Browser 场景 |
| `legitimate_concurrency` | 两个合法用户、标签页、Session 或请求可通过正式页面或公开 API 形成 | HTTP E2E 验证原子性、幂等、写入次数与数据库终态；仅在存在不可替代用户恢复交互时补最小 Browser |
| `internal_corruption_only` | 只能直接改库、伪造内部对象、篡改运行时或损坏历史数据形成 | 默认不进入业务批次；可保留廉价 pure/unit 防御证据，只有正式导入、迁移、兼容合同、已知事故或明确合规要求才升级 |
| `manual_or_real_device` | 自动化无法可靠替代的真实设备、相机、触控笔、手写、打印或专业判断 | Batch E 或明确人工验收；不得伪装为桌面 Browser 已通过 |
| `general_gate` | lint、typecheck、build、discovery、依赖、路由所有权、数据脱敏等 | 最终代码态或对应层变化后按影响范围执行；不创建业务 Audit ID |

设计顺序：

1. 证明真实 UI、公开 API、合法并发、正式导入或真实设备入口。
2. 判断风险是否涉及临床数据完整性、不可逆动作、权限、安全、隐私、恢复或已知回归，且是否足以阻断发布。
3. 检查相关代码、接口与配置未变化时是否已有可复用的精确证据。
4. 选择最低充分主证据，只为尚未被准确证明的事实补证。
5. 最后设计最小合法前置、场景和断言；禁止先扩张断言再反向建设 fixture。

业务风险守恒针对真实可达风险、不可替代状态语义和安全边界，不针对历史 Audit ID 数量、层级组合或顺序。同一风险只在最合适层作为主证据；代码阅读不等于动态通过，页面文本不替代数据库终态，fixture E2E 不冒充产品 Browser。Browser 收缩不得删除认证、授权、ownership、DTO 白名单、不可逆状态门禁、幂等、合法并发、隐私或数据库无副作用证据。

### 2.3 证据层职责

| 证据层 | 主职责 | 不可替代边界 |
|---|---|---|
| `backend_unit` | 局部判断、DTO、Service 分支、mapper、状态边界与廉价防御 | 不证明真实 HTTP、Guard 或数据库终态 |
| `backend_http_e2e` | 公开 API 绕过与合法并发的认证、权限、Pipe、Body、ownership、状态机、幂等、原子性和数据库终态 | 不证明页面真实交互 |
| `frontend_static_or_pure` | 展示映射、Action ownership、局部资格与非阻断防御 | 不证明真实输入、Browser API 或后端动态行为 |
| `browser_micro_profile` | 页面入口、控件、输入、提示、刷新、错误恢复、Browser 隐私与代表性可访问性 | 不替代服务端合同或数据库终态 |
| `database_verifier` | 仅在现有 HTTP E2E 不足时补充 Browser 写入次数、audit、protected roots 或持久终态 | 不重复准确 HTTP E2E，不替代页面体验 |
| `static_gate` | lint、typecheck、build、discovery、依赖与路由边界 | 不证明业务运行，不创建业务 Audit ID |

backend unit、HTTP E2E、database verifier、fixture 与 cleanup 的具体规则以 backend testing playbook 为准。

### 2.4 按变化影响选择执行范围

- 纯文档变化只执行文档内容、链接、diff 与 Git 范围检查。
- 单个测试文件变化执行精确 discovery、定向测试和必要静态检查，不自动扩大到完整 E2E。
- 单模块生产代码变化执行受影响 unit / E2E 与对应层静态门禁。
- 只有认证、公共 Guard、Schema、通用 mapper、公共测试基础设施或跨模块合同变化，才按实际影响扩大回归。
- 完整 unit / E2E 原则上在批次最终代码态执行一次，或在存在明确跨模块影响时执行；不得在每个 Profile 后机械重复。
- 前端最终代码态按实际影响选择 `npm run test:browser:list`、`npm run test:browser:infra`、`npm run lint`、`npm run typecheck`、`npm run build`；discovery 和 infrastructure 不关闭业务场景。

### 2.5 微型 Browser Profile 与任务粒度

微型 Profile 原则上只包含 1～4 个紧密相关场景，具有单一主风险、最小合法前置、独立执行、独立证据、必要后置验证和精确 cleanup，并独立关闭自己拥有的活动场景。一个 Codex 任务可以包含多个风险一致、证据层相近且能分别收口的 Profile，但不因此共享可写 Report、BrowserContext、Session、数据库终态或 cleanup。

同一 Profile 保持证据原子性：同一 Git 代码态、同一最小前置、一次 Browser 执行、适用的 verifier 和一次精确 cleanup。后续无关 Profile 失败，不得作废已经闭环的证据。禁止批次专属 runner、journal、aggregator 或完整 manifest，禁止把大量不相关状态塞入一次原子运行。

### 2.6 Browser 必须验证的行为与横切抽样

- 使用 production frontend、真实 Browser test backend 和真实 HTTP；不得以 mock server、伪造响应或代码阅读替代。
- 验证页面入口、角色可见性、控件 enabled/disabled、真实输入、请求次数、状态、成功或可达错误恢复；页面无入口的 403、DTO 或 ownership 绕过交给 HTTP E2E。
- 验证刷新、beforeunload、localStorage、sessionStorage、IndexedDB、Cookie、URL、Console、DOM 和 Network 隐私边界。
- 多角色或双 Session 使用独立 BrowserContext，不通过清除同一 Context Cookie 模拟隔离。
- 响应式代表范围为 390×844、800×1280、1280×800、1024×1366、1366×1024、1280×720、1536×864；宽表只允许局部滚动。
- 键盘证据使用真实 Tab、Shift+Tab、Enter、Space 与 `isTrusted=true` 事件，验证自然焦点顺序、focus-visible 和焦点进出。
- Axe 与 ARIA tree 用于代表性基础 A/AA、role、accessible name 和结构检查，不替代真实设备或专业判断。

认证生命周期、logout/Cookie、Storage/URL 隐私、CORS、Console、DOM 敏感信息扫描、Axe、viewport、focus-visible 和不支持 Action 扫描，只在对应能力变化或缺少可信证据时附着少量真实流程；横切证据不得替代业务特有页面断言、错误恢复、请求次数或数据库终态。

### 2.7 活动场景状态、失败与复杂度

活动场景只使用 `pending`、`passed`、`failed`、`blocked`、`not_executed`。只有全部必需子断言的主证据、必要支持证据、适用数据库终态与资源 cleanup 均实际通过，且无测试资产、环境或未执行项阻断时，场景才能标记 `passed`。

`unknown` 仅是命令已启动但没有可靠摘要、输出不完整或证据不足时的临时执行结论，不是活动场景状态；它不得关闭、通过或判失败场景。明确且持续的外部环境、工具或权限阻断才记 `blocked`；命令、选择器、权限或进程未启动导致目标没有实际执行时记 `not_executed`。exit code、测试文件存在、历史失败轮局部观察或 cleanup 成功均不能批量推导通过。

每轮区分产品缺陷、测试代码缺陷、fixture 缺陷、Playwright/support 缺陷、环境编排缺陷、工具或权限限制及未执行。稳定复现且证明违反产品合同才归类为产品缺陷。同一方案连续两轮因环境、fixture 或测试资产失败时不得第三轮同方案重跑；公共 support 连续影响两个场景或测试基础设施明显超过被测业务时停止扩张。每个 Profile 最多一次测试资产修复轮，之后只重跑受影响 Profile 与必要关联证据。

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

进入业务 Profile 前，在同一 BrowserContext 完成 health、页面 origin、登录 API origin/CORS、HttpOnly Cookie 存在以及 `GET /auth/me` 已认证读取的 preflight。任一项失败均不得进入业务场景；先修正环境与构建链，再按证据分类，不通过重试业务写请求或延长超时绕过。

### 3.2 进程、数据库与隐私边界

- production frontend 与 Playwright/Browser runner 的数据库用途必须为 `none`，不得直接连接 MongoDB。
- Browser test backend 使用 Browser app / `readWrite`；fixture、verifier、cleanup 使用 db_admin / `dbOwner`。具体数据库、进程与生命周期规则见 backend testing playbook。
- 每个 Profile 使用独立 BrowserContext；只关闭任务拥有的 Context、Session、Chromium、Node 进程、端口、runtime 和 test-results。
- 临床草稿、客户端可读凭据、内部 ID、完整响应和敏感对象不得进入 Storage、URL、DOM、Console、Network 日志、截图或产物。HttpOnly Cookie 只核对安全元数据。
- 不可逆 POST 不自动 retry、replay 或 polling。网络结果不确定时先只读核对服务端事实；只有明确用户动作才能再次写入。

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
| shared façade / coordinator / reducer / identity isolation | 跨 B11～B15 | `frontend/test/browser-acceptance/contracts/clinical-report-workflow-shared-non-browser.spec.ts`；稳定 `reportId`、route RESET、unexpected identity 隔离、expected correction transition 保真、identity generation、layout barrier、单一 writingRef/latest/beforeunload |

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
- 完成边界：A29/A30、B18-A 原 47 项、B18-B1 P1/P2、B18-B2 P4–P6、P7 2 项与 P8 1 项继续复用；single-flight 3 项、P3 2 项与本次 P9 1 项均已关闭，自动化 `gap=0`。B18 补充验证闭合，WP-03 按当前 roadmap 锁定范围完成；Batch E 的 8 项真实设备或人工项目保持原 ID 和待验状态，下一业务工作包尚未选择。

## 6. Batch E：真实设备或人工验收

以下稳定 ID 不属于桌面自动化范围，也不得被桌面 viewport、鼠标 Canvas 或普通 automated 测试替代；它们与当前 B18 自动化 gap 分离，继续作为独立待验范围：

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

后续执行必须明确真实设备或人工条件、步骤、签收人和证据。不得更换 ID、静默合并，或补写当前合同没有支持的细分要求。

## 7. 后续维护规则

- 只有 active / pending 批次保留详细场景设计；批次完成后收缩为当前状态、证据资产、evidence commit 与持久合同摘要。
- 逐轮命令、精确耗时、失败过程、旧编号全文、迁移表和完整合同表由 Git 历史承担，不搬入新文档。
- 只有影响性产品代码、接口、配置、测试基础设施或产品合同变化时，才按实际影响重新展开风险与证据设计；未变化事实复用现有精确证据。
- Browser 活动场景的主证据、必要支持证据、适用 verifier 和 cleanup 均通过后才能关闭；静态存在核对不得冒充动态通过。
- 数据库用途、fixture、verifier、cleanup、Stage 和后端定向命令以 backend testing playbook 为准。
- testing playbook 与 roadmap 已同步：B18 补充验证闭合、自动化 `gap=0`，WP-03 已完成；当前无活动工作包，下一业务工作包尚未选择。
