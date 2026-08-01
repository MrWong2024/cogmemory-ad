# CogMemory AD / 智忆评 后端验证手册

## 1. 文档定位与当前状态

本文档是数据库用途与隔离、后端自动测试、最小 fixture、verifier 和 cleanup 规则的权威来源。它只维护当前有效规则与待验范围；逐轮命令、临时数据、旧结果和失败过程由 Git 历史承担。

| 范围 | 当前状态 |
|---|---|
| WP-02 / B16、WP-04 / B17 | 已完成，既有状态不变 |
| Batch A / B1–B3 | 已完成，既有状态不变 |
| Batch B / B4–B6 | 桌面范围已完成，既有状态不变 |
| Batch C / B7–B10 | 已完成，既有状态不变 |
| Batch D / B11 | 70 项已完成，状态不变 |
| Batch D / B12 | 合同前置与防御证据保留；`B12-U01`～`B12-U03` 与最终通用门禁均已完成，活动用户场景状态为 `passed=3`、`pending=0`、`failed=0`、`blocked=0`、`not_executed=0`；合同前置证据仍无确认 `gap`，B12 Browser 验收闭环完成，权威明细见 frontend testing playbook |
| Batch D / B13 | `B13-P0-contract-evidence` 已完成，合同前置证据无确认 gap；仅有 `B13-U01`～`B13-U03` 3 个活动用户场景，状态 `passed=0`、`pending=3`、`failed=0`、`blocked=0`、`not_executed=0`，尚未执行；权威明细见 frontend testing playbook 10.1 |
| Batch D / B14–B15（含 B14.1） | 候选断言和历史设计输入保留，尚未执行；正式设计活动清单前须先完成可达性、风险与证据复用审查 |
| Batch E | 8 个真实设备或人工项目尚未执行 |

roadmap 继续维护产品范围和工作包状态；testing playbook 治理不得自动改变 roadmap。

当前状态：B12 既有后端 HTTP E2E、unit/pure、mapper 与 frontend pure/static 证据继续作为合同或防御证据保留，不再分配 B12 活动 ID。合同前置证据仍无确认 `gap`；两个合法独立认证 Session 基于同一 expectedUpdatedAt 的真实 HTTP 并发锁定，已由现有 `backend/test/clinical-report-lock.e2e-spec.ts` 覆盖，权威明细仍以 frontend testing playbook 9.2 为准；`internal_corruption_only` 的 S11 迁为非阻断防御证据。U01 已完成真实 Browser 只读入口验证；U02 已完成一次真实 Browser A22 lock 写入并由 `u02-post-lock` 验证唯一锁定事实；U03 已完成正式 logout 后原页面 401 与单次真实网络中止两条零写入恢复路径，post-browser verify 证明 `unlocked-confirmed`、`locked-confirmed`、updatedAt、正文、confirmation、metadata 与来源集合均未变化，两次 cleanup 均为 `residualCount=0`。最终通用门禁已完成，B12 Browser 验收闭环完成。

B13 已按当前 A23 合同重新生成：现有 A23 证据直接或分层覆盖角色边界、DTO、V1/V2+ 资格与 lineage、五类来源转换、首次冻结、completed 幂等、合法 `in_progress` 恢复和 A26 shared-source 兼容等合同；不在本手册复制 frontend testing playbook 10.1 的完整证据表。后端 P0-A 已以真实 HTTP E2E 覆盖 G1 同一实例多 ItemResponse 完整 scope；G2 经只读核对确认 A14/A15/A16/A18 均复用 A23 冻结后的 status/`lockedAt` 门禁与原子过滤，且不存在 A23 专属写入分支，按分层证据覆盖，不新增跨模块串联矩阵。G3 最终修正版已通过 exact test-name pattern 获得一次真实 doctor/admin 双 Session HTTP 并发绿色运行，覆盖唯一首次 start/completed 事实、首次 actor/note/counts 保真、五类来源唯一终态与精确 cleanup。G4 前端资格/草稿/Body/计数/latest continuation 与 G5 source-freeze 错误恢复已由同一份 `frontend/test/browser-acceptance/contracts/b13-source-freeze-non-browser.spec.ts` 绿色覆盖；`B13-P0-contract-evidence` 已完成，当前合同前置证据无确认 gap，下一阶段为 `B13-U01`。合法 `in_progress` 是跨集合无 transaction 流程的正式持久恢复锚点，保留原 scope、freezeId、freezeNote 与 started actor；不能把它当作损坏数据，也不能为只能损坏内部结构形成的状态创建 Browser 场景。

B12-P1 旧实验测试资产仍保持移除；U01～U03 复用一个自包含最小 fixture CLI，各自使用一个 Browser spec，没有恢复旧 fixture/support，也没有引入 manager、contract、manifest、journal、aggregator、runner、verifier 文件或 Stage。B12 当前没有剩余 Browser 活动场景，不再声明旧 P1 canary 为下一阶段。

## 2. 数据库用途和隔离

### 2.1 五类用途

| 用途 | 项目数据库 | 允许范围 |
|---|---|---|
| `none` | 不连接数据库 | 文档、lint、typecheck、build、静态审计、Playwright runner、production frontend |
| `development` | `cogmemory_ad_dev` | 日常开发与人工调试 |
| `standard_test` | `cogmemory_ad_test` | unit、普通 HTTP E2E 和允许重建测试数据的自动化 |
| `browser_acceptance` | `cogmemory_ad_browser_test` | 最小 Browser fixture、真实 Browser backend、verifier、精确 cleanup |
| `production_or_operations` | 项目命名基线 `cogmemory_ad` | 仅在用户同时明确授权目标环境与允许操作后使用 |

`standard_test` 与 `browser_acceptance` 必须数据库级隔离；namespace 不能替代数据库隔离。任一进程只允许一种用途，不得叠加 `.env.test` 与 `.env.browser-acceptance`，也不得依赖 dotenv 顺序、继承变量或后加载覆盖来选库。

### 2.2 连接前后门禁

1. 启动前确定唯一用途，并校验声明 URI 的数据库名与用途映射逐字一致。
2. 建连后读取实际数据库名，再与允许数据库逐字比较；不一致立即失败，不自动回退。
3. Browser backend 的主连接使用 app 用户与 `readWrite`；fixture/verifier/cleanup 进程使用 db_admin 与 `dbOwner`。
4. 同时存在两种用途时必须使用独立进程，并显式清除或覆盖 `MONGO_URI`、`MONGO_ADMIN_URI`、`COGMEMORY_DATABASE_PURPOSE` 及用途相关变量。
5. 普通测试不得连接 Browser 库；Browser fixture/backend 不得连接普通测试库、开发库或生产库。
6. `none` 任务不得启动应用、fixture、测试后端或其他会建立数据库连接的进程。

### 2.3 Secret 与进程职责

- 密码、完整连接串、Cookie、Session、token、hash 和私有数据不得写入 tracked 文件、CLI 参数、日志、manifest、截图、产物或最终报告。
- 本地隔离测试固定凭据只能来自项目约定且 Git ignored 的本地配置，或同一隔离父进程的稳定注入；不得从数据库 URI 或其他 Secret 派生。
- 同一微型 Profile 从 prepare 到认证、verifier 和 cleanup 使用一致凭据语义；凭据不一致时先停止并审计，不反复重试。
- fixture runner 与 Browser backend 负责数据库生命周期；Playwright runner 和 production frontend 的用途始终为 `none`，不得直接连接 MongoDB。

## 3. 可达性与后端证据职责

### 3.1 六类可达性

| 分类 | 真实入口 | 后端测试处置 |
|---|---|---|
| `ui_reachable` | 当前正式页面与正常人工操作 | Browser 主验用户可见事实；后端只复用该流程需要的合同证据 |
| `public_api_reachable` | 页面无入口，但公开 API 可被 Postman、curl 或自编客户端直接调用 | HTTP E2E 必须覆盖认证、权限、DTO 白名单、ownership、状态门禁、错误码和数据库无副作用；无副作用按风险选择最低充分证据，不等于为每种拒绝重复完整数据库快照；不重复建立 Browser 场景 |
| `legitimate_concurrency` | 两个合法用户、标签页、Session 或请求能通过正式页面或公开 API 真实形成 | HTTP E2E 主验原子性、幂等、写入次数与数据库终态；仅有不可替代页面恢复交互时补最小 Browser |
| `internal_corruption_only` | 只能直接改库、伪造内部对象、篡改运行时、损坏历史数据或依赖未实现未来功能形成 | 默认不阻断业务批次；可保留廉价 pure/unit 防御测试，只有正式导入、迁移、兼容合同、已知事故或明确合规要求才升级 |
| `manual_or_real_device` | 真实设备、相机、触控笔、手写、打印或专业人工判断 | 归入 Batch E 或明确人工验收，不由桌面 Browser 或后端测试冒充 |
| `general_gate` | lint、typecheck、build、discovery、依赖、路由所有权、数据脱敏等 | 最终代码态或对应层变化后按影响范围执行，不创建业务 Audit ID |

每个拟纳入强制验收的候选场景必须能写明起始状态、调用方角色、页面/公开 API/合法并发/正式导入/真实设备入口、实际操作、实际接口、预期业务结果和发布阻断理由。无法证明真实入口、只能直接改库制造的异常默认不得进入强制业务验收。

### 3.2 unit、HTTP E2E、Browser 与 verifier 职责

| 层级 | 负责 | 不能替代 |
|---|---|---|
| unit / pure spec | 局部判断、DTO、Controller 参数传递、Service 分支、mapper、状态边界和廉价防御分支 | 真实 HTTP、Guard、全局 Pipe、数据库终态 |
| HTTP E2E | `public_api_reachable` 与 `legitimate_concurrency` 的认证、401/403、Guard、ValidationPipe、Body 白名单、ownership、错误码、状态机、幂等、原子性、audit 与真实 MongoDB | 页面入口、控件、真实 Browser API 和用户体验 |
| Browser 微型 Profile | 仅验证 `ui_reachable` 的页面、输入、角色体验、Cookie/CORS、Storage、刷新、beforeunload、错误恢复、键盘与可访问性 | 不能替代服务端合同或数据库终态 |
| database verifier | 仅在 Browser 写入结果无法由现有 HTTP E2E 充分证明时补充写入次数、audit、protected roots 或持久终态 | 不重复已有准确 HTTP E2E，不替代页面行为 |
| static gate | `general_gate`：lint、typecheck、build、test discovery、依赖和路由边界 | 动态权限、状态机、数据库或 Browser 通过 |

同一风险已有准确证据，且相关代码、接口和配置未变化时，直接引用已有证据，不重复编写或执行 HTTP E2E、Browser 或 verifier。代码阅读、测试文件存在或测试名称存在不得写成“本次动态测试已通过”。

### 3.3 定向 Jest / HTTP E2E 命令契约

当前 `npm run test:e2e` 是完整 HTTP E2E 入口：它在导入应用前设置 `NODE_ENV=test` 和 `COGMEMORY_DATABASE_PURPOSE=standard_test`，然后以 `test/jest-e2e.json`、`--runInBand` 及该配置的 `testRegex` 启动 Jest。该 Node 包装器传给 `jest.run()` 的参数数组是固定值，未读取 `process.argv`，所以 npm 追加参数不会进入 Jest。禁止使用以下命令表示定向运行：

```powershell
npm run test:e2e -- <target>
```

以下定向命令均从 `backend` 目录执行，与完整 E2E 一致地在 Jest 启动前设置 `NODE_ENV=test` 和 `COGMEMORY_DATABASE_PURPOSE=standard_test`，并使用同一 Jest 配置与串行执行语义；正式运行导入应用时据此加载 `.env.test` 并保持 `standard_test` 数据库用途。discovery 只列出文件，不连接数据库，也不证明任何动态测试通过。`<target>`、`<first-target>` 与 `<second-target>` 必须替换为仓库内相对于 `backend` 的实际 E2E 文件路径。

单文件 discovery：

```powershell
node -e "process.env.NODE_ENV='test'; process.env.COGMEMORY_DATABASE_PURPOSE='standard_test'; require('jest').run(['--config', './test/jest-e2e.json', '--runInBand', '--listTests', '--runTestsByPath', ...process.argv.slice(1)])" ./test/<target>.e2e-spec.ts
```

单文件正式运行：

```powershell
node -e "process.env.NODE_ENV='test'; process.env.COGMEMORY_DATABASE_PURPOSE='standard_test'; require('jest').run(['--config', './test/jest-e2e.json', '--runInBand', '--runTestsByPath', ...process.argv.slice(1)])" ./test/<target>.e2e-spec.ts
```

多文件 discovery 与正式运行分别使用同一入口，并将目标路径逐个作为 Node 参数传入：

```powershell
node -e "process.env.NODE_ENV='test'; process.env.COGMEMORY_DATABASE_PURPOSE='standard_test'; require('jest').run(['--config', './test/jest-e2e.json', '--runInBand', '--listTests', '--runTestsByPath', ...process.argv.slice(1)])" ./test/<first-target>.e2e-spec.ts ./test/<second-target>.e2e-spec.ts
node -e "process.env.NODE_ENV='test'; process.env.COGMEMORY_DATABASE_PURPOSE='standard_test'; require('jest').run(['--config', './test/jest-e2e.json', '--runInBand', '--runTestsByPath', ...process.argv.slice(1)])" ./test/<first-target>.e2e-spec.ts ./test/<second-target>.e2e-spec.ts
```

正式运行前必须把 `--listTests` 输出规范化为文件路径集合，并与预期目标做完全相等比较；单文件只能发现一个目标，多文件不得缺失、重复或包含额外文件。以下任一情况触发立即停止：discovery 为 0、discovery 包含非目标文件、正式运行出现无关测试文件或完整 E2E 套件启动迹象、长时间没有目标测试摘要。不得通过延长超时掩盖范围错误，也不得用该次结果关闭或判失败目标验收项。

参数或选择器错误导致目标没有实际运行时，目标记为 `not_executed`。命令已经启动，但因超时且没有可靠测试摘要、输出不完整或证据不足而无法判断时，执行报告中的临时测试结论记为 `unknown`；`unknown` 不是 Audit ID 状态，不得写入 Audit 清单。相关 Audit ID 不得据此关闭、通过或失败，尚未形成有效证据时通常保持原有 `pending`；只有存在符合既有定义的明确且持续外部环境、工具或权限阻断时，才使用 `blocked`，目标测试未实际执行且符合项目定义时可使用 `not_executed`。

四类动态证据各有不可替代职责。fixture E2E 只证明测试资产合同，不能冒充产品 Browser；页面文本不能替代 verifier；cleanup 成功不能推导业务通过。

## 4. 最小 fixture 原则

1. fixture 只制造合法最小前置，不成为第二个产品。
2. 优先使用现有 API、通用 test factory 或最小数据库 builder。
3. 不为每个 Audit ID 单独建设 fixture，不构造产品永远不能持久化的状态。
4. 不为测试机制扩展产品合同，不重复建设批次专属 runner、journal、aggregator 或完整 manifest。
5. 写入、并发和冲突场景必须 Report 隔离；只读场景仅在可寻址且证明无污染时共享最小状态。
6. fixture 只输出安全、最小、稳定的导航与账号职责信息，不输出动态内部 ID、密码、连接串或业务正文。
7. 微型 Profile 只验证自己的副作用，不机械执行整个批次的全量 verifier。
8. fixture 不得用直接改库、mock 响应或运行时篡改创造产品永远无法进入的业务状态；`internal_corruption_only` 的防御测试不得包装成 Browser 业务前置。

## 5. 微型 Profile 的数据库生命周期

每个 Profile 原则上只覆盖 1～4 个紧密相关场景，并独立完成：

1. 选择唯一、可回收的 Profile 标识和最小资源集合。
2. 由 db_admin / `dbOwner` 独立进程 prepare；重复 prepare 默认拒绝，replace 必须显式且范围精确。
3. 执行只读 prepared verifier；它不得创建、修复或删除数据。
4. 仅在 prepared 门禁通过后启动 app / `readWrite` 的 Browser backend；Playwright 仍为 `none`。
5. 在同一代码态、同一最小前置下执行一次 Browser 微型 Profile。
6. 执行与该 Profile 副作用匹配的只读 verifier；零写入场景也必须证明报告、audit、`updatedAt` 和受保护资源未变。
7. logout、关闭 Browser/Context、停止进程，按 Profile 所有权精确 cleanup，再执行幂等核对。

一个 Codex 证据包可以包含多个微型 Profile，但同一 Codex 任务不等于共享数据库生命周期。每个 Profile 的最小数据库前置、写入副作用、并发窗口、post-action verifier、cleanup 与 residual 核对必须独立；不得跨 Profile 拼接数据库终态证据。只读 Profile 只有在测试数据可寻址、无状态污染且 cleanup 边界明确时，才可以复用安全的最小测试数据；可写、幂等、冲突和并发 Profile 不得为了减少任务数量而共享同一个可写 Report。

同一 Profile 内必须保持 Git 代码态、前置、Browser、verifier 和 cleanup 原子性。后续无关 Profile 失败，不得使此前已经独立闭环的证据失效。

## 6. 写入、并发、Stage 与终态验证

- 写请求按风险验证 Body 白名单、次数、actor、状态转换、审计和最终 MongoDB 状态；禁止自动 retry 或 polling。
- 首次成功与幂等、doctor 与 admin、冲突、401 与 403 只有在真实可达、风险不可互换且当前证据未覆盖时才分别取证，不机械扩张为固定组合。
- 页面没有入口但 Postman、curl 或自编客户端可直接调用的权限、DTO、ownership 与状态绕过属于 `public_api_reachable`，由 HTTP E2E 证明拒绝及数据库无非法变化，不要求 Browser。
- 数据库无非法变化按风险使用最低充分证据：在认证 Guard、角色 Guard、ValidationPipe 等写入逻辑之前被拒绝的请求，应验证真实 HTTP 状态与稳定错误合同，并可结合 Service 未调用、代表性无写入终态或现有层级证据；不要求为每种角色、错误码和字段组合重复完整数据库前后快照。
- 已进入可能写入的 Service，或涉及原子更新、部分写入、幂等、并发、不可逆状态的请求，必须验证数据库终态、写入次数与受保护字段；这类证据不能只由 unit 或 Browser 替代。曾出现副作用缺陷或具有明确高风险的拒绝路径，可以单独增加终态断言。
- 同一状态门禁适用于多个来源状态且产品代码没有独立分支时，复用已有证据，不为每个来源重复 HTTP E2E。接口已由状态机拒绝时，资源新增 `lockedAt` 字段不自动触发全部修改接口矩阵；只有 `lockedAt` 引入独立代码分支或改变原合同，才增加锁定专属 E2E。
- 敏感信息不泄露由公共 mapper、异常过滤器、序列化合同与代表性错误响应分层覆盖，不要求每个业务错误逐字段枚举正文、actor 内部字段和全部 Secret；只有 mapper、异常过滤器或公共响应合同变化时，才扩大完整字段安全回归。
- 多角色或双 Session 使用真实独立会话；合法并发以两个真实可达请求形成，网络结果不确定时先只读核对服务端事实，不得重试写请求。
- Stage 只能协调已经能够通过正式页面或公开 API 真实产生的并发时间窗口；它必须少量、固定、边界明确、幂等且可精确 cleanup，不能创造产品不可达的状态，也不能用直接改库或 mock 响应替代合法并发。
- Stage 前后终态检查只允许目标 transition；非目标报告、Patient、Visit、ScaleInstance、narrative、snapshot、audit、seed 和其他 Profile 必须保持不变。
- verifier 只在现有 HTTP E2E 无法充分证明 Browser 写入结果时补充；适用时必须拒绝零写入、额外写入、错误 actor、错误状态、缺失 audit、受保护字段漂移和跨 Profile 污染。
- 直接改库形成的损坏状态默认属于 `internal_corruption_only`，不阻断业务批次；已有廉价 pure/unit 或 E2E 可以作为非阻断防御回归保留。

## 7. Cleanup 与隔离

- cleanup 只能删除本次 Profile 明确拥有的 namespace、marker、runtime 和临时资源。
- 禁止 `dropDatabase()`、清空 collection、无条件或宽泛 `deleteMany({})`，也不得修改 canonical seed 或非目标数据。
- cleanup 必须有限超时、幂等并核对 residual；结果未知时先只读审计，不得重复写入。
- cleanup 不替代 post-action verifier。只有业务证据、数据库终态和资源收口分别通过，Profile 才能关闭。
- 无论是否创建数据库资源，都要精确关闭本次 Session、BrowserContext、Chromium、Node 进程、端口、runtime 和 test-results。

## 8. 失败分类与止损

每轮分别报告产品缺陷、测试代码缺陷、fixture 缺陷、Playwright/support 缺陷、环境编排缺陷、工具或权限限制和 `not_executed`。只有稳定复现并证明违反产品合同的行为才能归类为产品缺陷。

单个批次测试资产设计或修改累计达到 2 小时仍未进入稳定业务执行时暂停；公共 support 连续影响两个场景时停止方案；同一方案连续两轮因环境、fixture 或测试资产失败时不得第三轮重跑；每个微型 Profile 最多一次测试资产修复轮。修复后只重跑受影响 Profile 和必要关联证据。

不得在同一任务中同时重构 fixture、重构 runner、修改业务断言并执行正式完整验收。未经工具评估和用户明确批准，不得新建批次专属测试框架。每轮分别记录业务测试、fixture 准备、测试资产修改和环境收口耗时。

## 9. 后端静态及自动化门禁

测试执行范围按变化影响选择：

- 纯文档变化只执行文档内容、diff 与 Git 范围检查，不执行后端动态门禁。
- 单个测试文件变化先执行 discovery，再执行定向测试及必要静态检查；不自动要求完整 E2E。
- 单模块生产代码变化执行受影响 unit / HTTP E2E 和对应层 lint、typecheck、build。
- 只有认证、公共 Guard、Schema、通用 mapper、公共测试基础设施或跨模块合同变化，才按实际影响扩大回归范围。
- 完整 unit / E2E 原则上在批次最终代码态执行一次，或在存在明确跨模块影响时执行；不得在每个微型 Profile 后重复。
- Codex 指令要求完整套件时必须写明具体影响依据，不能只写“为了保险”。

适用范围内实际执行的 lint、typecheck、build、unit 和 E2E 必须分别报告，互不替代。删除测试资产后必须额外验证 test discovery、TypeScript 全量范围、import、package script 和文档链接无悬空。禁止通过放宽 TypeScript、扩大 exclude、suppression、跳过测试或吞掉退出码制造通过。

## 10. B12～B15 当前待验范围

- B12：原 88 个 ID 与原 S01～S17 不再作为活动关闭对象；当前唯一活动用户场景 `B12-U01`～`B12-U03` 均已完成，状态为 `passed=3`、`pending=0`、`failed=0`、`blocked=0`、`not_executed=0`。U02 的真实 Browser 写入与后置数据库验证已通过；U03 两条真实恢复路径均未产生报告业务写入，post-browser verify 与两次 `residualCount=0` cleanup 已通过；既有 A22/A23 HTTP E2E、unit/pure、mapper 和 frontend pure/static 证据继续作为不分配活动 ID 的合同前置或防御证据，仍无确认 `gap`。最终通用门禁已通过，B12 Browser 验收闭环完成；逐项权威明细、Browser 结果与迁移仍以 frontend testing playbook 9.1～9.5 为准。
- B13：已重新生成 `B13-U01`～`B13-U03` 3 个活动用户场景，状态为 `passed=0`、`pending=3`、`failed=0`、`blocked=0`、`not_executed=0`，活动设计治理已完成但尚未执行。B13-P0-A 已完成 G1 动态覆盖与 G2 分层校准，B13-P0-A2 已完成 G3 双 Session 真实 HTTP 并发绿色覆盖；G4、G5 已由同一份 frontend Node-only contract spec 覆盖，`B13-P0-contract-evidence` 已完成且合同前置证据无确认 gap，下一阶段为 `B13-U01`。后端合同、pure/static、防御证据、P0～P4 职责及原 1～116 迁移的权威明细见 frontend testing playbook 10.1；本手册只维护后端证据分层、数据库、fixture、verifier、cleanup 与状态摘要。
- B14：原 115 项和 B14.1 行为范围属于未经治理的候选断言和历史设计输入，本次不改写具体候选条目；正式设计活动清单前须先分类。
- B15：原 10 组属于未经治理的候选断言和历史设计输入，本次不改写具体候选条目；正式设计活动清单前须先分类。

B14～B15 正式设计活动清单前，每个候选断言必须先标记 `ui_reachable`、`public_api_reachable`、`legitimate_concurrency`、`internal_corruption_only`、`manual_or_real_device`、`general_gate` 或 `duplicate_or_covered`。场景化审查允许合并重复或已有覆盖的断言、迁移通用门禁、退役失去阶段前提的断言，并重新分配最低充分证据层；审查必须保留核心业务风险、不可替代语义、旧条目映射和已有有效证据，不得冻结历史数量或顺序。

场景化审查后仍不创建批次专属大型 fixture、evidence matrix、runner、journal、aggregator 或完整 manifest，也不要求一次原子运行关闭整个批次。先复用或补齐最低充分的非 Browser 证据，再为剩余 `ui_reachable` 风险设计最小 Browser Profile，最后按影响范围执行一次轻量集成冒烟和通用门禁。

本手册不关闭任何待验活动场景，不改变 B11 及以前完成状态，不改变 B13～B15 产品范围。B13 当前设计与迁移，以及 B12～B15 的活动场景清单、具体状态和旧 ID 映射，以 frontend testing playbook 为权威来源。
