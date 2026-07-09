# CogMemory AD / 智忆评 后端 Service 职责地图

## 1. 文档定位

本文档用于记录 CogMemory AD 后端 Service 职责边界、调用关系、事务要求和测试覆盖口径。

## 2. 当前状态

- 当前存在公共底座 Service / Provider，以及 `scales`、`patients`、`assessments`、`media` 内部读取 Service。
- 当前没有认证、用户、医生、报告、SMS 或 LLM Service；`ScalesService`、`PatientsService`、`AssessmentsService`、`MediaEvidenceService` 仅为内部模型读取底座。

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

- Service 名称：`ScalesService`
- 文件路径：`backend\src\modules\scales\services\scales.service.ts`
- 职责边界：提供量表定义与量表版本配置的内部读取底座；规范化 scale code；按 mapper 输出 `ScaleDefinitionSummary` / `ScaleVersionSummary`，不直接返回完整 Mongoose document。
- 当前方法：`normalizeScaleCode(code)`、`findDefinitionByCode(code)`、`findVersionByScaleCodeAndVersion(scaleCode, version)`、`listActiveDefinitions()`。
- 上游调用方：当前暂无公开 Controller；预期供后续评估、计分或配置读取模块内部调用。
- 下游依赖：`ScaleDefinition` 与 `ScaleVersion` Mongoose Model。
- 边界：不创建、更新、删除量表配置；不导入种子数据；不实现评估执行、作答、计分、报告、AI、认证或权限。
- 测试覆盖口径：`backend\src\modules\scales\services\scales.service.spec.ts`，覆盖 code 规范化、查无返回 `null`、mapper 输出、schema collection、索引和关键字段显式类型；不连接真实 MongoDB。

- Service 名称：`PatientsService`
- 文件路径：`backend\src\modules\patients\services\patients.service.ts`
- 职责边界：提供患者 / 受试者基础档案的内部读取底座；规范化 `subjectCode`；按 mapper 输出 `PatientSummary`，不直接返回完整 Mongoose document。
- 当前方法：`normalizeSubjectCode(subjectCode)`、`findPatientBySubjectCode(subjectCode)`、`listActivePatients()`。
- 上游调用方：当前暂无公开 Controller；预期供后续评估、报告或科研导出等后端业务模块内部读取患者基础档案。
- 下游依赖：`Patient` Mongoose Model。
- 边界：不创建、更新、删除患者档案；不实现真实患者建档流程；不实现脱敏流程、权限、认证或公开患者管理 API。
- 测试覆盖口径：`backend\src\modules\patients\services\patients.service.spec.ts`，覆盖 `subjectCode` 规范化、查无返回 `null`、mapper 输出、active patient 列表读取、schema collection、索引和关键字段显式类型；不连接真实 MongoDB，测试数据为脱敏人工样例。

- Service 名称：`AssessmentsService`
- 文件路径：`backend\src\modules\assessments\services\assessments.service.ts`
- 职责边界：提供访视、量表实例运行时数据与题目作答数据的内部读取底座；规范化 `visitCode` / `instanceCode` / `itemCode`；按 mapper 输出 `AssessmentVisitSummary` / `ScaleInstanceSummary` / `ItemResponseSummary`，不直接返回完整 Mongoose document。
- 当前方法：`normalizeVisitCode(visitCode)`、`normalizeInstanceCode(instanceCode)`、`normalizeItemCode(itemCode)`、`findVisitByCode(visitCode)`、`listVisitsByPatientId(patientId)`、`findScaleInstanceByCode(instanceCode)`、`listScaleInstancesByVisitId(assessmentVisitId)`、`findItemResponseByScaleInstanceAndItemCode(scaleInstanceId, itemCode)`、`listItemResponsesByScaleInstanceId(scaleInstanceId)`、`listScoredItemResponsesByScaleInstanceId(scaleInstanceId)`、`listItemResponsesByVisitId(assessmentVisitId)`。
- 上游调用方：当前暂无公开 Controller；预期供后续评估执行、计分、报告或科研导出等后端业务模块内部读取访视、量表实例和题目作答。
- 下游依赖：`AssessmentVisit`、`ScaleInstance` 与 `ItemResponse` Mongoose Model。
- 边界：不创建、更新、删除访视、量表实例或题目作答；不实现状态流转、作答提交、媒体证据读写流程、计分、报告、AI、认证、权限或公开评估 API。
- 测试覆盖口径：`backend\src\modules\assessments\services\assessments.service.spec.ts`，覆盖 code 规范化、访视 / 量表实例 / 题目作答查无返回 `null`、mapper 输出、列表读取、schema collection、索引、内嵌子文档 `_id: false` 和关键字段显式类型；不连接真实 MongoDB，测试数据为脱敏人工样例。

- Service 名称：`MediaEvidenceService`
- 文件路径：`backend\src\modules\media\services\media-evidence.service.ts`
- 职责边界：提供媒体证据元数据的内部读取底座；规范化 `evidenceCode`；按 mapper 输出 `MediaEvidenceSummary`，不直接返回完整 Mongoose document。
- 当前方法：`normalizeEvidenceCode(evidenceCode)`、`findEvidenceByCode(evidenceCode)`、`listEvidenceByItemResponseId(itemResponseId)`、`listEvidenceByScaleInstanceId(scaleInstanceId)`、`listEvidenceByVisitId(assessmentVisitId)`、`listEvidenceByPatientId(patientId)`、`listAttachedEvidenceByItemResponseId(itemResponseId)`。
- 上游调用方：当前暂无公开 Controller；预期供后续评估执行、计分、报告或科研导出等后端业务模块内部读取媒体证据元数据。
- 下游依赖：`MediaEvidence` Mongoose Model。
- 边界：不创建、更新、删除媒体证据；不实现媒体上传、下载、签名 URL、Storage 调用、文件删除、状态流转、图片压缩、OCR、图像识别、手写轨迹解析、自动计分、报告、AI、认证、权限或公开媒体 API。
- 测试覆盖口径：`backend\src\modules\media\services\media-evidence.service.spec.ts`，覆盖 evidence code 规范化、查无返回 `null`、mapper 输出、按题目作答 / 量表实例 / 访视 / 患者读取、attached / locked 过滤读取、schema collection、索引、内嵌子文档 `_id: false` 和关键字段显式类型；不连接真实 MongoDB，不调用 Storage / OSS，测试数据为脱敏人工样例。

## 4. 后续同步规则

- Service 事实以实际代码、模块边界和测试为准。
- 不得将未确认业务流程写成已实现 Service 能力。
- 跨模块调用、事务和一致性要求应在实现后及时补充。
