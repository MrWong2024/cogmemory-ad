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
| A29 / A30 / WP-03 backend | 后端范围完成；A29 / A30 证据复用；backend 阻断性 `gap=0` | 父实例 + 固定题目 scope 的可恢复 barrier、A14/A15 原子门禁、fencing/releasing 恢复、完成/释放 CAS 竞争、legacy / invalid / privacy 证据完整 | B18 补充验证仍有 frontend single-flight 与 P9 Browser gap；WP-03 进行中 |
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

新 A#、涉及后端合同的 B#、工作包子任务或其他实现单元的后端合同基本锁定后、生成实现 Codex 指令前，后端风险候选至少核对：

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

A# 默认从 backend unit、HTTP E2E、database verifier 与 static gate 中选择最低充分证据；没有正式 UI 入口时不机械要求 Browser。UI 候选可以归属到同一工作包中的具名 B#，但该归属不表示候选已经关闭：只有 A# 自身锁定的纯后端范围实际关闭后，才可准确写为“A# 后端范围完成”；具名 B# 仍 pending 时，不得宣布完整工作包或产品能力完成。若 A# 的锁定范围本身包含跨层产品闭环，不得把 UI 风险转移到后续 B# 以提前完成。

B# 可以引用当前代码态下仍适用的 A# 精确 unit、HTTP E2E 或 verifier 证据，不重复建设同一风险的主测试；若 B# 改变后端合同或暴露新的公开调用路径，必须重新扫描后端候选，并明确由当前跨层任务或具名 A# 承担。

本小节只生成后端特有风险候选；跨层生成、分类、主要归属、即时验收、阶段/实现单元/工作包完成门禁和最终覆盖核对，引用 frontend testing playbook“验证候选的系统生成与即时闭环”以及 `docs/codex-instruction-spec.md` 3.9，不复制完整跨层流程。不得为每个 Controller、DTO 字段或 Schema 字段机械建立测试，也不得把只能直接改库形成的数据库损坏状态默认升级为阻断验收。

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
| B18 Browser verifier | 复用 A29 / A30 既有生产合同；backend `src` 零修改 | `backend/scripts/b18-browser-fixtures.ts` 新增 P7/P8/P9 合法前置、prepared/post verifier 与精确 cleanup。P7 两个根、P8 一个根、P9 一个根均连接 `cogmemory_ad_browser_test`；各 Profile 的 prepared/post verifier 通过，cleanup 均 `residualCount=0`、runtime absent。P9 post 仅证明数据库终态，不替代缺失的 Browser abort 证据 | backend-specific fixture/verifier 完整；跨层 B18 验证 pending，WP-03 进行中 | frontend testing playbook“B18-A、B18-B1、B18-B2 与补充验证证据” |

B12～B15 的 Browser 操作、页面文案、keyboard、viewport、Storage 和活动场景结果只在 frontend testing playbook 的语义索引中维护；本手册不复制执行流水或历史迁移表。

A30 最终代码态的精确 discovery 与正式定向证据均闭合：六个目标 unit suite 全部发现且通过（6 suites / 108 tests）；`item-response-draft.e2e-spec.ts`、`media-evidence.e2e-spec.ts`、`scale-instance-submission.e2e-spec.ts` 精确发现且通过（3 suites / 32 tests）。HTTP E2E 建连后逐字确认实际库为 `cogmemory_ad_test`，Storage 为 fake、LLM / SMS 为 stub；没有加载 browser acceptance 配置。

九个 Stage 分别证明：屏障先胜时暂停的 A14 PATCH 零写入；PATCH 先胜时第二次 readiness 包含其结果；上传 attach 屏障先胜时本次 MediaEvidence 与 Storage 对象精确补偿；作废 clear 屏障先胜时零写入；clear 先胜使 readiness 失效、同 token release 后可重传再提交；两个真实 Session 的 submit 竞争保留唯一首次 actor / token；partial fencing 与 partial releasing 可恢复；释放不删除 scope 外其他 token；legacy completed 兼容且损坏父 / 子屏障 fail closed。完成后父屏障为 completed、固定 scope 子屏障保留，公开 response / 错误不泄露 barrier、scope、内部 ID 或 metadata。

最终后端证据继续复用：完整 unit 为 92 suites / 853 tests，完整 HTTP E2E 为 26 suites / 158 tests；本次不机械重跑 A29 / A30 unit 或 HTTP E2E，也未修改 backend `src`。本次 backend `lint`、`typecheck`、`build` 均 exit 0；P7/P8/P9 fixture 使用 browser-acceptance admin/readWrite 身份并逐字确认实际库 `cogmemory_ad_browser_test`，prepared/post verifier 全部通过，三个 cleanup 均 `residualCount=0`、runtime absent。P7/P8 Browser 已关闭；P9 的数据库不变量虽通过，但精确 upload abort Browser 证据未形成。A29 / A30 backend gap 仍为 0，跨层 B18 补充验证 pending，WP-03 进行中。
