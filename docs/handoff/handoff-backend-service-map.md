# CogMemory AD / 智忆评 后端 Service 职责地图

## 1. 文档定位

本文档用于记录 CogMemory AD 后端 Service 职责边界、调用关系、事务要求和测试覆盖口径。

## 2. 当前状态

- 当前只存在公共底座 Service / Provider。
- 当前没有任何业务 Service。
- 当前没有认证、用户、医生、患者、量表、评估、报告、SMS 或 LLM Service。

## 3. 当前 Service / Provider 清单

- Service 名称：`AppService`
- 文件路径：`backend\src\app.service.ts`
- 职责边界：返回 health 响应 `{ status: 'ok', service: 'cogmemory-ad-backend' }`。
- 上游调用方：`AppController.getHealth()`。
- 下游依赖：无。
- 测试覆盖口径：`backend\src\app.controller.spec.ts`。

- Provider 名称：`AllExceptionsFilter`
- 文件路径：`backend\src\common\filters\all-exceptions.filter.ts`
- 职责边界：统一 HTTP 异常与未知异常响应结构。
- 上游调用方：`configureApp()` 全局注册。
- 下游依赖：`HttpAdapterHost`。
- 测试覆盖口径：当前未单独添加 filter spec。

- Service 名称：`StorageConfigService`
- 文件路径：`backend\src\modules\storage\storage-config.service.ts`
- 职责边界：读取 Storage driver 与 OSS 配置，缺少 OSS 必需配置时抛出明确异常。
- 上游调用方：`StorageModule`、`FakeStorageService`、`OssStorageService`。
- 下游依赖：环境变量。
- 测试覆盖口径：`backend\src\modules\storage\storage.service.spec.ts`。

- Service 名称：`FakeStorageService`
- 文件路径：`backend\src\modules\storage\fake-storage.service.ts`
- 职责边界：提供不依赖真实 OSS 的 fake driver。
- 上游调用方：`STORAGE_SERVICE` token。
- 下游依赖：`StorageConfigService`。
- 测试覆盖口径：`backend\src\modules\storage\storage.service.spec.ts`。

- Service 名称：`OssStorageService`
- 文件路径：`backend\src\modules\storage\oss-storage.service.ts`
- 职责边界：提供 Alibaba Cloud OSS 底层适配，包括 put、delete 和 signed URL。
- 上游调用方：`STORAGE_SERVICE` token。
- 下游依赖：`StorageConfigService`、`ali-oss`。
- 测试覆盖口径：`backend\src\modules\storage\storage.service.spec.ts` 仅验证缺少配置时的错误，不调用真实 OSS。

- Provider token：`STORAGE_SERVICE`
- 文件路径：`backend\src\modules\storage\storage.constants.ts`
- 职责边界：根据 `STORAGE_DRIVER` 选择 fake 或 OSS driver。

## 4. 后续同步规则

- Service 事实以实际代码、模块边界和测试为准。
- 不得将未确认业务流程写成已实现 Service 能力。
- 跨模块调用、事务和一致性要求应在实现后及时补充。
