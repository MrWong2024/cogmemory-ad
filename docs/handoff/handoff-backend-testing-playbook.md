# CogMemory AD / 智忆评 后端验证手册

## 1. 文档定位

本文档用于记录 CogMemory AD 后端验证命令、测试分层口径、医疗与量表数据测试红线，供后续开发和交接使用。

## 2. 当前状态

- 当前 `backend\package.json` 已初始化公共骨架脚本。
- 当前未初始化 `backend\src`、`backend\test`、`backend\scripts`。
- 后端默认端口为 `5002`；本地前端默认端口为 `3002`，本地 `FRONTEND_URL` / `CORS_ORIGIN` 示例为 `http://localhost:3002`。
- 测试环境 `STORAGE_DRIVER=fake`，不需要 `OSS_BUCKET` / `OSS_OBJECT_PREFIX`。
- 测试环境 `LLM_PROVIDER=stub`，不得依赖真实大模型调用。
- 本任务不安装依赖，不执行构建、单元测试或 E2E 测试。
- 当前不编写测试代码，不定义真实后端测试用例。

## 3. 当前 package.json 脚本

- `build`
- `format`
- `start`
- `start:dev`
- `start:debug`
- `start:prod`
- `lint`
- `lint:fix`
- `lint:file`
- `lint:file:fix`
- `test`
- `test:watch`
- `test:cov`
- `test:debug`
- `test:e2e`

## 4. 当前可执行性说明

- 由于本任务不迁移 `src`、`test`、`scripts`，`build`、`lint`、`test`、`test:e2e` 是否可执行必须以当前实际文件和依赖安装状态为准。
- `lint` 与 `lint:fix` 当前只覆盖标准 `src` / `test` TypeScript glob，不引用未迁移的 `scripts` 目录。
- `test:e2e` 仍是公共骨架脚本，实际 E2E 配置和用例待后续初始化 `backend\test` 后确认。
- 本任务不执行 `npm install`、`npm run build`、`npm test` 或 `npm run test:e2e`。
- 本任务不执行真实 OSS、阿里云 SMS、大模型或数据库生产环境测试。
- 测试环境不得调用真实 OSS、真实阿里云 SMS 或真实 LLM；相关配置仅为占位口径。

## 5. 后端单元测试口径

- 后续 Service 或纯业务规则实现后，单元测试应覆盖规则、边界、错误分支和副作用。
- 当前暂无已确认 Service 或业务规则，具体测试范围待后续实际代码确定。

## 6. Controller / DTO 测试口径

- 后续新增 Controller、请求参数或 DTO 时，应验证参数转换、必填性、校验规则、默认值和错误响应。
- 当前暂无已确认 Controller 或 DTO，具体测试范围待后续实际代码确定。

## 7. E2E 测试口径

- 后续 E2E 必须遵循 `docs\e2e-testing.md`。
- E2E 应用于验证真实 HTTP 链路、权限、全局管道、模块装配和关键闭环。
- 当前暂无已确认 E2E 用例，待后续初始化 `backend\test` 后补充。

## 8. 医疗与量表数据测试红线

- 测试不得使用真实患者数据、真实身份证号、真实手机号、真实病历号或其他可识别个人信息。
- 量表测试数据应使用脱敏样本或人工构造样本。
- 不得调用真实短信、真实阿里云 SMS、支付、医保、医院 HIS/LIS/PACS、对象存储生产环境或真实大模型服务，除非未来单独定义受控集成测试。
- 不得在测试断言中生成真实医疗诊断结论。

## 9. 后续同步规则

- 后端新增或调整测试脚本后，应同步更新自动验证命令。
- 新增 Service、Controller、DTO、权限或 E2E 用例后，应同步补充对应验证口径。
- 测试数据、截图和日志不得包含可识别个人信息。
