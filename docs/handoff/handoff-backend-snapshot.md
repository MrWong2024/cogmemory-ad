# CogMemory AD / 智忆评 后端事实快照

## 1. 文档定位

本文档用于记录 CogMemory AD 后端当前事实快照，帮助后续交接时快速判断后端工程、模块、接口和验证能力的真实状态。

## 2. 当前工程状态

- `backend\src` 公共底座已初始化。
- 已具备 NestJS 启动入口、根模块、全局应用配置、健康检查、配置加载与校验、MongoDB 连接底座、全局 ValidationPipe、全局异常过滤器和 Storage 公共模块。
- `backend\src\modules` 当前只包含 `storage`。
- `StorageModule` 当前只提供 fake / OSS 底层 driver 结构和 `STORAGE_SERVICE` token，不提供业务上传接口。
- OSS 业务上传服务、SMS Service、LLM Service 均未实现。
- 本地默认后端端口为 `5002`。
- 本地默认前端 origin 为 `http://localhost:3002`。
- `GET /health` 是当前唯一公共接口。
- 已完成后端公共底座基础闭环本地验证：`npm install` 成功、`npm run build` 成功、`npm test -- --runInBand` 成功、`npm run start:prod` 启动成功。
- 单元测试验证结果为 3 个测试套件通过、9 个测试通过。
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
- 当前无业务模块、业务 API、认证、量表、评估或报告。
- 当前 `start:prod` 与 TypeScript build 主入口产物路径均指向 `dist/src/main.js`，并已完成本地启动验证。
- 本次仅使用指定外部 GitHub commit `b302b8af7b7ac9cc558939dc1b38ace0976c65b3` 作为后端公共底座来源，不继承其业务事实。

## 4. 当前尚未实现

- 尚无认证体系。
- 尚无用户管理。
- 尚无医生端或患者端业务。
- 尚无量表、评估、报告或诊断建议业务。
- 尚无短信发送接口。
- 尚无 AI / LLM 调用接口。
- 尚无业务 Schema、业务 Controller、业务 Service 或业务 API。
- 当前 E2E 未执行。
- 当前 lint 未执行。

## 5. 后续同步规则

- 后续新增模块、接口、DTO、数据模型、Service 或测试命令后，应同步更新对应 handoff 文档。
- 本文档只记录已确认事实，不承载未确认推测。
