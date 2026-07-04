# CogMemory AD / 智忆评 后端验证手册

## 1. 文档定位

本文档用于记录 CogMemory AD 后端验证命令、测试分层口径、医疗与量表数据测试红线，供后续开发和交接使用。

## 2. 当前状态

- `backend\src` 公共底座已初始化。
- 当前存在 health controller spec、Storage service spec 和上传文件名工具 spec。
- 后端默认端口为 `5002`。
- 本地前端默认 origin 为 `http://localhost:3002`。
- 测试环境默认 `STORAGE_DRIVER=fake`。
- 测试环境 `LLM_PROVIDER=stub`，不得依赖真实大模型调用。
- 当前没有 E2E 用例。
- `tsconfig.build.tsbuildinfo` 为 TypeScript 增量构建缓存，不进入版本库。

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

- 当前已验证命令：
  - `npm install`
  - `npm run build`
  - `npm test -- --runInBand`
- 当前验证结果：
  - `npm install` 成功。
  - `npm run build` 成功。
  - `npm test -- --runInBand` 成功。
  - 3 个测试套件通过。
  - 9 个测试通过。
- 当前未验证命令：
  - `npm run lint`
  - `npm run test:e2e`
- 如果 `backend\node_modules` 存在，可执行 `npm run build` 验证 TypeScript 编译。
- 如果 `backend\node_modules` 存在，可执行 `npm test -- --runInBand` 验证单元测试。
- 如果 `backend\node_modules` 不存在，不应自动执行 `npm install`。
- 当前任务不调用真实 OSS、阿里云 SMS、大模型或生产数据库。
- `test:e2e` 脚本存在，但当前没有 E2E 用例，且本次未执行 E2E；后续新增真实 HTTP 闭环后再同步。

## 5. 当前单元测试口径

- `backend\src\app.controller.spec.ts`：验证 `GET /health` 的 controller 返回结构。
- `backend\src\modules\storage\storage.service.spec.ts`：验证 fake storage 不依赖 OSS 配置，并验证 OSS driver 缺少配置时抛出明确异常。
- `backend\src\common\utils\uploaded-filename.util.spec.ts`：验证上传文件名的编码修复、空值 fallback 与路径字符清理。

## 6. E2E 测试口径

- 后续 E2E 必须遵循 `docs\e2e-testing.md`。
- E2E 应用于验证真实 HTTP 链路、权限、全局管道、模块装配和关键闭环。
- 启动期配置变量如影响模块装配，必须在 import `AppModule` 前设置。

## 7. 医疗与量表数据测试红线

- 测试不得使用真实患者数据、真实身份证号、真实手机号、真实病历号或其他可识别个人信息。
- 量表测试数据应使用脱敏样本或人工构造样本。
- 不得调用真实短信、真实阿里云 SMS、支付、医保、医院 HIS/LIS/PACS、对象存储生产环境或真实大模型服务，除非未来单独定义受控集成测试。
- 不得在测试断言中生成真实医疗诊断结论。

## 8. 后续同步规则

- 后端新增或调整测试脚本后，应同步更新自动验证命令。
- 新增 Service、Controller、DTO、权限或 E2E 用例后，应同步补充对应验证口径。
- 测试数据、截图和日志不得包含可识别个人信息。
