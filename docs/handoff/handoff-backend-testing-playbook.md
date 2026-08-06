# CogMemory AD / 智忆评 后端验证手册

## 1. 文档定位与紧凑状态

本文档是后端验证候选来源的项目级补充，以及数据库用途与隔离、Secret 和进程职责、后端定向 Jest / HTTP E2E、unit / HTTP E2E / database verifier 分工、fixture、verifier、cleanup、并发终态和后端静态门禁的权威来源。跨层候选生成与分类、Browser 规则、活动场景状态、Batch D Browser 证据和 Batch E 由 `handoff-frontend-testing-playbook.md` 维护；通用任务归属与即时闭环由 `docs/codex-instruction-spec.md` 3.9 维护；逐轮命令、耗时、失败过程与历史完整合同由 Git 历史追溯。

| 范围 | 当前状态 | backend-specific 证据 | Browser 详情 |
|---|---|---|---|
| WP-02 / B16、WP-04 / B17 | 已完成 | 既有状态不变 | frontend testing playbook |
| Batch A / B1–B3 | 已完成 | 既有状态不变 | frontend testing playbook |
| Batch B / B4–B6 | 桌面范围已完成 | 既有状态不变 | Batch E 仍有 8 项待验 |
| Batch C / B7–B10 | 已完成 | 既有状态不变 | frontend testing playbook |
| Batch D / B11 | 已完成 | backend-specific 证据完整 | frontend testing playbook |
| Batch D / B12 | 完成；`passed=3`、`pending=0`；P0 `gap=0` | A22 HTTP/unit 与 lock verifier 完整 | frontend testing playbook“当前证据索引” |
| Batch D / B13 | 完成；`passed=3`、`pending=0`；P0 `gap=0` | A23 HTTP/unit、并发、恢复与 verifier 完整 | frontend testing playbook“当前证据索引” |
| Batch D / B14 | 完成；`passed=2`、`pending=0`；P0 `gap=0` | A24 HTTP/unit、并发、Archive Node-only 与 verifier 完整 | frontend testing playbook“当前证据索引” |
| B14.1 | 累计证据索引，不是独立 Browser 批次 | shared Node-only 与分层 backend 证据完整 | frontend testing playbook“B14.1 累计证据索引” |
| Batch D / B15 | 完成；`passed=2`、`pending=0`；P0 `gap=0` | A25 HTTP/unit、三类并发收敛、Correction Node-only 与 verifier 完整 | frontend testing playbook“当前证据索引” |
| A29 / A30 / WP-03 backend | 后端范围完成；A29 / A30 证据复用；backend 阻断性 `gap=0` | 父实例 + 固定题目 scope 的可恢复 barrier、A14/A15 原子门禁、fencing/releasing 恢复、完成/释放 CAS 竞争、legacy / invalid / privacy 证据完整 | frontend single-flight、P3 与 P9 已闭合；B18 补充验证自动化 `gap=0`，WP-03 已完成 |
| Batch E | 8 个真实设备或人工项目待验 | 不由后端自动测试冒充 | frontend testing playbook“Batch E：真实设备或人工验收” |

roadmap 独立维护产品范围和工作包状态；testing playbook 治理不启动下一工作包。

## 2. 数据库用途和隔离

### 2.1 五类用途与固定映射

| 用途 | 项目数据库 | 允许范围 |
|---|---|---|
| `none` | 不连接数据库 | 文档、lint、typecheck、build、静态审计、Playwright runner、production frontend |
| `development` | `cogmemory_ad_dev` | 日常开发与人工调试 |
| `standard_test` | `cogmemory_ad_test` | unit、普通 HTTP E2E 和允许重建测试数据的自动化 |
| `browser_acceptance` | `cogmemory_ad_browser_test` | 最小 Browser fixture、Browser test backend、verifier 与精确 cleanup |
| `production_or_operations` | 项目命名基线 `cogmemory_ad` | 仅在用户同时明确授权目标环境与允许操作后使用 |

`standard_test` 与 `browser_acceptance` 必须数据库级隔离；namespace 不能替代数据库隔离。任一进程只允许一种用途，不得叠加 `.env.test` 与 `.env.browser-acceptance`，也不得依赖 dotenv 顺序、继承变量或后加载覆盖选择数据库。

### 2.2 连接前后门禁与进程角色

1. 启动前确定唯一用途，并校验 URI 声明数据库名与固定映射逐字一致。
2. 建连后读取实际数据库名，再与允许数据库逐字比较；不一致立即失败，不自动回退或猜测其他库。
3. Browser test backend 主连接使用 Browser app 用户与 `readWrite`；fixture、verifier、cleanup 独立进程使用 db_admin 与 `dbOwner`。
4. 同时存在不同用途时使用独立进程；需要切换时显式清除或覆盖 `MONGO_URI`、`MONGO_ADMIN_URI`、`COGMEMORY_DATABASE_PURPOSE` 及用途相关变量。
5. 普通测试不得连接 Browser 库；Browser 进程不得连接普通测试库、开发库或生产库；角色互换也必须拒绝。
6. `none` 进程不得建立数据库连接，也不得启动会连接数据库的应用、fixture 或测试后端。

### 2.3 Secret 与进程职责

- 密码、完整连接串、Cookie、Session、token、hash 和私有数据不得写入 tracked 文件、CLI 参数、日志、manifest、截图、产物或最终报告。
- 本地隔离测试固定凭据只能来自项目约定且 Git ignored 的本地配置，或由同一隔离父进程稳定注入；不得从数据库 URI、时间、进程值或其他 Secret 派生。
- 同一 Profile 从 prepare、prepared verify、Browser 登录、post verify 到 cleanup 使用一致的账号凭据语义；凭据不一致时停止并审计，不反复重试或降低校验。
- fixture runner 与 Browser backend 负责各自数据库职责；Playwright runner 和 production frontend 的用途始终为 `none`。

## 3. 后端证据职责

### 3.1 后端候选来源补充

本节后端候选清单同时适用于实现前初始阶段 A、实现中即时追加和实现后增量阶段 A。新 A#、涉及后端合同的 B#、工作包子任务或其他实现单元在后端合同基本锁定后、生成实现 Codex 指令前，应依据目标后端合同、当前既有资产、预计新增或修改资产及预计调用链和副作用，至少核对：

- Controller / Route / Guard / Pipe 的真实入口、认证顺序和拒绝边界。
- DTO、whitelist、path/query/body 转换与 Controller 到 Service 的参数传递。
- ownership、角色、服务端 actor 与跨资源归属。
- Service 状态转换、readiness、错误边界、不可逆动作和相邻生命周期写保护。
- Repository / Mongoose 条件过滤与原子写，以及幂等、合法并发、部分写入、显式恢复和网络不确定终态。
- Schema、索引、唯一性、版本/replacement 关系与持久不变量。
- mapper、response 白名单、错误响应与公开隐私。
- audit、protected roots、数据库写入次数和最终状态，以及 Patient / Visit / 来源 / Storage 等外部副作用。
- 是否需要 HTTP E2E，或现有 HTTP E2E 是否已提供当前代码态的精确证据。
- Browser 写入是否需要后置 database verifier，fixture 是否只制造合法最小前置，cleanup 是否精确、幂等且可核对。
- 已有 unit / HTTP E2E / verifier 等后端证据，以及证据形成后相关 Controller、DTO、Service、Repository、Schema、mapper 或配置是否变化。

实现完成后的增量阶段 A 必须核对实际 backend diff、新增或删除文件、Controller—Service—Repository / Mongoose 调用链、公共 Guard / Pipe / mapper 和共享服务、Schema / 数据库 / Storage / audit 等真实副作用，以及测试执行结果暴露的新风险；新增或发生实质变化的候选继续按 `docs/codex-instruction-spec.md` 3.9 的阶段 B、C 治理。

A# 默认从 backend unit、HTTP E2E、database verifier 与 static gate 中选择最低充分证据；没有正式 UI 入口时不机械要求 Browser。UI 候选可以归属到同一工作包中的具名 B#，但该归属不表示候选已经关闭：只有 A# 自身锁定的纯后端范围实际关闭后，才可准确写为“A# 后端范围完成”；具名 B# 仍 pending 时，不得宣布完整工作包或产品能力完成。若 A# 的锁定范围本身包含跨层产品闭环，不得把 UI 风险转移到后续 B# 以提前完成。

B# 可以引用当前代码态下仍适用的 A# 精确 unit、HTTP E2E 或 verifier 证据，不重复建设同一风险的主测试；若 B# 改变后端合同或暴露新的公开调用路径，必须重新扫描后端候选，并明确由当前跨层任务或具名 A# 承担。

本小节只补充后端特有风险候选；通用治理时序、默认实现与即时验收一体化、具名独立验收、无界扩张止损、阶段/实现单元/工作包完成门禁和最终覆盖核对，统一引用 `docs/codex-instruction-spec.md` 3.9，跨层分类引用 frontend testing playbook“验证候选的系统生成与即时闭环”，不复制完整跨层流程。不得为每个 Controller、DTO 字段或 Schema 字段机械建立测试，也不得把只能直接改库形成的数据库损坏状态默认升级为阻断验收。

### 3.2 后端证据层职责

新风险的 `ui_reachable`、`public_api_reachable`、`legitimate_concurrency`、`internal_corruption_only`、`manual_or_real_device` 与 `general_gate` 分类，以 frontend testing playbook“当前测试设计规则”为权威。后端在该分类上只补充以下证据职责：

| 层级 | 负责 | 不能替代 |
|---|---|---|
| unit / pure spec | 局部判断、DTO、Controller 参数传递、Service 分支、mapper、状态边界与廉价防御 | 真实 HTTP、Guard、全局 Pipe、数据库终态 |
| HTTP E2E | 公开 API 绕过与合法并发的认证、401/403、Guard、ValidationPipe、Body 白名单、ownership、错误码、状态机、幂等、原子写入、audit 与真实 MongoDB 终态 | 页面入口、控件、Browser API 和用户体验 |
| database verifier | 仅在 Browser 写入结果无法由现有 HTTP E2E 充分证明时，补充写入次数、audit、protected roots 或持久终态 | 不重复已有准确 HTTP E2E，不替代页面行为 |
| static gate | lint、typecheck、build、discovery、依赖、import、路由和测试资产链接 | 动态权限、状态机、数据库或 Browser 通过 |

页面没有入口但公开 API 可直接调用的权限、DTO、ownership 与状态绕过由 HTTP E2E 证明拒绝和数据库无非法变化。合法并发使用两个真实可达请求或独立会话，验证原子性、幂等、写入次数与终态；只有不可替代的页面恢复交互才增加 Browser。

已进入可能写入的 Service，或涉及原子更新、部分写入、幂等、并发、不可逆状态的请求，必须验证数据库终态、写入次数与受保护字段。Guard / Pipe 之前拒绝的请求按风险使用最低充分无副作用证据，不机械为每个错误组合复制全库快照。代码阅读、测试文件存在或测试名称存在不得写成本次动态通过。

## 4. 定向 Jest / HTTP E2E 命令

当前 `npm run test:e2e` 包装器固定向 Jest 传入 `test/jest-e2e.json` 和 `--runInBand`，未读取 `process.argv`，因此 npm 追加参数不会透传。禁止用下列命令表示定向运行：

```powershell
npm run test:e2e -- <target>
```

以下命令均从 `backend` 目录执行，并在 Jest 启动前设置 `NODE_ENV=test` 与 `COGMEMORY_DATABASE_PURPOSE=standard_test`。discovery 只列出目标文件、不连接数据库，也不证明动态测试通过；正式运行导入应用时加载普通测试配置并连接 `cogmemory_ad_test`。

单文件 discovery：

```powershell
node -e "process.env.NODE_ENV='test'; process.env.COGMEMORY_DATABASE_PURPOSE='standard_test'; require('jest').run(['--config', './test/jest-e2e.json', '--runInBand', '--listTests', '--runTestsByPath', ...process.argv.slice(1)])" ./test/<target>.e2e-spec.ts
```

单文件正式运行：

```powershell
node -e "process.env.NODE_ENV='test'; process.env.COGMEMORY_DATABASE_PURPOSE='standard_test'; require('jest').run(['--config', './test/jest-e2e.json', '--runInBand', '--runTestsByPath', ...process.argv.slice(1)])" ./test/<target>.e2e-spec.ts
```

多文件 discovery：

```powershell
node -e "process.env.NODE_ENV='test'; process.env.COGMEMORY_DATABASE_PURPOSE='standard_test'; require('jest').run(['--config', './test/jest-e2e.json', '--runInBand', '--listTests', '--runTestsByPath', ...process.argv.slice(1)])" ./test/<first-target>.e2e-spec.ts ./test/<second-target>.e2e-spec.ts
```

多文件正式运行：

```powershell
node -e "process.env.NODE_ENV='test'; process.env.COGMEMORY_DATABASE_PURPOSE='standard_test'; require('jest').run(['--config', './test/jest-e2e.json', '--runInBand', '--runTestsByPath', ...process.argv.slice(1)])" ./test/<first-target>.e2e-spec.ts ./test/<second-target>.e2e-spec.ts
```

正式运行前必须把 discovery 输出规范化为文件路径集合，并与预期目标完全相等；单文件只能发现一个目标，多文件不得缺失、重复或包含额外文件。discovery 为 0、出现非目标文件、完整套件迹象或长期没有目标摘要时立即停止，不延长超时掩盖范围错误。

参数或选择器错误导致目标未执行时记 `not_executed`。命令已启动但超时且没有可靠摘要、输出不完整或证据不足时，临时结论为 `unknown`；`unknown` 不是活动场景状态。明确且持续的外部环境、工具或权限阻断才记 `blocked`。四类动态证据互不替代：fixture E2E 不冒充产品 Browser，页面文本不替代 verifier，cleanup 成功不推导业务通过。

## 5. Fixture、verifier、cleanup 与 Stage

### 5.1 最小 fixture 与 Profile 生命周期

fixture 只制造合法最小前置，不成为第二个产品：优先使用现有 API、通用 test factory 或最小数据库 builder；不按每个 Audit ID 建 fixture，不制造产品永远不能持久化的状态，不建设批次专属 runner、journal、aggregator 或完整 manifest。写入、冲突和并发场景使用隔离 Report；只读场景仅在可寻址、无污染且所有权清楚时共享最小状态。

每个 Profile 独立完成：

1. 选择唯一、可回收的 Profile 标识和最小资源集合。
2. db_admin / `dbOwner` 独立进程 prepare；重复 prepare 默认拒绝，replace 必须显式且精确。
3. 执行只读 prepared verifier；不得创建、修复或删除数据。
4. prepared 门禁通过后才启动 app / `readWrite` 的 Browser backend；Playwright 仍为 `none`。
5. 在同一代码态和前置下执行一次 Browser 微型 Profile。
6. 执行与副作用匹配的只读 verifier；零写入场景也验证报告、audit、`updatedAt` 和受保护资源未变。
7. logout、关闭 Browser/Context、停止进程，按所有权精确 cleanup，再执行幂等 residual 核对。

一个任务可以包含多个 Profile，但不得跨 Profile 拼接前置、可写 Report、数据库终态或 cleanup。后续无关 Profile 失败，不得使此前独立闭环证据失效。

### 5.2 写入、并发、verifier 与 Stage

- 写请求按风险验证 Body 白名单、次数、actor、状态转换、审计和最终 MongoDB 状态；禁止自动 retry、replay 或 polling。
- 多角色或双 Session 使用真实独立会话；网络结果不确定时先只读核对服务端事实，不得重试写请求。
- verifier 只在现有 HTTP E2E 不足时补充 Browser 写入终态；适用时拒绝零写入、额外写入、错误 actor、错误状态、缺失 audit、受保护字段漂移和跨 Profile 污染。
- Stage 只协调正式页面或公开 API 能真实产生的并发窗口；必须少量、固定、边界明确、幂等且可精确 cleanup。禁止用直接改库、mock 响应或 Stage 创造产品不可达状态。
- Stage 前后只允许目标 transition；非目标报告、Patient、Visit、ScaleInstance、narrative、snapshot、audit、seed 与其他 Profile 保持不变。

### 5.3 Cleanup 与复杂度治理

- cleanup 只删除 Profile 明确拥有的 namespace、marker、runtime 和临时资源；禁止 `dropDatabase()`、清空 collection、无条件或宽泛 `deleteMany({})`，不得修改 canonical seed 或非目标数据。
- cleanup 必须有限超时、幂等并核对 residual；结果未知时先只读审计，不重复写入。cleanup 不替代 post-action verifier。
- 精确关闭本次 Session、BrowserContext、Chromium、Node 进程、端口、runtime 与 test-results；不终止所有权不明的资源。
- fixture、HTTP E2E、verifier 和 cleanup 的通用复杂度治理引用 `docs/codex-instruction-spec.md` 3.10；按职责、状态、进程、Secret、生命周期、耦合和重复实现判断，不以行数或文件数单独决定通过、失败或拆分。

## 6. 失败、止损与执行范围

每轮分别报告产品缺陷、测试代码缺陷、fixture 缺陷、Playwright/support 缺陷、环境编排缺陷、工具或权限限制和 `not_executed`。只有稳定复现并证明违反产品合同的行为才归类为产品缺陷。

同一方案连续两轮因环境、fixture 或测试资产失败时不得第三轮同方案重跑；公共 support 连续影响两个场景时停止方案；每个微型 Profile 最多一次测试资产修复轮。不得在同一任务同时重构 fixture、重构 runner、修改业务断言并执行正式完整验收；测试基础设施明显超过被测业务时停止扩张并重新评估分层。

测试范围按变化影响选择：

- 纯文档变化只执行文档、链接、diff 与 Git 范围检查。
- 单个测试文件变化先执行精确 discovery，再执行定向测试和必要静态检查。
- 单模块生产代码变化执行受影响 unit / HTTP E2E 及对应 lint、typecheck、build。
- 只有认证、公共 Guard、Schema、通用 mapper、公共测试基础设施或跨模块合同变化，才扩大回归范围。
- 完整 unit / E2E 原则上只在最终代码态或存在明确跨模块影响时执行。

lint、typecheck、build、unit、HTTP E2E、Browser、verifier 和 cleanup 互不替代。删除测试资产后必须额外核对 discovery、TypeScript 全量范围、import、package script 和文档链接。禁止放宽 TypeScript、扩大 exclude、添加 suppression、跳过测试或吞掉退出码制造通过。

## 7. 当前 backend 证据摘要

以下内容是当前资产与既有最终结果的紧凑索引；本次只读核对不表示重新动态执行。

| 批次 | backend 主要证据 | Browser verifier / cleanup 摘要 | 当前状态 | 详细权威来源 |
|---|---|---|---|---|
| B12 | `backend/test/clinical-report-lock.e2e-spec.ts`；`backend/src/modules/reports/services/clinical-report-lock-workflow.service.spec.ts`；A22 权限、幂等、真实并发、锁定终态 | `backend/scripts/b12-u01-browser-fixtures.ts` 覆盖 prepared/post-lock/零写入核对与精确 cleanup；生命周期已闭环 | backend-specific 证据完整 | frontend testing playbook“当前证据索引” |
| B13 | `backend/test/clinical-report-source-freeze.e2e-spec.ts`；`backend/src/modules/reports/services/clinical-report-source-freeze-workflow.service.spec.ts`；A23 多来源、精确 scope、合法并发与 `in_progress` 恢复 | `backend/scripts/b13-browser-fixtures.ts` 覆盖 prepared/post-freeze/post-recovery 与精确 cleanup；生命周期已闭环 | backend-specific 证据完整 | frontend testing playbook“当前证据索引” |
| B14 | `backend/test/clinical-report-archive.e2e-spec.ts`；`backend/src/modules/reports/services/clinical-report-archive-workflow.service.spec.ts`；`frontend/test/browser-acceptance/contracts/b14-archive-non-browser.spec.ts`；A24 并发、幂等与 protected facts | `backend/scripts/b14-browser-fixtures.ts` 覆盖只读/唯一归档后置核对与精确 cleanup；生命周期已闭环 | backend-specific 证据完整 | frontend testing playbook“当前证据索引” |
| B15 | `backend/test/clinical-report-correction.e2e-spec.ts`；`backend/src/modules/reports/services/clinical-report-correction-workflow.service.spec.ts`；`frontend/test/browser-acceptance/contracts/b15-correction-non-browser.spec.ts`；A25 pre-start、start miss、record/complete 三类合法并发收敛 | `backend/scripts/b15-browser-fixtures.ts` 覆盖 U01/U02 prepared/post-correction/post-recovery 与精确 cleanup；生命周期已闭环 | backend-specific 证据完整 | frontend testing playbook“当前证据索引” |
| A29 / A30 / WP-03 backend | 六个精确 unit suite 覆盖纯 barrier、持久化阶段、A14 草稿、A15 workflow、A16 编排与 Assessments 条件写；三个精确 HTTP E2E suite 覆盖 9 个确定性并发 / 恢复 Stage，并保留既有 A14-A16 回归 | HTTP E2E 使用两个真实认证 Session、测试侧一次性 Mongoose query latch 与 fake Storage 调用集；未增加生产 hook、sleep、轮询、Browser 或长期 namespace | 后端范围完成；阻断性 `gap=0`；A29 / A30 证据继续复用 | 本行及 roadmap / A30 maps |
| B18 Browser verifier | 复用 A29 / A30 既有生产合同；backend `src` 与 fixture 零修改 | P9 使用现有 fixture CLI 连接 `cogmemory_ad_browser_test`；prepared 与 `u09-post-media-failure` verifier 均通过。终态 revisionDelta=1、MediaEvidence=0、evidenceRefs 不变、photo requirement=pending、answeredItemCount 不变、实例 draft、score/domain/report=0、protected/adjacent facts matched；cleanup `residualCount=0`、runtime absent | backend-specific P3/P9 verifier 完整；B18 补充验证自动化 `gap=0`，WP-03 已完成 | frontend testing playbook“B18-A、B18-B1、B18-B2 与补充验证证据” |
| WP-10-A | 四个精确 unit suite 覆盖 released 资产校验、19 步 seed、受控物化补齐与安全 mapper；`assessment-execution-initialization.e2e-spec.ts` 覆盖真实 MongoDB 新插入、legacy 补齐、MoCA 零配置与公开摘要不泄漏；只读 CLI 校验真实 released package、22 个资产、19 步、8 页 PDF 和 source hash | 无患者 UI / API，未创建 Browser 批次；用户已人工确认相交五边形、21 个 MP3 与 MMSE package-001 整包 | WP-10-A 后端与资产发布范围完成；WP-10 仍进行中，下一阶段 WP-10-B | 本行、roadmap 与 backend snapshot/service map |
| WP-10-B1 | 三个精确 unit suite 覆盖会话 / schema、患者 Guard 与 Cookie；`patient-administration-session.e2e-spec.ts` 使用 AppModule、只读 presentation stub 和 standard_test 覆盖角色、Cookie、一次性码、生命周期、并发 CAS、ownership、底层阻断、隐私及实际索引；同时回归 `assessment-execution-initialization.e2e-spec.ts` | 无前端、Browser、真实设备、真实患者或私有资产写入；E2E 仅清理 `B1-SESSION-TEST` namespace，未 drop / 清空集合 | WP-10-B1 后端范围完成；WP-10-B 仍进行中，下一阶段 WP-10-B2 | 本行、roadmap 与 backend snapshot/API/DTO/service map |
| WP-10-B2 | `patient-administration-session.service.spec.ts` 扩展到 20 项，覆盖内嵌 capture / playback schema、步骤归属、完成前置、接管、redo / stepRun、顺序播放、重播授权、图片复核与 CAS 流关闭；新增 `patient-administration-step-flow.e2e-spec.ts`，与 B1 / 初始化回归共 3 suites / 13 tests | AppModule + `standard_test` + 只读内存 MMSE 19 步 / 22 资产 stub；覆盖 binary headers/body、DTO、19 步推进、播放/完成并发、paused replay、redo、takeover、完成凭证清理及 `ScaleInstance` / 11 个 `ItemResponse` 不变；无 Browser、真实设备、真实患者、真实私有文件或外部服务 | WP-10-B2 与 WP-10-B 后端范围完成；WP-10 仍进行中，下一阶段 WP-10-C | 本行、roadmap 与 backend snapshot/API/DTO/service map |
| WP-10-C1 | 新增 audio validator 与患者 evidence 编排 unit，扩展 session / MediaEvidence unit；完整 unit 98 suites / 947 tests。精确 E2E discovery 命中 C1、B2、B1、初始化与既有 staff media 五个文件，正式结果 5 suites / 25 tests | AppModule + `standard_test`，连接后实际库逐字为 `cogmemory_ad_test`；PresentationAssets 只读内存 stub，Storage=fake / 可追踪 fake，验证 audio/photo/handwriting、DTO/隐私、当前 run gate、redo、takeover、并发上传、pause-CAS 精确补偿、ItemResponse / ScaleInstance 零变化、staff media 回归与精确 cleanup。Browser、真实设备、真实 OSS 未执行 | WP-10-C1 完成；WP-10-C 与 WP-10 仍进行中，下一阶段 WP-10-C2 | 本行、roadmap 与 backend snapshot/API/DTO/service map |
| WP-10-C2 | 受影响 unit 9 suites / 94 tests、报告适配定向 unit 1 suite / 2 tests、完整 unit 102 suites / 984 tests 均通过；最终 E2E discovery 精确命中 C2、C1、B2、B1、初始化、staff media、ItemResponse draft 与 submission 共 8 个文件，正式结果 8 suites / 52 tests；完整 lint / typecheck / build 通过 | AppModule + `standard_test` + `cogmemory_ad_test`，Storage=可追踪 fake、ASR=受控 stub、PresentationAssets=只读内存 stub；覆盖上传→review→转写→幂等→人工 ItemResponse CAS、failed/retry、并发 claim、超长拒绝、redo invalidated run、takeover observation、安全访问及精确 cleanup。真实百炼、真实 OSS、Browser、真实设备未执行 | WP-10-C2 与 WP-10-C 后端范围完成；WP-10 仍进行中，下一阶段“WP-10 前端 MMSE 完整闭环” | 本行、roadmap 与 backend snapshot/API/DTO/service/config map |

B12～B15 的 Browser 操作、页面文案、keyboard、viewport、Storage 和活动场景结果只在 frontend testing playbook 的语义索引中维护；本手册不复制执行流水或历史迁移表。

A30 最终代码态的精确 discovery 与正式定向证据均闭合：六个目标 unit suite 全部发现且通过（6 suites / 108 tests）；`item-response-draft.e2e-spec.ts`、`media-evidence.e2e-spec.ts`、`scale-instance-submission.e2e-spec.ts` 精确发现且通过（3 suites / 32 tests）。HTTP E2E 建连后逐字确认实际库为 `cogmemory_ad_test`，Storage 为 fake、LLM / SMS 为 stub；没有加载 browser acceptance 配置。

九个 Stage 分别证明：屏障先胜时暂停的 A14 PATCH 零写入；PATCH 先胜时第二次 readiness 包含其结果；上传 attach 屏障先胜时本次 MediaEvidence 与 Storage 对象精确补偿；作废 clear 屏障先胜时零写入；clear 先胜使 readiness 失效、同 token release 后可重传再提交；两个真实 Session 的 submit 竞争保留唯一首次 actor / token；partial fencing 与 partial releasing 可恢复；释放不删除 scope 外其他 token；legacy completed 兼容且损坏父 / 子屏障 fail closed。完成后父屏障为 completed、固定 scope 子屏障保留，公开 response / 错误不泄露 barrier、scope、内部 ID 或 metadata。

最终后端证据继续复用：完整 unit 为 92 suites / 853 tests，完整 HTTP E2E 为 26 suites / 158 tests；本次未修改 backend `src` 或 `backend/scripts/b18-browser-fixtures.ts`，因此不机械重跑 backend lint/typecheck/build、A29/A30 unit 或 HTTP E2E。P9 fixture 与 verifier 以 browser-acceptance admin 身份逐字确认实际库 `cogmemory_ad_browser_test`，Browser backend 使用 readWrite 身份；prepared/post 与 cleanup 完整通过，MediaEvidence/evidenceRefs/相邻事实符合上传未到达后端的终态，cleanup `residualCount=0`、runtime absent。A29/A30 backend gap 仍为 0，跨层 B18 自动化 `gap=0`，WP-03 已完成。

WP-10-A 最终代码态的 unit discovery 精确命中 `presentation-assets.service.spec.ts`、`scale-seed-data.service.spec.ts`、`scale-catalog.service.spec.ts`、`scales.service.spec.ts`，正式定向结果为 4 suites / 75 tests；完整 unit 为 93 suites / 889 tests。HTTP E2E discovery 精确命中且仅命中 `assessment-execution-initialization.e2e-spec.ts`，建连后实际数据库逐字等于 `cogmemory_ad_test`，结果为 1 suite / 7 tests；未加载 Browser 配置。`lint`、`typecheck`、`build` 与真实 `presentation-assets:verify` 均退出 0；CLI 为 `none` 进程，不导入 AppModule、不连接数据库。人工证据仅覆盖用户已确认的相交五边形、A1 三段、A2 十八段和 MMSE package-001 整包；尚未执行患者 UI、患者 API、真实设备或 Browser 验收，这些边界留给 WP-10-B 及后续阶段。

WP-10-B1 discovery 精确且仅命中 `patient-administration-session.e2e-spec.ts` 与既有 `assessment-execution-initialization.e2e-spec.ts`；正式定向结果为 2 suites / 12 tests，实际数据库逐字为 `cogmemory_ad_test`，Storage=fake、LLM/SMS=stub。主 E2E 通过只读 `PresentationAssetsService` stub 隔离 Git ignored 私有资产，验证四个 workflow role、其他角色拒绝、同实例并发唯一开放会话、一次性码 / Cookie、staff 身份冲突不消费 code、handoff 撤销 staff Session、准备 / 暂停 / 恢复 / 重签 / 终止、revision 零副作用冲突、ownership、mode / lock / barrier、DTO 白名单、最小 current 和三个非 TTL 合同索引；cleanup 只按 `B1-SESSION-TEST` 资源 ID / 前缀执行。B1 没有 Browser 或真实设备证据，不能冒充 WP-10 完整闭环。

WP-10-B1 最终完整 unit 为 96 suites / 906 tests；B1 三个精确 unit suite 为 3 suites / 17 tests。最终 `lint`、`typecheck`、`build` 均退出 0；unit / 静态门禁用途为 `none`，未连接数据库。未执行完整 HTTP E2E、Browser、真实设备、真实私有资产校验或生产操作。

WP-10-B2 最终完整 unit 为 96 suites / 919 tests；B2 修改的 service 精确 unit 为 1 suite / 20 tests。首次非串行 unit discovery 包装进程发生 Jest worker 内存崩溃且无测试写入；改用 `--runInBand --forceExit` 的同一只读目标后精确命中 service spec，正式定向与完整 unit 均正常退出 0。定向 HTTP E2E discovery 精确且仅命中 `patient-administration-step-flow.e2e-spec.ts`、`patient-administration-session.e2e-spec.ts` 与 `assessment-execution-initialization.e2e-spec.ts`，正式结果为 3 suites / 13 tests；实际数据库逐字为 `cogmemory_ad_test`，Storage=fake、LLM/SMS=stub，所有 B2 namespace 在 afterAll 精确清理。新增主 E2E 用一个真实认证 doctor Session 与患者 Cookie 完成 MMSE 19 步，验证当前安全 asset metadata、图片 GET、音频 POST + revision header、顺序和刺激重播门禁、patient/staff 归属、staff 接管、直接前一步 redo、capture / playback 内嵌事实、完成态凭证/Cookie 清理、同 revision 的完成 / stimulus 首播 / 技术重播 / pause-play / redo-old-write 竞争最多一个成功，以及 `ScaleInstance` / 11 个 `ItemResponse` 前后逐字快照不变。最终完整 `lint`、`typecheck`、`build` 均退出 0，数据库用途为 none。未执行完整 HTTP E2E、Browser、真实设备、真实私有资产校验或生产操作；这些不能由内存 stub 或桌面自动化替代，WP-10-C 尚未开始。

WP-10-C1 最终精确 unit 首批为 audio validator、患者 evidence 编排与患者 session 3 suites / 47 tests；共享 MediaEvidence / mapper / report builder 回归为 3 suites / 18 tests；完整 unit 为 98 suites / 947 tests。E2E discovery 使用 `--listTests --runTestsByPath` 唯一命中 `patient-administration-evidence.e2e-spec.ts`、`patient-administration-step-flow.e2e-spec.ts`、`patient-administration-session.e2e-spec.ts`、`assessment-execution-initialization.e2e-spec.ts` 与既有 staff `media-evidence.e2e-spec.ts`，正式结果 5 suites / 25 tests。所有 E2E 建连后实际数据库逐字为 `cogmemory_ad_test`，使用 Storage=fake、LLM/SMS=stub 和只读内存 PresentationAssets；C1 可追踪 fake Storage 证明双上传最多一个 ref / Evidence / 对象、失败对象精确删除，以及 pause 赢得 revision CAS 后本次 Evidence / 对象零残留。测试按精确 subject / visit / instance / user namespace 清理 Patient、Visit、ScaleInstance、ItemResponse、MediaEvidence、staff Session、患者 Session 与 fake 对象，未 drop 或无条件清空集合。最终完整 `lint`、`typecheck`、`build` 均退出 0；未执行完整 HTTP E2E、Browser、真实设备、真实 OSS、生产部署或主观验收。WP-10-C1 完成不等于 WP-10-C / WP-10 完成，WP-10-C2 尚未开始。

WP-10-C2 最终受影响 unit 为 9 suites / 94 tests，授权后的报告 fail-closed 适配定向 unit 为 1 suite / 2 tests，完整 unit 为 102 suites / 984 tests；均 `--runInBand --forceExit` 退出 0，数据库用途为 none。最终 E2E discovery 唯一命中 `patient-administration-review-transcription.e2e-spec.ts`、`patient-administration-evidence.e2e-spec.ts`、`patient-administration-step-flow.e2e-spec.ts`、`patient-administration-session.e2e-spec.ts`、`assessment-execution-initialization.e2e-spec.ts`、`media-evidence.e2e-spec.ts`、`item-response-draft.e2e-spec.ts` 与 `scale-instance-submission.e2e-spec.ts`，正式结果 8 suites / 52 tests，退出 0；各 suite 使用 standard_test 精确 namespace 和既有 cleanup 合同，未执行完整 HTTP E2E。C2 主 E2E 使用 AppModule、可追踪 fake Storage、受控 stub ASR 和只读内存 PresentationAssets，证明患者真实 C1 multipart audio、not_requested review、显式转写 / requestedBy / succeeded 幂等、受控 failed→retry、并发至多一个 claim、超五分钟 pre-claim 拒绝、非 audio 拒绝、redo 失效 / 新 run、staff takeover observation、access URL 可用、ItemResponse 人工 revision CAS，以及转写候选不自动进入正式答案、ScaleInstance 不变和响应不泄漏 objectKey / URL / key。首次 typecheck / build 精确暴露完整 `MediaCaptureMode` 与旧 Reports 图片快照窄类型冲突；经用户明确授权，仅在 report draft builder 增加浏览器录音 fail-closed 适配后，最终完整 `lint`、`typecheck`、`build` 均退出 0，未用断言或跳过检查掩盖。真实 ASR、Browser、真实设备、真实 OSS、生产部署均为 not_executed。WP-10-C2 与 WP-10-C 后端范围完成，WP-10 仍进行中，下一阶段为“WP-10 前端 MMSE 完整闭环”。
