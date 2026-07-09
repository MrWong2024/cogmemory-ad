# CogMemory AD / 智忆评 后端事实快照

## 1. 文档定位

本文档用于记录 CogMemory AD 后端当前事实快照，帮助后续交接时快速判断后端工程、模块、接口和验证能力的真实状态。

## 2. 当前工程状态

- `backend\src` 公共底座已初始化。
- 已具备 NestJS 启动入口、根模块、全局应用配置、健康检查、配置加载与校验、MongoDB 连接底座、全局 ValidationPipe、全局异常过滤器和 Storage 公共模块。
- `backend\src\modules` 当前包含 `storage`、`scales`、`patients` 与 `assessments`。
- `StorageModule` 当前只提供 fake / OSS 底层 driver 结构和 `STORAGE_SERVICE` token，不提供业务上传接口。
- `ScalesModule` 当前只提供量表定义 / 量表版本 Schema 与内部 `ScalesService` 读取底座，不提供公开业务接口。
- `PatientsModule` 当前只提供患者 / 受试者基础档案 Schema 与内部 `PatientsService` 读取底座，不提供公开业务接口。
- `AssessmentsModule` 当前只提供访视 / 量表实例运行时 Schema、题目作答数据 Schema 与内部 `AssessmentsService` 读取底座，不提供公开业务接口。
- OSS 业务上传服务、SMS Service、LLM Service 均未实现。
- 本地默认后端端口为 `5002`。
- 本地默认前端 origin 为 `http://localhost:3002`。
- `GET /health` 是当前唯一公共接口。
- 已完成后端公共底座基础闭环本地验证：`npm install` 成功、`npm run build` 成功、`npm test -- --runInBand` 成功、`npm run start:prod` 启动成功。
- 单元测试验证结果为 6 个测试套件通过、44 个测试通过。
- 后端 TypeScript 编译根目录为 `.`，`outDir` 保持 `./dist`，因此 `src/main.ts` 编译后的主入口产物为 `dist/src/main.js`。
- `package.json` 中 `start:prod` 保持指向 `./dist/src/main.js`，当前 build 产物路径已与该启动路径对齐。
- `tsBuildInfoFile` 保持 `./dist/tsconfig.build.tsbuildinfo`；`dist` 与 `*.tsbuildinfo` 均作为生成物处理，不作为项目源文件纳入版本库。
- 用户已补充验证 `npm run start:prod` 本地启动成功；该验证只代表公共底座本地基础启动链路通过，不代表真实生产环境部署完成。
- 当前不得写成完整业务后端已经实现。

## 3. 当前已确认后端事实

- 项目名称为 CogMemory AD / 智忆评。
- health 响应 service 为 `cogmemory-ad-backend`。
- MongoDB 默认命名口径为 `cogmemory_ad_dev`、`cogmemory_ad_test` 和 `cogmemory_ad`。
- Session cookie 默认名为 `cogmemory_ad_session`。
- Storage object prefix 默认值为 `cogmemory_ad`。
- development / test 默认 `STORAGE_DRIVER=fake`，production 默认 `STORAGE_DRIVER=oss`。
- OSS、SMS、LLM 配置均为占位或示例口径，不包含真实密钥。
- OSS 业务上传服务、SMS Service、LLM Service、业务上传接口均未实现。
- 当前已有 `scales`、`patients` 与 `assessments` 内部模型底座，其中 `assessments` 已包含 `AssessmentVisit`、`ScaleInstance` 与 `ItemResponse`；但无公开业务 API、认证、真实患者建档流程、评估执行业务接口、作答提交、媒体证据、计分或报告。
- 当前 `start:prod` 与 TypeScript build 主入口产物路径均指向 `dist/src/main.js`，并已完成本地启动验证。
- 本次仅使用指定外部 GitHub commit `b302b8af7b7ac9cc558939dc1b38ace0976c65b3` 作为后端公共底座来源，不继承其业务事实。

## 4. 当前 scales 模型底座

- `ScaleDefinition` Schema 位于 `backend\src\modules\scales\schemas\scale-definition.schema.ts`。
- `ScaleDefinition` collection 为 `scale_definitions`，使用 `timestamps: true`，不在 class 中重复声明 `createdAt` / `updatedAt`。
- `ScaleDefinition` 当前覆盖稳定量表编码、名称、简称、说明、分类、状态、当前版本引用、排序和标签。
- `ScaleDefinition` 当前索引为 `{ code: 1 }` unique 与 `{ status: 1, sortOrder: 1 }`。
- `ScaleVersion` Schema 位于 `backend\src\modules\scales\schemas\scale-version.schema.ts`。
- `ScaleVersion` collection 为 `scale_versions`，使用 `timestamps: true`，不在 class 中重复声明 `createdAt` / `updatedAt`。
- `ScaleVersion` 当前覆盖量表引用、量表 code、版本、CRF 版本、评分规则版本、字段编码版本、来源材料、状态、总分范围、分组配置、题目配置、质控规则、报告规则、科研导出映射、生效时间和退役时间。
- `ScaleVersion` 当前索引为 `{ scaleDefinitionId: 1, version: 1 }` unique、`{ scaleCode: 1, version: 1 }`、`{ scaleCode: 1, status: 1 }`。
- 内嵌 group / item 配置已预留指导语、作答类型、得分范围、是否计入总分、认知域、证据类型、计时、图片上传、平板手写、操作者备注、质控规则、报告规则和科研导出映射等字段。
- 当前未写入 MMSE / MoCA 种子数据，未实现评估执行业务流程、作答记录、媒体证据、自动计分、报告或 AI。

## 5. 当前 patients / assessments 运行时与作答模型底座

- `Patient` Schema 位于 `backend\src\modules\patients\schemas\patient.schema.ts`。
- `Patient` collection 为 `patients`，使用 `timestamps: true`，不在 class 中重复声明 `createdAt` / `updatedAt`。
- `Patient` 当前覆盖受试者稳定编码、展示名、来源类型、性别、出生日期、受教育年限、利手、状态、标签、备注、脱敏外部引用和扩展 metadata。
- `Patient` 当前索引为 `{ subjectCode: 1 }` unique、`{ status: 1, subjectCode: 1 }`、`{ sourceType: 1, status: 1 }`。
- `AssessmentVisit` Schema 位于 `backend\src\modules\assessments\schemas\assessment-visit.schema.ts`。
- `AssessmentVisit` collection 为 `assessment_visits`，使用 `timestamps: true`，不在 class 中重复声明 `createdAt` / `updatedAt`。
- `AssessmentVisit` 当前覆盖患者引用、受试者编码快照、访视编码、访视类型、状态、评估日期、开始 / 完成 / 锁定 / 作废时间、操作者快照、临床上下文、备注和扩展 metadata。
- `AssessmentVisit` 当前索引为 `{ visitCode: 1 }` unique、`{ patientId: 1, assessmentDate: -1 }`、`{ subjectCode: 1, assessmentDate: -1 }`、`{ status: 1, assessmentDate: -1 }`。
- `ScaleInstance` Schema 位于 `backend\src\modules\assessments\schemas\scale-instance.schema.ts`。
- `ScaleInstance` collection 为 `scale_instances`，使用 `timestamps: true`，不在 class 中重复声明 `createdAt` / `updatedAt`。
- `ScaleInstance` 当前覆盖访视引用、患者引用、受试者编码快照、量表定义引用、量表版本引用、量表 code、量表版本、实例编码、实例序号、状态、施测模式、版本追溯快照、时间字段、用时、操作者快照、进度摘要占位、质控摘要占位、备注和扩展 metadata。
- `ScaleInstance` 当前索引为 `{ instanceCode: 1 }` unique、`{ assessmentVisitId: 1, scaleCode: 1, instanceNo: 1 }` unique、`{ patientId: 1, scaleCode: 1, startedAt: -1 }`、`{ status: 1, updatedAt: -1 }`、`{ scaleCode: 1, scaleVersion: 1 }`。
- `ItemResponse` Schema 位于 `backend\src\modules\assessments\schemas\item-response.schema.ts`。
- `ItemResponse` collection 为 `item_responses`，使用 `timestamps: true`，不在 class 中重复声明 `createdAt` / `updatedAt`。
- `ItemResponse` 当前覆盖访视引用、量表实例引用、患者引用、受试者编码快照、量表定义引用、量表版本引用、量表 code / version、量表实例编码快照、题目编码、CRF 编码、题目组、题目标题、题目顺序、作答类型、是否计入总分、认知域编码、题目配置快照、版本追溯、作答状态、作答来源、原始作答、结构化作答、文本记录、缺失原因、单题得分、分步结果、提示后表现、计时、证据引用占位、操作者备注、质控占位、metadata、锁定和作废时间。
- `ItemResponse` 当前索引为 `{ scaleInstanceId: 1, itemCode: 1 }` unique、`{ assessmentVisitId: 1, scaleInstanceId: 1, itemOrder: 1 }`、`{ patientId: 1, scaleCode: 1, itemCode: 1 }`、`{ scaleCode: 1, itemCode: 1 }`、`{ status: 1, updatedAt: -1 }`、`{ scaleInstanceId: 1, countsTowardTotal: 1 }`。
- 当前已建立 `Patient` -> `AssessmentVisit` -> `ScaleInstance` -> `ItemResponse` 的运行时 ObjectId 引用关系，并在 `ScaleInstance` 与 `ItemResponse` 中保存量表定义、量表版本和版本追溯快照字段。
- `AssessmentsService` 当前提供 `ItemResponse` 的最小内部读取能力：规范化 item code、按量表实例和题目编码读取单条作答、按量表实例读取作答列表、按量表实例读取已计分作答列表、按访视读取作答列表；返回结果经过 mapper，不直接返回完整 Mongoose document。
- 当前未实现真实患者建档流程、访视创建流程、真实作答提交、媒体证据、自动计分、认知域结果、报告、AI、认证或权限。

## 6. 当前尚未实现

- 尚无认证体系。
- 尚无用户管理。
- 尚无医生端或患者端业务。
- 尚无公开患者、访视、量表实例、题目作答或量表业务接口、评估、报告或诊断建议业务。
- 尚无短信发送接口。
- 尚无 AI / LLM 调用接口。
- 尚无业务 Controller 或公开业务 API。
- 当前 E2E 未执行。
- 已完成本次 `patients` / `assessments` / `app.module.ts` 定向 lint；全量 lint 当前未执行。

## 7. 后续同步规则

- 后续新增模块、接口、DTO、数据模型、Service 或测试命令后，应同步更新对应 handoff 文档。
- 本文档只记录已确认事实，不承载未确认推测。
