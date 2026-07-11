# CogMemory AD / 智忆评 前端验证手册

## 1. 文档定位

本文档用于记录 CogMemory AD 前端自动验证命令、人工验证口径、认证状态验证口径、医疗与隐私展示红线，供后续开发和交接使用。

## 2. 当前状态

- 前端公共底座与 B1-B7 既有闭环已落地；B8 题目人工评分、乐观并发、显式评分确认与最终只读展示已落地。
- `frontend\package.json` 已存在，自动验证命令以其中真实脚本为准。
- B2-B8 不新增测试代码、测试框架、E2E 或第三方依赖。
- 当前自动验证覆盖三个认证 API、A12 五个患者 / 访视 API、A13 三个评估初始化前置 API、A14 两个执行草稿 API、A15 四个媒体证据 API、A16 两个提交 API 与 A17 两个阶段性评分 API 的前端类型、调用代码和页面构建；真实 HTTP / 浏览器联调仍需手工验证。

## 3. B1 / B2 / B3 / B4 / B5 / B6 / B7 / B8 自动验证命令

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
- 评分 lock / void / reopen / rerun、认知域、报告、诊断或 AI；这些能力未实现。

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
15. 确认实例列表提供“打开量表 / 查看量表”入口，但访视详情页自身不读取或保存题目，也没有最终提交、媒体、计分、报告或 AI 操作。

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

## 13. 认证与安全验证口径

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

## 14. 医疗与隐私展示红线

- 不展示真实用户或患者敏感数据样本。
- 测试截图不得包含真实姓名、邮箱、身份证号、手机号、病历号、住址、患者资料或真实文件名。
- 不得在页面文案或测试截图中呈现未经确认的真实医疗诊断结论。
- 核心认知评估必须保持医护或研究人员陪伴 / 监督的产品边界。

## 15. 后续同步规则

- 前端新增或调整测试脚本后，应同步更新自动验证命令。
- 新增页面、路由、组件、API 对接或权限展示后，应同步补充对应验证口径。
- 新增页面、组件、布局、样式或关键交互后，应同步补充与 `handoff-frontend-design-baseline.md` 一致的视觉 / 可用性人工验证口径。
- 验证截图、测试数据和日志不得包含可识别个人信息。
