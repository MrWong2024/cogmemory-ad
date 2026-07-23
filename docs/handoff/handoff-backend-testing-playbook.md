# CogMemory AD / 智忆评 后端验证手册

## 1. 文档定位

本文档是后端验证的 active playbook，只维护三类内容：当前执行规则、仍待执行的 Browser 验收所依赖的后端 fixture 合同，以及已完成范围的最终证据索引。逐阶段命令、失败重试、临时 namespace 和执行流水由 Git 历史承担，不在本文重复保存。

本文档不改变产品、接口、DTO、Schema、测试合同或 roadmap 工作包状态。当前唯一事实是：WP-02、WP-04、Batch A 已完成；Batch B 桌面范围已完成；Batch C、Batch D 尚未启动；Batch E 的 8 项真实设备、辅助技术或人工验收继续保留。

## 2. 当前验证状态

| 范围 | 当前状态 | 当前结论 |
|---|---|---|
| 后端代码门禁 | 已建立 | 最终代码态独立执行 lint、typecheck、build、unit、E2E 五项门禁 |
| D-038 数据库隔离 | 已实现并认证 | `standard_test` 与 `browser_acceptance` 双向拒绝，建连前后库名门禁和数据库用户角色门禁有效 |
| WP-02 / B16 | 已完成 | replacement V2+ 生命周期矩阵与 Web Storage 最终审计已关闭 |
| WP-04 / B17 | 已完成 | 44 个 scenarioKey 全部通过，正式 fixture 已双次 cleanup，残留为 0 |
| Batch A / B1–B3 | 已完成 | 67 个验证原子全部有明确处置，正式 fixture 已双次 cleanup，残留为 0 |
| Batch B / B4–B6 | 桌面范围已完成 | Browser 133 项 + automated boundary 2 项 = 135 项；post-browser verify 通过；产品缺陷 0 |
| Batch C / B7–B10 | 尚未启动 | 详细待验合同以 frontend testing playbook 为准 |
| Batch D / B11–B15 | 尚未启动 | 包含 B14.1 的剩余 Browser 回归；详细待验合同以 frontend testing playbook 为准 |
| Batch E | 保留 8 项 | 真实设备、辅助技术或人工验收，不被桌面 Browser 证据替代 |

Batch B 的正式 namespace 已连续 cleanup 两次，两次均 `residualCount=0`；namespace-owned 数据和操作系统临时 fixture 文件已删除，全局 MMSE / MoCA seed 不在 cleanup 范围内。Batch C 未启动，后续不得复用已删除的 Batch B namespace 或把 prepared fixture 当作新的验收事实。

## 3. 数据库用途、凭据来源与进程隔离

### 3.1 五类用途与项目映射

| 用途类别 | 当前项目映射 | 允许用途 |
|---|---|---|
| `none` | 不连接数据库 | 纯文档、lint、typecheck、build、静态审计 |
| `development` | `cogmemory_ad_dev` | 日常开发和人工调试 |
| `standard_test` | `cogmemory_ad_test` | unit、普通 E2E，以及允许重建测试数据的自动化测试 |
| `browser_acceptance` | `cogmemory_ad_browser_test` | Browser fixture、Browser / Chrome 验收、post-browser verify |
| `production_or_operations` | 项目命名基线为 `cogmemory_ad` | 仅在用户同时明确授权目标环境与允许操作后使用；本文不构成连接授权 |

强制边界：

1. 每个会连接数据库的进程必须先确定唯一用途，连接后再读取真实数据库名并逐字校验。
2. `standard_test` 与 `browser_acceptance` 不得共用数据库；namespace 隔离不能替代数据库隔离。
3. 普通 unit / E2E 禁止连接 `cogmemory_ad_browser_test`；Browser fixture 和 Browser backend 禁止连接 `cogmemory_ad_test` 或 `cogmemory_ad_dev`。
4. 同一任务包含两种用途时必须启动独立进程，不得复用已经设置连接变量的 shell，也不得依赖 dotenv 顺序、旧变量或后加载覆盖来选择数据库。
5. cleanup 只能按显式 namespace 和 ownership 精确执行；不得使用 `dropDatabase()`、清空 collection 或无条件 `deleteMany({})`。
6. `none` 类任务不得启动应用、fixture、测试后端或其他会建立数据库连接的进程。

### 3.2 本地凭据来源与职责边界

| 用途 | 本地忽略文件 | 职责 |
|---|---|---|
| `standard_test` | `backend/.env.test` | 只供普通 unit / E2E 进程，不加载 Browser 配置 |
| `browser_acceptance` | `backend/.env.browser-acceptance` | 只供 Browser backend 与 fixture CLI，不与 `.env.test` 叠加 |

`backend/.env.browser-acceptance` 当前提供数据库用途、Browser app 主连接和 Browser 管理连接的本地凭据来源。本手册只记录变量职责，不记录实际密码或完整 URI。

独立进程的显式变量映射为：

- Browser backend：`COGMEMORY_DATABASE_PURPOSE=browser_acceptance`，`MONGO_URI` 映射 `BROWSER_ACCEPTANCE_APP_MONGO_URI`，`MONGO_ADMIN_URI` 映射 `BROWSER_ACCEPTANCE_ADMIN_MONGO_URI`。
- Browser fixture CLI：`COGMEMORY_DATABASE_PURPOSE=browser_acceptance`，`MONGO_URI` 与 `MONGO_ADMIN_URI` 都映射 `BROWSER_ACCEPTANCE_ADMIN_MONGO_URI`。
- 普通 E2E：`COGMEMORY_DATABASE_PURPOSE=standard_test`，只加载 `.env.test`，不得继承 Browser app/admin 连接变量。

本地隔离测试专用固定凭据默认自动使用：Codex 可以从上述 Git 忽略文件读取并注入对应独立进程，也可以使用任务明确给定的固定测试密码。不得机械要求剪贴板、一次性密码、Secret Manager 或每次人工输入；同时不得把密码、完整连接串、Cookie、Session token 或 hash 写入 Git 跟踪文件、文档、日志、manifest、生成物、最终报告或提交记录。

切换用途或复用 shell 前，应优先新建独立进程；确需复用时，必须清除或覆盖数据库主连接、管理连接、数据库用途及其他用途相关变量。该动作是防串库门禁，不是密码保密仪式。

### 3.3 Browser 进程与数据库用户

| 独立进程 | 主连接用户 / 角色 | 管理连接 | 允许数据库 |
|---|---|---|---|
| Browser test backend | `cogmemory_ad_browser_test_app` / `readWrite` | 受控 db_admin 连接 | `cogmemory_ad_browser_test` |
| Browser fixture CLI | `cogmemory_ad_browser_test_db_admin` / `dbOwner` | 同一 db_admin 连接 | `cogmemory_ad_browser_test` |
| 普通 E2E | `.env.test` 中的 standard_test 用户 | 按测试配置 | `cogmemory_ad_test` |

app 用户的连接和 `readWrite` 角色、db_admin 用户的连接和 `dbOwner` 角色均已实际验证。不得让 Browser backend 以 db_admin 作为主连接，也不得让 fixture CLI 以 app 用户作为主连接。

`npm run start:browser-test` 是 test-only Browser backend 入口；只有用途、URI 声明库名、实际连接库名、用户名和角色全部通过后才监听端口。Browser backend 继续使用既有应用装配、CORS、Cookie、fake Storage 与 stub SMS / LLM。

### 3.4 D-038 双向门禁

D-038 的门禁顺序必须完整保留：

1. AppModule 导入前校验数据库用途。
2. 建连前校验 URI 声明的数据库名与用途固定映射一致。
3. Mongoose 建连后校验 `connection.name` 与允许数据库逐字一致。
4. Browser backend 校验 app 用户及 `readWrite`；fixture CLI 校验 db_admin 用户及 `dbOwner`。
5. 任一用途、库名、用户名或角色不一致立即失败，不自动回退、不改连、不输出凭据。
6. 普通 E2E 指向 Browser 库、Browser CLI 指向普通测试库或开发库、app/db_admin 角色互换时均必须拒绝。

D-038 认证时，Browser sentinel 在 standard_test 完整回归前后 prepared verify 与安全 manifest 哈希一致；两次 sentinel cleanup 均 `residualCount=0`。该事实证明进程和数据库隔离，不授权未来任务跳过自己的连接门禁。

## 4. 标准命令与最终门禁

### 4.1 后端最终五项门禁

在 `backend` 目录、最终代码态按固定顺序执行：

1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`
4. `npm test -- --runInBand`
5. `npm run test:e2e`

不可替代性：

- lint 只检查规则与格式，不能替代 TypeScript 全量检查。
- `typecheck` 使用 `tsconfig.typecheck.json`，覆盖 `src/**/*.ts`、`test/**/*.ts`、`scripts/**/*.ts` 且 `noEmit`；production build 不覆盖全部 spec、E2E、fixture、mock、helper 和 script。
- build 只证明生产编译范围可构建，不能替代 typecheck、unit 或 E2E。
- unit 主要验证纯函数、DTO、Controller、Service、mapper、状态和边界，不能替代真实 HTTP、Guard、全局 Pipe、模块装配和数据库链路。
- E2E 的 Jest 执行通过不能替代未被实际运行源码的全量 typecheck。

开发中可以运行定向 lint、unit 或 E2E 获取反馈，但最终代码任务必须重新执行五项完整门禁。`npm run typecheck` 未通过时不得宣称后端代码任务完成。纯文档任务按文档与 Git 检查验收，不机械运行代码门禁。

### 4.2 报告规则

五项结果必须分别报告退出状态和关键统计；未执行项必须说明原因，不得把未执行写成通过。不得通过新增 suppression、放宽 TypeScript、扩大 exclude、跳过测试或吞掉退出码制造通过。

当前最终代码态的 D-038 门禁证据为：lint 0 errors / 0 warnings，typecheck 0 errors，build 通过，full unit 89 suites / 761 tests，full E2E 21 suites / 94 tests；E2E 实际连接 `cogmemory_ad_test`。这些是已完成代码基线的证据，不代表后续代码修改可以免于重跑。

## 5. 当前测试资产与覆盖范围

### 5.1 主要自动测试资产

| 资产层 | 当前覆盖重点 |
|---|---|
| unit / pure specs | 配置与数据库用途、Schema/索引、DTO whitelist、Controller Guard、Service ownership/状态/并发、mapper 白名单、量表 seed、作答、媒体、提交、评分、认知域、报告生命周期、历史与趋势 |
| HTTP / database E2E | 认证 Cookie、401/403、全局 ValidationPipe、真实 AppModule、MongoDB 写读、fake Storage、A12–A28 临床链路及 D-038 数据库门禁 |
| Browser fixture E2E | contract 计数、namespace 隔离、safe manifest、prepare/verify/post-browser verify、损坏检测、双 namespace、cleanup/二次 cleanup |
| Browser acceptance | production frontend + 真实 test backend + `browser_acceptance` 专用数据库；Network、Console、Storage、Cookie、CORS、角色、并发、幂等与页面行为 |

E2E 固定使用 `NODE_ENV=test`、`--runInBand`、隔离数据库、fake Storage、stub SMS / LLM 和脱敏人工数据；真实服务禁令统一见第 8 节。

### 5.2 Fixture CLI 简表

| 范围 | 入口 | 合同摘要 | 当前状态 |
|---|---|---|---|
| WP-02 / B16 | `scripts/b16-browser-fixtures.ts` | 4 角色；22 scenarioKey / 21 业务场景 | 已完成并清理 |
| WP-04 / B17 | `scripts/wp04-browser-fixtures.ts` | 5 角色；44 scenarioKey / 43 业务场景 | 已完成并清理 |
| Batch A / B1–B3 | `scripts/b123-browser-fixtures.ts` | 5 角色；27 scenarioKey / 26 业务场景 / 58 audit ID | 已完成并清理 |
| Batch B / B4–B6 | `scripts/b456-browser-fixtures.ts` | 5 角色；32 scenarioKey / 31 业务场景 / 135 audit ID；15 direct / 120 fixture-required | 桌面范围已完成并清理 |

这些 CLI 是 test-only 资产，不是 production seed，不随应用启动，不向 Browser 输出密码、连接串、Cookie、Session、metadata、完整请求/响应、原始作答、评分规则、报告正文或内部 lineage/source ID。

Batch C / D fixture 的验证意图、前置状态和关键边界必须从 frontend testing playbook 的 B7–B15（含 B14.1）待验合同设计；不得从已完成 Batch A / B 的旧 namespace、操作流水或中间失败状态反推。

## 6. Browser fixture 通用生命周期

每个新 Browser 批次统一执行以下生命周期：

1. 选择独立、合规的 namespace；重复 prepare 默认拒绝，替换必须显式确认。
2. 在 db_admin / `dbOwner` 的 fixture CLI 独立进程执行 `prepare` 或受控 `replace`。
3. 执行只读 `verify --phase prepared`，核对角色、scenario、前置状态、写入预留、临时文件、安全 manifest 和 transition 无遗留；verify 不得修复数据。
4. 启动 app / `readWrite` 的 Browser backend，并连接 production frontend；两端健康、CORS 和 Cookie 边界通过后才开始页面验收。
5. Browser 只使用脱敏固定账号和 fixture 明确提供的导航/输入；Network fault 用单次真实中止或合同指定方式，不伪造业务成功。
6. 多角色、双 Session、并发和幂等场景必须使用真实独立会话；写请求不得自动重试，网络结果不确定时先读回服务端事实。
7. Browser 完成后执行只读 `verify --phase post-browser`；它必须核对实际终态、无副作用、请求次数和合同计数，且前后快照一致。
8. 退出登录、关闭 Browser、停止进程后按 namespace 精确 cleanup；再执行第二次幂等 cleanup，两次都要求 `residualCount=0`。
9. cleanup 后确认 namespace-owned 记录和临时文件已删除，非 namespace 数据、全局 seed 与其他 namespace 未受影响。

固定测试凭据可由目标进程自动读取，但不得进入 CLI 参数、manifest、截图、日志或报告。prepare / prepared verify 只证明前置就绪，不等于 Browser 通过；Browser 场景通过但缺 post-browser verify 或 cleanup，也不得宣布工程收口。

## 7. 已完成批次证据索引

| 范围 | 最终状态 | 关键证据 | evidence commit | 是否需要重跑 |
|---|---|---|---|---|
| WP-02 / B16 | 已完成 | 基线 `9099f66…` 的确定性 Resume/unsafe fixture 与既有 V1/V2/V3 矩阵，加最终 Web Storage 审计；fixture 双次 cleanup 为 0 | `95b778448603e5eb4f96eafb82136edc36d3ab0e` | 否；相关产品代码变化时另行评估 |
| WP-04 / B17 | 已完成 | 验收基线 `7dd6f52…`；44/44 scenarioKey 通过，0 fail，0 未执行；Storage 八时点与双次 cleanup 为 0 | `db825a9df57ca1a131fee20159f9c6a38529f1ab` | 否 |
| Batch A / B1–B3 | 已完成 | 验收基线 `3a9c784…`；6 prior covered + 58 Browser + 2 用户人工视觉 + 1 obsolete = 67；双次 cleanup 为 0 | `335c6201f1f4864b371150467f5da6658b068e45` | 否 |
| Batch A 真正大屏抽查 | 已完成 | 普通最大化 Chrome，`innerWidth=1536`；5 个代表页均通过 | `8b8a9281dd738c5a0694d0c2feea4bcefcae6c66` | 否；后续新代表页按当前策略抽查 |
| D-038 数据库隔离 | 已实现并认证 | 五项门禁通过；89 unit suites / 761 tests，21 E2E suites / 94 tests；双向库名/角色门禁和 sentinel 隔离通过 | `f528efb7152b5770e9f873683fbd03c814108b81` | 否；数据库治理代码变化时重跑 |
| Batch B / B4–B6 | 桌面范围已完成 | 基于 D-038 代码基线；Browser 133 + automated boundary 2 = 135，0 fail / 0 未执行；post-browser verify 通过；双次 cleanup 为 0；产品缺陷 0 | `f59f3ac0c93d47e2c7fad4d29f1d7f2a61dc4021` | 否；Batch E 8 项仍需执行 |

表中的 evidence commit 已由当前文档与 Git 提交顺序、提交主题和文件范围交叉核对；“验收基线”是执行所基于的代码/fixture 状态，“evidence commit”是写入最终结果的提交，两者不得混写。

## 8. 医疗、量表、数据与安全红线

1. 只使用脱敏或人工构造的账号、患者、访视、作答、图片、轨迹、评分、报告和意见；不得使用真实姓名、身份证号、手机号、病历号、住址或其他可识别信息。
2. 测试不得生成或断言真实医疗诊断结论、疾病概率、治疗建议或未经确认的临床判断。
3. MMSE / MoCA 题项、CRF、指导语、评分规则和 seed 相关验证必须遵循权威资料与已确认修正，不得凭模型记忆或页面表现重新解释量表。
4. 原始作答、分步结果、提示后表现、图片、手写轨迹和报告来源是证据；测试不得用前端推断、自动评分或诊断文案覆盖服务端事实。
5. 媒体测试只使用人工 Buffer/文件；不得暴露源文件名、Storage bucket/objectKey、校验和、短期 URL、轨迹内容或内部关联 ID。
6. 除非未来单独定义并授权受控集成测试，不调用真实 OSS、阿里云 SMS、LLM、支付、医保、HIS/LIS/PACS、生产数据库或真实对象存储。
7. 不记录密码、完整 URI、Cookie、Session/token/hash、请求/响应全文、metadata、内部堆栈或浏览器持久化 value。
8. 401 必须表现为未认证，403 必须表现为无权限；前端角色展示不能替代后端 Guard，fixture 角色不能扩张产品权限。
9. cleanup 不物理删除非 namespace 数据，不以测试便利破坏审计、版本关系、全局 seed 或生产语义。
10. 测试截图、Console、Network 摘要、DOM、URL、Storage 审计和最终报告均适用同一隐私边界。

## 9. 当前未决事项和同步规则

- Batch C / B7–B10 尚未启动；必须按 frontend playbook 的逐项合同设计 fixture 与 Browser 矩阵。
- Batch D / B11–B15 尚未启动；B14.1 的行为等价 Browser 回归仍属于待验合同，不因 B16 / WP-02 已完成而自动覆盖。
- Batch E 的 8 项真实设备、辅助技术或人工验收继续保留：`B5-MV-008`、`B5-MV-028`、`B5-MV-029`、`B5-MV-058`、`B5-MV-059`、`B5-MV-060`、`B5-MV-061`、`B5-MV-062`；桌面 Browser、automated boundary 或大屏抽查均不能替代。
- roadmap 业务工作包状态不因 testing playbook 压缩、历史证据索引或未来 Batch 验收自动变化。
- 后端新增或调整测试脚本、fixture、数据库门禁、Service、Controller、DTO、权限或 E2E 时，应更新当前资产、门禁和证据索引；不得追加逐轮执行流水。
- 每次报告必须区分代码门禁、Browser 前置、Browser 结果、post-browser verify、cleanup 和人工签收，不能用其中一类替代另一类。

## 10. 历史追溯

- 本轮 testing playbook 减肥前的完整历史基线为 `3c0e373902985b9da09b359ed8f2a0334ef1e5d0`。
- 已删除的 A1–A28 逐阶段命令、旧 suite/test 数量、fixture 重试、临时诊断、旧 namespace 和逐轮 Browser 日志可通过 Git 历史查看。
- active playbook 不另建 archive，也不复制一份 Validation catalog；已完成历史只保留本文件的最终摘要与 evidence commit 索引。
