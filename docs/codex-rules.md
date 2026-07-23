# Codex 执行规则

> 适用于采用 `frontend\`、`backend\`、`docs\` 目录结构的 TypeScript 全栈项目。
> 后端主要采用 NestJS、Mongoose；前端主要采用 Next.js。
> 本文档负责约束 Codex 的实际执行行为；Codex 指令的生成结构由 `docs/codex-instruction-spec.md` 负责。

---

## Agent 执行规则（强制）

- 修改 `backend\` 时，必须遵循：
  - `docs/backend-architecture.md`
  - `docs/codex-rules.md`
- 修改 `frontend\` 时，必须遵循：
  - `docs/frontend-architecture.md`
  - `docs/codex-rules.md`
- 同时修改 `backend\` 和 `frontend\` 时，必须分别遵循对应架构文档。
- 仅修改 `docs\` 时：
  - 必须遵循任务明确指定的文档范围；
  - 不要求机械引用前后端架构文档；
  - 不得顺带修改代码。
- Codex 必须严格执行按 `docs/codex-instruction-spec.md` 生成的任务边界、非目标、文档同步要求和验收要求。

---

## 职责边界（强制）

- Codex 负责在当前 Git 仓库内，按照明确指令读取、创建或修改代码、文档和配置。
- Chat 或其他评审方负责需求分析、架构判断、指令生成、代码审查和风险提示。
- 审查阶段发现问题后，应形成新的明确指令，再交由 Codex 修改。
- Codex 不得在没有明确任务边界的情况下自行扩展实现范围。

---

## 仓库边界与 Git 操作规则（强制）

- Codex 仅允许访问和修改当前 Git 仓库根目录内的文件。
- 不得通过相对路径、绝对路径、脚本或命令访问、读取或修改相邻项目及仓库外目录。
- 不得假设相邻目录中的项目、代码或文档可作为当前项目事实依据。
- 如发现当前工作目录或 Git 根目录与任务预期不一致，应停止修改并报告。
- 除非任务明确要求，否则 Codex 不得执行以下 Git 操作：
  - `git commit`
  - `git push`
  - `git pull`
  - `git merge`
  - `git rebase`
  - `git reset`
  - `git clean`
  - 创建、切换或删除分支
- 不得执行可能丢失现有修改的破坏性命令。

---

## 命令范围与搜索噪声控制（强制）

- Codex 执行只读搜索、复查和验收命令时，也必须控制范围和输出噪声。只读命令虽然不会修改文件，但过宽搜索会浪费上下文、拖慢执行并干扰判断。
- 优先使用任务明确指定的文件列表、目录或 `git diff --name-only` 结果作为命令范围。
- 检查修改范围时，优先使用：
  - `git diff --name-only`
  - `git diff --check -- <明确文件或目录>`
  - `git status --short`
- 不得为了证明“没有误改”而对仓库根目录执行宽关键词搜索。
- 除非任务明确要求全局影响面分析，否则不得从仓库根目录搜索过宽关键词，例如 `package.json`、`.env`、`backend`、`frontend`、`node_modules`、`.next`。
- 默认不得搜索生成目录、依赖目录、缓存目录和构建产物目录，包括但不限于：
  - `node_modules/`
  - `.next/`
  - `dist/`
  - `build/`
  - `coverage/`
  - `.turbo/`
  - `.cache/`
  - `out/`
  - `backend/dist/`
  - `frontend/.next/`
- 除非任务明确要求且已说明理由，不得使用会放开忽略规则或显著扩大搜索范围的参数，例如：
  - `rg --no-ignore`
  - `rg --hidden`
  - `rg -uuu`
  - `rg -g "*"`
- 如确需全局搜索，必须尽量使用明确目录、文件类型或排除规则：
  - 推荐写法：`rg -n "pattern" backend/src frontend/src docs`
  - 推荐写法：`rg -n "pattern" -g "*.ts" -g "*.tsx" backend/src frontend/src`
  - 需要排除目录时的写法：`rg -n "pattern" --glob "!**/node_modules/**" --glob "!frontend/.next/**"`
- 搜索关键词应尽量使用业务字段、函数名、接口路径、DTO 名、环境变量名等精准词，不得用过宽泛词替代精准定位。
- 如搜索结果明显异常膨胀，应停止输出，收窄路径或关键词后重试。
- Codex 输出执行结果时，不得粘贴大段无关搜索结果；应摘要说明命中的文件、行号和结论。

---

## 数据库用途判定与环境隔离（强制）

数据库用途类别只允许使用以下抽象值：

- `none`：纯文档、lint、typecheck、build、静态审计等不需要数据库的任务。
- `development`：日常开发、人工调试和本地业务验证。
- `standard_test`：unit、普通 E2E，以及允许重建或破坏测试数据的自动化测试。
- `browser_acceptance`：Browser fixture、Browser / Chrome 验收、长期保留 namespace 和 post-browser verify。
- `production_or_operations`：生产、迁移、运维或真实数据操作；仅在用户对目标环境和允许操作明确授权后允许。

强制规则：

1. 任何涉及数据库的任务，必须在连接前确定唯一的数据库用途类别。
2. 具体数据库名必须从项目级 testing playbook、项目环境约定、用户明确输入或其他明确项目文档中解析；通用规则不得硬编码任何项目数据库名。
3. `standard_test` 与 `browser_acceptance` 不得共用会被破坏性重置的数据库；namespace 级隔离不能替代数据库级隔离。
4. 同一任务包含多种数据库用途时，必须为每种用途启动独立进程并分别注入进程级环境变量；禁止复用已经设置数据库连接的 shell 上下文，也不得用一份全局环境配置同时服务不同用途。
5. 建立实际连接后，必须读取真实数据库名并与任务声明的允许数据库逐字校验。
6. 实际数据库与任务声明不一致时，必须立即停止；禁止自动回退、猜测或改连其他数据库。
7. 无法唯一解析数据库用途类别或具体数据库时，必须停止并询问用户，不得自行选择。
8. `none` 类任务必须保持不连接数据库，且不得无故启动应用、fixture、测试后端或其他会建立数据库连接的进程。
9. `production_or_operations` 必须同时取得用户对目标环境和允许操作的明确授权；缺少任一项都必须停止。
10. 数据库密码、完整连接串和其他 Secret 默认属于严格保护对象。production 或 operations、真实业务数据环境、日常开发环境、可访问非隔离环境或真实数据的凭据，以及未经用户明确授权的任何 Secret，均不得出现在 Codex 指令正文、仓库文件、持久配置、日志、生成物、最终报告或提交记录中。
11. `standard_test` 与 `browser_acceptance` 中，只能访问本地或等价隔离的目标测试数据、无权访问生产或真实业务数据及其他非目标数据库、且不被其他环境复用的确定性凭据，统一作为“本地隔离测试专用固定凭据”按普通测试凭据处理。该规则同时覆盖两种用途的数据库用户密码，unit / E2E / fixture 创建的测试应用用户密码、E2E 创建的测试账号密码、Browser 验收测试账号密码，以及其他满足上述隔离条件的确定性测试凭据；此类凭据不得用于 `development`、`production_or_operations`、真实业务数据或任何非目标数据库。
12. 符合上一条条件的固定测试凭据默认全自动使用：Codex 可以从项目约定且被 Git 忽略的本地凭据文件读取，或由同一隔离父进程稳定注入，并自动传递给对应的独立目标进程环境变量或测试数据构造流程。除非用户明确另有要求，不得机械强制剪贴板授权、一次性密码、每次重新生成、Secret Manager、人工输入、人工交互或每次向用户询问。
13. 对同一个 fixture namespace 中的同一组测试应用账号，所有实际创建、替换、认证或校验账号密码的命令和独立子进程，必须在整个生命周期使用同一个稳定凭据来源和同一个确定密码值。该范围覆盖 prepare 或受控 replace、prepared verify、Browser 登录与角色 Session、post-browser verify，以及其他实际执行密码校验的进程；不执行密码校验的 cleanup 无需人为增加该依赖。稳定性必须跨命令、跨进程和跨阶段保持，不能只保证单个 prepare 命令内部一致。禁止随机或逐次生成密码，禁止使用临时包装命令、时间、进程或命令级派生值，禁止从数据库 URI、数据库用户密码或无关 Secret 派生，也禁止因父进程未稳定配置凭据而临时构造新值或向不同阶段注入不同值。固定凭据只能来自项目约定且被 Git 忽略的本地凭据文件，或由同一隔离父进程稳定注入目标环境变量，不得通过 CLI 参数传递。
14. 如已准备的 namespace 因固定凭据不一致而无法通过账号密码校验，不得反复执行 verify、手工补插或修改数据库账号、降低账号有效性或密码校验标准，也不得把 verify 未执行、未通过或密码校验失败记为 prepared gate 通过。必须在继续遵守显式确认、namespace ownership 和数据库隔离规则的前提下，使用正确的固定凭据执行受控 replace，再在完全相同的稳定凭据环境中执行只读 prepared verify；只有该门禁通过后才能进入 Browser。
15. 固定测试凭据可以从项目约定的本地忽略文件读取，但不得复制到 Git 跟踪文件、文档、日志、manifest、截图、生成物、最终报告或提交记录，也不得随 commit 进入版本库；具体 Codex 指令仍可填写允许和禁止的具体数据库名，但不得回显密码或完整连接串。
16. 固定测试凭据不要求仅为了保密而在每一步或命令结束后立即清空。`standard_test` 与 `browser_acceptance` 的配置不得叠加加载到同一进程；同一 shell 将切换数据库用途或被复用时，必须优先启动独立进程，或在切换前清除或覆盖数据库主连接变量、管理连接变量、项目定义的数据库用途变量及其他用途相关变量。具体变量名必须从项目级 testing playbook、项目环境约定、任务声明或用户明确输入中解析；通用规则不得硬编码项目专属变量名。该清理是防止串库的数据库隔离要求，不是密码保密仪式，也不得依赖旧变量或后加载覆盖行为选择数据库。
17. 上述有限规则不削弱第 10 条的默认严格保护范围；`development`、`production_or_operations`、真实业务数据环境、可访问非隔离环境或真实数据的凭据，以及未经授权的其他 Secret，仍必须按严格保护对象处理。

---

## 依赖与版本控制规则（极其重要｜强制）

1. **依赖安装权归属**
   - 所有第三方依赖必须由人类开发者决定并安装。
   - Codex 不得擅自决定是否引入依赖，也不得决定版本号。

2. **依赖清单修改禁令**
   - Codex 不得擅自新增、删除或升级依赖。
   - Codex 不得擅自修改 `package.json` 中的 `dependencies`、`devDependencies`、`optionalDependencies`。

3. **`@types/*` 包禁令**
   - Codex 不得擅自引入任何 `@types/*` 包。
   - 如某依赖是否需要额外类型定义存在不确定性，应由人类开发者判断。

4. **缺失依赖的处理方式**
   - 如实现过程中发现缺少第三方依赖，Codex 只能：
     - 明确指出依赖名称；
     - 说明依赖用途；
     - 给出建议版本。
   - 不得修改依赖清单，不得生成安装行为。

5. **版本事实依据**
   - 已初始化项目必须以当前 `package.json`、锁文件、配置文件和仓库实际代码为事实依据。
   - 未初始化项目的 Node.js 版本、依赖版本和初始化方案由人类开发者明确决定。
   - Codex 不得仅凭经验自行升级、降级或替换依赖版本。

6. **锁文件约束**
   - 除非任务明确允许，Codex 不得主动修改 `package-lock.json`、`pnpm-lock.yaml`、`yarn.lock` 等依赖锁文件。
   - 不得为了消除无关差异重新生成锁文件。

---

## 代码生成风格约束（强制）

- 代码的最终格式以项目现有 Prettier 结果为准。
- Codex 不得为了个人格式偏好绕过 Prettier。
- `// prettier-ignore` 只能局部、谨慎、有明确理由地使用，不得作为逃避整体格式化规范的常规手段。
- 以下场景允许使用 `// prettier-ignore`：
  - 装饰器密集代码因自动格式化显著降低可读性；
  - 需要保持稳定结构的局部示例代码；
  - 已确认存在 TypeScript、ESLint、Parser 或 IDE 工具链兼容问题。
- 使用 `// prettier-ignore` 时，应确保理由清晰且作用范围最小化。

---

## Schema timestamps 约束（强制｜红线）

当 Codex 生成或修改 Mongoose Schema 时：

- 如 Schema 使用：

  ```ts
  @Schema({ timestamps: true })
  ```

- 则禁止在 Schema class 中声明以下字段：
  - `createdAt`
  - `updatedAt`
  - 以及 `timestamps` 自定义映射后的等价字段名
- 以上字段必须完全由 Mongoose `timestamps` 机制维护。

违规处理：

- 任何包含上述重复声明的 Schema 修改，视为无效修改，应回滚并重新执行。

---

## Mongoose Schema `@Prop` 类型可推断性约束（强制｜红线）

当 Codex 生成或修改 NestJS Mongoose Schema（`@nestjs/mongoose`）时：

- 对任何 `union`、`nullable`、`ambiguous` TypeScript 类型字段，必须在 `@Prop()` 中显式声明 `type`，禁止依赖 `reflect-metadata` 自动推断。
- 典型情形包括但不限于：
  - `Date | null`
  - `string | null`
  - `Types.ObjectId | null`
  - `A | B`
  - `X & Y`

示例（合法）：

```ts
@Prop({ type: Date, default: null })
archivedAt?: Date | null;
```

示例（非法）：

```ts
@Prop()
archivedAt?: Date | null;
```

违规处理：

- 任何未显式声明 `type` 且使用上述类型的 Schema 修改，视为无效修改，应回滚并重新执行。

---

## Mongoose Schema 枚举字段显式 primitive type 约束（强制｜红线）

当 Codex 生成或修改 NestJS Mongoose Schema（`@nestjs/mongoose`）时：

- 对任何字符串枚举、数字枚举、字面量联合或具有明确枚举语义的字段，只要 `@Prop()` 中使用了 `enum`，或字段 TypeScript 类型不是简单稳定可反射的基础原始类型，就必须在 `@Prop()` 中显式声明 primitive `type`（如 `String`、`Number`）。
- 禁止依赖 `reflect-metadata` 自动推断这类字段的类型。

示例（合法）：

```ts
@Prop({ type: String, enum: StatusEnum, default: StatusEnum.Active })
status!: StatusEnum;
```

示例（非法）：

```ts
@Prop({ enum: StatusEnum, default: StatusEnum.Active })
status!: StatusEnum;
```

说明：

- 本规则用于降低 `CannotDetermineTypeError` 与 Schema metadata 推断失败风险。
- 本规则与上一条规则互补：
  - 上一条覆盖联合、可空、歧义类型；
  - 本条额外覆盖枚举语义字段，即使字段不是联合或可空类型，也必须显式声明 primitive `type`。

违规处理：

- 任何命中上述枚举语义风险模式但未显式声明 primitive `type` 的 Schema 修改，视为无效修改，应回滚并重新执行。

---

## 工具链兼容性写法约束（强制）

- 默认以项目现有 Prettier、ESLint 和 TypeScript 配置为准。
- 仅在已确认现有工具链对特定换行、链式调用写法或尾逗号存在兼容问题时，才优先采用兼容性写法。
- 不得把单行链式调用、单行箭头函数或去除尾逗号机械应用为所有项目的绝对格式要求。
- 涉及后端 Service 层或类似逻辑代码时，可在已确认兼容性问题的前提下优先采用更稳定的局部写法。
- 如需判断工具链兼容约束，应引用对应架构文档中的相关规范，不得依赖具体章节编号。

---

## Mongoose Lean 查询的类型约束（强制）

Codex 在生成或修改后端查询逻辑时，如使用 Mongoose `.lean()` 查询，并将结果传入 mapper、serializer、DTO builder、response builder，或在后续逻辑中访问 `_id`、`createdAt`、`updatedAt`、populate 字段、select / 投影字段、聚合字段，必须显式建模查询结果类型。

具体要求：

- 不得使用 `as any`、隐式断言或双重断言绕过类型约束。
- 不得把 `.lean()` 查询结果直接当作完整 Mongoose document 使用。
- 不得把 `select`、投影或聚合结果声明为完整 Schema 实体类型。
- mapper、serializer、DTO builder、response builder 的入参类型必须表达其实际读取字段。
- 如果读取 `_id`，类型中必须显式包含 `_id` 字段。
- 如果读取 `createdAt`、`updatedAt`，类型中必须显式包含对应字段。
- 对 `findOne().lean()` 结果必须处理 `null`。
- 对 `find().lean()` 结果必须明确数组元素类型。
- 对 populate 结果必须明确被填充字段结构，不得假设其仍是原始 id 或完整 document。
- 对 aggregate 或投影阶段后的结果，不得套用原 Schema 类型，应定义聚合或投影结果类型。
- 不得为了绕过 lean 类型问题而去掉 `.lean()`，除非当前任务明确要求改变查询策略，并说明性能与行为影响。
- 不得为了消除 TypeScript 报错而删除字段访问、删除返回字段或改变业务语义。

类型组织方式：

- 局部只用一次的类型，优先在当前 service 文件就近定义。
- 多处复用且语义稳定的类型，才考虑提取到模块级 `interfaces`、`types` 或等价位置。
- 可以使用仓库已有的类型；但如果仓库尚未形成某个全局工具类型范式，Codex 不得为解决局部问题擅自创建全局类型。
- 不得为解决局部 lean 类型问题擅自引入 `WithTimestamps<T>`、`WithId<T>` 等项目级通用类型；需要 `_id` 或 timestamps 字段时，应按实际查询结果在局部类型中显式声明字段。

示例：

```ts
import { Types } from 'mongoose';

type ProjectSummaryLean = {
  _id: Types.ObjectId;
  projectNo: string;
  name: string;
  status: string;
  createdAt?: Date;
  updatedAt?: Date;
};

function toProjectSummaryResponse(project: ProjectSummaryLean) {
  return {
    id: project._id.toString(),
    projectNo: project.projectNo,
    name: project.name,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

const projects = await this.projectModel
  .find(filter)
  .select({ projectNo: 1, name: 1, status: 1, createdAt: 1, updatedAt: 1 })
  .lean<ProjectSummaryLean[]>()
  .exec();

return projects.map(toProjectSummaryResponse);
```

违规处理：

- 违反上述约定的修改，视为无效修改，应回滚并重新执行。

---

## 执行策略约束（防越界）

- 仅实现指令明确要求的内容。
- 不得提前实现后续阶段。
- 如当前任务目标为骨架、结构就位或最小闭环，允许最小实现。
- 不得为了所谓完整性擅自扩大范围。
- 如实现过程中发现任务前提不足、接口不明确或缺少必要依赖，应停止对应部分并报告，不得自行创造业务规则。
- 不得顺手重构与任务无直接关系的代码。

---

## 验证规则（强制）

- 仅执行当前 `package.json` 中真实存在的脚本，不得凭空假设存在 `lint:file`、`test:e2e` 等命令。
- 对代码修改，优先执行与本次修改范围匹配的 `build`、`lint` 和测试。
- 修改少量文件时，优先使用已有的定向检查能力。
- 不默认执行带自动修复或大范围写入效果的命令。
- 不得为了修复全量检查中的既有范围外错误，修改非本次任务文件。
- 如全量检查失败，必须区分：
  - 本次修改导致的问题；
  - 仓库原有或任务范围外的问题。
- `backend\` 和 `frontend\` 应分别在各自目录执行对应验证命令。
- 纯文档任务通常只需执行差异检查、关键词检查和仓库状态检查，不应机械执行前后端构建。

---

## 后端 TypeScript 全量类型检查门禁（强制）

### 触发范围

凡任务修改以下任一内容，必须在 `backend` 目录执行 `npm run typecheck`：

- `backend/src/**/*.ts`
- `backend/test/**/*.ts`
- `backend/scripts/**/*.ts`
- `backend/**/*.spec.ts`
- `backend/**/*.e2e-spec.ts`
- `backend/test/support/**/*.ts`
- `backend/tsconfig*.json`
- `backend/package.json` 中会影响 TypeScript、测试或构建的 script

以下情况均不得免除全量类型检查：

- 即使只修改一个 spec，也必须执行。
- 即使只修改一个 E2E，也必须执行。
- 即使 Jest 实际运行通过，也必须执行。
- 即使 build 通过，也必须执行。
- 即使修改主要是类型、fixture、mock 或 helper，也必须执行。

### 命令口径

- 固定命令：`npm run typecheck`。
- 执行目录：`backend`。
- 不得用临时 `npx tsc` 命令替代正式 package script 作为最终验收。
- 不得只检查某个文件或目录后宣称全量类型检查通过。
- 不得改用 `tsconfig.build.json` 替代 `tsconfig.typecheck.json`。
- 不得在命令尾部过滤错误输出。
- 不得使用 `|| true`、PowerShell 等价吞错写法、修改脚本吞掉退出码或忽略退出码。

### 不可替代性

- build 只验证其编译范围，不能替代全量 typecheck。
- Jest 运行测试不代表所有测试源码已完成全量 TypeScript 检查。
- lint、unit 和 E2E 均不能替代 typecheck。
- typecheck 是独立门禁，必须在结果中单独报告。

### 完成标准

`npm run typecheck` 必须同时满足以下条件才算通过：

- 命令退出码为 0。
- TypeScript errors 为 0。
- 没有通过 exclude 排除失败文件。
- 没有降低 TypeScript 严格度。
- 没有新增 suppression。
- 没有生成应进入 Git 的编译产物或缓存文件。

### 失败处理

如果 `npm run typecheck` 失败，必须报告：

- 错误总数。
- 涉及文件。
- 错误码。
- 哪些错误属于本次修改。
- 哪些错误属于任务前既有问题。

本次修改引入的错误必须修复。任务范围外既有问题不得被静默修改。如果任务目标要求全量后端门禁，`npm run typecheck` 未通过时不得宣称后端任务完成。

不得为了制造 typecheck 通过而：

- 修改 exclude 排除失败文件。
- 关闭 `strictNullChecks` 或降低其他 TypeScript 严格度。
- 新增 `any` 消音。
- 添加双重断言。
- 添加批量非空断言。
- 添加 `@ts-ignore` 或 `@ts-expect-error`。
- 删除或跳过测试。
- 修改脚本吞掉退出码。

### 后端完整最终门禁

后端代码任务的完整最终门禁顺序固定为：

1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`
4. `npm test -- --runInBand`
5. `npm run test:e2e`

执行要求：

- 开发过程中可以执行定向 lint、定向 unit 或定向 E2E，但定向验证不能替代最终完整门禁。
- 最终代码态必须重新按上述顺序执行完整门禁。
- 后端代码、测试、script 或 TypeScript 配置任务默认执行完整门禁。
- 五项结果必须分别报告，不得合并表述为“静态验证通过”或“测试通过”。
- 后端代码任务如因环境原因无法执行完整门禁中的任一项，必须如实报告未执行项及原因，不得把该项写成通过，也不得宣称任务完成。
- `npm run typecheck` 未通过时，不得宣称后端任务完成。
- 任务指令明确不需要 E2E 的纯文档或非代码任务，按任务范围执行文档与 Git 检查，不机械运行上述门禁。

---

## 后端测试分层策略（强制）

后端任务应按变更风险选择测试层级，不要求所有规则变化都新增 E2E，也不得把 `service.spec.ts` 视为真实 HTTP 链路的替代品。

1. **`service.spec.ts`：覆盖规则与边界**
   - 适用于业务规则、状态机、聚合统计、优先级、边界条件、错误分支和副作用。
   - 规则类变更优先补 `service spec`，不必为了纯计算规则强行搭建完整 HTTP 或数据库链路。

2. **`controller.spec.ts` / DTO validation：覆盖参数与校验层**
   - 适用于请求参数、DTO 字段、`ValidationPipe`、默认值、参数转换以及 controller 到 service 的参数传递。
   - 新增 query 参数或 DTO 字段时，不能只写 `service spec`；至少应补 `controller spec`、DTO validation 测试或确认已有等价覆盖。

3. **`backend/test/*.e2e-spec.ts`：覆盖真实 HTTP 与关键闭环**
   - 适用于真实 HTTP、权限、Guard、认证状态、全局 Pipe、数据库读写、模块装配和跨模块关键闭环。
   - 通用闭环示例应表述为“认证请求 -> 数据写入 -> 派生结果读取”这类真实链路验证，而不是具体领域流程。
   - E2E 用于验证真实链路，不应用来承载所有边界条件；大量规则边界应下沉到 `service spec` 或 controller/DTO 测试。

4. **选择规则**
   - 规则类任务：优先 `*.service.spec.ts`。
   - 参数、DTO、`ValidationPipe` 类任务：优先 `*.controller.spec.ts`、DTO validation 测试或等价覆盖。
   - 权限、路由、Guard、真实 HTTP 行为：考虑 `*.e2e-spec.ts`。
   - 涉及 controller、query、DTO、`ValidationPipe`、Guard、权限、接口路径的任务，不能只补 `service spec`。

---

## 文档同步执行规则（强制）

- Codex 必须按照当前任务中“〖文档同步要求〗”列出的范围同步文档。
- 不得自行创建任务未要求的新文档。
- 不得为了形式完整修改与本次任务无关的文档。
- 如任务要求同步的文档不存在，或发现指令遗漏了明显必要的文档同步，应报告情况，不得擅自扩大范围。
- 纯文档通用化任务无需机械创建 `handoff` 文档。

---

## 违规处理原则（默认）

- 如 Codex 行为违反以上明确标注为“强制”的约束，视为无效修改，应回滚并重新执行。
- 仅涉及展示形式且不影响语义、工具链稳定性或类型安全的问题，不作为回滚依据。
