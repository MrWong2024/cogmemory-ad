# CogMemory AD / 智忆评 前端路由地图

## 1. 文档定位

本文档用于记录 CogMemory AD 前端路由、页面职责、访问边界和数据来源，供后续开发、测试和交接使用。

## 2. 当前状态

- 当前包含公共首页、登录页、轻量工作台、四条患者 / 访视路由与 not-found 兜底。
- `/dashboard` 已提供患者档案入口，但仍不是完整医生工作台。
- 当前不包含患者编辑 / 删除 / 归档 / 合并、访视编辑 / 删除 / 详情 / 状态流转、MMSE / MoCA、媒体、计分、报告、AI、用户管理或权限菜单路由。
- 当前不包含 Next middleware 或路由级服务端认证中间件。

## 3. 当前路由清单

### 3.1 `/`

- 页面名称：公共首页占位
- 页面职责：展示 CogMemory AD / 智忆评认证接入底座状态，并提供 `/login` 与 `/dashboard` 入口
- 访问边界：公开
- 数据来源：静态内容，无 API 调用
- 加载态 / 错误态：不适用
- 关联组件：`Badge`、`Card`、Next `Link`
- 备注：仍非完整产品门户或业务工作台

### 3.2 `/login`

- 页面名称：机构账号登录
- 页面职责：提供账号密码登录；已有有效会话时进入 `/dashboard`
- 访问边界：公开
- 数据来源：`GET /auth/me`、提交时 `POST /auth/login`
- 加载态：确认已有会话时显示“正在确认登录状态...”；提交时按钮禁用并显示“正在登录...”
- 错误态：登录认证失败显示统一文案；服务异常显示稳定连接错误，不展示后端细节
- 成功态：`router.replace('/dashboard')`
- 关联组件：`Badge`、`Card`、`LoginForm`、`useAuth`
- 备注：不提供注册、密码重置、短信验证码、OAuth / SSO 或测试账号

### 3.3 `/dashboard`

- 页面名称：轻量工作台
- 页面职责：通过认证探针恢复状态，展示当前用户公开信息与角色摘要，提供患者档案真实入口和登出入口
- 访问边界：需要有效会话；当前由 Client Component 调用 `GET /auth/me` 判断，不使用 middleware
- 数据来源：`GET /auth/me`；登出时调用 `POST /auth/logout`
- 加载态：显示正在验证认证状态
- 未认证态：显示会话失效提示并 `router.replace('/login')`
- 错误态：显示稳定认证服务错误，提供重新检查与返回登录页入口
- 已认证态：显示 `displayName`、`accountName`、`roles`、可选 `userType`
- 关联组件：`Badge`、`Button`、`Card`、`AuthDashboard`、`useAuth`
- 备注：Dashboard 自身不调用患者 API；患者档案卡片链接到 `/patients`，MMSE / MoCA、历史结果深化、报告确认与科研导出仍标注“后续建设”

### 3.4 `/patients`

- 页面名称：患者档案列表
- 页面职责：分页查看患者公开档案，按 keyword / status / sourceType 筛选，并进入患者详情或新建患者
- 访问边界：`PatientsWorkspaceShell` 使用 `useAuth()`；loading 显示认证检查，unauthenticated 返回 `/login`，认证服务 error 提供重试；后端 Guard 仍是最终权限边界
- 数据来源：`GET /patients`
- 状态：首次 / 列表加载、无记录、筛选无结果、网络错误、401 跳转、403 无权限、上一页 / 下一页
- 关联组件：`PatientsListPage`、`PaginationControls`、`PatientStatusBadge`
- 当前非目标：不在前端重新搜索，不提供编辑、删除、归档或合并

### 3.5 `/patients/new`

- 页面名称：新建患者
- 页面职责：按 `CreatePatientDto` 白名单创建患者，成功后跳转患者详情
- 访问边界：复用 `/patients/**` 认证工作区；API 401 返回登录，403 显示无权限
- 数据来源：`POST /patients`
- 状态：表单校验、提交中、患者编号冲突、网络错误与稳定成功跳转
- 关联组件：`PatientCreateForm`
- 当前非目标：不提交 status、externalRefs、metadata 或 timestamps；不提供编辑、草稿或本地持久化

### 3.6 `/patients/[patientId]`

- 页面名称：患者详情与评估访视列表
- 页面职责：展示患者公开档案，在同页分页查看访视并按 status / visitType / dateFrom / dateTo 筛选
- 动态参数：Server Component 按 Next 16 `params: Promise<{ patientId: string }>` 等待参数后传入 Client Component
- 访问边界：复用 `/patients/**` 认证工作区；400 显示链接无效，404 显示患者不存在，401 返回登录，403 显示无权限
- 数据来源：`GET /patients/:patientId`、`GET /patients/:patientId/visits`
- 状态：患者与访视独立 loading / error；访视失败保留患者详情；空访视、筛选无结果、分页、日期范围前端校验
- 关联组件：`PatientDetailPage`、`PaginationControls`、`PatientStatusBadge`
- 当前非目标：不展示 externalRefs、metadata、clinicalContext；不提供访视详情、访视编辑 / 删除 / 状态流转或 MMSE / MoCA 执行入口

### 3.7 `/patients/[patientId]/visits/new`

- 页面名称：新建评估访视
- 页面职责：先读取患者公开信息并确认 active 状态，再按 `CreateAssessmentVisitDto` 白名单创建访视，成功后返回患者详情
- 动态参数：Server Component 按 Next 16 `params: Promise<{ patientId: string }>` 契约实现
- 访问边界：复用 `/patients/**` 认证工作区；患者不存在 / 非 active、401、403、校验和冲突均有独立状态
- 数据来源：`GET /patients/:patientId`、`POST /patients/:patientId/visits`
- 关联组件：`AssessmentVisitCreateForm`、`PatientStatusBadge`
- 当前非目标：不提交 operatorSnapshot、clinicalContext、metadata、状态或状态时间；不自动创建量表实例，不启动计分或报告

### 3.8 `not-found`

- 页面名称：404 兜底页
- 页面职责：处理未匹配地址并提供返回首页入口
- 访问边界：公开
- 数据来源：静态内容
- 错误态：页面自身即为兜底展示
- 关联组件：`Badge`、`Card`
- 备注：不调用后端

## 4. 后续同步规则

- 路由事实以实际前端代码、路由文件和业务文档为准。
- 不得在页面未实现前写成已存在路由。
- 路由涉及接口调用时，应同步更新 `docs\handoff\handoff-frontend-api-map.md`。
- `/dashboard` 仍是轻量入口；只有更多医生业务能力真实落地后才能更新为完整医生业务工作台。
