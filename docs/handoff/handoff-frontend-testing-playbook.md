# CogMemory AD / 智忆评 前端验证手册

## 1. 文档定位

本文档用于记录 CogMemory AD 前端自动验证命令、人工验证口径、认证状态验证口径、医疗与隐私展示红线，供后续开发和交接使用。

## 2. 当前状态

- 前端公共底座与 B1-B15 既有闭环已落地；B16 replacement V2+ 产品代码保持在基线 `066ee87`。该基线的前轮完整浏览器矩阵证据继续有效，本轮已补测确定性 V2+ Resume 与不安全公开 replacement 摘要门禁，但完整 lint 和 Web Storage 审计门禁尚未闭合，因此 B16/WP-02 仍为进行中。
- `frontend\package.json` 已存在，自动验证命令以其中真实脚本为准。
- B2-B16 不新增测试代码、测试框架、E2E 或第三方依赖。
- 当前自动验证以 ESLint、TypeScript 与 production build 覆盖现有前端类型、调用代码和页面构建；真实 HTTP、角色、并发、浏览器交互与业务数据状态由分轮 Chrome 验收补充，未执行的安全存储检查必须明确保留为未完成项。

## 3. B1 / B2 / B3 / B4 / B5 / B6 / B7 / B8 / B9 / B10 / B11 / B12 / B13 / B14 / B15 / B16 自动验证命令

在 `frontend` 目录、且既有 `node_modules` 存在时执行：

- `npm run lint`
- `npm run typecheck`
- `npm run build`

本次 B1 验证结果：

- `npm run lint`：通过。
- `npm run typecheck`：通过，Next route types 生成成功且 TypeScript 无错误。
- `npm run build`：通过，生产构建包含 `/`、`/login` 与 `/dashboard`。
- E2E / 浏览器自动化：未执行；本阶段明确不新增或执行 E2E。
- 后端命令：未执行。

本次 B2 验证结果：

- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 route types 生成成功且 TypeScript 无错误。
- `npm run build`：通过，生产构建包含 `/patients`、`/patients/new`、`/patients/[patientId]`、`/patients/[patientId]/visits/new`。
- E2E / 浏览器自动化：未执行；本阶段明确不新增或执行 E2E。
- 浏览器手工验证：未执行，以下 B2 手工场景均为待验证。
- 后端命令：未执行。

本次 B3 验证结果：

- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 route types 生成成功且 TypeScript 无错误。
- `npm run build`：通过，生产构建包含 `/patients/[patientId]/visits/[visitId]`。
- 未新增自动测试：当前前端没有既有测试框架，任务明确不新增测试框架或浏览器 E2E；本阶段使用 lint、typecheck 与生产构建验证。
- E2E / 浏览器自动化：未执行；本阶段明确不新增或执行 E2E。
- 浏览器手工验证：未执行，以下 B3 手工场景均为待验证。
- 后端命令：未执行。

本次 B4 验证结果：

- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 量表实例执行动态路由类型生成成功且 TypeScript 无错误。
- `npm run build`：通过，生产构建包含 `/patients/[patientId]/visits/[visitId]/scale-instances/[scaleInstanceId]`。
- 未新增自动测试：当前前端没有既有测试框架，任务明确不新增测试框架或浏览器 E2E；本阶段使用 lint、typecheck 与生产构建验证。
- E2E / 浏览器自动化：未执行；本阶段明确不执行浏览器 E2E。
- 浏览器手工验证：未执行，以下 B4 场景均为待验证。
- 后端命令：未执行。

本次 B5 验证结果：

- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 量表实例执行动态路由类型生成成功且 TypeScript 无错误。
- `npm run build`：通过，生产构建包含既有量表实例动态路由，B5 未新增路由。
- 未新增自动测试：当前前端没有既有测试框架，任务明确不新增测试框架或浏览器 E2E；本阶段继续使用 lint、typecheck 与生产构建验证。
- E2E / 浏览器自动化：未执行；本阶段明确不执行浏览器 E2E。
- 浏览器手工验证：未执行，以下 B5 场景均为待验证。
- 后端命令：未执行。

本次 B6 验证结果：

- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 量表实例执行动态路由类型生成成功且 TypeScript 无错误。
- `npm run build`：通过，生产构建包含既有量表实例动态路由，B6 未新增路由。
- 未新增自动测试：当前前端没有既有测试框架，任务明确不新增测试框架或浏览器 E2E；本阶段继续使用 lint、typecheck 与生产构建验证。
- E2E / 浏览器自动化：未执行；本阶段明确不执行浏览器 E2E。
- 浏览器手工验证：未执行，以下 B6 场景均为待验证。
- 后端命令：未执行。

本次 B7 验证结果：

- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 量表实例执行动态路由类型生成成功且 TypeScript 无错误。
- `npm run build`：通过，生产构建包含既有量表实例动态路由，B7 未新增路由。
- 未新增自动测试：当前前端没有既有测试框架，任务明确不新增测试框架或浏览器 E2E；本阶段继续使用 lint、typecheck 与生产构建验证。
- E2E / 浏览器自动化：未执行；本阶段明确不执行浏览器 E2E。
- 浏览器手工验证：未执行，以下 B7 场景均为待验证。
- 后端命令：未执行。

本次 B8 验证结果：

- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 量表实例执行动态路由类型生成成功且 TypeScript 无错误。
- `npm run build`：通过，生产构建包含既有量表实例动态路由，B8 未新增路由。
- 未新增自动测试：当前前端没有既有测试框架，任务明确不新增测试框架或浏览器 E2E；本阶段使用 lint、typecheck 与生产构建验证。
- E2E / 浏览器自动化：未执行。
- 浏览器手工验证：未执行，以下 B8 场景均为待验证。
- 后端命令：未执行。

本次 B9 验证结果：

- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 既有量表实例执行动态路由类型生成成功且 TypeScript 无错误。
- `npm run build`：通过，生产构建包含既有量表实例动态路由，B9 未新增路由。
- 未新增自动测试：当前前端没有既有测试框架，任务明确不新增测试框架或浏览器 E2E；本阶段使用 lint、typecheck 与生产构建验证。
- E2E / 浏览器自动化：未执行。
- 浏览器手工验证：未执行，以下 B9 场景均为待验证。
- 后端命令：未执行。

本次 B10 验证结果：

- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 既有动态路由类型生成成功且 TypeScript 无错误。
- `npm run build`：通过，生产构建包含既有访视详情动态路由，B10 未新增路由。
- 未新增自动测试：当前前端没有既有测试框架，任务明确不新增测试框架或浏览器 E2E；本阶段使用 lint、typecheck 与生产构建验证。
- E2E / 浏览器自动化：未执行。
- 浏览器手工验证：未执行，以下 B10 场景均为待验证。
- 后端命令：未执行。

本次 B11 验证结果：

- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 既有动态路由类型生成成功且 TypeScript 无错误。
- `npm run build`：通过，生产构建包含既有 `/patients/[patientId]/visits/[visitId]`，B11 未新增路由。
- 未新增自动测试：当前前端没有既有测试框架，本阶段使用 lint、typecheck 与生产构建验证。
- E2E / 浏览器自动化：未执行；本阶段明确不执行。
- 浏览器手工验证：未执行，以下 B11 场景均待开发者使用脱敏数据本地验证。
- 后端命令：未执行。

本次 B12 验证结果：

- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 既有动态路由类型生成成功且 TypeScript 无错误。
- `npm run build`：通过，生产构建包含既有 `/patients/[patientId]/visits/[visitId]`，B12 未新增路由。
- 未新增自动测试：当前前端没有既有测试框架，本阶段使用 lint、typecheck 与生产构建验证。
- E2E / 浏览器自动化：未执行；本阶段明确不执行。
- 浏览器手工验证：未执行，以下 B12 场景均待开发者使用脱敏数据本地验证。
- 后端命令：未执行。

本次 B13 验证结果：

- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 既有动态路由类型生成成功且 TypeScript 无错误。
- `npm run build`：通过，生产构建包含既有 `/patients/[patientId]/visits/[visitId]`，B13 未新增路由。
- 未新增自动测试：当前前端没有既有测试框架，本阶段使用 lint、typecheck 与生产构建验证。
- E2E / 浏览器自动化：未执行；本阶段明确不执行。
- 浏览器手工验证：未执行，以下 B13 场景均待开发者使用脱敏数据本地验证。
- 后端命令：未执行。

本次 B14 验证结果：

- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 既有动态路由类型生成成功且 TypeScript 无错误。
- `npm run build`：通过，生产构建包含既有 `/patients/[patientId]/visits/[visitId]`，B14 未新增路由。
- 未新增自动测试：当前前端没有既有测试框架，本阶段使用 lint、typecheck 与生产构建验证。
- E2E / 浏览器自动化：未执行；本阶段明确不执行。
- 浏览器手工验证：未执行，以下 B14 场景均待开发者使用脱敏数据本地验证。
- 后端命令：未执行。

本次 B14.1 验证结果：

- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 route types 生成成功且 TypeScript 无错误。
- `npm run build`：通过，既有路由集合不变。
- 公共 options 9 / result keys 99 静态对照通过；消费者、组件、API Client、ClinicalReport types、draft libs 与 display 均无 diff。
- E2E / 浏览器自动化 / 浏览器手工验证：未执行；以下 B14.1 浏览器场景均待验证。
- 后端命令：未执行。

本次 B15 验证结果：

- `npm run lint`：通过。
- `npm run typecheck`：通过，Next 16 route types 生成成功且 TypeScript 无错误。
- `npm run build`：通过，既有路由集合不变并包含访视详情动态路由。
- 静态核对：A25 API 仅在 Correction Action 调用；façade / 组件不调用 API；单一 writingAction、beforeunload、latest 与 onReportUpdated 入口保持；V2 A22–A24 入口关闭。
- E2E / 浏览器自动化 / 浏览器手工验证：未执行；以下 B15 场景均待使用脱敏数据验证。
- 后端命令：未执行。

本次 B16 验证结果：

- 定向检查：`npm run lint:file -- <15 个 B16 代码文件>` 通过。
- `npm run lint`：通过，无 error / warning。
- `npm run typecheck`：通过，Next 16 route types 生成成功且 TypeScript 无错误。
- `npm run build`：通过，既有路由集合不变并包含访视详情动态路由；未新增路由。
- 静态核对：统一 lifecycle target 是 A22–A24 唯一版本门槛；无 `reportVersion === 2` 业务分支；三条 API Body 未加入版本 / lineage / sourceIds；`COMPLETE_CORRECTION` 清除旧版本 A21–A24 会话状态；lineage invalid 独立映射、最多 latest 一次、writeProhibited 且不自动 POST。
- 浏览器自动化 / 浏览器手工验证：未执行；`localhost:3002` 与 `localhost:5002` 均不可用，且缺少脱敏四角色账号及 V1 / V2 / V3、in_progress、stale、lineage invalid 数据。WP-02 保持进行中。
- 后端命令：未执行。

如后续环境中 `frontend/node_modules` 不存在，不得为验证本阶段而执行 `npm install`；应跳过上述命令并说明原因。

## 4. 自动验证覆盖范围

B1 静态与构建验证覆盖：

- Auth 类型、API Client、Hook 和 Client Component 的 lint 与类型检查。
- `/login`、`/dashboard` 与公共首页的 Next.js 生产构建。
- App Router 路由类型生成。

B1 自动验证不覆盖：

- 真实后端、数据库与测试用户联调。
- 浏览器 Cookie 行为、CORS 与实际部署拓扑。
- 患者、评估、量表、媒体、计分、认知域、报告、AI、用户管理或权限菜单。
- E2E 与浏览器自动化。

以上结果不代表真实医疗业务或业务 MVP 完成验收。

B2 静态与构建验证额外覆盖：

- patients 公开类型、Patients API Client、日期 / 展示纯函数和 Client Components 的 lint 与类型检查。
- 四条 patients 路由的 App Router route types；两个动态页面使用 Next 16 Promise params 契约。
- 患者列表 / 创建、患者详情 / 访视列表、访视创建及 `/patients/**` 认证布局的生产构建。

B2 自动验证不覆盖：

- 真实患者 / 访视 API、数据库、测试用户、HttpOnly Cookie、CORS 与浏览器导航联调。
- 患者编辑 / 删除 / 归档 / 合并、访视编辑 / 删除 / 详情 / 状态流转。
- MMSE / MoCA 执行、作答、媒体、计分、认知域、报告、AI、用户管理和权限菜单。

B3 静态与构建验证额外覆盖：

- assessment execution 公开类型、API Client、展示纯函数与三个业务组件的 lint 和类型检查。
- `/patients/[patientId]/visits/[visitId]` 的 Next 16 Promise params 路由类型与生产构建。
- PatientDetailPage 新增访视入口，以及目录 / 详情独立状态和初始化交互的静态代码路径。

B3 自动验证不覆盖：

- 真实 A13 HTTP、数据库写入、测试用户、HttpOnly Cookie、CORS、浏览器导航和重复请求竞态联调。
- ItemResponse 查询 / 保存 / 提交、真实 MMSE / MoCA 题目作答、媒体、计时、计分、认知域、报告或 AI。

B4 静态与构建验证额外覆盖：

- A14 安全公开类型、错误 code 映射、执行详情 GET、逐题 PATCH 白名单和草稿转换纯函数的 lint 与类型检查。
- `/patients/[patientId]/visits/[visitId]/scale-instances/[scaleInstanceId]` 的 Next 16 Promise params 路由类型与生产构建。
- 动态分组、逐题编辑器、step / prompt / timing / evidence 子组件、dirty / beforeunload、只读状态和 B3 实例入口的静态代码路径。

B4 自动验证不覆盖：

- 真实 A14 HTTP、数据库写入、测试用户、HttpOnly Cookie、CORS、浏览器导航、GET 取消与 PATCH 竞态联调。
- 浏览器 beforeunload 的实际提示样式与触发策略；该行为由浏览器决定。
- B4 当时不覆盖媒体与整份量表提交；对应静态路径现分别由下方 B5、B6 验证覆盖。批量或自动保存、实时计时、计分、认知域、报告或 AI 仍未实现。

B5 静态与构建验证额外覆盖：

- A15 安全公开类型、四个 API Client 方法、FormData 白名单、固定安全文件名、错误 code 映射、GET AbortSignal 和 POST 不重试路径的 lint 与类型检查。
- photo Canvas 解码 / JPEG 重编码与有界压缩代码、handwriting Pointer Events / 轨迹 / PNG 代码，以及列表 / 预览 / 作废 / 父级媒体草稿集成的生产构建。
- 同一 B4 路由的 B5 组件集成；B5 未新增页面路由、依赖、BFF、middleware 或远程图片域名配置。

B5 自动验证不覆盖：

- 真实 A15 HTTP、Storage、测试用户、Cookie / CORS、浏览器文件解码差异、移动端 capture 提示、触控笔 / 触屏 Pointer Events、临时 URL 域名与过期行为。
- 浏览器 Canvas 输出的临床可读性、不同源图格式兼容性、真实网络竞态、作废后重传和 beforeunload 提示；均需使用脱敏人工测试数据手工验证。
- B5 当时不覆盖整份量表最终提交；该静态路径现由下方 B6 验证覆盖。自动保存、评分、认知域、报告、OCR、图像识别或 AI 仍未实现。

B6 静态与构建验证额外覆盖：

- A16 安全类型、两个 API Client 方法、GET AbortSignal、submit confirm 白名单、7 个提交业务错误映射和 POST 不重试路径的 lint 与类型检查。
- submission 展示纯函数、面板、issue 列表、readiness stale、本地 dirty / 写请求阻断、内联 checkbox、submit 临时只读、服务端状态合并、幂等回执和题目定位代码路径。
- 同一 B4 / B5 动态路由的 B6 集成；B6 未新增路由、依赖、BFF、middleware、持久化状态或配置。

B6 自动验证不覆盖：

- 真实 A16 HTTP、数据库状态迁移、Cookie / CORS、并发提交、已提交历史审计差异、滚动 / focus 和浏览器可访问性行为。
- 真实本地草稿与上传竞态、submit 期间各浏览器控件 disabled 表现、网络中断后的服务器最终状态；均需使用脱敏人工测试数据手工验证。
- B6 自动验证当时不覆盖评分；A17 / A18 当前静态路径分别由 B7 / B8 覆盖。访视完成 / 锁定、报告、撤销 / reopen / lock / force submit 或 AI 仍未实现。

B7 静态与构建验证额外覆盖：

- A17 安全类型、独立 API Client、latest AbortSignal、compute confirm 白名单、全部受控业务错误映射和 POST 不重试路径的 lint 与类型检查。
- 阶段性 total / group / item、reviewQueue、12 个 reason、2 个 warning、状态 / 来源 / review / quality、版本追溯、内联确认、本地阻断、幂等回执和通用题目定位代码路径。
- 同一 B4-B6 动态路由的 B7 集成；B7 未新增路由、依赖、BFF、middleware、持久化状态或配置。

B7 自动验证不覆盖：

- 真实 A17 HTTP、数据库 ScoreResult、Cookie / CORS、并发计算、幂等重读、各种历史状态、滚动 / focus 和浏览器可访问性行为。
- 真实网络中断后的服务器最终状态、窄屏布局和后端数据组合；均需使用脱敏人工测试数据手工验证。
- B7 自动验证当时不覆盖人工评分与确认；这些静态路径当前由 B8 覆盖。评分锁定 / 作废 / 重算 / 历史、认知域、报告或 AI 仍未实现。

B8 静态与构建验证额外覆盖：

- A18 安全类型、manual-review / confirm 请求白名单、credentials / no-store、全部错误 code 映射和写请求不重试路径。
- 人工评分 finite number / 0 / min / max、reviewNote、step="any"、单活动草稿、dirty / stale、updatedAt 基线、冲突刷新、回执与 beforeunload 静态路径。
- 确认 eligibility、warning 阻断、两步内联交互、checkbox、确认冲突、alreadyConfirmed、安全 confirmation 摘要和 final 文案。
- 同一既有动态路由集成；未新增依赖、路由、BFF、middleware、持久化状态或配置。

B8 自动验证不覆盖：

- 真实 A18 HTTP、数据库更新、Cookie / CORS、多操作者并发、审计上限与历史异常组合。
- 浏览器 beforeunload、滚动 / focus、窄屏、屏幕阅读器 live region 与真实表单控件行为。
- B8 自身不覆盖认知域；该静态路径现由下方 B9 覆盖。评分 lock / void / reopen / rerun、认知域确认、报告、诊断或 AI 仍未实现。

B9 静态与构建验证额外覆盖：

- A19 安全类型、独立 API Client、latest AbortSignal、compute `{ confirm: true }` 白名单、全部业务错误映射和 POST 不重试路径。
- 独立 Hook 的来源 ScoreResult 依赖、waiting / not_found / forbidden / error、latest 取消、首次计算二次确认、dirty / writing 阻断、幂等回执与冲突后只读刷新路径。
- domainScores、itemContributions、mapping policy / interpretation、computation / warning / versionTrace / 来源评分摘要、7 个真实 seed domain code 标签和统一题目定位的静态路径。
- 同一既有动态路由集成；未新增依赖、路由、BFF、middleware、持久化状态、图表库或配置。

B9 自动验证不覆盖：

- 真实 A19 HTTP、数据库 CognitiveDomainResult、Cookie / CORS、并发计算、幂等重读、历史状态和业务错误组合。
- 浏览器 beforeunload、scrollIntoView / focus、窄屏横向表格、屏幕阅读器 live region 与真实 checkbox / disabled 行为。
- 认知域人工修改 / 确认 / 锁定 / 作废 / 重算、weighted mapping 编辑、报告、诊断或 AI；这些能力未实现。

B12 静态与构建验证额外覆盖：

- A22 lock 安全类型、API Body 白名单、五个业务错误映射、Path 编码 / MongoId 防御、credentials / no-store 与 POST 不自动重试路径。
- lock mode、统一报告写锁、doctor / admin role gate、eligibility、3–2000 字 lockNote、checkbox、服务端 updatedAt 基线、dirty / stale / beforeunload、冲突 latest 一次、alreadyLocked 与完整 report 应用路径。
- lock 安全摘要、当前会话 receipt、status / lockedAt / lock / isFinal 分离、一致性警告、已锁定只读和同一访视详情路由集成；未新增依赖、路由、BFF、middleware、持久化状态或配置。

B12 自动验证不覆盖：

- 真实 A22 HTTP、数据库锁定、Cookie / CORS、多操作者并发、历史安全 fallback、审计异常与幂等重读组合。
- 浏览器 beforeunload、窄屏布局、屏幕阅读器 alert / live region、真实 checkbox / disabled 行为和网络中断后的最终服务端状态。
- B12 自动验证不覆盖来源数据冻结；该静态路径现由下方 B13 覆盖。unlock / reopen / return / reject / withdraw、签名、归档、更正、作废、PDF / 下载或 AI 仍未实现。

B13 静态与构建验证额外覆盖：

- A23 sourceFreeze 安全类型、freeze request / receipt / response、八个业务错误映射、Path 编码 / MongoId 防御、Body 白名单、credentials / no-store 与 POST 不自动重试路径。
- 独立 start / resume 草稿纯函数、3–2000 字 freezeNote、服务端 updatedAt 基线、持久说明只读、dirty / stale / beforeunload、计数 / 状态 / actor 一致性与请求构建。
- source_freeze 统一报告写锁、doctor / admin role gate、首次 / 恢复 Visit 口径、冲突 / incomplete / failed latest 一次、显式转入恢复、alreadyFrozen / resumedExisting 与完整 report 应用路径。
- SourceFreezePanel / Summary、五类 + total expected / completed / newly / previously 计数、null / in_progress / completed Badge、技术字段分离与既有访视详情路由集成；未新增依赖、路由、BFF、middleware、持久化状态或配置。

B13 自动验证不覆盖：

- 真实 A23 HTTP、数据库跨集合冻结、Cookie / CORS、多操作者并发、中断恢复、部分失败、审计异常与幂等重读组合。
- 浏览器 beforeunload、窄屏计数表、屏幕阅读器 alert / live region、真实 checkbox / disabled 行为和网络中断后的最终服务端状态。
- unfreeze / rollback / 自动恢复 / 轮询、Patient / Visit / Storage 冻结、archive / correct / void、PDF / 下载或 AI；这些能力未实现。

B14 静态与构建验证额外覆盖：

- A24 archive 安全类型、request / receipt / response、五个业务错误映射、Path 编码 / MongoId 防御、Body 白名单、credentials / no-store 与 POST 不自动重试路径。
- 独立归档草稿与一致性纯函数、3–2000 字 archiveNote、服务端 updatedAt / lock / sourceFreeze anchor 冻结上下文、dirty / stale / beforeunload、完整 A24 / historical fallback / 异常摘要判断。
- archive 统一报告写锁、doctor / admin role gate、不依赖 Patient active / Visit editable / Visit locked 的 eligibility、冲突 / failed latest 一次、alreadyArchived 与完整 report 应用路径。
- ArchivePanel / Summary、status / archivedAt / archive / receipt 分离、归档 actor / note / sourceFreeze anchor、安全警告与既有访视详情路由集成；未新增依赖、路由、BFF、middleware、持久化状态或配置。

B14 自动验证不覆盖：

- 真实 A24 HTTP、数据库归档、Cookie / CORS、多操作者并发、幂等重读、历史 fallback 与各种审计异常组合。
- 浏览器 beforeunload、窄屏布局、屏幕阅读器 alert / live region、真实 checkbox / disabled 行为和网络中断后的最终服务端状态。
- unarchive / restore confirmed / correction / void / delete / unlock / unfreeze / PDF / Word / 下载或 AI；这些能力未实现。

B14.1 静态回归矩阵：

- 公共：options 字段与 null 语义不变；99 个 result keys 不变；mode 仍为 idle / edit / submit / confirm / lock / source_freeze / archive；writingAction、mountedRef、writingRef、activeMode 和 beforeunload 各自唯一；组件无 diff，API Client 无 diff，未新增 correction。
- Edit：open / update / no-change / save / conflict / 403 / receipt / stale / beforeunload 条件与 B11 一致；本地三个字段在网络与冲突错误后保留。
- Submit：readiness、submissionNote、checkbox、success / alreadySubmitted、conflict 与 pending read-only 条件一致；不自动重发。
- Confirm：doctor / admin role、confirmationNote、checkbox、success / alreadyConfirmed、conflict 与 403 文案一致；不模拟 lock。
- Lock：doctor / admin、Visit draft / in_progress / completed、success / alreadyLocked、conflict、consistency warning 与 confirmed status 不变；lockNote 保留。
- Source-freeze：start / resume、服务端 persisted note、显式 discard local、in_progress / incomplete / failed、alreadyFrozen / resumedExisting 与 no polling 语义一致；不自动进入恢复。
- Archive：doctor / admin、不依赖 Patient active / Visit editable、Visit locked 不阻断、success / alreadyArchived、conflict、historical fallback 与 archived read-only 一致。
- 自动审计：lint / typecheck / build、diff-check、consumer diff、line count、API import direction、单锁、单 beforeunload、latest 与禁止范围检查。

B14.1 静态验证不覆盖：

- 真实 B11-B14 HTTP、Cookie / CORS、多操作者并发、浏览器 beforeunload、网络中断最终状态、窄屏与屏幕阅读器行为；均待开发者使用脱敏数据本地验证。
- A25 / B15 correction、replacement 关系、版本列表、自动 retry / polling；本阶段均未实现。

## 5. B1 手工验证建议

前置条件：后端已启动，存在脱敏人工测试账号，前后端的 Cookie 与跨域配置适用于当前本地环境。

### 5.1 登录页

- 访问 `/login`，确认先显示认证状态检查，再显示账号密码表单或进入工作台。
- 输入无效凭证，确认只显示“账号或密码错误，或账号不可用。”，不区分账号、密码或账号状态。
- 模拟服务不可用，确认显示稳定连接错误，不出现后端堆栈、响应体、token 或 Cookie 细节。
- 登录提交时确认按钮禁用并显示“正在登录...”。
- 登录成功后确认进入 `/dashboard`。
- 确认页面没有测试账号、注册、密码重置、短信验证码或 OAuth / SSO 入口。

### 5.2 会话恢复与工作台入口

- 登录成功后刷新 `/dashboard`，确认页面通过 `GET /auth/me` 恢复 authenticated 状态。
- 确认页面只展示当前用户公开的 `displayName`、`accountName`、`roles` 与可选 `userType`。
- 确认患者档案卡片标记“已接入”，其余能力卡片标记“后续建设”；Dashboard 自身不发起患者、评估或报告业务 API 请求。
- 清除或使服务端会话失效后访问 `/dashboard`，确认显示会话失效提示并返回 `/login`。
- 模拟认证服务异常，确认 `/dashboard` 展示 error 状态与重新检查入口。

### 5.3 登出

- 在 `/dashboard` 点击“退出登录”，确认调用 `POST /auth/logout`。
- 确认前端清理本地公开认证状态并返回 `/login`。
- 再访问 `/dashboard`，确认 `GET /auth/me` 返回未认证并再次回到 `/login`。

### 5.4 首页与视觉

- 访问 `/`，确认登录与工作台入口存在，首页本身不调用后端。
- 确认登录页、工作台与 patients 页面符合浅色、低饱和蓝绿、清晰分区、大字号、少装饰、少动画的设计基线。
- 确认页面不是营销页、娱乐化界面或 ReviewX 风格管理后台。

## 6. B2 手工验证建议（待验证）

前置条件：后端已启动，使用脱敏人工测试账号和测试数据；不得使用真实患者信息。以下场景本次未执行，均待开发者本地验证：

1. 登录后进入 `/dashboard`，确认“患者档案”入口标记已接入且可进入 `/patients`。
2. 确认患者列表正常加载，keyword、status、sourceType、pageSize、上一页 / 下一页和 URL 参数同步正常。
3. 确认无患者记录与筛选无结果展示不同文案，列表窄屏可横向滚动。
4. 创建患者成功后进入详情；重复患者编号显示稳定冲突提示；出生日期无时区偏移；标签能按中英文逗号 / 换行解析、去空和去重。
5. 确认详情只展示公开患者字段，访视列表支持 status、visitType、dateFrom、dateTo、pageSize 和分页；截止日期包含用户选择的完整一天。
6. active 患者可进入访视创建页；创建页先显示当前患者，成功后返回患者详情；重复访视编号显示稳定冲突提示。
7. inactive / archived 患者不显示可提交访视表单；服务端返回 `PATIENT_NOT_ACTIVE` 时显示稳定提示。
8. 确认访视请求不含 operatorSnapshot、clinicalContext、metadata 或状态字段；操作者由后端当前账号生成。
9. 使会话失效后访问任意 `/patients/**`，确认返回 `/login`；刷新后确认仍由 HttpOnly Cookie 恢复会话。
10. 使用无 A12 权限账号确认患者 API 403 显示无权限，而不是空列表。
11. 模拟患者不存在、无效 patientId、服务不可用与访视列表单独失败，确认 not-found / invalid / error / retry 状态稳定，访视失败不抹掉患者详情。
12. 使用浏览器网络面板确认五个业务请求指向 `frontendEnv.apiBaseUrl`，携带 credentials 语义且不自动重试 POST。

## 7. B3 手工验证建议（待验证）

前置条件：后端已启动，使用脱敏人工测试账号与测试患者 / 访视；不得使用真实患者信息。以下场景本次未执行，均待开发者本地验证：

1. 登录并进入患者详情。
2. 从访视列表点击“打开访视”。
3. 确认访视详情正常加载并展示公开访视字段与状态时间。
4. 确认 MMSE / MoCA 真实目录正常显示。
5. 确认目录不显示完整题目、指导语、答案、评分规则、expectedValue 或 ObjectId，能力标识不宣称媒体 / 手写 / 计时已实现。
6. 在 `draft` 或 `in_progress` 访视初始化 MMSE 成功。
7. 确认成功后显示服务端返回实例与 ItemResponse 题目记录骨架创建数量，但不显示 ItemResponse 全量。
8. 确认同一 MMSE 再次初始化按钮禁用；竞态返回 `SCALE_INSTANCE_ALREADY_EXISTS` 时显示稳定提示并刷新详情。
9. 使用另一种已确认施测方式初始化 MoCA 成功。
10. 刷新页面后确认 MMSE / MoCA 两个实例仍存在并按 scaleCode / instanceNo 排序。
11. 确认 `completed` / `locked` / `voided` 访视禁用全部初始化操作并显示原因。
12. 使会话失效后确认页面返回 `/login`，且不无限重试。
13. 使用无 A13 权限账号确认显示 403，而不是空目录或空实例，并可返回工作台或退出登录。
14. 模拟患者不存在、访视不存在或归属不符、无效 ID、目录单独失败、量表不可用、目录冲突和服务错误，确认使用稳定中文状态且不展示后端 message。
15. 确认实例列表提供“打开量表 / 查看量表”入口；访视详情页自身不读取或保存题目，B10 报告能力位于独立区域且不触发题目、媒体、评分或认知域写操作。

## 8. B4 手工验证建议（待验证）

前置条件：后端已启动，使用脱敏人工测试账号和测试患者 / 访视 / MMSE / MoCA 实例；不得使用真实患者信息。以下场景本次未执行，均待开发者本地验证：

1. 登录后打开患者、访视与 MMSE / MoCA 实例，确认 draft / in_progress 显示“打开量表”，completed / locked / voided 显示“查看量表”。
2. 确认执行详情加载访视、量表版本、实例、实时进度、服务端分组和题目；分组 / 题目按 order / itemOrder 排序，无匹配 groupCode 的题目进入“其他项目”。
3. 确认页面不显示完整评分规则、expectedValue、正确答案、score、isCorrect、scoreValue 或任意 JSON 编辑器。
4. 分别保存 boolean、number、text 草稿；确认 boolean 文案是原始布尔记录，number 空值为 null 且非空必须为有限 number，text 不自动匹配或判分。
5. 确认 single_choice / multi_choice 只显示原始回答转录 textarea，不出现前端虚构选项或评分结果。
6. 在 MMSE / MoCA 连续减 7 等项目中保存分步实际回答和备注；确认页面不显示预期值、正确性或步骤分数。
7. 在 MoCA 延迟回忆提示槽位中保存提示后表现；确认 promptText、提示类型和计分参与标识可见，不新增槽位或推断正确性。
8. 开启缺失记录但不填原因，确认前端阻止保存；填写原因后可保存。确认开启时清空实际作答、step actualValue 和 prompt responseAfterPrompt，保留相关 note、timing 与 operatorNote；关闭时清空 missingReason。
9. 确认非计时题不出现计时编辑；计时题可编辑开始 / 完成时间、秒口径用时与来源，完成时间早于开始时间时阻止保存，页面没有实时计时器操作。
10. drawing / handwriting / photo_upload 的原始文字说明继续独立保存；含 photo / handwriting requirement 时另显示 B5 证据面板，媒体操作不触发 A14 PATCH。
11. 保存草稿后刷新确认服务端草稿仍保留；保存成功不重新加载整页，当前题反馈稳定且 dirty 清除。
12. 保存并标记本题完成后确认后端 progress 增加；只有 timing 或 operatorNote 时不能标记完成。
13. answered 题继续编辑并保存后仍为 answered，不出现退回进行中操作，也不提交 status。
14. scored / locked / voided 题只读；completed / locked / voided 访视或实例全页只读，历史安全草稿仍展示。
15. 修改多个分组中的题目并切换分组，确认未保存输入不丢失、顶部未保存数量正确；刷新或关闭页面触发浏览器 beforeunload 基础提示。
16. 使会话失效后确认 401 返回 `/login`；使用无 A14 权限账号确认 403 显示无权限，而不是空题目页。
17. 模拟患者、访视、实例或题目不存在，确认使用稳定中文 not-found；跨患者 / 访视访问不泄露资源存在性。
18. 模拟量表实例配置不可用、访视 / 实例 / 题目不可编辑、槽位变化、计时无效和保存失败，确认映射稳定中文错误且 PATCH 不自动重试。
19. 使用浏览器网络面板确认 A14 GET 可取消，所有路径 ID 已编码，PATCH 只含当前题变化白名单且不包含 status、score、答案、evidenceRequirements、ID 或完整响应对象。
20. 确认页面不存在整份最终提交、批量保存、自动保存、评分、报告、认知域或 AI 入口，也未把作答草稿、Cookie 或 token 写入 localStorage / sessionStorage。

## 9. B5 手工验证建议（待验证）

前置条件：后端已启动，使用脱敏人工测试账号和测试患者 / 访视 / 量表实例；不得使用真实患者图片或真实手写内容。以下场景本次未执行，均待开发者本地验证：

1. 登录并进入含 photo / handwriting 要求的题目。
2. 媒体列表正常按题加载，而不是页面初次加载批量请求全部题目。
3. attached、locked、voided 状态显示正确且 voided 历史不隐藏。
4. 选择已有 JPEG / PNG / WebP 源图后生成重新编码 JPEG。
5. 页面不显示和不提交原始文件名。
6. 手机浏览器 paper_scan 输入可提示摄像头；不支持时正常退化为文件选择，且不出现实时摄像头界面。
7. 处理后的图片能使用本地 object URL 预览。
8. 输出宽、高、JPEG MIME 和大小符合 2560 最长边与 10 MiB 限制。
9. 图片无法解码、Canvas 输出失败或有界压缩仍超限时阻止上传，绝不回退上传原图。
10. photo_upload 上传成功。
11. paper_scan 上传成功并正确提交页码。
12. 上传后对应 requirement 立即变为 attached。
13. 上传不改变题目状态、作答 dirty 或 progress。
14. 同类型存在 attached / locked 证据时上传按钮禁用并提示先作废。
15. 后端返回 `MEDIA_EVIDENCE_ALREADY_ATTACHED` 后刷新列表，不自动重复上传。
16. primary 临时地址仅在点击预览时获取。
17. 图片内联预览和新窗口打开可用，且请求不依赖 next.config 永久域名。
18. expiresAt 无效、已过期或距过期不足 30 秒时会重新获取地址。
19. 作废必须填写 trim 后 3–1000 字符原因。
20. 作废后记录显示 voided，且文案不称为删除。
21. 作废后 requirement 恢复 pending / false。
22. 作废后可重新上传同类型证据，旧历史仍保留。
23. 平板触控笔、触屏手指和鼠标可在 1200 × 800 逻辑画布连续书写，窄屏缩放时坐标仍正确。
24. pointer capture、`touch-action: none`、撤销上一笔和清空全部正常。
25. 空白画布不能上传；撤销最后一笔或清空后未上传证据计数减少。
26. 切换分组后未上传 strokes 与媒体元数据保留。
27. handwriting 上传包含从当前 Canvas 生成的 PNG。
28. 默认同时上传固定结构的 strokes JSON；关闭轨迹时同时省略 trajectory 与 trajectoryFormat。
29. handwriting 有轨迹时可获取 trajectory 临时地址并在新窗口打开，但页面不渲染 JSON 内容。
30. 轨迹超过 8000 点或 2 MiB 时前端阻止上传并显示明确提示。
31. 页面刷新不保留未上传 JPEG Blob、strokes 或短期 URL。
32. 未上传媒体内容时 beforeunload 生效，顶部独立显示未保存作答与未上传证据题目数。
33. completed / locked / voided Visit 或实例只允许列表与 attached / locked 预览。
34. scored / locked / voided ItemResponse 只允许列表与 attached / locked 预览。
35. 401 返回登录页；403 显示无权限而不是空列表。
36. 患者非 active 或 Storage 异常时显示稳定提示并保留本地待上传草稿。
37. 上传与作废请求不自动重试；分组切换期间同题同类型写锁仍阻止第二个写请求。
38. 页面与公开类型不显示内部对象定位、Storage bucket / credential、校验和、原始文件名、任意 metadata / qualityHints 或内部归属字段。
39. 媒体子组件自身不调用提交、评分、OCR、报告或 AI 接口；正式提交只由 B6 主执行页交互触发。
40. 全部验证使用脱敏人工测试图片与手写内容，不使用真实医疗数据。

## 10. B6 手工验证建议（待验证）

前置条件：后端已启动，使用脱敏人工测试账号和测试患者 / 访视 / MMSE / MoCA 实例；不得使用真实患者或医疗数据。以下场景本次未执行，均待开发者本地验证：

1. 打开未完成 MMSE / MoCA 实例。
2. readiness 在执行详情成功后独立自动加载。
3. 初始阻断问题和九项统计与服务器数据一致。
4. readiness 失败只影响提交面板，不影响题目、作答草稿与媒体历史展示。
5. 问题列表不显示作答、正确答案、expectedValue 或评分。
6. “定位题目”能切换分组、滚动并将键盘焦点移到题目容器。
7. scale_instance scope 问题不显示错误的题目定位操作。
8. 未保存作答存在时禁止进入有效确认和发送 POST。
9. 未上传媒体草稿存在时禁止进入有效确认和发送 POST。
10. 题目 PATCH 成功后 readiness 标记过期，纯本地输入不自动请求 readiness。
11. 媒体上传或作废成功后 readiness 标记过期；列表 / 预览 GET 不标记过期。
12. 重新检查取消旧 GET 并使用最新服务器状态；取消请求不显示错误。
13. blocking issue 阻止提交，页面没有忽略或 force 操作。
14. warning 不阻止提交，并可独立展开查看。
15. readiness ready=true、canSubmitNow=true、无 blocking 且无本地阻断时出现确认区。
16. 未勾选确认 checkbox 时“确认正式提交”不可用。
17. submit 期间题目编辑 / 保存、图片采集、手写画布、上传和作废全部真实禁用。
18. submit 成功后页面立即变为 completed 只读，不整页重载。
19. submit 成功后历史题目作答和媒体证据仍可查看。
20. submit 成功后不跳转评分、报告或 AI 页面，也不修改访视状态。
21. 当前会话 submission 回执的 submittedAt、operatorName、operatorRole、durationSource 正确，submissionId 仅弱化展示。
22. 并发已提交返回 alreadySubmitted=true 时作为成功处理并说明未重复写入。
23. completed 实例刷新后不自动调用 submit POST。
24. completed 实例无当前会话回执时不把施测 operatorSnapshot 冒充提交操作者。
25. locked / voided 实例不显示可用提交按钮，仍可查看 readiness 与历史。
26. patient_inactive / visit_not_editable 显示 canSubmitNow=false 且不能提交。
27. `SCALE_INSTANCE_NOT_READY` 后自动刷新一次 readiness，但不自动再次 POST。
28. `SCALE_INSTANCE_SUBMISSION_CONFLICT` 后刷新服务器状态，但不自动再次 POST。
29. readiness 或 submit 的 401 返回登录页。
30. readiness 或 submit 的 403 显示无权限，不伪装成空检查结果。
31. readiness / submit 服务错误保留当前题目、作答草稿、媒体草稿和确认说明；POST 不自动重试。
32. 页面没有 force submit、ignore issues、撤销、reopen 或 lock 入口。
33. 页面不显示 score、isCorrect、scoreValue、scoringRule、expectedValue 或正确答案。
34. 问题定位跨分组后其他分组的作答与媒体草稿没有丢失。
35. B6 没有新增路由、修改 URL 或增加路由参数。
36. 全部验证使用脱敏人工测试数据，不使用真实患者或医疗信息。

## 11. B7 手工验证建议（待验证）

前置条件：后端已启动，使用脱敏人工测试账号和测试患者 / 访视 / MMSE / MoCA 实例；不得使用真实患者或医疗数据。以下场景本次未执行，均待开发者本地验证：

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

## 12. B8 手工验证建议（待验证）

前置条件：后端已启动，使用脱敏人工测试账号与测试数据；不得使用真实患者或医疗数据。以下场景本次未执行：

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

## 13. B9 手工验证建议（待验证）

前置条件：后端已启动，使用脱敏人工测试账号与测试数据；不得使用真实患者或医疗数据。以下场景本次未执行：

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

## 14. B10 手工验证建议（待验证）

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

以上真实浏览器联调尚未执行，不得写成已通过。

## 15. B11 手工验证建议（待验证）

前置条件：后端已启动，使用脱敏人工测试账号与测试报告；不得使用真实患者或临床意见。以下场景本次未执行：

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
69. stale / alert / aria-live 文案与真实 disabled 状态正确。
70. `npm run lint`、`npm run typecheck`、`npm run build` 通过。

以上真实浏览器联调尚未执行，不得写成已通过。

## 16. B12 手工验证建议（待验证）

前置条件：后端已启动，使用脱敏人工测试账号与测试报告；不得使用真实患者或锁定说明。以下场景本次未执行：

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
82. label、alert、live region 正确。
83. 没有第二次 `/auth/me`。
84. 没有新增路由。
85. 没有使用真实患者或锁定说明。
86. lint 通过。
87. typecheck 通过。
88. build 通过。

以上真实浏览器联调尚未执行，不得写成已通过。

## 17. B13 手工验证建议（待验证）

前置条件：后端已启动，使用脱敏人工测试账号、已确认并锁定的测试报告；不得使用真实患者或冻结说明。以下场景本次未执行：

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
111. label / alert / live region 正确。
112. 没有新增路由。
113. 没有使用真实患者或冻结说明。
114. lint 通过。
115. typecheck 通过。
116. build 通过。

以上真实浏览器联调尚未执行，不得写成已通过。

## 18. B14 手工验证建议（待验证）

前置条件：后端已启动，使用脱敏人工测试账号、已确认 / 锁定 / 来源冻结完成的测试报告；不得使用真实患者或归档说明。以下场景本次未执行：

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
109. label / alert / live region 正确。
110. 没有新增路由。
111. 没有新增依赖。
112. 没有使用真实医疗数据。
113. lint 通过。
114. typecheck 通过。
115. build 通过。

以上真实浏览器联调尚未执行，不得写成已通过。

## 18.1 B15 手工验证建议（待验证）

- 使用脱敏 doctor / admin 账号验证 archived V1 首次更正：原因 3–2000、摘要 3–4000、checkbox、Body 白名单与成功原地切换 V2；确认没有刷新、跳转或额外 latest。
- 使用脱敏 in_progress source 验证显式恢复：correctionId / No.、started actor / time、版本关系与 replacementReportId 可见；reason / summary 只读，必须重新勾选且不生成新 ID。
- 验证 completed 幂等：source 不显示再次发起 / 恢复；alreadyCreated 与 resumedExisting 三类成功文案准确，source 与 receipt 仅当前会话保留。
- 模拟 not correctable / not latest / conflict / incomplete / failed / not found / voided：最多 latest 一次，首次文本保留、checkbox 清除、stale，绝不重发 POST。latest 变 in_progress 时需明确放弃本地内容后恢复；变 corrected / replacement 时提示本地说明未写入。
- 模拟 401 / 403 / audit unavailable / replacement conflict / 网络中断：401 返回登录页；403 保留报告与输入；审计 / 关系冲突不可绕过；网络不确定只提供手工 latest。
- 分别以 doctor/admin 与 nurse/research_assistant 验证合法 V2：仅 doctor/admin 可 edit / submit / confirm；Patient inactive、Visit locked / voided 不阻断 A21；V1 既有角色与资格不放宽。
- 确认 V2 confirmed 不显示 lock / freeze-sources / archive 入口且网络面板没有 A22–A24 请求；不自动完成编辑、确认、锁定、冻结或归档。
- 验证 source / replacement 摘要没有虚假历史链接、metadata、原始 correctionRecords 或五类来源 ID；刷新后仅使用 replacementOf。
- 验证小屏纵向布局、可见 label / 字符计数、alert / polite live region、键盘操作与 POST 期间全部报告写操作 disabled。
- 验证 beforeunload 只有一个监听器：start 模式 reason / summary trim 后非空触发；resume 只读文本本身不触发；不得写 localStorage / sessionStorage / IndexedDB / URL / Cookie。

以上 B15 浏览器自动化与手工联调尚未执行，全部场景待使用脱敏数据验证。

## 18.2 B16 核心验证矩阵（待验证）

前置条件：同时可用的本地前后端、脱敏 doctor / admin / nurse / research_assistant 账号，以及可构造 V1、V2、V3、sourceFreeze in_progress、并发 stale 与 lineage invalid 的隔离测试数据。

- V1 回归：doctor/admin 按原顺序 lock → freeze → archive；确认 Visit 非 draft / in_progress / completed 时原 lock / 首次 freeze 限制未放宽，note、checkbox、receipt 与 B12–B14 一致。
- V2 闭环：从 archived V1 更正并原地切换；不刷新时旧 V1 的 edit / submit / confirmation / lock / freeze / archive receipt 均消失，仅保留 correction receipt / sourceReport；完成 V2 A21 后逐步执行 A22–A24，每步显示当前 reportCode / V2 且不自动进入下一步。
- V3 防写死：从 archived V2 创建 V3，完成 A21–A24；确认 UI、请求和文案均动态使用 V3，没有 V2 专用分支、页面、Hook 或 endpoint。
- 历史状态：对安全 replacement 分别验证 Patient inactive、Visit locked、Visit voided 均不阻断当前报告 A22–A24；当前报告自身未确认、未锁定、freeze 未完成、已归档 / corrected / voided 时仍正确阻断。
- 来源冻结：首次使用当前 updatedAt / 用户 note；in_progress 使用服务端 freezeId 与持久 note 且不可编辑；completed 不写入。检查 expected / completed / newly / previously 计数及“前序已冻结、当前兼容验证”说明，不显示内部来源集合 ID。
- 幂等 / 并发：alreadyLocked / alreadyFrozen / alreadyArchived 展示原 receipt；lock / archive stale 保留 note、清 checkbox、latest 最多一次且不重发；freeze-before-lock 与 archive-before-freeze 保留各自错误语义。
- lineage invalid：409 显示安全中文提示，最多 latest 一次，刷新后仍不可安全写入，禁止自动 POST / 跳转 / 修补 replacementOf，页面和日志不泄露 previousReportId、correctionId、来源 ID、堆栈或数据库异常。
- 权限 / 协调：doctor/admin 可执行；nurse/research_assistant 无可操作按钮但可看安全摘要。快速双击仅一个请求，一个 writingAction 期间不能打开另一模式，beforeunload 生效，结束后释放，不存在 lock → freeze → archive 自动串联或轮询。
- 网络面板：A22–A24 继续只发送 confirm、当前 note、当前 report.updatedAt；不得发送 reportVersion、previousReportId、replacementOf、correctionId、sourceIds、Patient / Visit 状态或来源范围。

基线 `066ee87` 的前轮已执行上述完整浏览器矩阵；本轮未重复全部场景，只补齐两个确定性场景和指定冒烟。两轮证据可在产品代码无差异的前提下合并，但仍不得绕过本轮未完成的强制门禁而写成 B16 完成。

### B16 浏览器矩阵的夹具前置

- 执行上述矩阵前，后端执行者必须先在隔离 test database 运行 B16 fixture `prepare`，再运行只读 `verify`；两者均要求 `NODE_ENV=test` 和仅通过临时进程环境提供的 `B16_FIXTURE_PASSWORD`。密码值不写入本手册，也不得进入浏览器日志、截图或存储。
- safe manifest 中 `roles` 提供 doctor、admin、nurse、research_assistant 四类脱敏账号的 `accountName` 登录标识；执行者使用同一临时密码登录。`route` 可直接打开对应脱敏 patient/visit 页面，但验收报告不得粘贴实际 ID。
- 场景用途按 key 分组：`v1_doctor_ready_lock` / `v1_admin_ready_lock` / `v1_visit_ineligible` 验证 V1 回归与资格边界；`archived_v1_for_v2` / `archived_v2_for_v3` 分别作为真实 V2、V3 创建起点；`v2_patient_inactive_ready_lock` / `v2_visit_locked_ready_lock` / `v2_visit_voided_ready_lock` 验证 replacement 历史状态。
- A23/A24 场景：`v2_ready_freeze`、`v2_freeze_in_progress`、`v2_ready_archive`；并发与幂等场景：`v2_ready_lock_concurrency`、`v2_ready_archive_concurrency`、`v2_already_locked`、`v2_already_frozen`、`v2_already_archived`；前置错误：`v2_freeze_before_lock`、`v2_archive_before_freeze`；内部 lineage 409：`v2_lineage_invalid_internal`。新增 `v2_correction_in_progress` 用于恢复同一 A25 correction，新增 `v2_replacement_summary_unsafe` 用于公开摘要前端写阻断。contract 共 22 个 `scenarioKey`（1 个 roles + 21 个业务场景），每个业务 key 都有独立 patient/visit/report 链，不应跨场景复用浏览器写操作。
- safe manifest 的 purpose、当前版本、安全状态、建议角色、起始阶段和聚合来源计数是验收导航信息；它不会输出密码、Cookie、Session、连接串、报告正文、前序/替代报告内部 ID、correction/freeze/source ID。
- 浏览器矩阵结束后执行后端 CLI `cleanup --namespace <name> --confirm-cleanup`，并核对残留为 0。夹具 prepare/verify 通过只说明账号与数据前置就绪，不等于 B16 真实浏览器业务验收通过。
- 当前状态：前轮完整矩阵与本轮针对性 Chrome 结果均已记录，但本轮完成门禁未全部满足；B16/WP-02 仍为进行中，WP-04 尚未开始。

### B16 最终门禁补齐的本轮结果

- fixture 使用 production correction plan/start builder 和 `ReportsService.startCorrectionIfUnmodified()` 确定性停在完整 `in_progress`，不再通过网络中断或随机时机碰撞状态；`prepare` / `verify` / `cleanup` 命令不变。固定 namespace 的 replace、verify 均成功，4 个角色、22 个 `scenarioKey`、21 个业务场景及 safe manifest 扫描均通过。fixture 准备成功不等于浏览器验收完成。
- 真实 Chrome 的 `v2_correction_in_progress`：doctor 从 archived V2 看到只读持久原因/摘要和 Resume 入口；Tab / Enter / Space 完成键盘流程；A25 POST 恰好 1 次并返回 HTTP 200、`resumedExisting=true`；页面原地切到 V3，刷新不重发。后端 E2E 进一步确认只创建一个 V3、复用原 correction、没有 V4。页面、DOM、URL 和 Console 未发现 correction/lineage 内部 ID。
- 真实 Chrome 的 `v2_replacement_summary_unsafe`：页面和公开报告映射正常，显示安全阻断说明；A22–A25 入口均不开放，写请求为 0，刷新后不修补、不跳转。页面、DOM、URL 和 Console 未发现内部 lineage 标识或被破坏关系的原始值。
- 指定冒烟通过：安全 archived V2→V3 为 1 次 A25 POST / HTTP 200；internal lineage invalid 为 1 次 A22 POST / HTTP 409、错误码保持稳定、latest 1 次且自动重发 0；nurse 和 research_assistant 无 correction 入口；非 archived replacement 无 correction Start；Resume 键盘焦点可见。beforeunload、双会话并发、完整 V1/V2、历史 Patient/Visit、幂等和 freeze 矩阵沿用同一产品代码基线 `066ee87` 的前轮证据。
- fixture 定向 E2E 1 suite / 3 tests、A25/A26 定向 E2E 1 suite / 7 tests、全量 unit 76 suites / 666 tests、全量 E2E 15 suites / 70 tests、build 均通过。完整 lint 因三个未修改 scoring 文件中的 51 个既有 Prettier 问题失败；受本任务范围约束未修复。
- Chrome 控制规范禁止读取浏览器 Cookie、Local Storage、Session Storage、profile、密码或 session store，因此本轮未执行强制 Web Storage 泄露检查。该验证能力限制与完整 lint 失败共同阻止 B16/WP-02 完成；未发现新的产品行为缺陷，不切换 WP-04。
- 浏览器验证后 fixture cleanup 连续执行两次，残留为 0；本任务启动的服务已停止。未修改任何 frontend 产品文件。

## 19. 认证与安全验证口径

- 使用浏览器网络面板确认三个认证请求均携带 credentials 语义，并由浏览器处理 HttpOnly Cookie。
- 前端代码与存储中不得出现 raw token、token hash、`passwordHash`、JWT 或其他认证凭证。
- localStorage / sessionStorage 不得保存认证凭证或认证状态。
- URL、console 与页面错误中不得出现密码、Cookie、后端堆栈或内部认证失败原因。
- 当前 roles 只作公开摘要展示，不得误判为前端权限矩阵已实现。
- 患者 / 访视 API 的 401 必须返回登录页，403 必须显示无权限；页面角色显示不替代后端 Guard。
- 患者创建请求不得包含 status、externalRefs、metadata 或 timestamps；访视创建请求不得包含 operatorSnapshot、clinicalContext、metadata、状态或状态时间。
- 页面、console、localStorage、sessionStorage 和 URL 不得泄露患者请求体、Cookie、token、token hash、JWT、passwordHash 或 Mixed 内部字段。
- A13 GET 必须支持取消且取消不显示服务异常；初始化 POST 不自动重试，请求 body 仅包含 scaleCode、scaleVersion、administrationMode。
- B3 页面不得在 console、存储或 URL 中记录访视详情、目录、实例或 ItemResponse；不得展示完整 seed、scoringRule、expectedValue 或后端内部错误。
- B4 页面不得在 console、存储或 URL 中记录作答草稿、患者、访视、实例、请求体或响应体；PATCH body 必须是变化白名单，不能包含服务器控制字段。
- B5 页面不得在 console、存储或 URL 中记录源 File、JPEG / PNG Blob、轨迹、短期 URL、请求体或响应体；multipart 只能由 API Client 逐字段构造，不能手工设置 multipart Content-Type。
- B7 页面不得在 console、存储或 URL 中记录评分结果、reviewQueue、请求体或响应体；compute 只能由独立 API Client 构造 `{ confirm: true }`，不得提交任何分数、规则、状态或服务器字段。
- B9 页面不得在 console、存储或 URL 中记录认知域结果、贡献、来源评分、请求体或响应体；compute 只能由独立 API Client 构造 `{ confirm: true }`，不得提交 domain、weight、mapping、分数、规则、状态或服务器字段。
- B13 页面不得在 console、存储或 URL 中记录 freezeNote、sourceFreeze 计数、updatedAt、请求或响应；freeze-sources 只能由独立 API Client 构造 confirm、trim 后 freezeNote 与 expectedUpdatedAt。不得提交或显示内部来源 ID / scope / metadata，不得保存 sourceFreeze 草稿或 receipt 到浏览器持久化存储。
- B14 页面不得在 console、存储或 URL 中记录 archiveNote、updatedAt、请求或响应；archive 只能由独立 API Client 构造 confirm、trim 后 archiveNote 与 expectedUpdatedAt。不得提交或显示 metadata、Schema 原始 archivedBy 或来源 ID，不得保存 archive 草稿或 receipt 到浏览器持久化存储。
- B15 页面不得在 console、存储或 URL 中记录 correction reason / summary、source / replacement 响应或临床数据；corrections Body 只含 confirm、trim 后 reason / summary 与 expectedUpdatedAt。不得持久化草稿 / 回执，不得前端生成 correctionId、版本、code、时间或关系。
- B16 页面不得在 console、存储或 URL 中记录完整 report、lineage 错误响应、冻结来源快照或内部来源 ID；A22–A24 Body 不得新增 reportVersion、previousReportId、replacementOf、correctionId、sourceIds 或 Patient / Visit 状态字段。

## 20. 医疗与隐私展示红线

- 不展示真实用户或患者敏感数据样本。
- 测试截图不得包含真实姓名、邮箱、身份证号、手机号、病历号、住址、患者资料或真实文件名。
- 不得在页面文案或测试截图中呈现未经确认的真实医疗诊断结论。
- 核心认知评估必须保持医护或研究人员陪伴 / 监督的产品边界。

## 21. 后续同步规则

- 前端新增或调整测试脚本后，应同步更新自动验证命令。
- 新增页面、路由、组件、API 对接或权限展示后，应同步补充对应验证口径。
- 新增页面、组件、布局、样式或关键交互后，应同步补充与 `handoff-frontend-design-baseline.md` 一致的视觉 / 可用性人工验证口径。
- 验证截图、测试数据和日志不得包含可识别个人信息。
