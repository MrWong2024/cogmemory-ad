# CogMemory AD / 智忆评 前端验证手册

## 1. 文档定位

本文档是前端验证的 active playbook，只维护当前静态门禁、Browser 通用验收策略、仍待执行的 Batch D / E 合同，以及已完成范围的最终证据索引。已完成 B1–B10、B16、B17 的逐场景操作、失败过程、旧端口、旧 namespace 和重复命令由 Git 历史追溯，不在本文继续累积。

本文档不改变产品、接口、DTO、Schema、测试合同或 roadmap。下文 B7–B15 的阶段内序号保持减肥前基线顺序，序号即该阶段稳定验证项；不得重排、合并或用数量摘要替代验证意图。

## 2. 当前验证状态总表

| 范围 | 当前状态 | 唯一当前事实 |
|---|---|---|
| WP-02 / B16 | 已完成 | replacement V2+ 生命周期矩阵、Resume / unsafe 边界和 Web Storage 最终审计均已关闭 |
| WP-04 / B17 | 已完成 | 44 个 scenarioKey 全部通过，正式 fixture 双次 cleanup，残留为 0 |
| Batch A / B1–B3 | 已完成 | 67 个验证原子全部有明确处置，正式 fixture 双次 cleanup，残留为 0 |
| Batch B / B4–B6 | 桌面范围已完成 | Browser 133 + automated boundary 2 = 135；post-browser verify 通过；双次 cleanup `residualCount=0`；产品缺陷 0 |
| Batch C / B7–B10 | 已完成 | B10 最终为 `generation-workflow` 48 pass + `public-surface-security` 47 pass，共 95 项 |
| Batch D / B11–B15 | B11 已完成；B12-B8 三种 open mode 预检未通过；Batch D 尚未完成 | B12-B8 使用独立全新 namespace 实际执行三条零业务写入 route，结果为 0 pass / 3 fail；Browser 后 prepared re-verify、停服、产物清理与双次 `residualCount=0` cleanup 均通过。按门禁未进入另一个 namespace 的 22 条 core route 完整验收，62 个 core Browser ID 均未关闭；B12-B、B12 与 Batch D 未完成，不进入 B12-C，B12-83 与 B12-86–B12-88 未关闭 |
| Batch E | 尚未执行，保留 8 项 | 真实设备或人工验收；不被桌面 Browser、大屏抽查或 automated boundary 替代 |

Batch B 的正式 namespace 和临时文件已经删除，不存在“尚待 post-browser verify”或“下一步重建 Batch B 终态”的当前任务。B7 采用组合证据完成：原完整 Browser 验收中 B7-01–B7-37、B7-39、B7-40 通过，完整 post-browser verify 通过且双次 cleanup 均为 `residualCount=0`；B7-38 修复后的三个 viewport 定向回归、Browser 前后 prepared verify 和双次 cleanup 也均通过。本次定向回归没有执行 compute，namespace 按合同保持 prepared 状态，因此对它执行要求写终态的 post-browser verify 不适用，不构成当前阻断。B8 `core-workflow` 的 39 项真实 Browser 验收与 `resilience-security` 的 21 项真实 Browser 验收均已完成；后者的 post-browser verify 通过，双次 cleanup 均为 `residualCount=0`。B8 共 60 项全部闭环，B8 已完成。B9-B1 已修复规范 seed 首次物化前误采基线的问题，并在 Git 忽略的本地 Browser 配置建立稳定 B9 fixture 密码来源；B9-B2 已完成五条 `local_write_gate` route、服务端数组顺序和内部 ID DOM 边界的定向修复。B9-B3 在指定基线上使用全新 namespace 重跑完整 `core-workflow` 的 37 项 Browser pass、产品缺陷 0、logout/停服和双次 `residualCount=0` cleanup 事实继续保留。B9-B4 已将无法在产品合法状态下成立的 B9-32 唯一处置为 `obsolete`，不得创建非法草稿 fixture 或写成 pass；core 合同现为 37 active + 1 obsolete。seed-drift 目标已改为实际受保护 canonical 集合，score-confirmation-only verifier 已与真实 A18 confirm 字段对齐；定向 E2E 1 suite / 7 tests、完整 E2E 24 suites / 110 tests 与全新 namespace core fixture prepare/verify/replace/verify/双 cleanup 冒烟均通过。B9-B5 已在基线 `ed37e22dab3950e62bf434572f5a4bd4a983227a` 使用全新 namespace `b9c-b9b5-20260726-f3a7` 重跑 19 条 `core-workflow` route；B9-01–B9-31、B9-33–B9-38 共 37 个 active 项全部通过，B9-32 保持唯一 `obsolete`，post-browser verify 通过，logout、Browser/服务关闭及端口释放完成，两次 cleanup 均为 `residualCount=0`，第二次 `matched=false`。B9-C 原完整 `resilience-security` 的 B9-39–B9-50 与 B9-52 共 13 项、post-browser verify 和双次 `residualCount=0` cleanup 证据继续有效；B9-C1 已在基线 `ff3b55ba1d4422234a93c923d1a107c2bfd4c16e` 修复并定向重验 B9-51，七个固定 viewport、768×900 压力尺寸和最大化 Chrome 均通过，Browser 前后 prepared verify 与双次 cleanup 均通过。该只读 namespace 未执行全量 post-browser verify，符合本次定向合同且不构成缺陷。B9 最终为 51 active pass + B9-32 obsolete，B9 已完成。B10-A 当时只完成 fixture，Browser 验收尚未开始；该历史状态后续已由 B10-B5、B10-C 和 B10-C2 关闭，当前 B10 已完成。不填写不存在的 evidence commit。

B10-A 已建立 95 项完整唯一映射以及两个互不依赖的 profile；定向 E2E 1 suite / 7 tests、完整后端 E2E 25 suites / 117 tests、后端 lint / typecheck / build / unit、前端 lint / typecheck / build 均通过。两个 profile 的 prepare、prepared verify、显式 replace、再次 prepared verify 和双次 cleanup 冒烟均通过，第二次 cleanup 均为 `residualCount=0`、`matched=false`，canonical seed hash 全程不变。该阶段未启动 Browser、production frontend 或 Browser test backend，也未执行真实 A20 generate；这是当时状态，后续已由 B10-B5、B10-C 和 B10-C2 完成全部 95 项。Batch D 尚未启动；不填写不存在的 evidence commit。

B10-B4 已使 Stage baseline 支持合法 generation-workflow 进度：`first_generate_success` 产品 V1 draft 之后，scope-conflict 与 scale-not-ready 两个 allowlist stage 可按任一顺序执行，verifier 仍严格拒绝报告、scope/ownership/marker、stage 外 Instance、其他来源、seed、profile isolation 和资源总数漂移。Browser test backend 也已建立仅服务 B10-04 的 test-only、allowlist、进程内 one-shot 真实 HTTP 500，不依赖 Browser response mutation，不注册 production route；CORS 后置故障响应、安全 envelope、第二次真实产品请求、unrelated route 与业务数据零变化均由 E2E 和 browser_acceptance 冒烟证明。后端最终六项门禁为 lint、typecheck、build、89 suites / 761 unit tests、B10 定向 E2E 1 suite / 11 tests、full E2E 25 suites / 121 tests，另有 fixture replace/prepared verify、双 cleanup 与零残留证据。本阶段未启动 frontend 或 Browser；当时 B10-04、B10-36、B10-37、B10-40 为 `not_executed`，Browser 状态为 44 pass / 0 fail / 4 not_executed / 0 obsolete，B10-B 与 B10 尚未完成。该历史阻断后续已由 B10-B5 关闭；`public-surface-security` 后续也已由 B10-C2 收口。Batch D 尚未启动，不填写不存在的 evidence commit。

通用 Browser acceptance 基础设施现已接入 Playwright Test 1.62.0、Playwright Chromium 与 `@axe-core/playwright` 4.12.1。`frontend/test/browser-acceptance` 提供 synthetic infrastructure suite、显式启用的真实拓扑 smoke，以及可复用的 Context、Network、键盘、viewport、Axe、ARIA tree、可选 live-region helper、runtime、beforeunload 和安全输出模块。live-region helper 可以保留为可选技术能力，但不属于产品强制验收合同。通用基础设施阶段本身不代表产品验收；后续 B10-C2 已在真实 `long_report` 上定向完成 B10-89，不填写不存在的 evidence commit。

## 3. 标准静态门禁

在 `frontend` 目录且既有 `node_modules` 存在时，最终前端代码态执行：

1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`

三项必须分别报告，互不替代。lint 不证明类型和路由生成；typecheck 不证明 production build；build 不替代 lint 或全量 TypeScript 检查。定向检查只用于开发反馈，不能替代最终三项门禁。

若 `frontend/node_modules` 不存在，不得为验证擅自执行 `npm install`；应如实记录未执行项及原因。纯文档任务只执行文档与 Git 检查，不机械运行前端门禁。

静态门禁只能证明类型、白名单调用路径、App Router 路由生成和 production build，不证明真实 HTTP、Cookie / CORS、数据库状态、角色、并发、Browser 交互、响应式、键盘、Storage 或人工视觉已经通过。

## 4. Browser 通用验收策略

### 4.1 运行拓扑与 fixture 生命周期

Browser 验收必须使用 production frontend 和真实 test backend，不以 mock server、静态检查或伪造响应替代真实 HTTP。数据库用途固定为 `browser_acceptance`，后端和 fixture CLI 必须分别使用 app / `readWrite` 与 db_admin / `dbOwner` 独立进程；数据库门禁、凭据来源和 cleanup 规则见 backend testing playbook。

Playwright Test、Chromium 和 Axe 是当前 Browser acceptance 默认工具。配置固定 Chromium、`workers=1`、`fullyParallel=false`、`retries=0`、有界 timeout 和安全文本 reporter；config 不自动启动 mock server，不硬编码数据库、账号、密码或动态业务路径。BrowserContext、keyboard、Network control、viewport、Axe 等已有能力必须优先复用。当前工具不能满足新需求时，必须先执行工具适配判断并告知用户，不得直接重复自研 runner、协议客户端或测试框架；安装新工具仍由用户完成或经用户明确授权。多角色和双 Session 必须由 `browser.newContext()` 创建相互独立的 Chromium BrowserContext；不得通过清除同一 Context 的 Cookie 模拟角色或 Session 隔离，所有额外 Context 必须在 `finally` 关闭。

需要真实 Browser 拓扑并依赖 fixture 或数据库事实的独立完整验收 profile，按以下标准生命周期执行：

1. 根据本文待验项设计脱敏、确定性、可回收的 fixture contract，明确每个验证项的 primary owner、前置状态和预期副作用。
2. 执行 fixture `prepare` 或显式 `replace`，再执行只读 prepared verify；前置未通过不得进入 Browser。
3. 启动 production frontend 与真实 Browser test backend，确认 health、CORS、Cookie 和 origin。
4. 执行真实 Browser 矩阵；多角色、双 Session、并发和幂等必须使用真实独立会话，写请求不得自动重试。
5. 执行只读 post-browser verify，核对最终数据库事实、请求次数、无副作用和合同计数；verify 不创建、不修复、不删除业务结果。
6. logout、关闭 Browser、停止进程，按 namespace 精确 cleanup；再执行第二次幂等 cleanup，两次均要求 `residualCount=0`。

prepare / prepared verify 只说明账号和前置数据就绪，不等于 Browser 通过；Browser 场景通过但缺少与本次验收范围及副作用合同相匹配的后置只读验证，或缺少对本次实际创建资源的必要清理，不得宣布工程收口。完整 profile 必须执行完整 post-browser verify；定向重验按本节的 route-specific verifier、prepared re-verify 与组合证据规则执行。旧 Batch namespace、端口和临时文件名不是未来 fixture 合同。

#### 4.1.1 适用边界与组合证据

标准生命周期的强制执行单元是独立完整验收 profile，而不是所有 Batch 标签或所有验证项。独立完整验收 profile 可以是一个完整 Browser profile、一个具有独立 namespace、前置状态和 mutation contract 的验收矩阵，或一个必须独立形成 prepared、Browser、post-browser 和 cleanup 证据的验收范围。

以下情形必须执行完整生命周期：

1. 某一 profile 的首次完整 Browser 验收。
2. 新建或实质修改 fixture contract。
3. 修改 namespace ownership、数据库基线或资源矩阵。
4. 修改产品 mutation contract、状态机、并发、幂等或权限合同。
5. 修改 audit ID primary owner 或完整 route 映射。
6. 现有证据影响面无法被可靠限定。
7. 既有完整生命周期证据已经失效。
8. 需要重新证明整个 profile 的最终数据库终态。

上述完整生命周期仍须依次覆盖 fixture contract、prepare 或受控 replace、prepared verify、production frontend、真实 Browser test backend、完整 Browser 矩阵、post-browser verify、logout、Browser 与进程关闭、namespace cleanup 和第二次幂等 cleanup。prepared verify 未通过不得进入 Browser；Browser 页面通过不能替代数据库终态验证；完整 profile 不得省略 post-browser verify；创建 namespace 后不得省略双次 cleanup；fixture-ready、静态门禁或 E2E 均不得冒充 Browser 通过。数据库门禁和 fixture CLI 的具体规则继续以 backend testing playbook 为准。

纯静态门禁，lint、typecheck、build，Browser test list，synthetic infrastructure，不连接数据库的通用 Playwright helper 测试，实体设备验收，人工视觉或专业判断，以及不依赖 fixture 或数据库事实的独立检查，按各自合同执行，不机械套用完整 Browser fixture 生命周期。无论是否适用完整生命周期，均须清理本次实际创建的 BrowserContext、Chromium / Browser、Node 进程、服务端口、runtime、test-results、Session 和其他临时产物。

某一 profile 已完成完整生命周期后，明确、局部的测试资产缺陷或产品缺陷可以进行定向重验（定向回归）。定向写入 route 必须使用能够覆盖本次 mutation 的 route-specific verifier；全 profile fixture contract 允许时也可执行完整 post-browser verify。定向零写入 route 可以在 Browser 后执行 prepared re-verify，但必须证明报告、audit、`updatedAt` 和其他业务资源未变化。仅执行 cleanup 不能替代后置只读验证。

本次定向证据可以与仍然有效的既有完整生命周期证据组成组合证据，但必须同时：

- 明确引用既有完整生命周期证据，并列出本次定向重验的 route、audit ID 和缺陷影响范围。
- 明确本次未执行的步骤及其不适用原因。
- 说明既有 post-browser verify、Stage、mutation 和 cleanup 证据是否继续有效。
- 证明本次产生的 Session、Browser、进程、runtime 和 namespace 已完整收口。
- 确认没有跨数据库基线、fixture contract 或不兼容状态 / mutation contract 拼接证据。

组合证据不得替代某一 profile 的首次完整验收，不得以局部 Browser 通过替代从未执行过的完整 post-browser verify，不得无条件沿用旧产品代码证据或用历史通过掩盖本次实际 `fail` / `not_executed`，也不得省略影响面分析后直接宣布旧证据仍有效。

产品代码、fixture、数据库基线、mutation contract、角色权限、audit owner、route 映射或验收口径变化时，必须先分析影响面。只有能够可靠证明变化不影响既有通过范围，才可保留对应旧证据；无法可靠限定影响范围时，必须使用全新 namespace 重新执行完整生命周期。

只要本次创建了 namespace，就必须执行两次 cleanup：第一次要求 `residualCount=0`，第二次要求 `residualCount=0` 且 `matched=false`。未创建 namespace 的纯静态或 synthetic 任务不机械执行数据库 cleanup，但仍须清理其实际创建的 Session、BrowserContext、Browser、Node 进程、服务端口、runtime、test-results 和其他临时文件。

### 4.2 Network、Console、Storage、Cookie、CORS 与隐私

- Network：按请求类别记录 method、状态、次数、initiator 和安全 URL 模式；写请求必须验证白名单 Body、无自动 retry / polling / N+1。不得在报告中粘贴密码、动态内部 ID、完整请求体或响应体。
- Network 中止使用 Playwright `page.route()` / `route.abort()`，并保持一次性、可等待和有界；不得用 `route.fulfill()` 伪造真实后端 HTTP 状态。真实 500 继续由 Browser test backend 的 test-only fault 合同提供。Chromium initiator 诊断可使用 Playwright `browserContext.newCDPSession()`，不得自行建立 WebSocket CDP client。
- Console：稳定观察窗内检查 warn/error；不得输出完整业务响应、堆栈、患者数据、报告正文、token、Cookie 或内部 lineage/source ID。
- Storage：检查 localStorage、sessionStorage、IndexedDB 的 key / database / object-store 名称和禁止模式；value 只允许在同源 runtime 内做布尔扫描，不输出实际 value。
- Cookie：只判断脚本可读 Cookie 是否为空或是否命中禁止模式，不读取 HttpOnly Cookie，不导出 Cookie 存储。
- CORS：production frontend origin 必须被精确允许，credentials 正常；不得用关闭浏览器安全策略掩盖配置问题。
- DOM / URL：不得出现密码、token、Cookie、内部 ObjectId、metadata、Storage 定位、完整临床正文或其他非公开字段。
- 登录取证：密码框仍有值时不得采集完整 DOM；提交后确认登录页卸载或密码值清空，再进行 DOM、Console 或 Storage 取证。

### 4.3 Viewport 与响应式口径

- 主业务流程矩阵使用 Browser 的自然内容 viewport；不按每个 viewport 重跑完整矩阵，而是选择内容完整、布局风险较高的代表页执行响应式矩阵。
- 本节所有固定尺寸均指实际 CSS content viewport，即 `window.innerWidth × window.innerHeight`；不得以设备物理分辨率、Browser `outerWidth` / `outerHeight` 或截图尺寸代替。
- 强制代表性响应式尺寸为：
  - 手机竖屏：`390×844`。
  - 大屏 Android 平板竖屏：`800×1280`。
  - 大屏 Android 平板横屏：`1280×800`。
  - 大屏 iPad 竖屏：`1024×1366`。
  - 大屏 iPad 横屏：`1366×1024`。
  - 紧凑桌面：`1280×720`。
  - 桌面大屏：`1536×864`。
- `768×900` 不再是强制代表尺寸，仅在验证 768px 附近响应式断点、复现既有缺陷或修改公共响应式布局时作为补充压力尺寸。
- 固定 `1536×864` 是可重复的桌面大屏正式验收尺寸。另保留一次普通最大化 Chrome 的真实大屏补充抽查：页面缩放 100%，关闭 DevTools、浏览器侧边栏及其他会压缩页面的面板，实测 `window.innerWidth >= 1440`，并记录实际 `window.innerWidth` 和 `window.innerHeight`；该抽查不能替代固定 `1536×864`。
- 包含长表单或宽表格，Dialog、Modal 或多栏摘要，Canvas、连线、绘图或平板手写，图片、手写媒体或证据区域，题目定位及复杂操作区的页面，必须覆盖大屏 Android 平板与大屏 iPad 的横屏和竖屏。
- 每个固定 viewport 至少记录：实际 `window.innerWidth`、`window.innerHeight`；document 与 main 的 `clientWidth`、`scrollWidth`；是否存在非预期横向溢出；主要控件是否可见、可聚焦、可操作。
- 页面不得产生非预期 document/main 横向溢出。宽表格允许由明确的局部容器横向滚动；不得通过 html、body、main 或页面根容器的全局 overflow 隐藏布局问题。
- 本口径从 B9 及后续尚未执行的验收开始生效，不追溯重跑 B7、B8，也不改写其历史尺寸和通过证据。

### 4.4 键盘风险抽样

- 普通原生 `button`、`a`、`input`、`select`、`label` 不在每个场景重复完整 Tab / Shift+Tab / Enter / Space 矩阵，但仍自动检查语义、可访问名称和明显 `tabindex` 问题。
- 自定义复合控件、Modal / Dialog、菜单、下拉框、交互图表、Canvas、富文本、全局导航或焦点管理变更，以及无障碍修复，必须做真实键盘验证。
- 正式键盘证据使用 `page.keyboard.press()`、`page.keyboard.down()` 或 `page.keyboard.up()`，并由页面只读监听器证明 `keydown` / `keyup` 的 `isTrusted=true`。应覆盖 Tab / Shift+Tab、适用的 Enter / Space、focus-visible、焦点进入与离开区域和状态变化。
- raw CDP `Input.dispatchKeyEvent` 不再是唯一合法通道；只有 Chromium 协议级诊断才使用 Playwright `newCDPSession()`。不得以 `element.click()`、`node.click()`、合成 `KeyboardEvent`、修改 `checked/open`，或只检查 `tabindex` / role / DOM 属性替代真实键盘。
- 明显焦点陷阱始终阻断；鼠标/触摸优先不等于取消基本可访问性。

### 4.5 Axe、ARIA tree 与基础可访问性边界

- WCAG A / AA 自动扫描使用 Axe；默认输出只保留 rule ID、impact 与 node count，不保留完整 HTML、患者内容或 selector 路径，也不建立未经说明的全局 violation ignore 清单。
- ARIA tree 使用 Playwright ARIA snapshot，检查基本 role、accessible name 与结构；Axe 和 ARIA tree 自动检查不等同于屏幕阅读器专项验收。
- 基础可访问性继续强制覆盖原生 HTML 语义、表单 label、accessible name、错误提示的清晰可见语义、必要 role / ARIA 的基本合法性、真实键盘、自然焦点顺序和 focus-visible。
- 现有 `aria-live-audit.ts` 等 helper 可以保留为可选技术能力；live region、`aria-live`、`aria-busy` 的动态播报以及屏幕阅读器实际播报顺序、次数和时机，不属于本产品强制验收合同，也不是 Batch D 或 Batch E 的通过条件。
- 触摸、手写笔、软键盘和其他真实设备边界按具体真实设备或人工项目验收，不由 Axe 或 ARIA tree 替代。

### 4.6 重跑与测试产物

- Playwright 自动 retry 固定为 0，失败必须保留原始失败状态，不得由 runner 自动重跑掩盖竞态。
- trace、video 与自动 screenshot 默认关闭；失败上下文不得采集页面 ARIA/DOM 内容。确需截图时只能由测试显式调用安全截图 helper，且必须已离开登录密码状态、使用脱敏 fixture，并写入 Git ignored 的 `test-results`。
- 默认 outputDir、HTML/blob report、Browser auth 与 runtime 临时目录均须 Git ignored；公共 helper 与报告只输出结构化安全摘要，不输出密码、Cookie / Session、完整 URI、动态内部 ID、原始作答、临床报告正文、metadata、objectKey、完整 DOM 或完整请求/响应。

### 4.7 结果报告

每个验证项只能是 pass、fail、not_executed 或明确 obsolete；fixture-ready、静态通过、工具限制和人工待签收不得写成 pass。报告必须区分静态门禁、Browser 场景、automated boundary、人工验收、post-browser verify、cleanup 与产品缺陷。

## 5. Batch C 当前状态与合同：B7–B10 已完成

B7 的 40 项、B8 的 60 项与 B9 的 51 active pass + B9-32 obsolete 均已按既有证据闭环。B10-B5 已使用全新 namespace 完整重跑 `generation-workflow`，48 项全部通过，post-browser verify、logout/停服与双次 cleanup 均闭环。B10-C 原完整 Browser 证据与 B10-C1 定向证据组合使其余 46 项、完整 post-browser verify 与双次 cleanup 继续有效；B10-C2 已在真实 `long_report` 上用 Playwright Chromium 定向通过 B10-89，Browser 前后 prepared verify、logout/停服、临时 runtime 删除与双次 cleanup 均闭环，产品业务写入为 0。B10 最终为 `generation-workflow` 48 pass + `public-surface-security` 47 pass，共 95 项完成；Batch C / B7–B10 已完成。Batch D 的 B11-B `core-workflow` 58 个 Browser audit ID、B11-C `resilience-security` 11 个 Browser audit ID 与 B11-70 static-gate 均已通过，共 70 项完成，B11 已完成。Batch D 尚未完成，下一阶段为 Batch D / B12。以下序号与减肥前基线完全一致，fixture-ready、静态门禁、synthetic infrastructure 或 automated boundary 不得替代真实 Browser 项。

阶段所有权口径：条目中的“页面不存在后续能力/入口”用于证明本阶段组件或动作不创建、不自动触发、不越权接管后续能力；后来已实现的 B8–B16 sibling 区域可以按当前状态合法共存。执行时应限定目标组件 DOM、请求 initiator 和动作前置状态，不得用页面全局文本误判，也不得为了满足旧阶段字面值隐藏当前合法能力。

### 5.1 B7 阶段性评分：40 项（已完成）

Fixture 前置：准备 draft / in_progress / completed / locked / voided 实例，completed 无结果、已有 provisional 结果、复核队列、warning、incomplete、voided、冲突、401/403 和网络失败状态；全部为脱敏 MMSE / MoCA 数据。

1. draft / in_progress 实例不请求 latest。
2. completed 实例自动查询 latest。
3. latest 无结果显示“尚未计算”，不显示系统错误。
4. 页面加载不自动 compute。
5. 计算前出现内联说明和 checkbox。
6. 未勾选不能计算。
7. compute 只发送 confirm=true。
8. compute 期间重复按钮禁用。
9. compute 成功展示 provisional 结果。
10. alreadyComputed=true 按成功处理。
11. 页面刷新后 latest 能重新加载同一结果。
12. 有待复核项时 scorePercent 不显示。
13. 部分得分不显示成最终总分。
14. null 得分不显示成 0。
15. countsTowardTotal=false 显示过程记录。
16. groupScores 不标记为认知域。
17. reviewQueue reason 中文映射正确。
18. reviewQueue 能定位原题。
19. itemResponseId=null 不提供虚假定位。
20. 评分结果不显示原始作答。
21. 不显示 expectedValue。
22. 不显示 scoringRule。
23. 不显示正确答案或 isCorrect。
24. 不显示 reviewer 内部信息。
25. warning 不显示成诊断风险。
26. completed / locked / voided 历史结果只读。
27. locked / voided 且无结果时不能首次计算。
28. SCORE_RESULT_INCOMPLETE 显示管理员处理提示。
29. SCORE_RESULT_VOIDED 不提供重算。
30. SCORE_COMPUTATION_CONFLICT 后重新加载 latest。
31. 401 返回登录页。
32. 403 显示无权限而不是无结果。
33. 网络错误不影响题目和媒体历史展示。
34. 页面不存在重新计算按钮。
35. 页面不存在人工分数输入。
36. 页面不存在评分确认、认知域或报告入口。
37. 页面不显示诊断阈值或疾病判断。
38. 小屏幕评分区域可正常使用。
39. 未使用真实患者或医疗数据。
40. 页面没有新增路由。

B7 已完成，40 项全部闭环。组合证据为：原完整 Browser 验收中 B7-01–B7-37、B7-39、B7-40 通过，完整 post-browser verify 通过，双次 cleanup 均为 `residualCount=0`；B7-38 修复后在 390×844、768×900、1280×720 的定向回归通过，三个 viewport 的 document/main 与阶段性评分卡片均无横向溢出，展开题目分值、技术信息和人工评分表单后操作仍可用，每次页面加载均为 latest GET 1 次、compute POST 0 次，Browser 前后 prepared verify 通过，双次 cleanup 均为 `residualCount=0`。定向回归未执行 compute，其 namespace 正确保持 prepared 状态；要求 `first_compute_idempotency` 已产生写终态的 post-browser verify 不适用于该只读回归，其 phase 不匹配失败不推翻原完整验收的 post-browser 证据，也不构成当前阻断。B8 已完成，60 项全部闭环；B9 也已按组合证据完成。B10-A 当时仅完成 fixture、尚未开始 Browser 验收；后续已由 B10-B5、B10-C 和 B10-C2 完成 B10 全部 95 项。

### 5.2 B8 人工评分与显式确认：60 项

Fixture 前置：准备 needs_review、auto_scored、not_scored、manual_scored、最后一项待复核、warning、pending、confirmed、locked、审计上限、metadata 异常、双 Session stale、401/403 与网络失败状态。

B8 fixture 按互不依赖的两个 profile 执行：`core-workflow` 覆盖人工评分、输入校验、服务端汇总、复核队列、显式确认与只读状态；`resilience-security` 覆盖并发/stale、401/403、网络失败、草稿保护、安全审计、隐私与响应式。每个 B8 编号只属于一个 profile；两者使用独立 namespace、manifest、prepared / post-browser verifier 与 cleanup 范围。`core-workflow` 的 39 项与 `resilience-security` 的 21 项均已完成；`resilience-security` post-browser verify 通过，双次 cleanup 均为 `residualCount=0`。B8 共 60 项全部闭环，B8 已完成。

1. needs_review 项出现人工评分入口。
2. auto_scored 项不允许人工评分。
3. not_scored 项不允许人工评分。
4. itemResponseId 为空不显示人工评分入口。
5. 人工评分输入 0 可正常提交。
6. 空分值不能提交。
7. 非有限数值不能提交。
8. 超出 min / max 前端阻止。
9. 前端不猜测 step，number input 使用 step="any"。
10. 后端 step 错误稳定显示并保留输入。
11. reviewNote 少于 3 字符不能提交。
12. reviewNote 超过 2000 字符不能提交。
13. manual-review 只发送 scoreValue、reviewNote、expectedUpdatedAt。
14. 成功后 reviewQueue 使用服务端返回并减少。
15. 成功后 total / group / item 使用服务端返回值。
16. 成功后 updatedAt 变化。
17. manualReview 显示操作者、时间和意见。
18. manual_scored 在确认前可修订，预填最新服务端分值与公开意见。
19. 同时只能打开一个人工评分表单。
20. dirty 表单阻止直接切换目标，并提供明确放弃操作。
21. dirty 人工评分或确认意见触发 beforeunload，且计数与作答 / 媒体分开。
22. SCORE_RESULT_REVIEW_CONFLICT 后保留输入。
23. 人工评分并发冲突后自动刷新一次 latest。
24. 冲突后不会自动重发 PATCH。
25. 基于旧版本的表单禁用提交。
26. 用户明确基于最新结果继续后可再次提交，且不重置输入。
27. metadata 异常禁止继续写入并提示管理员。
28. 审计上限禁止继续人工评分或修订。
29. 最后一项人工评分成功后只按服务端 computed 展示。
30. reviewQueue 清空且全部资格满足后显示确认入口。
31. 有 warning 时不显示可用确认。
32. 有 pending 项时不能确认。
33. 确认意见少于 3 字符不能提交。
34. 未勾选 checkbox 不能确认。
35. confirm 只发送 confirm、reviewNote、expectedUpdatedAt。
36. confirm 期间人工评分与重复 confirm 禁用。
37. 确认成功后 status=confirmed。
38. 确认成功后 isFinal=true 与 totalScore.isFinal 使用服务端事实。
39. qualityStatus=passed 只显示“评分复核流程已通过”。
40. 确认成功后 confirmation 安全摘要正确。
41. alreadyConfirmed=true 按成功处理且不再次 POST。
42. confirmed 页面不显示人工评分输入和确认按钮。
43. locked 页面只读，且不把 confirmed 称为 locked。
44. confirmation 缺失时不冒充施测或复核操作者。
45. confirmation conflict 后保留意见、清除 checkbox 并刷新 latest。
46. confirmation warning 不允许忽略。
47. confirmed 不显示成 locked。
48. confirmed 总分显示为确认得分。
49. groupScores 显示为分组得分，不称为认知域。
50. 评分区域不显示原始作答、expectedValue、scoringRule、正确答案或 isCorrect。
51. 页面不显示 previousScoreValue、metadata 或完整审计历史。
52. 页面不输出诊断阈值、正常 / 异常或疾病判断。
53. 页面不存在 lock、void、reopen、rerun 或 runNo=2 入口。
54. A18 401 返回登录页。
55. A18 403 显示无权限，保留已有安全结果与本地输入。
56. 网络失败保留本地人工评分与确认输入。
57. 页面刷新不保留未提交人工评分、确认意见、updatedAt 或回执。
58. 全部验证不使用真实患者或医疗数据。
59. 页面没有新增路由，题目定位不修改 URL 且不丢失各类草稿。
60. lint、typecheck、build 均通过。

`core-workflow` 的 B8-01–B8-19、B8-29–B8-44、B8-47–B8-49、B8-60 共 39 项已全部闭环；core post-browser verify 通过，双次 cleanup 均为 `residualCount=0`。`resilience-security` 的 B8-20–B8-28、B8-45–B8-46、B8-50–B8-59 共 21 项已全部闭环；完整 Browser 验收 21 项全部通过，post-browser verify 通过，双次 cleanup 均为 `residualCount=0`，不填写尚不存在的 evidence commit。B8 共 60 项全部闭环，B8 已完成；B9 也已完成。B10-A 当时仅完成 fixture、尚未开始 Browser 验收；该历史状态后续已关闭，当前 B10 已完成。

### 5.3 B9 认知域计算与安全展示：52 项

Fixture 前置：准备无评分、needs_review / computed、confirmed / locked / voided ScoreResult，认知域无结果、computed / locked / voided、单域、多域、excluded、null、mapping 异常、冲突、401/403 与网络失败状态。

B9 fixture 按互不依赖的两个 profile 建成：`core-workflow` 覆盖 B9-01–B9-38（19 route），其中 37 active + 1 obsolete（仅 B9-32）；`resilience-security` 覆盖 B9-39–B9-52（11 route），14 项全部 active。每个编号只有一个 primary owner；两个 profile 使用独立 namespace、manifest、prepared / post-browser verifier 与 cleanup ownership，未执行某个 profile 时不得要求其 post-browser verify 通过。Audit disposition 只允许 `active` 或 `obsolete`；obsolete 项必须有稳定原因，且不参与 Browser 请求、Session evidence 或 post-browser 写终态要求。

B9-B5 已基于 `ed37e22dab3950e62bf434572f5a4bd4a983227a` 使用全新 namespace `b9c-b9b5-20260726-f3a7` 完整重跑 19 条 `core-workflow` route；B9-01–B9-31、B9-33–B9-38 的 37 个 active 项全部通过，B9-32 保持唯一 `obsolete`。关键状态如下：

- `answer_dirty`、`media_dirty`、`manual_score_dirty`、`confirmation_dirty`、`score_writing` 均以对应本地 dirty / writing 提示作为认知域区域首要安全阻断；清除或结束本地状态后分别回退到原有实例、来源评分或本地确认草稿提示。五条 route 的 cognitive-domain compute POST 均为 0；`score_writing` 的最终有效轮次只产生一次评分确认 POST，并在到达服务端前受控中止。
- `domainScores` 的 response 与 DOM 顺序均为 `attention`、`executive_function`、`language`、`memory`；`itemContributions` 的 response 与 DOM 顺序逐项一致，依次为 `mmse.orientation.time|memory`、`mmse.orientation.place|attention`、`mmse.orientation.place|executive_function`、`mmse.memory.immediate_recall|memory`、`mmse.memory.immediate_recall-unlocatable|language`。
- 展开 mapping 技术摘要后，`scoreResultCode`、`domainResultCode`、`runNo`、`status`、`reviewStatus`、时间、mapping、computation 与 versionTrace 仍存在；两个内部 ID、对应标签以及 `aria-*`、`title`、`data-*` 属性泄漏均不存在。
- B9-04 通过真实产品 UI 确认评分，业务请求为 score-confirm POST 1 次、cognitive latest GET 1 次、compute POST 0 次；首次 compute 仅发送 `{confirm:true}` 一次并创建合法 runNo=1 computed 结果，幂等 compute 返回 `alreadyComputed=true` 且结果不变。
- B9-32 的唯一 owner route 是 completed / confirmed 的整页只读页面，实际不存在任何可合法建立的本地作答、媒体、人工评分或确认草稿；定位本身已由 B9-30 覆盖不改 URL、正确聚焦与合法贡献定位，本地草稿保护由 B9-10 和既有 B8 验收覆盖。B9-32 因此仅标记为 `obsolete` 并保留稳定原因，不得写成 pass、`not_executed` 或通过非法 fixture 满足。
- Seed-drift E2E 现在从与 fixture canonical hash 完全相同的 MMSE/MoCA definition/ScaleVersion 受保护集合选择目标；底层 collection 确认 `displayVersion` 原始字段已变化后，hash 变化且 prepared verify 返回 `B9_FIXTURE_BASELINE_INVALID`，完整原始 BSON 在 `try/finally` 恢复，随后 hash 与 prepared verify 均恢复。
- score-confirmation-only verifier 只允许真实 A18 confirm 的 status、confirmedAt、qualityStatus、updatedAt、五个 review 字段和 `metadata.a18Confirmation` 变化，并显式核对三方时间、review/audit 内容、namespace doctor/admin 操作者及 domain result=0；itemScores、total/group score、versionTrace、operatorNote、review/audit 不一致、额外 metadata 或意外 domain 结果均被负向 E2E 拒绝。
- B9 定向 E2E 为 1 suite / 7 tests 全通过，完整 E2E 为 24 suites / 110 tests 全通过；全新 core namespace 的 prepare、prepared verify、显式 replace、再次 prepared verify 全通过，两次 cleanup 均为 `residualCount=0`。本阶段未启动 Browser、production frontend 或 Browser test backend，也未执行真实认知域 compute 或评分确认 HTTP 写入。
- post-browser verify 通过；logout、Browser/服务关闭和端口释放完成；两次 cleanup 均为 `residualCount=0`，第二次 `matched=false`，全局 seed、其他 namespace 与非 namespace 数据未受影响。
- B9-B5 产品缺陷 0、fixture 缺陷 0、稳定环境限制 0；不填写不存在的 evidence commit。

B9-B `core-workflow` 已完成，口径为 37 active pass + B9-32 obsolete。B9-C `resilience-security` 在基线 `977e3ce053dd13aae1965534409e209a0cb5d64e` 完整执行的 B9-39–B9-50 与 B9-52 共 13 项、完整 post-browser verify、logout/停服和双次 `residualCount=0` cleanup 证据继续有效。B9-C1 基于 `ff3b55ba1d4422234a93c923d1a107c2bfd4c16e` 修复认知域结果收缩链后，仅定向重验 B9-51：390×844、800×1280、1280×800、1024×1366、1366×1024、1280×720、1536×864 七个固定 viewport 与 768×900 压力尺寸全部满足 document/main `scrollWidth=clientWidth`，Card、CardContent、结果 Grid、得分、贡献和 mapping 区域均随父容器收缩；七列表保留约 1180 CSS px 宽度，仅在局部 wrapper 横向滚动。390、800、1024 三个原失败宽度滚到最右端后“查看原题”可见、可聚焦、可触发且 URL 不变。最大化 Chrome 在 zoom=100% 下实测 1536×647，无全局横向溢出；整轮只有 latest GET 200×1，compute 与其他业务写请求均为 0，纯 resize 未产生请求，Console warn/error 为 0。Browser 前后 prepared verify 均通过，双次 cleanup 均为 `residualCount=0`，第二次 `matched=false`；本次只读 namespace 未执行全量 post-browser verify，符合定向合同，不是产品、fixture 或环境缺陷。B9 最终为 51 active pass + B9-32 obsolete，B9 已完成。B10-A 当时仅完成 fixture、尚未开始 Browser 验收；后续已完成 B10 的 95 项。不填写不存在的 evidence commit。

1. 未生成评分结果时不请求认知域 latest。
2. needs_review / computed 未确认评分不请求认知域 latest。
3. confirmed 评分自动查询认知域 latest。
4. B8 confirm 成功后自动查询一次 latest。
5. latest 无结果显示“尚未计算”，不是系统错误。
6. 页面加载不自动 compute。
7. 计算前出现重叠归因和非诊断说明。
8. 未勾选 checkbox 不能计算。
9. compute 只发送 confirm=true。
10. 本地作答 / 媒体 / 评分草稿或写请求阻止 compute。
11. compute 期间重复操作禁用。
12. compute 成功展示结果。
13. alreadyComputed=true 按成功处理。
14. 页面刷新后 latest 返回同一结果。
15. 已有结果不显示重算按钮。
16. computed 结果显示尚未独立确认。
17. locked / voided 结果只读。
18. domain score 不按分数排名。
19. scoreValue=null 不显示为 0。
20. scorePercent 只使用服务端值。
21. scorePercent 文案不是正常率或疾病概率。
22. domainScores 不进行前端求和。
23. 页面明确认知域不能相加解释为量表总分。
24. 单 domain 项展示正确。
25. 多 domain 项保留多条合法贡献。
26. 多 domain 项不平均拆分分值。
27. 同 item 同 domain 后端去重结果不被前端重复生成。
28. countsTowardDomain=false 显示排除。
29. contribution 没有伪造 minScore。
30. contribution 能定位原题。
31. itemResponseId=null 不提供虚假定位。
32. 定位不丢失其他分组草稿。
33. mapping policy 展示正确。
34. interpretation 四项安全字面值展示正确。
35. interpretation 异常时显示安全警告。
36. computation / versionTrace 展示正确。
37. source ScoreResult 摘要展示正确。
38. warning 不显示为患者风险。
39. `COGNITIVE_DOMAIN_RESULT_INCOMPLETE` 显示管理员处理提示。
40. `COGNITIVE_DOMAIN_RESULT_VOIDED` 不提供重算。
41. `COGNITIVE_DOMAIN_COMPUTATION_CONFLICT` 后刷新 latest。
42. `COGNITIVE_DOMAIN_SOURCE_SCORE_NOT_FINAL` 不自动确认评分。
43. `COGNITIVE_DOMAIN_MAPPING_UNAVAILABLE` 不提供客户端自定义映射。
44. 401 返回登录页。
45. 403 显示无权限而非无结果。
46. 网络错误不影响题目、媒体和评分展示。
47. 页面不显示原始作答、评分意见或评分规则。
48. 页面不显示诊断阈值、正常 / 异常或疾病结论。
49. 页面没有认知域人工编辑、确认、lock、void 或 rerun。
50. 页面没有新增路由。
51. 小屏幕认知域区域可正常使用。
52. 不使用真实患者或医疗数据。

### 5.4 B10 规则化临床报告草稿：95 项

B10 fixture 固定拆分为两个互不依赖的 profile：`generation-workflow` 覆盖 B10-01–B10-45、B10-93–B10-95，共 48 项、10 个 scenarioKey、26 条 route；`public-surface-security` 覆盖 B10-46–B10-92，共 47 项、13 个 scenarioKey、21 条 route。每个 profile 各有 5 个角色，并使用独立 namespace、manifest、prepared / post-browser verifier 与 cleanup ownership；未执行某个 profile 时不得要求其 post-browser verify 通过。`generation-workflow` prepared 合同计数为 patients 10、visits 26、instances 39、ScoreResults 8、CognitiveDomainResults 6、MediaEvidence 21、ClinicalReports 5；post-browser 将 fixture-owned stage 与产品副作用分开：`first_generate_success` 只允许新增一份产品 V1 draft，`scope_conflict/base` 只允许一份 staged 不同 scope draft，`source_readiness_errors/scale_not_ready` 只允许单一 Instance 状态 transition，其余来源链不得改变。B10-34 与 B10-39 全部业务数据零变化，B10-36/37 和 B10-40 的 generate 自身零写入。`public-surface-security` prepared / post-browser 合同计数均为 patients 13、visits 21、instances 24、ScoreResults 2、CognitiveDomainResults 2、MediaEvidence 4、ClinicalReports 19，整个 profile 业务数据零变化。

B10 fixture 当前最终代码态门禁为：后端 lint、typecheck、build、89 suites / 761 unit tests、定向 E2E 1 suite / 14 tests、完整 E2E 25 suites / 124 tests 全部通过；standard_test 实际连接 `cogmemory_ad_test`。B10-B2 使用全新 namespace 在隔离 `browser_acceptance` / `cogmemory_ad_browser_test` / dbOwner 进程完成 prepare、prepared verify、scope-conflict stage×2、scale-not-ready stage×2、显式 replace、再次 prepared verify 与双次 cleanup；重复 stage 均 `alreadyStaged=true`，两次 cleanup 均 `residualCount=0` 且第二次 `matched=false`，canonical seed hash 全程不变。B10-B4 进一步覆盖 first generate 后的双 stage 任意顺序、严格漂移拒绝、受控真实 500 和无 fault 零影响，并再次完成 replace/prepared verify、双 cleanup 与残留审计。稳定 `B10_FIXTURE_PASSWORD` 未进入 Git diff；B10-B4 未启动 Browser 或 frontend，也未执行正式 Browser 验收。

`generation-workflow` 原有 40 个 pass 事实继续有效。B10-B1 基于 `05d0ca98f17f111d1c8805f2a15df30f2df8d893` 完成 B10-05、B10-21、B10-22 产品修复与定向 Browser 复验。B10-B2 已完成剩余五项前置：B10-34 的请求 scope 只从 latest 公开 `scaleTraces` 中筛选非 null、合法、唯一 ID，并按 A20 规则稳定排序；scope conflict 与 scale-not-ready 使用显式 stage；B10-39 由 namespace-owned blocker 和 partial unique index 确定性产生 generation conflict。两种 stage 均不依赖 response 伪造或 XHR interception。

B10-B3 在基线 `ab1a5941857a1da3b524b3c4ab2cfeba733878a1` 使用全新 namespace `b10g-b10b3-20260727-k4m2` 完整触达 `generation-workflow` 的 10 个 scenarioKey / 26 条 route。backend build、B10 fixture 定向 E2E 1 suite / 8 tests、frontend lint / typecheck / build、prepare 与 prepared verify 均通过；B10-05 的旧 latest cancelled、新 latest 404 唯一生效，B10-21/22 的首次生成入口 DOM 数量为 0，B10-34 返回 `alreadyGenerated=true`，B10-39 为真实 404 → 409 → 404；首次生成仅发出一次白名单 Body 的 POST，并直接采用响应。历史阻断一：当时 Browser 工具不支持受控真实 HTTP 500，且验收禁止 response mutation，因此 B10-04 为 `not_executed`。历史阻断二：两个 allowlist stage 都在对应 Browser 前置动作后各调用一次，但 `verifyStageBaseline` 因更早的 `first_generate_success` 合法新增 V1 draft 与 prepared baseline 不同而在变更前返回 `B10_FIXTURE_SCENARIO_INVALID`；没有 staged report 或 Instance transition，故为避免未授权产品写入，B10-36、B10-37、B10-40 均为 `not_executed`。post-browser verify 因缺少合同要求的第二份新增报告返回 `B10_FIXTURE_ROOT_MATRIX_INVALID`。production frontend、Browser backend 与 Browser 已关闭，端口已释放；两次 cleanup 均为 `residualCount=0`，第二次 `matched=false`，canonical seed hash 不变。当时状态为 44 pass / 0 fail / 4 not_executed / 0 obsolete，B10-B 与 B10 尚未完成；上述阻断后续已由 B10-B4 修复并由 B10-B5 完成重跑，`public-surface-security` 后续也已完成。Batch D 尚未启动；不存在可填写的新 evidence commit。

B10-B4 已完成 B10-B3 所列两项测试资产阻断：Stage verifier 现按合法进度矩阵计算报告总数，并在 first generate 后接受两个 allowlist stage 的任一顺序；受控 500 固定为目标 GET 的第一次真实 500，第二次和其他 route/method 均回到真实产品链。配置缺失、错误 profile/scenario/route、非 browser_acceptance、错误数据库/密码以及任何 path/status/body 扩展均拒绝，未配置时 Browser backend 行为不变。该结论来自后端 E2E 与不启动 Browser/frontend 的 browser_acceptance HTTP 冒烟，不能记作四项正式 Browser pass；当时状态仍为 44 pass / 0 fail / 4 not_executed / 0 obsolete，下一步是使用全新 namespace 完整重跑 `generation-workflow`。该历史待办后续已由 B10-B5 关闭，`public-surface-security` 后续也已完成；Batch D 尚未启动，不存在可填写的新 evidence commit。

B10-B5 基于 `8be7b50c97521e00dbf379d976e8364b85a93590`，使用全新 namespace `b10g-b10b5r-20260727-m8p2`、production frontend、Browser test backend 与真实 Browser 完整重跑 `generation-workflow` 的 10 个 scenarioKey / 26 条 route。backend build、B10 fixture 定向 E2E 1 suite / 11 tests、frontend lint / typecheck / build、prepare 与 prepared verify 均通过；standard_test 实际库为 `cogmemory_ad_test`，Browser backend 与 fixture CLI 实际库均为 `cogmemory_ad_browser_test`，角色分别为 app / `readWrite` 与 db_admin / `dbOwner`，配置未叠加 `.env.test`。B10-04 为真实 HTTP 500 → 手工重试 → 产品 404，B10-05 为旧 latest aborted、新 latest 404 唯一生效；B10-34 返回 `alreadyGenerated=true`，B10-36/37 为 404 → Stage → 409 → latest 200，B10-39 为 404 → 409 → 404，B10-40 为 ready snapshot → Stage → 409。逐 route 账本共记录 latest GET 27 次、generate POST 9 次；所有 generate Body 仅有 `confirm` 与 `primaryScaleInstanceIds`，无写请求 retry、polling 或 A17/A18/A19 扇出。`first_generate_success` 只新增一份合法产品 V1 draft；scope-conflict staged report 与 scale-not-ready 单一 Instance transition 均符合 fixture-owned 合同，其余产品 route 数据库零变化。post-browser verify 通过，ClinicalReports 从 prepared 5 变为 7；五类角色真实 Session 均已建立并 logout，Console、Storage、HttpOnly Cookie、CORS、DOM/URL 与基础隐私检查通过，Browser/服务关闭且端口释放。两次 cleanup 均为 `residualCount=0`，第二次 `matched=false`，canonical seed、其他 namespace 与非 namespace 数据未受影响。B10-01–B10-45、B10-93–B10-95 共 48 项全部通过，B10-B `generation-workflow` 已完成；当时下一项为 `public-surface-security`，后续已由 B10-C 与 B10-C2 完成。Batch D 尚未启动，B9 已完成事实保持不变，不填写不存在的 evidence commit。

B10-C 基于 `44ac1f3ddb5bb2352a4215b20fee8a628035016f`，使用全新 `b10p-` namespace、production frontend、Browser test backend 与真实 Browser 完整执行 `public-surface-security` 的 13 个 scenarioKey / 21 条 route / 47 项。B10-85 当时为产品缺陷：真实 generate POST 在服务端写入前中止后，scope 保留且无 retry，但确认 checkbox 被清除，不符合网络失败状态保留合同。B10-89 当时为 fixture / 测试资产阻断：合同声明 `long_report` 提供 native checkbox 目标，实际代表页 checkbox 数量为 0；真实 Tab / Shift+Tab 与可见焦点环已在 1536×864、390×844 执行，但当时 Browser 键盘注入未能可靠触发 Enter / Space，故未以 DOM 属性替代。其余 45 项通过；B10-88 的七个固定 viewport、768×900 压力尺寸和 zoom=100% 的最大化 Chrome 均无全局横向溢出，最大化 Chrome 实测 `1536×703`。post-browser verify 通过，prepared / post-browser 资源计数及 hash 完全一致，ClinicalReports 保持 19，profile 业务数据零变化，canonical seed 不变；五角色 Session 已 logout，Browser / Chrome 与服务已关闭，3002 / 5002 已释放；两次 cleanup 均为 `residualCount=0`，第二次 `matched=false`。B10-B `generation-workflow` 48 项完成事实、B9 已完成事实均保持不变；B10-C 当时尚未完成，上述 B10-85 后续由 B10-C1 修复，B10-89 后续由 B10-C2 完成。Batch D 尚未启动，不填写不存在的 evidence commit。

B10-C1 基于 `7c594e811283425b819a85b33ab1a68adf1d85c5` 修复 B10-85 与 B10-89 fixture 前置，并定向复验 B10-85、B10-88、B10-89。最终代码态 backend lint / typecheck / build、B10 fixture 定向 E2E 1 suite / 13 tests，以及 frontend lint / typecheck / build 均通过；standard_test 实际库为 `cogmemory_ad_test`。`long_report` 现使用显式 `long_pending_confirmation`：`pending_confirmation`、`mixed`、合法 submission、医生文本、长 narrative、3 个 scale trace、多个 snapshot、`aiUsed=false`、`confirmation=null`、`isFinal=false`，合同明确声明 button / checkbox / link / details，prepared verifier 同时保护确认资格、submission、合法 trace 与技术摘要。B10-85 的 latest GET 与 generate POST 各中止一次：均无自动 retry / polling；generate 失败后 scope 顺序、确认区和已勾选 checkbox 保留，错误可见、按钮恢复可用，Body 仍仅含 `confirm` 与 `primaryScaleInstanceIds`，未自动 refreshLatest，ClinicalReports 前后均为 0。B10-88 在 390×844、800×1280、1280×800、1024×1366、1366×1024、1280×720、1536×864、768×900 全部无全局横向溢出；最大化 Chrome 为 innerWidth 1536、visual scale 1，长文本、多 trace、确认区域与技术摘要均可用，业务写请求为 0。B10-89 在第一个正式 Tab 前调用同一 CDP 会话的 `Input.dispatchKeyEvent` 即被控制层明确拒绝为 unsupported；按验收合同停止，未使用 CUA、`element.click()`、合成 KeyboardEvent 或 DOM 属性替代，故两个 viewport 当时均为 `not_executed`。定向 namespace 的 Browser 前后 prepared verify 均通过；按定向合同未执行全量 post-browser verify，原完整 post-browser verify 证据继续保留。logout、Browser / 服务关闭、3002 / 5002 释放完成；cleanup 1 为 `residualCount=0` / `matched=true`，cleanup 2 为 `residualCount=0` / `matched=false`，canonical seed 不变。当时 `public-surface-security` 为 46 pass / 0 fail / 1 not_executed；该历史阻断后续已由 B10-C2 关闭，B10-C 与 B10 均已完成。Batch D 尚未启动，不填写不存在的 evidence commit。

B10-C2 基于 `c0922c47aa9467f85eae6ea97814d091bbe010de` 使用 Playwright Chromium 定向复验 B10-89。一个 spec 在 1536×864 与 390×844 两个独立 BrowserContext / Session 内完成真实 Tab、Shift+Tab、Enter 和 Space；button、native checkbox、details summary 与 scale link 均由自然 Tab 顺序到达，keydown / keyup 均为 `isTrusted=true`，`:focus-visible` 及可见 outline / box-shadow 通过，焦点可离开并 Shift+Tab 返回报告区。button Enter 打开确认表单，checkbox 两次 Space 完成 false → true → false，details 切换后恢复初始状态，scale link Enter 进入既有单量表路径。未对目标控件使用 click、合成 KeyboardEvent、checked/open 属性修改或 `locator.focus()` 跳过自然顺序。Playwright runner 不连接 MongoDB；固定 `public-surface-security/responsive_keyboard/long_report/doctor` 的七字段临时 runtime 描述仅作为路径桥接，生成前 prepared verify 通过，测试后已删除且未进入 Git。两个 Session 均通过真实 login 建立并 logout；报告确认、编辑、提交及 A17/A18/A19 写请求均为 0，产品业务写请求为 0，Storage、HttpOnly Cookie、CORS 与 URL 审计通过。Browser 前后 prepared verify 均通过，ClinicalReports 保持 19，业务 hash 与 canonical seed 不变；按定向合同不重跑全量 post-browser verify，原 `public-surface-security` 其余 46 项、完整 post-browser verify 和双 cleanup 证据继续有效。Browser / 服务均已关闭，端口已释放；cleanup 1 为 `residualCount=0` / `matched=true`，cleanup 2 为 `residualCount=0` / `matched=false`。B10 最终为 `generation-workflow` 48 pass + `public-surface-security` 47 pass，共 95 项完成；Batch C / B7–B10 已完成。Batch D 尚未启动，下一阶段为 Batch D / B11；不填写不存在的 evidence commit。

Fixture 前置：准备 Visit 无报告、合法 scope、不同实例状态、draft / confirmed / voided / incomplete 报告、scope/source 冲突、缺评分/认知域/媒体、历史 confirmation、401/403 与网络失败；报告内容和意见必须脱敏且无临床含义。

1. 访视详情成功后自动查询 report latest。
2. 量表目录失败不阻止 latest。
3. latest 无报告显示正常 not_found。
4. latest 失败不清除访视详情和实例列表。
5. latest 提供独立手工重试，新请求取消旧请求，Abort 不显示错误。
6. 页面不自动 generate。
7. draft 实例不可选择。
8. in_progress 实例不可选择。
9. voided 实例不可选择。
10. completed 实例可作为候选。
11. locked 实例可作为候选。
12. completed / locked 不显示成“已满足全部报告条件”。
13. 初始不自动勾选任何实例。
14. scope 最少 1 项。
15. scope 最多 10 项。
16. 重复 ID 与非法 MongoId 被阻止且不静默去重。
17. scope 按 scaleCode / instanceNo / id 稳定顺序发送。
18. 更改 scope 后关闭确认区、清除 checkbox 与旧生成错误。
19. 全选只由用户触发且最多选择稳定前 10 项。
20. report loaded 时不显示 scope 控件。
21. Visit locked 时无首次生成入口。
22. Visit voided 时无首次生成入口。
23. 生成前显示 version 1 与 scope 固定性说明。
24. 生成前显示未使用 AI。
25. 生成前显示 draft 尚未经医生确认。
26. 生成前显示非诊断、认知域重叠和媒体仅索引边界。
27. 未勾选确认 checkbox 不能生成。
28. generate body 只发送 confirm 与 primaryScaleInstanceIds。
29. 请求不包含 snapshot、narrative、metadata、状态、版本或服务器编号。
30. generate 期间 scope 与量表初始化提交真实 disabled。
31. generate 不自动重试、不轮询、不自动刷新整页。
32. generate 成功直接展示服务端完整报告。
33. alreadyGenerated=false 显示首次生成 draft 回执。
34. alreadyGenerated=true 按成功处理并说明未重复生成。
35. 相同 scope 不显示为重生成能力。
36. scope conflict 后自动 latest 一次。
37. scope conflict 不提供覆盖或改写入口。
38. voided report 只读且不提供重生成。
39. generation conflict 后不自动重发 POST。
40. source scale not ready 保留 scope 与量表查看入口。
41. source score not final 保留 scope并引导量表评分确认。
42. source domain result required 不自动调用 A19。
43. source media invalid 不显示对象键或内部错误猜测。
44. patient inactive 显示稳定状态且不猜测患者其他状态。
45. report incomplete 不伪造空报告并提示管理员处理。
46. draft 显示“规则化报告草稿”。
47. draft 显示尚未经医生确认，不称为正式报告。
48. status / isFinal 不一致显示安全警告且不自行纠正。
49. system_draft 不显示为 AI 或医生确认。
50. quality passed 只解释流程标记，不显示患者正常。
51. patientSnapshot 仅显示 subjectCode / displayName / sex / birthDate / educationYears。
52. patientSnapshot 为 null 不从当前档案补齐。
53. visitSnapshot 只显示允许字段且不显示 clinicalContext / metadata。
54. scaleTrace 有合法 ID 时可打开既有单量表路由。
55. scaleTrace 无 ID 或非法 ID 时不伪造链接。
56. score null 不显示为 0。
57. scorePercent 只显示服务端值且不在前端计算。
58. score summary 显示为规则化安全摘要，不称为医生意见。
59. domainSnapshot 不编造 minScore。
60. domainSnapshot 不跨域求和或生成报告级认知域总分。
61. domain scorePercent 不显示成疾病概率。
62. evidenceSnapshot 不显示预览、原文件或下载。
63. evidenceSnapshot 不显示 media / item 内部 ID 或对象键。
64. A20 系统 narrative 只显示 chief / score / domain / evidence / limitations 五个安全字段；B11 clinician-owned 字段在独立分区展示。
65. narrative 使用普通文本且不使用 `dangerouslySetInnerHTML`。
66. 系统五段 narrative 不出现编辑框；B11 编辑器只出现 doctorOpinion / recommendationText。
67. narrative 不显示 trendSummary；doctorOpinion / recommendationText 仅作为临床人员明确填写内容展示。
68. generation.aiUsed=false 显示未使用 AI。
69. generation=null 时不猜测 AI 使用情况、生成时间或操作者。
70. generation actor 不重点展示 operatorId。
71. historical confirmation 只读安全展示公开字段。
72. confirmed 但 confirmation=null 时不冒充访视操作者。
73. voided 报告显示公开 voidReason。
74. report.id 不作为业务编号展示，也没有 reportId 路由。
75. 页面只提供 B11 clinician-owned 字段受控编辑，不提供系统摘要、scope 或快照编辑。
76. 页面只在 pending_confirmation 且当前角色为 doctor / admin 时提供最终确认按钮。
77. 页面没有签名按钮。
78. 页面没有 lock / archive / correct / void 按钮。
79. 页面没有重生成或 version 2。
80. 页面没有 PDF、打印模板或下载。
81. 页面没有 AI 操作或 LLM 调用。
82. 系统规则内容不输出阈值、等级、风险、诊断或治疗建议；临床人员明确填写的原文只按流程状态展示，不由系统解释。
83. A20 401 返回登录页。
84. A20 403 仅影响报告区域，不伪装成 not_found。
85. 网络错误保留当前 scope 并提供手工操作。
86. scope 不写 localStorage / sessionStorage / URL。
87. 页面刷新后未提交 scope 消失。
88. 报告区域在小屏幕保持纵向可读且无内容溢出阻断。
89. checkbox、按钮、量表链接和原生 details 支持键盘。
90. 没有新增独立报告路由。
91. 没有调用 A17 / A18 / A19 readiness 扇出或写接口。
92. 页面与文档没有使用真实患者或医疗数据。
93. `npm run lint` 通过。
94. `npm run typecheck` 通过。
95. `npm run build` 通过。

## 6. Batch D 当前待验合同：B11–B15（含 B14.1）

Batch D 已完成 B11，并已进入 B12。B12-B6 已用全新 namespace 从 prepare 开始完整执行 `core-workflow` 的 5 个 scenarioKey / 22 条 route / 62 个 Browser audit ID；22 条 route 全部实际启动并执行，最终为 0 route / 0 audit ID pass、22 route / 62 audit ID fail。全部 route 在工作流导航阶段发现相对 Dashboard 的额外 `/auth/me` 实际为 2、合同要求为 1，因而未进入后续 route Action；两个 allowlist Stage 均未请求，post-browser verify 按不完整产品终态失败。双次 cleanup 与 Browser、Context、服务、runtime、测试产物和端口零残留收口通过，但未取得全部已认证 Session 的逐 Session logout 成功证据。B11 fixture 建立的两个互斥 profile 均已闭环：`core-workflow` 覆盖 58 个 Browser 项，`resilience-security` 覆盖 11 个 Browser 项；B11-70 是单独的 `static-gate`。共 70 个稳定 ID、69 个 Browser 项和 1 个静态项，每个 ID 只有一个 primary owner。B11 已完成事实保持不变。B12-B、B12 与 Batch D 仍未完成，不进入 B12-C；B12-86–B12-88 未关闭，也尚未执行 B13–B15。

B12-B7 已完成 core `/auth/me` 验收所有权的代码级纠正，未形成新的产品 Browser 结果；B12-B6 的 0 route / 0 audit pass 历史继续生效。B12-83 仍由 `resilience-security / presentation-safety / auth-route-deidentified` 独立拥有且未执行、未关闭；下一阶段仍须使用全新 namespace 完整重跑 B12-B 的 22 条 core route。

B11-B 已使用 production frontend、Browser test backend、Playwright Chromium 和全新 core namespace 启动 5 个 scenarioKey / 20 条 route。`confirmation-conflict` 页面按合同先加载并冻结版本，但随后唯一一次 `confirmation-conflict-touch` Stage 在写入前对整个 profile 重做 `prepared` 校验，因此前合法完成的 `edit-success` 已变为 mixed 而返回 `B11_FIXTURE_REPORT_STATE_INVALID`；Stage 实际写入为 0，Browser confirm 因此未执行。post-browser verify 随后精确拒绝 `confirmation/confirmation-conflict`。服务、Browser、runtime 与测试产物均已收口；两次 cleanup 均为 `residualCount=0`，第二次 `matched=false`，canonical seed 不变。B11-B、B11 与 Batch D 均保持未完成，不进入 B11-C；B11-56–B11-59、B11-63–B11-69 与 B11-70 仍未关闭。不填写不存在的 evidence commit。

B11-B1 已修复上述测试资产阻断，但没有重跑正式 Browser。Stage 现在逐 route 验证 prepared 或精确合法 product-completed，目标只允许精确 prepared / target-staged，重复 Stage 幂等；Stage 后对非目标 route 仍执行 prepared / 原产品合同二选一，完整 post-browser verifier 没有放宽。B11-15 增加 latest editorial 与最新服务端安全事实逐项一致；B11-16 在独立新 BrowserContext / 登录 Session 中证明 editorial 持久而当前会话 receipt 不持久且没有第二次 edit；B11-17 明确验证一份 summary、receipt 数量、无历史集合 UI，并扫描 DOM / HTML / aria / title / data 属性的内部历史字段边界；B11-29 覆盖 trim 后少于 3、`maxLength=2000`、2000 合法与第 2001 个真实按键受原生约束，非法分支 POST=0、合法分支 POST=1且日志不含正文；B11-62 改为 clinician content 语义分区内验证“不自动生成、不改写、不审核、不解释”，不再要求独立文本节点。

B11 support 的 capture / collect 状态机现为 open、collecting、collected、failed / closing：先冻结并移除监听器，再等待已登记的 `allHeaders()`、latest parse 等任务；仅完整审核成功后 collected，capture rejection 只输出安全类别并仍执行真实 logout、Context close、runtime 和 test-results 精确清理。corrected route Console error 不使用全局 allowlist，只允许在确定时间窗口内一一对应单次合法只读 GET、safe endpoint pattern 与 404 / 409；无法对应、出现 pageerror 或额外 retry / polling 均失败。前端 `test:browser:list` 通过并保持 20 条 B11 core route，synthetic infrastructure 12 tests、lint、typecheck、build 全部通过；该 infrastructure 只启动并关闭隔离 synthetic Chromium，不启动产品前端或 Browser test backend，也不执行 B11 Browser Action。Browser 状态仍为 51 pass / 7 not_executed，B11-B、B11 与 Batch D 均未完成；下一阶段必须使用全新 namespace 从 prepare 开始完整重跑 B11-B `core-workflow`，不得进入 B11-C，B11-70 尚未最终关闭。不填写不存在的 evidence commit。

B11-B2 基于 `0c53cd180eca10c84149a9adcc8429bf3b2aadfd`，使用全新 `b11c-` namespace 完整执行 `core-workflow` 的 5 个 scenarioKey / 20 条 route / 58 个 Browser audit ID。backend build、B11 fixture 定向 E2E 1 suite / 13 tests、frontend test list / infrastructure 12 tests / lint / typecheck / production build、prepare、prepared verify 与 20 个 runtime descriptor 均通过；production frontend、Browser test backend、CORS 与 credentials 也均就绪。Playwright 的 20 条 route 全部启动，最终为 `system-draft-edit`、`edit-field-validation` 两条 route 通过，其余 18 条失败，即 B11-01–B11-09 共 9 项 pass，B11-10–B11-55 与 B11-60–B11-62 共 49 项 fail。稳定产品阻断为 A21 latest 与 action report 的 public workflow actor 返回非空内部 `operatorId`；安全解析器在 `latest_parse` 或 action response 收口时按合同拒绝，`edit-success` 的真实 A21 edit 200 响应也复现同一泄露。`confirmation-conflict` 在页面初始 latest 解析阶段失败，因此没有请求或执行 `confirmation-conflict-touch` Stage；post-browser verify 按实际不完整进度在 `edit-concurrency/edit-conflict-continue` 拒绝。全部 Session 都进入测试资产的真实 logout / best-effort logout 收口，Browser、Context、服务、runtime、test-results 与 error-context 均已清理；cleanup 1 为 `matched=true` / `residualCount=0`，cleanup 2 为 `matched=false` / `residualCount=0`，canonical seed 不变。当前分类为产品缺陷 1、fixture / Playwright 资产缺陷 0、稳定环境限制 0。B11-B、B11 与 Batch D 均保持未完成，不进入 B11-C，B11-70 尚未最终关闭；不填写不存在的 evidence commit。

B11-B3 已将前端 A21 `ClinicalReportReviewActor` 收缩为仅可选 operatorName / operatorRole，editorial / submission 与 edit / submit / confirm receipt 均改用该类型；A20 generation 及 A22–A25 lifecycle 继续使用原 actor，不改变 UI 文案、布局、请求或行为。B11-B4 基于 `adc132e432a15163abdc424913b87e7c6a5216f3`，使用全新 `b11c-` namespace 完整执行 `core-workflow` 的 5 个 scenarioKey / 20 条 route / 58 个 Browser audit ID。backend build、B11 fixture 定向 E2E 1 suite / 13 tests、frontend test list / infrastructure 12 tests / lint / typecheck / production build、prepare、prepared verify、20 个 runtime descriptor、production frontend、Browser test backend、health、CORS 与 credentials 均通过。20 条 route 全部执行，18 条通过；`edit-success` 因 Playwright 仍期待 `editReceipt.editedBy` 的 actor keys 含 `operatorId` 而失败，实际响应只含 operatorName / operatorRole 且内部 ID 属性不存在；`corrected-readonly` 因 Console error 无法与唯一允许的只读网络事件完成相关性收集而失败。按 route ownership 计为 48 audit ID pass，B11-11–B11-19 与 B11-54 共 10 项 fail；产品缺陷 0、fixture / Playwright 资产缺陷 2、稳定环境限制 0。A21 public actor 在 initial latest、edit、submit、alreadySubmitted、confirm、alreadyConfirmed 与 historical reports 均无 `operatorId`，post-browser verifier 同时确认数据库内部 editedBy / submittedBy / confirmedBy 审计 ID 存在且正确。`confirmation-conflict-touch` 在合法产品进度后成功执行一次，Browser 随后真实 confirm 409 且未产生 confirmation；产品 mutation、Stage、A22–A25 零写入边界与 20 条 route 最终数据库状态均通过 post-browser verify。所有实际 Session 均执行真实 logout，Browser / Context / 服务关闭，端口、runtime、test-results 与 error-context 均无残留；cleanup 1 为 `matched=true` / `residualCount=0`，cleanup 2 为 `matched=false` / `residualCount=0`，canonical seed、其他 namespace 与非 namespace 数据未受影响。不填写不存在的 evidence commit。B11-B、B11 与 Batch D 均未完成，不进入 B11-C，B11-70 尚未最终关闭。

B11-B5 基于指定基线定向修复并重验 `edit-success` 与 `corrected-readonly`，不重跑其余 18 条 route。A21 安全解析器现在以 `Object.hasOwn(actor, 'operatorId')` 拒绝属性本身，无论值为字符串、null、undefined、空串、遮罩或哈希；actor 的 own enumerable key 白名单严格限制为可选 operatorName / operatorRole，额外字段安全失败，`edit-success` 期待 keys 精确为 operatorName / operatorRole。该 route 真实 edit PATCH 200 恰好 1 次，actor 内部 ID 属性不存在且 role 为 doctor，editorial 与 receipt actor 一致；新 Session 中 editorial 保留、receipt 消失且没有第二次 edit，beforeunload、Storage、Cookie、CORS、URL、DOM / HTML / aria / title / data 属性隐私边界与 logout 均通过，B11-11–B11-19 关闭。Console 捕获只保留发生时间、类别和由 `ConsoleMessage.location().url` 清洗出的 safe endpoint pattern，不保留原文或完整 URL；相关性先要求 route-scoped 精确合同，再把 2.5 秒窗口仅用于同一 endpoint 内的辅助定位。`corrected-readonly` 唯一允许事件为 GET `/patients/<id>/visits/<id>/clinical-reports`、409、request failure 为空且恰好 1 次；页面 corrected 与写控件为 0 的业务断言先通过，产品业务写入、retry、polling、pageerror 均为 0，Console 与 Network 一一对应，Storage、Cookie、CORS、URL、隐私和 logout 均通过，B11-54 corrected 半项关闭。前端 test list、infrastructure 12/12、lint、typecheck、production build，backend build 与 B11 fixture 定向 E2E 1 suite / 13 tests 均通过；`standard_test` 使用 `cogmemory_ad_test`，Browser backend / fixture CLI 使用 `cogmemory_ad_browser_test` 且分别为 app / `readWrite`、db_admin / `dbOwner`，Playwright runner 不连接数据库。两条 route 分别使用新的隔离数据范围；prepared verify 均在 Browser 前通过，corrected 在 Browser 后再次通过；全部 Session logout、Browser / 服务关闭，cleanup 1 均为 `matched=true` / `residualCount=0`，cleanup 2 均为 `matched=false` / `residualCount=0`，canonical seed 不变且无运行与测试产物残留。B11-B4 的其余 18 route / 48 audit ID、完整 post-browser verify、Stage、全部产品 mutation、数据库内部审计、profile isolation、canonical seed 与双次 cleanup 证据继续有效；与本次 2 route / 10 audit ID 组合后，B11-B 共 58 个 Browser audit ID 全部通过，`core-workflow` 已完成。产品缺陷 0；fixture 缺陷 0；本次关闭的是 Playwright 测试资产缺陷，稳定环境限制 0。B11 整体与 Batch D 仍未完成；下一阶段为 B11-C `resilience-security`，B11-70 尚未最终关闭；不填写不存在的 evidence commit。

B11-C `resilience-security` 已完整执行 4 个 scenarioKey / 9 条 route，B11-56–B11-59、B11-63–B11-69 共 11 个 Browser audit ID 全部通过。Action 所有权、真实 401 / 403、edit / submit / confirm 三个 one-shot network abort、Storage / refresh、七个正式 viewport、zoom=100% 且 innerWidth≥1440 的最大化 Chrome、Axe、ARIA tree、focus-visible、stale / disabled 真实 409 均通过；A21/A22–A25、PDF / print / download / signature / AI 非合同写请求为 0。`forbidden-confirm-role` Stage 仅在页面加载并建立本地确认草稿后执行，post-browser verify 接受唯一 `fixture_forbidden_role_only` 变化；ClinicalReport、Patient、Visit、ScaleInstance、A21 edit / submission / confirmation audit 与 canonical seed 均保持 prepared baseline。全部 Session logout，Browser / Context / 服务关闭，runtime 与测试产物无残留；cleanup 1 为 `matched=true,residualCount=0`，cleanup 2 为 `matched=false,residualCount=0`。最终 frontend lint、typecheck、production build 全部通过，B11-70 关闭。B11 最终为 `core-workflow` 58 Browser pass + `resilience-security` 11 Browser pass + static-gate 1 pass，共 70 项完成；B11 已完成，Batch D 尚未完成，下一阶段为 Batch D / B12，B12–B15（含 B14.1）仍待验；不填写不存在的 evidence commit。

阶段所有权口径同第 5 节：B11–B15 的“不存在/不实现”验证目标是当前 Action 不越界、不自动串联、不伪造后续事实，不要求移除后来已经实现且在当前状态合法的 sibling 能力。B16 / WP-02 只证明 replacement V2+ 的特定闭环，不能替代 B11–B15 各自的完整角色、草稿、并发、错误、可访问性和隐私矩阵。

### 6.1 B11 报告编辑、提交与确认：70 项

1. system_draft draft 可打开编辑。
2. 只显示 doctorOpinion / recommendationText 编辑字段。
3. 五段系统摘要不可编辑。
4. 结构化快照不可编辑。
5. doctorOpinion 少于 3 字不能保存。
6. doctorOpinion 超过 4000 字不能保存。
7. recommendation 为空可以清除。
8. recommendation 非空少于 3 字不能保存。
9. editNote 必填且为 3–1000 字。
10. 无正文变化不能保存。
11. PATCH 只发送 doctorOpinion、可选 recommendationText、editNote、expectedUpdatedAt。
12. expectedUpdatedAt 来自服务端 report.updatedAt，不使用浏览器当前时间。
13. 保存后 source=mixed。
14. 保存后系统摘要和快照不变。
15. editorial 显示最新编辑摘要。
16. editReceipt 只在当前会话显示。
17. 不显示完整审计历史。
18. 不显示 previousValues / nextValues / metadata。
19. 编辑草稿或 editNote 触发 beforeunload。
20. edit conflict 保留医生意见、建议与 editNote。
21. conflict 后自动 latest 一次。
22. conflict 后不自动 PATCH。
23. stale 状态禁止保存。
24. 用户明确基于最新报告继续后可保存，且本地输入不重置。
25. audit limit 禁止继续编辑。
26. pending_confirmation 不可编辑。
27. confirmed / archived / corrected / voided 不可编辑。
28. doctorOpinion 保存后显示提交入口。
29. submissionNote 为 3–2000 字。
30. 未勾选 checkbox 不能提交。
31. submit 只发送 confirm、submissionNote、expectedUpdatedAt。
32. 提交成功变为 pending_confirmation。
33. alreadySubmitted 按成功处理且不再次 POST。
34. pending 显示 submission 摘要。
35. pending 不显示编辑或重复提交按钮。
36. submit conflict 保留 note 并清除 checkbox。
37. submit conflict 不自动 POST。
38. nurse / research_assistant 不显示可用确认入口。
39. doctor 显示确认入口。
40. admin 显示确认入口。
41. 网络面板确认 B11 不发第二次 `/auth/me`。
42. confirmationNote 为 3–2000 字。
43. 未勾选 checkbox 不能确认。
44. confirm 只发送 confirm、confirmationNote、expectedUpdatedAt。
45. confirm 成功 status=confirmed。
46. confirmed isFinal 使用服务端值。
47. qualityStatus=passed 只显示报告确认流程质量标记通过，不显示患者正常。
48. confirmed 不显示为 locked。
49. confirmationId 弱化安全显示。
50. alreadyConfirmed 按成功处理且不再次 POST。
51. confirm conflict 保留 note 并清除 checkbox。
52. confirm conflict 不自动 POST。
53. confirmed 后所有工作流控件只读。
54. archived / corrected 只读。
55. voided 只读。
56. 不存在退回、reject、reopen 或 withdraw。
57. 不存在签名或 signatureText。
58. 不存在 lock / archive / correct / void 操作。
59. 不存在 PDF、打印或下载。
60. mixed 显示为系统规则与临床人员补充并存，不显示为 AI。
61. recommendation 明确标记为临床人员内容。
62. 系统不自动生成、改写、审核或解释 clinician 文本。
63. A21 401 返回登录页。
64. action 403 不清除已加载报告或本地草稿；confirm 403 提示需 doctor / admin。
65. 网络错误保留本地草稿且不自动重试。
66. localStorage / sessionStorage / IndexedDB 未保存工作流草稿。
67. 页面刷新后未保存草稿与当前会话回执消失。
68. 小屏幕表单纵向可用，textarea / checkbox 均有可见 label。
69. stale / 错误提示文案与真实 disabled 状态一致。
70. `npm run lint`、`npm run typecheck`、`npm run build` 通过。

当前处置：B11-B 的 `core-workflow` 58 个 Browser audit ID、B11-C 的 `resilience-security` 11 个 Browser audit ID 与 B11-70 static-gate 均已通过，B11 共 70 项完成。Batch D 尚未完成；下一阶段为 Batch D / B12，B12–B15（含 B14.1）仍待验。

### 6.2 B12 报告不可逆锁定：88 项

1. draft 报告不显示锁定入口。
2. pending_confirmation 不显示锁定入口。
3. confirmed 未锁定报告显示锁定状态。
4. confirmed 未锁定报告对 doctor 显示锁定入口。
5. confirmed 未锁定报告对 admin 显示锁定入口。
6. nurse 不显示可用锁定入口。
7. research_assistant 不显示可用锁定入口。
8. system 不显示可用锁定入口。
9. 不新增 locked status。
10. 技术信息中的 status 仍为 confirmed。
11. 页面独立显示“尚未锁定”。
12. quality 非 passed 不开放锁定。
13. isFinal=false 不开放锁定。
14. confirmation 缺失不开放锁定。
15. Visit locked / voided 不开放首次锁定。
16. lockedAt 非空不显示再次锁定入口。
17. lock 非空但 lockedAt 为空显示一致性警告。
18. lockedAt 非空但 lock 为空显示审计摘要不完整。
19. lock.lockedAt 与 top-level 不一致显示警告。
20. 锁定前显示不可逆说明。
21. 锁定前说明 status 仍为 confirmed。
22. 锁定前说明只锁报告本身。
23. 锁定前说明不锁来源数据。
24. 锁定前说明不等于归档。
25. 锁定前说明不生成签名或 PDF。
26. lockNote 少于 3 字符不能提交。
27. lockNote 超过 2000 字符不能提交。
28. lockNote 不自动生成。
29. confirmationNote 不自动填入 lockNote。
30. 未勾选 checkbox 不能锁定。
31. lock 只发送 confirm、lockNote、expectedUpdatedAt。
32. expectedUpdatedAt 来自服务端。
33. 锁定期间 edit / submit / confirm / lock 均禁用。
34. 锁定期间报告仍可阅读。
35. 锁定成功使用服务端完整 report。
36. 锁定成功 status 仍为 confirmed。
37. 锁定成功 lockedAt 非空。
38. 锁定成功 lock summary 非空。
39. 锁定成功显示 lockReceipt。
40. alreadyLocked=false 显示首次锁定成功。
41. alreadyLocked=true 按成功处理。
42. alreadyLocked 不自动重发。
43. 重复锁定不显示第二个可用入口。
44. lockId 弱化为技术追溯号。
45. lockedBy 显示姓名和角色。
46. operatorId 不作为主要业务字段。
47. lockNote 标记为锁定流程说明。
48. lockNote 不显示为报告正文。
49. lock conflict 保留 lockNote。
50. lock conflict 清除 checkbox。
51. lock conflict 自动 latest 一次。
52. lock conflict 不自动 POST。
53. stale 时不能锁定。
54. 基于最新报告继续后保留 lockNote。
55. 最新报告已锁定时不能继续提交本地草稿。
56. audit unavailable 不猜测锁定人。
57. metadata unsupported 不显示 metadata。
58. action 403 保留报告和 lockNote。
59. 401 返回登录页。
60. 网络错误保留 lockNote。
61. beforeunload 覆盖 lockNote。
62. lockNote 不写 localStorage。
63. 刷新后未提交 lockNote 消失。
64. 已锁定报告 edit 不可用。
65. 已锁定报告 submit 不可用。
66. 已锁定报告 confirm 不可用。
67. 已锁定报告 lock 不可用。
68. confirmed 不显示为 locked status。
69. isFinal 不作为锁定判断。
70. lockedAt 不显示为归档时间。
71. 页面不存在 unlock。
72. 页面不存在 reopen / return / reject / withdraw。
73. 页面不存在 signature。
74. 页面不存在 archive / correct / void。
75. 页面不存在 PDF / 下载。
76. 页面不存在来源链锁定。
77. 页面不存在 AI 操作。
78. 页面不显示患者、访视或评分已锁定。
79. 页面不把 quality passed 显示为患者正常。
80. 页面不输出诊断结论。
81. 小屏幕锁定表单可用。
82. label、错误提示和交互状态反馈正确。
83. 没有第二次 `/auth/me`。
84. 没有新增路由。
85. 没有使用真实患者或锁定说明。
86. lint 通过。
87. typecheck 通过。
88. build 通过。

当前处置：B12-B5 已完成 B12-B4 暴露的三项代码级验收资产修复，但尚未执行新的产品 Browser 验收；B12-B4 的 22 条 core route 全部执行、0 pass / 22 fail、0 audit pass / 62 audit fail、post-browser verify 通过与双次 cleanup 通过仍是唯一历史结果。产品缺陷 0、fixture 缺陷 0；两项 Playwright 验收资产缺陷与一项 Session 收口缺陷已完成代码级修复，等待全新 namespace 完整重跑确认。B12 合同固定为 `core-workflow` 62 个 Browser audit ID（5 个 scenarioKey / 22 条 route）、`resilience-security` 23 个 Browser audit ID（6 个 scenarioKey / 11 条 route）和 B12-86–B12-88 三个 `static-gate`；88 个 ID 均有唯一 owner，85 个 Browser ID 均恰有一条 route，三个 static-gate 无 Browser route。两个 profile 均使用 doctor、admin、nurse、research_assistant、system 五角色和互不共享的 Patient / Visit / ScaleInstance / ClinicalReport / marker 根。B12-A1 调整后的 core 合法状态矩阵为 confirmed unlocked 11、confirmed locked 4、historical locked fallback 1，其余状态计数不变；状态矩阵总数和资源数量不变，resilience 仍使用 11 个独立 confirmed unlocked 根。

历史 fallback 覆盖现由 B12-16 `already-locked-no-repeat` 保留：顶层 lockedAt / lockedBy 完整，但无合法 `metadata.a22Lock`，公开 fallback 的 lockId=null、role=unknown，不猜测 operatorName 或 lockNote，页面不得显示重复锁定入口。B12-41–B12-43 `already-locked-idempotency` 则从 `confirmed_unlocked` 开始，primary / secondary 均为 doctor；runtime 的两个登录标识可指向同一 fixture 账号，但未来必须由两个独立 BrowserContext 分别真实登录并建立两个独立 Session。

未来双 Session 顺序固定为：Primary 先加载同一报告、打开 LockPanel、填写自己的合法 lockNote、勾选 checkbox 并冻结旧 expectedUpdatedAt；Secondary 在独立 Context 中加载同一报告并以不同 lockNote 发出一次真实 A22 lock，收到 HTTP 200 / `alreadyLocked=false`；Primary 不刷新、不替换 expectedUpdatedAt，再从原页面发出一次真实 A22 lock，收到 HTTP 200 / `alreadyLocked=true`。Primary 不得收到 409，不自动 retry、不 polling、不自动额外 latest，必须把响应中的完整 report / lockReceipt 作为成功结果、清除本地草稿且不显示第二个锁定入口。该 route 的 A22 POST 总数固定为 2，action response 不使用 `route.fulfill()`，Secondary 产品 lock 不得由 Stage 或数据库写入替代。

数据库终态只允许 Secondary 产生的一份合法 doctor A22 audit：a22Lock 只增加 1，持久 lockNote 为 Secondary 首次成功说明，Primary lockNote 不写入；status 仍为 confirmed、qualityStatus 仍为 passed，confirmation、narrative、snapshots、A20/A21、Patient、Visit 与 ScaleInstance 不变，A23–A25 为零。Browser POST 次数、顺序和 alreadyLocked false/true 分支由 B12-B Playwright Network 账本验证；fixture verifier 只验证数据库终态并拒绝零 lock、第二个或非法 A22、错误 actor、protected field 与来源根漂移。synthetic simulation 只写一次合法 doctor lock，不冒充 Browser 分支证据。四条 controlled public-read boundary、五个 Stage 和 runtime 字段白名单均未扩张。

本阶段没有启动 production frontend、Browser test backend 或正式 B12 Playwright 产品验收，没有执行任何真实 B12 Browser Action；`test:browser:infra` 仅启动并关闭隔离 synthetic Chromium。因此不得把 fixture-ready、E2E、CLI 冒烟或静态门禁记为 B12 Browser pass；历史 45 pass / 17 fail 状态不变，B12-86–B12-88 也尚未关闭。不填写不存在的 evidence commit。B12-B、B12 与 Batch D 仍未完成，不进入 B12-C；下一阶段必须使用全新 namespace 完整重跑 B12-B `core-workflow` 的 22 条 route，B11 已完成事实保持不变。

B12-B 首次完整执行仍以指定基线 `28685a744bd4ddc021a112e656f7ef887e8423d7` 为历史事实：production frontend、Browser test backend 与 Playwright Chromium 实际执行了 `core-workflow` 的 5 个 scenarioKey / 22 条 route / 62 个 Browser audit ID，结果仍为 18 route / 45 audit ID pass、4 route / 17 audit ID fail；失败项仍为 B12-06–B12-08、B12-14、B12-33–B12-40、B12-44–B12-48，完整 post-browser verify、Session logout、Browser / 服务停止、runtime 与测试产物清理以及双次 cleanup 均已完成，cleanup 1 为 `matched=true,residualCount=0`、cleanup 2 为 `matched=false,residualCount=0`，canonical seed、其他 namespace 与非 namespace 数据不变。B12-B1 合同复核将原两项“产品缺陷”纠正为验收资产问题：`system` 本就不属于 Patient / ClinicalReport 交互式工作流角色，真实 403、无受保护报告泄露且无 A22 Action 已满足 B12-08 的更强安全边界；`confirmed` 且 `confirmation=null` 的报告由 public readability 真实返回 `409 / CLINICAL_REPORT_INCOMPLETE`，fail-closed 不公开残缺报告且不开放锁定已满足 B12-14 的稳定意图。B12 route 合同新增固定 `expectedPublicReadOutcome` 枚举，默认 `readable`，仅 `confirmation-missing` 为 `clinical_report_incomplete`；该字段进入 audit matrix 与 safe manifest，不进入只承载账号和 navigationPath 的 runtime descriptor，且 `confirmation-missing` 继续保持 `boundaryType=none`、`controlledPublicResponseVariant=none`。Playwright support 将打开方式严格分为正常 latest 200、仅 B12-08 system 使用的真实权限 403、仅 B12-14 使用的真实 latest 409；不使用 `route.fulfill()` 伪造错误，不全局放宽 403 / 409，也不解析或输出错误响应正文。三项 fixture / Playwright 验收资产问题——system 错误要求完整报告可读、confirmation-missing 错误要求部分报告可读及专用告警、doctor / admin 首次锁定错误标题定位——均已完成代码修复，其中 doctor / admin 仍定位产品真实正文 section；但 B12-B1 未启动 production frontend、Browser test backend 或正式 B12 Playwright 产品验收，仅 synthetic infrastructure 启动并关闭隔离 Chromium，未形成任何新 Browser 证据。当前产品缺陷计数修正为 0，fixture / Playwright 验收资产问题为 3 项且均等待完整 Browser 复验，稳定环境限制为 0；历史 45 pass / 17 fail 状态不变，B12-86–B12-88 未关闭，B12-B、B12 与 Batch D 仍未完成，不进入 B12-C。下一阶段必须使用全新 namespace 完整重跑 B12-B `core-workflow` 的 22 条 route；不填写不存在的 evidence commit。

B12-B1 的非 Browser 验证已闭环：frontend test list 通过并列出 17 files / 66 tests，synthetic infrastructure 13 / 13、lint、typecheck 与 build 均通过；该 infrastructure 只启动并关闭隔离 synthetic Chromium，不启动 production frontend 或 Browser test backend，也不连接数据库。全新 core namespace 的 fixture CLI 已完成 prepare、prepared verify、两条目标 runtime 生成与删除、replace、再次 prepared verify及双次 cleanup；cleanup 1 为 `matched=true,residualCount=0`，cleanup 2 为 `matched=false,residualCount=0`，前后 seed、其他 namespace 与非 namespace 数据一致，runtime、manifest 与 namespace 资源无残留。上述 test list、synthetic infrastructure、fixture E2E、CLI 与静态结果均不得记为 Browser pass。

B12-B2 基于指定基线完整执行了全新 core namespace 的 prepare、prepared verify、23 个 runtime descriptor、production frontend、Browser test backend、22 条 Playwright route、两次 allowlist Stage、post-browser verify、Session logout、Browser / 服务关闭、runtime 与测试产物删除及双次 cleanup。后端 build、B12 fixture 定向 E2E 1 suite / 11 tests、前端 test list 17 files / 66 tests、synthetic infrastructure 13 / 13、lint、typecheck 与 production build 均通过。两次 Stage、完整 post-browser verify 和产品数据库终态均通过：doctor / admin 首次锁定、双 Session alreadyLocked 与两条 conflict 的写入终态符合合同，四条 controlled public-read route 数据库零变化，canonical seed 不变。22 条 Browser route 仍全部失败，因为每个 Session 已完成真实 logout 并进入登录页后，登录页的认证检查会产生预期 unauthenticated `/auth/me`；B12 收集器随后把 logout 前后的全部 `/auth/me` 合并统计，却要求每条都为 2xx，因而在业务验收之后统一失败。该 Playwright 资产阻断使 B12-08、B12-14、doctor / admin 首次锁定及其余 route 均不能记为 Browser pass，也不能用 post-browser verify 替代。所有 Context、服务、runtime 与测试产物已收口；cleanup 1 为 `matched=true,residualCount=0`，cleanup 2 为 `matched=false,residualCount=0`。当前分类为产品缺陷 0、fixture 缺陷 0、Playwright 验收资产缺陷 1、稳定环境限制 0。B12-B、B12 与 Batch D 仍未完成，不进入 B12-C；B12-86–B12-88 未关闭，不填写不存在的 evidence commit。

B12-B3 在不修改产品、fixture、通用 `NetworkLedger` 或 B12 core spec 的前提下完成代码级修复。收集器在业务 capture flush、业务页 network idle、Console 严格审计停止之后且点击退出前，仅一次记录 ledger entry 索引；完整 ledger 继续覆盖真实 `POST /auth/logout` 和登录页认证 Hook。纯函数随后把账本分成 `authenticated_workflow`、`logout_transition` 与 `post_logout_unauthenticated`：logout 前 `/auth/me` 必须至少一次且全部为无 request failure 的 2xx，logout POST 必须唯一、2xx、无 request failure 且由页面 script 发起，logout 后 `/auth/me` 必须唯一、无 request failure 且精确为 401，Patient、Visit、ClinicalReport、A21–A25、PDF / print / download / signature / AI / LLM 及其他非登录页允许请求必须为 0；该 401 不进入 workflow 额外 `/auth/me` 计数，也不进入业务 Console error。边界越界或重复设置、logout 前非 2xx、logout 缺失/重复/失败/非 script、logout 后 `/auth/me` 缺失/重复/仍为 2xx、logout 后 Patient / ClinicalReport 请求和输入 mutation 均由 synthetic 负向用例拒绝。synthetic infrastructure 从 13 项增至 21 项并实际 21 / 21 通过；本阶段只启动并关闭随机 localhost synthetic Node server、隔离 BrowserContext 与 Chromium，没有启动 production frontend、Browser test backend、fixture CLI 或正式 B12 Playwright，也没有连接数据库。B12-B2 的 0 route / 22 route fail、0 audit pass / 62 audit fail、post-browser verify 通过与双次 cleanup 通过事实均保持不变；B12-B、B12 与 Batch D 仍未完成，不进入 B12-C，B12-86–B12-88 未关闭。下一阶段必须使用全新 namespace 从 prepare 开始完整重跑 B12-B `core-workflow` 的 22 条 route；不填写不存在的 evidence commit。

B12-B4 基于 `8e69ba8b8ccc4da7e2509b300e3a8a5ab13945be`，使用全新 `b12c-` namespace 从 prepare 开始完整执行 `core-workflow` 的 5 个 scenarioKey / 22 条 route / 62 个 Browser audit ID。backend build、B12 fixture 定向 E2E 1 suite / 11 tests、frontend test list 17 files / 74 tests、synthetic infrastructure 21 / 21、lint、typecheck、production build、prepared verify、23 个 runtime descriptor、production frontend、Browser test backend、health、精确 CORS 与 credentials 均通过；Playwright runner 不连接数据库，workers=1、retries=0 且未限制后续 route。22 条 route 全部实际执行，两条 allowlist Stage 各执行一次；system 真实 403、confirmation-missing 真实 `409 / CLINICAL_REPORT_INCOMPLETE`、双 Session alreadyLocked、两条 conflict、四条 controlled public-read、locked readonly 与数据库终态均通过各自业务断言或完整 post-browser verify。最终 22 条 route 全部失败、62 个 Browser ID 均未关闭：20 条在认证账本收口时发现 authenticated slice 包含登录成功前的 401 `/auth/me`；doctor / admin 两条已完成真实锁定后，正文 section 联合 locator 命中两个真实 section，`not.toContainText` 触发 strict-mode，因此其完整 Network、Storage、Cookie、URL、DOM 与三阶段认证审计没有继续到最终收口。失败清理记录 26 个已创建 Session 中 25 个 logout 成功，denied-role 的 system Session logout 失败，不能声明全部 Session 生命周期闭环。产品缺陷 0、fixture 缺陷 0、已确认 Playwright 验收资产缺陷 2，另有 1 项 Session cleanup 证据失败；稳定产品环境未发现限制。完整 post-browser verify 通过，Browser / Context、服务、runtime、Stage marker 与测试产物均已收口，端口无监听；cleanup 1 为 `matched=true,residualCount=0`，cleanup 2 为 `matched=false,residualCount=0`，canonical seed 保持不变。B12-B `core-workflow` 未完成；Batch D 暂不能进入 B12-C，B12-86–B12-88 仍未最终关闭，B13–B15 未执行，不填写不存在的 evidence commit。

B12-B5 基于 `5ee0081a263ddf712300009b218b9e97f552cba8` 只修改 B12 Playwright support、doctor / admin 共用的首次锁定 spec、synthetic infrastructure 与两份 testing playbook。认证账本新增 login boundary，并继续保留进入 `/login` 前 attach 的完整 ledger：登录页稳定且初始唯一 `/auth/me` 已完成后、点击“登录系统”前只记录一次 login entry 数量；logout boundary 仍在业务页稳定后、真实 logout 前只记录一次，且必须严格晚于 login boundary。纯函数现按双边界分离 `pre_authentication`、`login_transition`、`authenticated_workflow`、`logout_transition`、`post_logout_unauthenticated` 五阶段；login 前唯一、无 request failure 的 401 仍被严格验证，但不计入 authenticated 或 workflow `/auth/me`，唯一 script login 必须为 2xx，authenticated `/auth/me` 必须存在且全为 2xx，唯一 script logout 必须为无 failure 的 2xx，logout 后唯一 `/auth/me` 必须为无 failure 的 401，且 logout 后业务请求仍为 0。返回 entries 与 `bodyKeys` 均为安全副本，非法、逆序或重复边界以及缺失、重复、失败、错误状态、错误 initiator 和错误顺序均由 synthetic 负向用例拒绝。doctor / admin 首次锁定共用逐 section helper：联合 locator 必须至少命中一个 section，并对全部 `nth(index)` 逐一验证可见且不含目标说明，不再对多元素 locator 执行单元素 strict assertion。logout 默认继续点击真实 UI；仅 `eligibility-state / denied-role-entry / system / forbidden` 在仍有 HttpOnly Session Cookie 且无可见 logout 按钮时，允许页面脚本对真实 backend `/auth/logout` 发出唯一 credentials-included POST，等待 request 完成后导航真实 `/login`、验证唯一 401 并确认 Cookie 清除；其他角色或 route 不使用 fallback，无 Cookie 返回 `not_authenticated` 且不发 POST。synthetic infrastructure 从 21 项增至 30 项并实际 30 / 30 通过，其中真实验证 scripted POST、script initiator、无 request failure 2xx、登录页导航、401 探针、Cookie 清除和第二次无 Cookie 不发请求；多 section 正向、任一 section 泄露拒绝与空集合拒绝也均通过。本阶段数据库用途为 `none`，未加载数据库环境，未启动 production frontend、Browser test backend、B12 fixture CLI 或正式 B12 Playwright，未连接数据库；synthetic Chromium、BrowserContext、随机 localhost Node server 与端口均由 suite 关闭。B12-B4 的 0 route pass / 22 route fail、0 audit pass / 62 audit fail、post-browser verify 与双 cleanup 通过事实保持不变；B12-B、B12 与 Batch D 仍未完成，不进入 B12-C，B12-86–B12-88 仍未关闭，B13–B15 未执行。下一阶段必须使用全新 namespace 从 prepare 开始完整重跑 B12-B `core-workflow` 的 22 条 route；不填写不存在的 evidence commit。

B12-B6 基于 `c1e5624bc0a9a2fdf1cb0b382e6f7989a396020b`，使用全新 namespace 从 prepare 开始完整重跑 `core-workflow`。backend build、B12 fixture 定向 E2E 1 suite / 11 tests、frontend test list 17 files / 83 tests、synthetic infrastructure 30 / 30、lint、typecheck、production build、prepare、prepared verify、23 个 runtime descriptor、production frontend、Browser test backend、health、精确 CORS 与 credentials 均通过；standard_test 使用 `cogmemory_ad_test` / app / `readWrite`，Browser backend 使用 `cogmemory_ad_browser_test` / app / `readWrite`，fixture CLI 使用同库 db_admin / `dbOwner`，Playwright runner 不加载数据库 URI。Playwright 以 workers=1、retries=0、max-failures=0 实际执行全部 5 个 scenarioKey / 22 条 route，但 22 条均在 `finishWorkflowNavigation()` 发现相对 Dashboard 的额外 `/auth/me` 为 2 而非合同要求的 1，最终为 0 route pass / 22 route fail、0 audit pass / 62 audit fail。失败发生在 route exercise 之前，两个 allowlist Stage 均未请求，doctor / admin 首次锁定与逐正文 section 数量、system 真实 403 与 scripted logout、confirmation-missing 终态、双 Session alreadyLocked、两个 conflict、四条 controlled read 和 locked-readonly 均不能形成通过证据。post-browser verify 已实际执行并按未形成合同锁定终态返回 `B12_FIXTURE_POST_BROWSER_MUTATION_INVALID`。失败路径执行 best-effort logout，但未形成全部已认证 Session 的逐 Session 成功摘要，因此 Session 收口证据缺口记为 1；随后 Browser、Context、服务、runtime 与测试产物均已关闭或删除，端口、Node 与 Chromium 无残留。cleanup 1 为 `matched=true,residualCount=0`，cleanup 2 为 `matched=false,residualCount=0`，canonical seed 不变。当前分类为产品缺陷 0、fixture 缺陷 0、Playwright 验收资产缺陷 1、Session 收口证据缺口 1、稳定环境限制 0。B12-B `core-workflow` 未完成；Batch D 暂不能进入 B12-C，B12-86–B12-88 仍未最终关闭，B13–B15 未执行，不填写不存在的 evidence commit。

B12-B7 基于 `2c6cca113b314dc3e0d83801126d5cc65a538f7c` 完成 core `/auth/me` 验收所有权的代码级纠正。所有权复核确认精确“没有第二次 `/auth/me`”是 B12-83，唯一 owner 仍为 `resilience-security / presentation-safety / auth-route-deidentified`；B12 core 的 62 个 audit ID 不拥有该要求，B12-83 保持未执行、未关闭，后续 B12-C 必须通过自己的完整 Browser route 独立判断精确次数，不能引用 core 的区间计数结果。B12 core Session 现于 Dashboard 稳定后、三个 open mode 的真实工作流 `page.goto()` 前只设置一次 `workflowNavigationBoundaryEntryIndex`，并于目标响应及页面断言完成、`networkidle` 后且 route Action 前只设置一次 `workflowNavigationCompletedEntryIndex`；两个边界必须是非负整数、严格递增且 completed 不得超过 ledger 长度。专属纯函数只读取两个索引间的安全 `NetworkLedgerEntry[]`，拒绝未设置、非整数、负数、相等、逆序和越界边界，拒绝区间内 login/logout，并要求至少一个 `/auth/me`，且每条都必须为真实 GET、2xx、无 request failure、script initiator；函数不使用时间窗口、不设置精确数量上限，返回 entry 与 `bodyKeys` 的安全副本并保持输入不变。`finishWorkflowNavigation()` 不再以 Dashboard 后累计差强制 `toBe(1)`，而是保存纯函数得到的实际数量；Session summary 从固定字面量 `workflowAuthMeRequestCount: 1` 改为 `workflowNavigationAuthMeRequestCount: number`，只计导航子区间，不包含登录前或 logout 后探针，完整 authenticated 总数与五阶段 lifecycle 严格合同保持不变。数量为 2 仅表示 core helper 逐条校验通过，不代表 B12-83 通过，也不是把 1 或 2 固化为产品合同。frontend Browser test list 实际为 17 files / 92 tests，B12 core 仍为 5 个 scenarioKey / 22 条 route；synthetic infrastructure 从 30 项增至 39 项并实际 39 / 39 通过，覆盖单次和双次成功探针、区间外 pre-login/post-logout 401 不计数、缺失/非 GET/非 2xx/failure/非 script、login/logout 混入、非法与重复边界及输入不变性，同时既有五阶段认证、三种 open mode、system logout fallback、正文多 section、controlled-read 和通用基础设施继续通过。frontend lint、typecheck 和 production build 均通过。本阶段数据库用途为 `none`，未加载 `.env.test` 或 `.env.browser-acceptance`，未启动 production frontend、Browser test backend、B12 fixture CLI 或正式 B12 Browser，未连接数据库；仅 synthetic suite 启动并关闭随机 localhost Node server、隔离 BrowserContext 与 Chromium，随机端口和 `test-results` / error-context 已收口。B12-B6 的 22 route 全部执行、0 route pass / 22 route fail、0 audit pass / 62 audit fail、route Action 未开始、post-browser verify 因产品终态未形成而失败、双次 cleanup 与零残留通过的历史均不变；产品缺陷 0、fixture 缺陷 0、B12-B7 完成代码级纠正的 Playwright 验收资产缺陷 1、B12-B6 Session 收口证据缺口 1、环境或工具限制 0。B12-B、B12 与 Batch D 仍未完成，不进入 B12-C，不关闭 B12-83 或 B12-86–B12-88，不执行 B13–B15，不填写 evidence commit。下一阶段必须使用全新 namespace 从 prepare 开始完整重跑 B12-B `core-workflow` 的 22 条 route。

B12-B8 基于 `d21704f819c38e308443574698ebec994f0c90fd` 先使用独立全新 namespace 执行三种 open mode 的零业务写入预检。backend build、B12 fixture 定向 E2E 1 suite / 11 tests、frontend test list 17 files / 92 tests、synthetic infrastructure 39 / 39、lint、typecheck、production build、prepare、prepared verify、四个预检 runtime descriptor、production frontend、Browser test backend、health、精确 CORS 与 credentials 均通过。`draft-no-entry` 在 Session 最终认证分区收口时报告登录前存在非 allowlist 请求；`denied-role-entry` 的 system Session 在工作流导航区间发现非 2xx `/auth/me`；`confirmation-missing` 的真实 409 页面完成后，Console error 实际为 2 而 route-scoped 合同允许 1。三条 route 因而均为 fail，导航实际计数与完整五阶段 summary 未形成，system fallback 也未形成可关闭证据；这三项当前只定性为正式 Browser 验收阻断信号，现有安全输出不足以进一步归为产品根因，确认的 fixture 缺陷和稳定环境缺陷均为 0。全部已纳入失败收口的 Session logout 成功；system 创建失败路径执行自身 best-effort logout 与 Context 关闭，但没有生成最终 Session summary。Browser 后 prepared re-verify 通过，证明三条 route 产品业务写入为 0；Browser、Context、服务、runtime、Stage marker 与测试产物均已收口，端口无监听。cleanup 1 为 `matched=true,residualCount=0`，cleanup 2 为 `matched=false,residualCount=0`，canonical seed 不变。按阶段门禁未创建完整验收 namespace，22 条 core route、62 个 core Browser audit ID、两个 Stage、完整 post-browser verify 均为 `not_executed`；B12-83 继续由 B12-C 独立拥有且未执行、未关闭，B12-86–B12-88 也未关闭。B12-B、B12 与 Batch D 仍未完成，不进入 B12-C，不执行 B13–B15，不填写 evidence commit。

B12-B9 基于 `7489c6a576de692d56484f1fb6533746098dc901` 只增强 B12 Playwright 专属安全诊断并重跑相同三条 open-mode 预检，没有修改产品、fixture、core spec、通用 `ConsoleAudit` / `NetworkLedger`、allowlist、导航成功合同或 Console 允许数量。B12 support 现提供固定上限 20、保序且不含 `bodyKeys` 的安全 Network 副本；pre-auth unexpected request 输出 method、safe endpoint、status、resourceType、initiator、failureReason 与相对索引；非法 system 导航探针输出 start / completed boundary、区间 entryCount、每个 `/auth/me`、全部受保护 Patient / Visit / ClinicalReport GET 及其与 403 的顺序；并行 Console listener 只保存 warning / error 的单调 sequence、分类、脱敏 location 与 locationPresent，不保存原文，基于唯一 latest 409 将 error 分为 exact、phase-only 或 unmatched；open 失败在 Context 关闭后输出 role、openMode、logout result / mechanism、ledgerDetached 与 contextClosed，原断言继续抛出。synthetic infrastructure 从 39 项增至 59 项并实际 59 / 59 通过，frontend test list 为 17 files / 112 tests，lint、typecheck、production build、backend build 与 B12 fixture 定向 E2E 1 suite / 11 tests 均通过。

B12-B9 使用一个带 `b12p` 预检标记、仍遵循固定 `b12c-` profile 前缀的全新 namespace 完成 prepare、prepared verify、四个 runtime descriptor、production frontend、Browser test backend 与三条精确 route；workers=1、retries=0，trace、video、screenshot 与 HTML report 均关闭。三条 route 均实际执行并 fail：`draft-no-entry` 与 `denied-role-entry` 的 primary 各观察到四条相同 unexpected pre-auth entry，relativeIndex 为 11、12、13、14，均为 `GET /`、status 200、resourceType=fetch、initiator=script、failureReason=null；根因分类为 `normal_public_resource_missing_from_allowlist`，本任务未据此修改 allowlist。`denied-role-entry` 的 system forbidden open 本轮通过原严格导航合同并实际取得受保护 403，B12-B8 的非 2xx `/auth/me` 未复现；route 随后在 primary pre-auth 收口失败，故没有非法 auth probe 的 start / completed 数值和 auth/me-to-403 失败矩阵，旧 system 阻断根因仍为 `insufficient_evidence`。失败收口中 nurse、research_assistant 与 system logout 均成功，system mechanism 为 `scripted_cleanup_fallback`，所有 Context 均关闭。`confirmation-missing` 的唯一安全 Network 事实为 relativeIndex=49、GET latest、status 409、script、failureReason=null；Console sequence 1 为 network 类、location 指向同一 ClinicalReport 集合但非 latest，相关性 `unmatched`，sequence 2 为 network 类、location 精确 latest，相关性 `exact_endpoint`，最终 exact=1、phase-only=0、unmatched=1。该证据既不能严格证明单一 409 的重复记录，也不能证明独立 runtime error，根因分类为 `insufficient_evidence`；允许 Console error 数量仍为 1。

B12-B9 Browser 后 prepared re-verify 通过，证明产品业务写入为 0；五个实际 Session 的 logout 均成功。Browser、Context、production frontend、Browser backend、四个 runtime、test-results、Node / Chromium、3002 / 5002 与 namespace 资源均已收口；cleanup 1 为 `matched=true,residualCount=0`，cleanup 2 为 `matched=false,residualCount=0`，canonical seed 不变，package 与 lock 文件无变化。阶段二、完整 22 条 core route、两个 Stage、完整 post-browser verify、B12 resilience-security、B13–B15 均未执行；本次结果不计作 B12 Browser pass，不关闭任何 B12 audit ID。确认的产品缺陷为 0、fixture 缺陷为 0、Playwright 验收资产缺陷为 1、Session 收口缺陷为 0、环境或工具限制为 0，另有 system 与 Console 两项根因证据不足。B12-B、B12 与 Batch D 仍未完成，不进入 B12-C；B12-83 与 B12-86–B12-88 均未执行或未最终关闭，不填写 evidence commit。

### 6.3 B13 报告来源冻结：116 项

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

### 6.4 B14 报告归档：115 项

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

### 6.5 B14.1 工作流结构治理：当前仍待验部分

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

### 6.6 B15 版本化更正：10 组

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

## 7. Batch E：8 个真实设备或人工验收项目

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

## 8. 已完成批次证据索引

| 范围 | 最终状态 | 最终构成与关键证据 | evidence commit | 是否需要重跑 |
|---|---|---|---|---|
| WP-02 / B16 | 已完成 | 基线 `9099f66…` 的 Resume/unsafe 补齐与既有 V1/V2/V3 矩阵，加最终 Web Storage 审计；fixture 双次 cleanup 为 0 | `95b778448603e5eb4f96eafb82136edc36d3ab0e` | 否 |
| WP-04 / B17 | 已完成 | 验收基线 `7dd6f52…`；44/44 scenarioKey，0 fail / 0 未执行；角色、响应式、真实键盘、Network、Runtime Storage 八时点、双次 cleanup 均通过 | `db825a9df57ca1a131fee20159f9c6a38529f1ab` | 否 |
| Batch A / B1–B3 | 已完成 | 67 = Browser 58 + prior covered/automated 6 + human 2 + obsolete 1；27 scenarioKey 全过；双次 cleanup 为 0 | `335c6201f1f4864b371150467f5da6658b068e45` | 否 |
| Batch A 真正大屏抽查 | 已完成 | 普通最大化 Chrome，`window.innerWidth=1536`；5 个代表页通过 | `8b8a9281dd738c5a0694d0c2feea4bcefcae6c66` | 否；后续新代表页按策略抽查 |
| D-038 数据库隔离 | 已实现并认证 | Browser 专用数据库、双向库名/角色门禁、sentinel 隔离和完整后端门禁通过 | `f528efb7152b5770e9f873683fbd03c814108b81` | 否；数据库治理变化时重跑 |
| Batch B / B4–B6 | 桌面范围已完成 | 全合同 143 = Browser 133 + automated boundary 2 + Batch E real-device/manual 8 + obsolete 0；桌面 135 已闭环，post-browser verify 与双次 cleanup 为 0，产品缺陷 0 | `f59f3ac0c93d47e2c7fad4d29f1d7f2a61dc4021` | 桌面范围否；Batch E 8 项仍待验 |

B1–B6 的原始逐项意图通过本轮减肥前基线追溯；active playbook 不再保留已完成范围的大段旧未决清单。表中的验收基线与 evidence commit 已按 Git 提交父子顺序、提交主题和文件范围交叉核对，两者不得混写。

## 9. 认证、安全、医疗与隐私红线

1. 主登录态由后端 Session + HttpOnly Cookie 维护；前端不得读取 HttpOnly Cookie，不保存 raw token、token hash、JWT、`passwordHash` 或其他认证凭证。
2. 401 必须返回登录流程，403 必须显示无权限；入口可见性不替代后端 Guard，也不得把 403 伪装为空结果。
3. GET 使用正确 credentials / no-store / AbortSignal；写请求只发送明确白名单，不自动 retry，不把服务端生成字段、完整对象或内部 ID 回传。
4. React 内存草稿、note、reason、summary、媒体 Blob、strokes、短期 URL、updatedAt 和 receipt 不得写入 localStorage、sessionStorage、IndexedDB、URL、Cookie 或 Console。
5. 页面、Network 摘要、Console、DOM、URL、截图和报告不得泄露患者请求体、原始作答、报告正文、内部 lineage/source ID、metadata、Storage 定位、凭据或后端堆栈。
6. 只使用脱敏人工账号、患者、访视、作答、评分、报告、图片和手写数据；不得使用真实姓名、邮箱、身份证号、手机号、病历号、住址、真实文件名或其他可识别信息。
7. 系统不得把量表分数、认知域比例、趋势、qualityStatus 或 warning 表述为疾病概率、正常/异常、改善/恶化、诊断、风险等级或治疗建议。
8. MMSE / MoCA 核心评估保持医护或研究人员陪伴/监督边界；不得描述为患者居家自测。
9. 认知域重叠归因不得跨域求和；null 不补 0；前端不重算 score、percent、delta、comparison、mapping 或报告结论。
10. 媒体只展示安全公开字段和按需短期访问；不显示原始文件名、bucket/objectKey、checksum、轨迹内容、内部 media/item ID，不把逻辑作废称为物理删除。
11. system_draft、source=mixed、quality passed、confirmed、locked、source frozen 和 archived 必须按各自真实语义展示，不能互相替代或扩展为 AI/诊断/签名/PDF 事实。
12. 未实现的 unlock、unfreeze、unarchive、void/delete、签名、PDF/下载、AI、自动评分、自动确认或自动归档不得通过测试辅助入口伪造。

## 10. 同步规则与历史追溯

- 前端新增或调整测试脚本、页面、路由、组件、API Client、状态协调、权限展示、响应式或关键交互时，应更新当前门禁和对应未决合同；已完成证据只在结论确实变化时更新。
- Fixture 设计必须以本文当前待验合同为输入；不得为了方便执行而删减验证项、放宽角色/状态、引入持久化草稿或改变 API 合同。
- roadmap 业务工作包状态不因 testing playbook 压缩或 Batch 验收自动变化。
- 本轮 testing playbook 减肥前的完整历史基线为 `3c0e373902985b9da09b359ed8f2a0334ef1e5d0`。
- 已删除的 B1–B6、B16、B17 逐阶段命令、原始清单、Browser 操作、失败诊断、旧 namespace/端口和执行日志可通过 Git 历史查看。
- active playbook 不另建 archive，也不复制一份 Validation catalog；已完成历史只保留最终摘要和 evidence commit 索引。
