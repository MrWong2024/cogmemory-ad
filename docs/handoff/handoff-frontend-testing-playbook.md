# CogMemory AD / 智忆评 前端验证手册

## 1. 文档定位

本文档只维护前端 / Browser 的稳定验证规则、跨层证据分工与当前仍待验边界。产品范围、工作包状态和下一阶段由 `handoff-roadmap.md` 维护；当前实现事实由 frontend snapshot 与 route / API / component maps 维护；数据库用途、fixture、verifier、cleanup 和后端定向命令由 backend testing playbook 维护。

既有已关闭批次的详细命令、数字、失败过程和执行证据由 Git 历史及当前测试资产追溯，本 Playbook 不重复维护阶段流水或 evidence ledger。

## 2. 稳定验证设计规则

### 2.1 候选治理与验收止损

通用候选生成、归属、增量对账和止损以 `docs/codex-instruction-spec.md` 3.9 为唯一事实源。候选按正常主流程、真实 UI、公开 API、合法并发、数据副作用、权限 / 隐私、恢复以及人工 / 真实设备边界生成，再按必要性、可达性、已有证据和最低充分证据治理；候选集合不是自动待办生成器，也不建立永久 Audit ID 仓库。

正常主流程、数据完整性、权限 / 安全 / 隐私、正常单次操作稳定未知 4xx / 5xx、当前业务合同直接违例或无可信恢复属于当前阻断。低频组合、代表性非关键 accessibility、真实设备以及已有低层精确证据的边缘恢复，可以具名归属工作包最终收口，但在对应工作包完成前必须复核。

### 2.2 Browser 验收顺序

1. **Happy Path Smoke**：先证明正常用户按正常步骤从入口走到正常结束；未完成前不持续扩大低频异常矩阵。
2. **高价值防御**：选择重复点击 / 提交、权限绕过、stale write、代表性凭证失效和一个代表性并发冲突，重点证明无覆盖、无重复副作用和服务端事实一致。
3. **少量代表性恢复**：按合同选择 refresh、pause / resume 或 recovery，不排列全部组合，也不重复已有低层精确证据。
4. **工作包最终收口**：非关键 Axe、真实设备、极低频组合和可用性细节按具名归属收口；未全部完成不默认阻断下一业务功能，但仍按 roadmap 阻断对应工作包完成。

### 2.3 跨层证据职责

| 证据层 | 主职责 | 不可替代边界 |
|---|---|---|
| `backend_unit` | 局部判断、DTO、Service 分支、mapper 与状态边界 | 不证明真实 HTTP、Guard 或数据库终态 |
| `backend_http_e2e` | 认证、权限、Pipe、Body、ownership、状态机、幂等、并发原子性和数据库终态 | 不证明页面真实交互 |
| `frontend_static_or_pure` | 展示映射、Action ownership、局部资格与廉价防御 | 不证明真实输入、Browser API 或后端动态行为 |
| `browser_micro_profile` | 页面入口、控件、输入、提示、刷新、恢复、Browser 隐私和代表性可访问性 | 不替代服务端合同或数据库终态 |
| `database_verifier` | HTTP E2E 不足时补 Browser 写入次数、audit、protected roots 或持久终态 | 不重复准确 HTTP E2E，不替代页面体验 |
| `static_gate` | lint、typecheck、build、discovery、依赖与路由边界 | 不证明业务运行 |

同一风险只在最合适层作为主证据。代码阅读不等于动态通过，页面文本不替代数据库终态，fixture E2E 不冒充产品 Browser；收缩 Browser 范围不得削弱认证、授权、ownership、DTO 白名单、不可逆状态门禁、幂等、合法并发、隐私或数据库无副作用证据。

### 2.4 按真实影响选择验证范围

- 纯文档变化只执行文档内容、链接、diff 与 Git 范围检查。
- 单个测试文件变化执行精确 discovery、定向测试和必要静态检查，不自动扩大到完整 E2E。
- 单模块生产代码变化执行受影响 unit / HTTP E2E、Browser 或对应静态门禁。
- 只有认证 / 公共 Guard、Schema、共享 mapper / 基础设施、跨模块公共合同、影响边界无法由定向证据可靠界定、工作包最终收口或用户明确要求等实际依据，才扩大完整回归。
- 是否需要完整 unit / E2E 由真实影响依据决定；已证明有必要时在本实现单元最终代码态执行。最终代码态本身不是扩大测试范围的理由，定向 unit / HTTP E2E / Browser 可以成为最终有效证据。
- discovery 和 infrastructure 只证明测试可发现与跑道能力，不关闭业务场景；各层按真实职责选择，不能用低层证据替代确有必要的真实 HTTP 或 Browser 证据。

### 2.5 微型 Browser Profile、状态与失败分类

微型 Profile 原则上只包含 1～4 个紧密相关场景，具有单一主风险、最小合法前置、独立 BrowserContext、独立证据、必要后置 verifier 和精确 cleanup。正常 happy path 与低频 recovery / takeover / redo 原则上拆开；已有低层充分证据的边缘恢复不在每条高层主链重复排列。禁止批次专属 runner、journal、aggregator 或完整 manifest。

活动场景只使用 `pending`、`passed`、`failed`、`blocked`、`not_executed`；全部必要主证据、支持证据、适用数据库终态与 cleanup 实际通过后才能标记 `passed`。`unknown` 只是输出不足时的临时执行结论，不关闭场景。

失败先分类为 `product`、`spec/test`、`fixture`、`support/runner`、`environment`、`tool limitation` 或 `not_executed`，再修对应层。只有稳定证明违反正式产品合同才升级为产品 gap；GET aborted、Next prefetch、Playwright response / requestfailed 时序、测试鼠标坐标和 runner 编排问题不能仅因自动化失败演化为 production 架构要求。

## 3. Browser 专属稳定规则

### 3.1 必须验证的行为与代表性抽样

- 使用 production frontend、真实 Browser test backend 和真实 HTTP；不得以 mock server、伪造响应或代码阅读替代。
- 验证入口、角色可见性、控件状态、真实输入、请求次数、结果与可达恢复；页面无入口的 403、DTO 或 ownership 绕过交给 HTTP E2E。
- 验证 refresh、beforeunload、localStorage、sessionStorage、IndexedDB、Cookie、URL、Console、DOM 与 Network 隐私边界。
- 多角色或双 Session 使用独立 BrowserContext，不通过清除同一 Context Cookie 模拟隔离。
- 代表性 viewport 保持 390×844、800×1280、1280×800、1024×1366、1366×1024、1280×720、1536×864；不穷举设备 × 角色组合，宽表只允许局部滚动。
- 键盘证据使用真实 Tab、Shift+Tab、Enter、Space 与 `isTrusted=true` 事件，验证自然焦点顺序、focus-visible 和焦点进出。
- Axe 与 ARIA tree 用于代表性基础 A/AA、role、accessible name 和结构检查，不替代真实设备或专业判断。影响核心操作、表单名称、键盘、标签或内容理解的 violation 必须当前关闭；非关键结构 / 语义项可具名进入最终 accessibility 收口。

横切项只在对应能力变化或缺少可信证据时附着少量真实流程。GET canceled 本身不是产品失败；只有必要读取因此无法取得、业务不可达且无可信恢复才阻断。

### 3.2 Canonical Origin、Cookie 与构建输入

每个 Browser Profile 启动前必须核对页面 URL/origin、production frontend 实际构建使用的 `NEXT_PUBLIC_API_BASE_URL`、实际 API origin、backend `CORS_ORIGIN`、Session Cookie host 和 backend health：

| canonical host | 页面 origin | API origin / API Base | CORS origin | Cookie host | health |
|---|---|---|---|---|---|
| `localhost` | `http://localhost:3002` | `http://localhost:5002` | `http://localhost:3002` | `localhost` | `http://localhost:5002/health` |
| `127.0.0.1` | `http://127.0.0.1:3002` | `http://127.0.0.1:5002` | `http://127.0.0.1:3002` | `127.0.0.1` | `http://127.0.0.1:5002/health` |

- 同一认证链不得混用两个 host；CORS 必须精确匹配含 scheme 和端口的页面 origin。
- 当前 Session Cookie 是 API host 的 host-only HttpOnly Cookie；只核对安全元数据，禁止输出值。
- `NEXT_PUBLIC_API_BASE_URL` 是 production build 输入；值变化后必须重新 build，并以实际 Network 请求证明，重启已有 server 不能替代。
- `BROWSER_ACCEPTANCE_FRONTEND_ORIGIN` 与 `BROWSER_ACCEPTANCE_BACKEND_ORIGIN` 只声明 runner 预期拓扑，不能覆盖构建产物中的 API Base。

业务 Profile 前在同一 BrowserContext 完成 health、页面 origin、登录 API origin / CORS、HttpOnly Cookie 存在和 `GET /auth/me` 已认证读取的 preflight；失败时先修环境或构建链，不重试业务写请求或延长超时绕过。

### 3.3 进程、数据库、审计与 cleanup

- production frontend 与 Browser runner 的数据库用途必须为 `none`，不得直连 MongoDB；Browser test backend 使用 Browser app / `readWrite`，fixture、verifier、cleanup 使用 db_admin / `dbOwner`，具体规则见 backend testing playbook。
- 同一 Profile 保持同一 Git 代码态、最小 fixture、一次 Browser 执行、适用 verifier 和一次精确 cleanup；不同 Profile 不共享可写 Report、Session、数据库终态或 cleanup。
- 只关闭任务拥有的 BrowserContext、Session、Chromium、Node 进程、端口、runtime、namespace 和 test-results；cleanup 成功本身不证明业务通过。
- 临床草稿、客户端可读凭据、内部 ID、完整响应和敏感对象不得进入 Storage、URL、DOM、Console、Network 日志、截图或产物；HttpOnly Cookie 只核对安全元数据。
- 不可逆 POST 不自动 retry / replay。网络结果不确定时先只读核对服务端权威事实，只有明确用户动作才再次写入。

## 4. 当前仍待验边界

- **WP-10 最终 Browser 收口**：F2-P2 保留 upload 后 reload recovery、takeover、redo、old-run isolation 与 terminate；它在 F3 后、WP-10 宣布完成前执行，不改变 F2 已完成或 F3 下一阶段状态。
- **WP-10 accessibility 收口**：staff 页面既有两项 Axe 观察需在最终收口重新取得 rule 并分类；影响核心操作、accessible name、键盘或明显可理解性的项目必须修复，非阻断结构 / 语义项按最终验收治理。
- **真实服务与设备**：真实设备、真实麦克风、真实触控笔、真实患者 OSS 和真实 ASR 不由 desktop viewport、synthetic microphone、mouse / Pointer 或 fake Storage 冒充；按 roadmap 的 Batch E / WP-08 或相应最终验收边界处理。
- Batch E 既有待验 ID 为 `B5-MV-008`、`B5-MV-028`、`B5-MV-029`、`B5-MV-058`～`B5-MV-062`。WP-08 启动时按最终患者合同重新治理适用性；工作包完成以最终适用候选关闭为准，不以机械关闭历史 ID 为准。

## 5. 维护规则

- 只为当前仍待验边界保留必要场景设计；关闭后由 Git 历史和当前测试资产追溯，不在本 Playbook 复制测试数字或阶段故事。
- 验证规则、Browser canonical environment、Profile / audit / cleanup / accessibility 合同或当前仍待验边界变化时更新本文档。
- 当前实现事实更新 snapshot / maps，产品范围与工作包状态更新 roadmap；本文档不得自行启动、完成或重标工作包。
- 测试资产复杂度按职责内聚、重复基础设施、跨进程链路、独立状态、cleanup 责任、证据价值与维护成本判断，不以物理行数、字符数或文件数量作为 pass / fail 标准。
