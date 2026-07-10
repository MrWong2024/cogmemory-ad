# CogMemory AD / 智忆评 前端验证手册

## 1. 文档定位

本文档用于记录 CogMemory AD 前端自动验证命令、人工验证口径、认证状态验证口径、医疗与隐私展示红线，供后续开发和交接使用。

## 2. 当前状态

- 前端公共底座、B1 登录 / 认证接入，以及 B2 患者档案与评估访视最小页面闭环已落地。
- `frontend\package.json` 已存在，自动验证命令以其中真实脚本为准。
- B2 不新增测试代码、测试框架、E2E 或第三方依赖。
- 当前自动验证覆盖三个认证 API 与 A12 五个患者 / 访视 API 的前端类型、调用代码和页面构建；真实 HTTP / 浏览器联调仍需手工验证。

## 3. B1 / B2 自动验证命令

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

## 7. 认证与安全验证口径

- 使用浏览器网络面板确认三个认证请求均携带 credentials 语义，并由浏览器处理 HttpOnly Cookie。
- 前端代码与存储中不得出现 raw token、token hash、`passwordHash`、JWT 或其他认证凭证。
- localStorage / sessionStorage 不得保存认证凭证或认证状态。
- URL、console 与页面错误中不得出现密码、Cookie、后端堆栈或内部认证失败原因。
- 当前 roles 只作公开摘要展示，不得误判为前端权限矩阵已实现。
- 患者 / 访视 API 的 401 必须返回登录页，403 必须显示无权限；页面角色显示不替代后端 Guard。
- 患者创建请求不得包含 status、externalRefs、metadata 或 timestamps；访视创建请求不得包含 operatorSnapshot、clinicalContext、metadata、状态或状态时间。
- 页面、console、localStorage、sessionStorage 和 URL 不得泄露患者请求体、Cookie、token、token hash、JWT、passwordHash 或 Mixed 内部字段。

## 8. 医疗与隐私展示红线

- 不展示真实用户或患者敏感数据样本。
- 测试截图不得包含真实姓名、邮箱、身份证号、手机号、病历号、住址、患者资料或真实文件名。
- 不得在页面文案或测试截图中呈现未经确认的真实医疗诊断结论。
- 核心认知评估必须保持医护或研究人员陪伴 / 监督的产品边界。

## 9. 后续同步规则

- 前端新增或调整测试脚本后，应同步更新自动验证命令。
- 新增页面、路由、组件、API 对接或权限展示后，应同步补充对应验证口径。
- 新增页面、组件、布局、样式或关键交互后，应同步补充与 `handoff-frontend-design-baseline.md` 一致的视觉 / 可用性人工验证口径。
- 验证截图、测试数据和日志不得包含可识别个人信息。
