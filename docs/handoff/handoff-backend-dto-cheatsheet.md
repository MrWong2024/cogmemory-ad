# CogMemory AD / 智忆评 后端 DTO 与响应速查

## 1. 文档定位

本文档用于记录 CogMemory AD 后端 DTO、请求参数、响应结构和校验摘要，方便后续开发、测试和交接快速查阅。

## 2. 当前状态

- 当前存在公共底座 DTO、响应 type、Storage interface，以及 `scales` 内部 Service 读取输出 type。
- 当前不记录任何业务请求 DTO。
- 当前没有认证、用户、医生、患者、量表、评估、报告或业务上传 DTO。

## 3. 当前 DTO / Type 清单

- 名称：`AppHealthResponse`
- 文件：`backend\src\app.service.ts`
- 用途：`GET /health` 响应 type。
- 字段：`status: 'ok'`，`service: 'cogmemory-ad-backend'`。

- 名称：`PaginationQueryDto`
- 文件：`backend\src\common\dto\pagination-query.dto.ts`
- 用途：公共分页 query DTO。
- 字段：`page` 默认 `1`，`pageSize` 默认 `100`。
- 校验：`page` 为不小于 `1` 的整数；`pageSize` 为 `1` 到 `1000` 的整数。

- 名称：`ListFilterQueryDto`
- 文件：`backend\src\common\dto\pagination-query.dto.ts`
- 用途：公共列表过滤 query DTO。
- 字段：`keyword?: string`，`isActive?: boolean`。

- 名称：`PaginatedResponse<T>`
- 文件：`backend\src\common\dto\pagination-query.dto.ts`
- 用途：公共分页响应 type。
- 字段：`items`、`page`、`pageSize`、`total`。

- 名称：`StorageService` 及相关输入输出 type
- 文件：`backend\src\modules\storage\storage.interface.ts`
- 用途：Storage 公共底层接口。
- 相关 type：`UploadFileInput`、`UploadedFileResult`、`SignedUrlOptions`、`SignedUrlResult`。

- 名称：`ScaleDefinitionSummary`
- 文件：`backend\src\modules\scales\services\scales.service.ts`
- 用途：`ScalesService` 内部读取量表定义时返回的 mapper 输出 type，不是 HTTP DTO。
- 字段摘要：`id`、`code`、`name`、`shortName`、`description`、`category`、`status`、`currentVersionId`、`sortOrder`、`tags`。

- 名称：`ScaleVersionSummary`
- 文件：`backend\src\modules\scales\services\scales.service.ts`
- 用途：`ScalesService` 内部读取量表版本配置时返回的 mapper 输出 type，不是 HTTP DTO。
- 字段摘要：量表引用、量表 code、版本追溯字段、状态、总分范围、分组配置、题目配置、质控规则、报告规则、科研导出映射、生效时间和退役时间。

- 名称：`ScaleScoreRangeSummary`、`ScaleGroupConfigSummary`、`ScaleItemConfigSummary`
- 文件：`backend\src\modules\scales\services\scales.service.ts`
- 用途：`ScaleVersionSummary` 的内部配置输出 type，承载题目分组、题目配置、作答类型、得分范围、证据要求和展示 / 导出规则。

## 4. 后续同步规则

- DTO 事实以实际 DTO 文件、校验装饰器、Controller 使用方式和测试为准。
- 不得在业务文档未确认前编造字段、枚举、状态或响应结构。
- DTO 变更影响前端时，应同步更新前端 API 对接文档。
