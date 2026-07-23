# CogMemory AD / 智忆评 前端验证手册

## 1. 文档定位

本文档是前端验证的 active playbook，只维护当前静态门禁、Browser 通用验收策略、仍待执行的 Batch C / D / E 合同，以及已完成范围的最终证据索引。已完成 B1–B6、B16、B17 的逐场景操作、失败过程、旧端口、旧 namespace 和重复命令由 Git 历史追溯，不在本文继续累积。

本文档不改变产品、接口、DTO、Schema、测试合同或 roadmap。下文 B7–B15 的阶段内序号保持减肥前基线顺序，序号即该阶段稳定验证项；不得重排、合并或用数量摘要替代验证意图。

## 2. 当前验证状态总表

| 范围 | 当前状态 | 唯一当前事实 |
|---|---|---|
| WP-02 / B16 | 已完成 | replacement V2+ 生命周期矩阵、Resume / unsafe 边界和 Web Storage 最终审计均已关闭 |
| WP-04 / B17 | 已完成 | 44 个 scenarioKey 全部通过，正式 fixture 双次 cleanup，残留为 0 |
| Batch A / B1–B3 | 已完成 | 67 个验证原子全部有明确处置，正式 fixture 双次 cleanup，残留为 0 |
| Batch B / B4–B6 | 桌面范围已完成 | Browser 133 + automated boundary 2 = 135；post-browser verify 通过；双次 cleanup `residualCount=0`；产品缺陷 0 |
| Batch C / B7–B10 | 尚未启动 | 本文第 5 节是当前待验合同 |
| Batch D / B11–B15 | 尚未启动 | 包含 B14.1 当前仍待验的 Browser 行为等价回归；本文第 6 节是当前待验合同 |
| Batch E | 保留 8 项 | 真实设备、辅助技术或人工验收；不被桌面 Browser、大屏抽查或 automated boundary 替代 |

Batch B 的正式 namespace 和临时文件已经删除，不存在“尚待 post-browser verify”或“下一步重建 Batch B 终态”的当前任务。Batch C / D 尚未准备正式 fixture，也未执行 Browser；不得把 B16 / B17 或 Batch A / B 的证据外推为 B7–B15 已通过。

## 3. 标准静态门禁

在 `frontend` 目录且既有 `node_modules` 存在时，最终前端代码态执行：

1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`

三项必须分别报告，互不替代。lint 不证明类型和路由生成；typecheck 不证明 production build；build 不替代 lint 或全量 TypeScript 检查。定向检查只用于开发反馈，不能替代最终三项门禁。

若 `frontend/node_modules` 不存在，不得为验证擅自执行 `npm install`；应如实记录未执行项及原因。纯文档任务只执行文档与 Git 检查，不机械运行前端门禁。

静态门禁只能证明类型、白名单调用路径、App Router 路由生成和 production build，不证明真实 HTTP、Cookie / CORS、数据库状态、角色、并发、Browser 交互、响应式、键盘、Storage 或人工视觉已经通过。

## 4. Browser 通用验收策略

### 4.1 运行拓扑与 fixture 生命周期

Browser 验收必须使用 production frontend 和真实 test backend，不以 mock server、静态检查或伪造响应替代真实 HTTP。数据库用途固定为 `browser_acceptance`，后端和 fixture CLI 必须分别使用 app / `readWrite` 与 db_admin / `dbOwner` 独立进程；数据库门禁、凭据来源和 cleanup 规则见 backend testing playbook。

每个 Batch 按同一生命周期执行：

1. 根据本文待验项设计脱敏、确定性、可回收的 fixture contract，明确每个验证项的 primary owner、前置状态和预期副作用。
2. 执行 fixture `prepare` 或显式 `replace`，再执行只读 prepared verify；前置未通过不得进入 Browser。
3. 启动 production frontend 与真实 Browser test backend，确认 health、CORS、Cookie 和 origin。
4. 执行真实 Browser 矩阵；多角色、双 Session、并发和幂等必须使用真实独立会话，写请求不得自动重试。
5. 执行只读 post-browser verify，核对最终数据库事实、请求次数、无副作用和合同计数；verify 不创建、不修复、不删除业务结果。
6. logout、关闭 Browser、停止进程，按 namespace 精确 cleanup；再执行第二次幂等 cleanup，两次均要求 `residualCount=0`。

prepare / prepared verify 只说明账号和前置数据就绪，不等于 Browser 通过；Browser 页面场景通过但没有 post-browser verify 或 cleanup，也不得宣布工程收口。旧 Batch namespace、端口和临时文件名不是未来 fixture 合同。

### 4.2 Network、Console、Storage、Cookie、CORS 与隐私

- Network：按请求类别记录 method、状态、次数、initiator 和安全 URL 模式；写请求必须验证白名单 Body、无自动 retry / polling / N+1。不得在报告中粘贴密码、动态内部 ID、完整请求体或响应体。
- Console：稳定观察窗内检查 warn/error；不得输出完整业务响应、堆栈、患者数据、报告正文、token、Cookie 或内部 lineage/source ID。
- Storage：检查 localStorage、sessionStorage、IndexedDB 的 key / database / object-store 名称和禁止模式；value 只允许在同源 runtime 内做布尔扫描，不输出实际 value。
- Cookie：只判断脚本可读 Cookie 是否为空或是否命中禁止模式，不读取 HttpOnly Cookie，不导出 Cookie 存储。
- CORS：production frontend origin 必须被精确允许，credentials 正常；不得用关闭浏览器安全策略掩盖配置问题。
- DOM / URL：不得出现密码、token、Cookie、内部 ObjectId、metadata、Storage 定位、完整临床正文或其他非公开字段。
- 登录取证：密码框仍有值时不得采集完整 DOM；提交后确认登录页卸载或密码值清空，再进行 DOM、Console 或 Storage 取证。

### 4.3 Viewport 与响应式口径

- 主业务矩阵使用 Browser 的自然内容 viewport，不启用设备模拟，不长期强制固定为 1280×720。
- 代表性响应式抽查尺寸固定为 `1280×720`、`768×900`、`390×844`；只抽查代表页，不按每个 viewport 重跑完整业务矩阵。
- 页面不得产生非预期 document/main 横向溢出；宽表格可由明确的局部容器滚动，表单、提示、操作和焦点仍须可见。
- 真正大屏只使用普通最大化 Chrome，缩放 100%，关闭会压缩页面的侧边栏、DevTools 或其他面板；必须实测 `window.innerWidth >= 1440`，外层窗口尺寸不能替代 CSS viewport。

### 4.4 键盘风险抽样

- 普通原生 `button`、`a`、`input`、`select`、`label` 不在每个场景重复完整 Tab / Shift+Tab / Enter / Space 矩阵，但仍自动检查语义、可访问名称和明显 `tabindex` 问题。
- 自定义复合控件、Modal / Dialog、菜单、下拉框、交互图表、Canvas、富文本、全局导航或焦点管理变更，以及无障碍修复，必须做真实键盘验证。
- 真实键盘验证应覆盖正向/反向焦点、适用的 Enter/Space、焦点环、退出区域和状态变化；工具不能可靠产生原生事件时标记未执行，转人工协助，不得用 DOM 属性替代。
- 明显焦点陷阱始终阻断；鼠标/触摸优先不等于取消基本可访问性。

### 4.5 结果报告

每个验证项只能是 pass、fail、not_executed 或明确 obsolete；fixture-ready、静态通过、工具限制和人工待签收不得写成 pass。报告必须区分静态门禁、Browser 场景、automated boundary、人工验收、post-browser verify、cleanup 与产品缺陷。

## 5. Batch C 当前待验合同：B7–B10

Batch C 尚未启动。以下序号与减肥前基线完全一致；fixture 设计必须覆盖列出的前置状态、角色、错误、无副作用、Network 和隐私边界。

阶段所有权口径：条目中的“页面不存在后续能力/入口”用于证明本阶段组件或动作不创建、不自动触发、不越权接管后续能力；后来已实现的 B8–B16 sibling 区域可以按当前状态合法共存。执行时应限定目标组件 DOM、请求 initiator 和动作前置状态，不得用页面全局文本误判，也不得为了满足旧阶段字面值隐藏当前合法能力。

### 5.1 B7 阶段性评分：40 项

Fixture 前置：准备 draft / in_progress / completed / locked / voided 实例，completed 无结果、已有 provisional 结果、复核队列、warning、incomplete、voided、冲突、401/403 和网络失败状态；全部为脱敏 MMSE / MoCA 数据。

1. draft / in_progress 实例不请求 latest。
2. completed 实例自动查询 latest。
3. latest 无结果显示“尚未计算”，不显示系统错误。
4. 页面加载不自动 compute。
5. 计算前出现内联说明和 checkbox。
6. 未勾选不能计算。
7. compute 只发送 confirm=true。
8. compute 期间重复按钮禁用。
9. compute 成功展示 provisional 结果。
10. alreadyComputed=true 按成功处理。
11. 页面刷新后 latest 能重新加载同一结果。
12. 有待复核项时 scorePercent 不显示。
13. 部分得分不显示成最终总分。
14. null 得分不显示成 0。
15. countsTowardTotal=false 显示过程记录。
16. groupScores 不标记为认知域。
17. reviewQueue reason 中文映射正确。
18. reviewQueue 能定位原题。
19. itemResponseId=null 不提供虚假定位。
20. 评分结果不显示原始作答。
21. 不显示 expectedValue。
22. 不显示 scoringRule。
23. 不显示正确答案或 isCorrect。
24. 不显示 reviewer 内部信息。
25. warning 不显示成诊断风险。
26. completed / locked / voided 历史结果只读。
27. locked / voided 且无结果时不能首次计算。
28. SCORE_RESULT_INCOMPLETE 显示管理员处理提示。
29. SCORE_RESULT_VOIDED 不提供重算。
30. SCORE_COMPUTATION_CONFLICT 后重新加载 latest。
31. 401 返回登录页。
32. 403 显示无权限而不是无结果。
33. 网络错误不影响题目和媒体历史展示。
34. 页面不存在重新计算按钮。
35. 页面不存在人工分数输入。
36. 页面不存在评分确认、认知域或报告入口。
37. 页面不显示诊断阈值或疾病判断。
38. 小屏幕评分区域可正常使用。
39. 未使用真实患者或医疗数据。
40. 页面没有新增路由。

### 5.2 B8 人工评分与显式确认：60 项

Fixture 前置：准备 needs_review、auto_scored、not_scored、manual_scored、最后一项待复核、warning、pending、confirmed、locked、审计上限、metadata 异常、双 Session stale、401/403 与网络失败状态。

1. needs_review 项出现人工评分入口。
2. auto_scored 项不允许人工评分。
3. not_scored 项不允许人工评分。
4. itemResponseId 为空不显示人工评分入口。
5. 人工评分输入 0 可正常提交。
6. 空分值不能提交。
7. 非有限数值不能提交。
8. 超出 min / max 前端阻止。
9. 前端不猜测 step，number input 使用 step="any"。
10. 后端 step 错误稳定显示并保留输入。
11. reviewNote 少于 3 字符不能提交。
12. reviewNote 超过 2000 字符不能提交。
13. manual-review 只发送 scoreValue、reviewNote、expectedUpdatedAt。
14. 成功后 reviewQueue 使用服务端返回并减少。
15. 成功后 total / group / item 使用服务端返回值。
16. 成功后 updatedAt 变化。
17. manualReview 显示操作者、时间和意见。
18. manual_scored 在确认前可修订，预填最新服务端分值与公开意见。
19. 同时只能打开一个人工评分表单。
20. dirty 表单阻止直接切换目标，并提供明确放弃操作。
21. dirty 人工评分或确认意见触发 beforeunload，且计数与作答 / 媒体分开。
22. SCORE_RESULT_REVIEW_CONFLICT 后保留输入。
23. 人工评分并发冲突后自动刷新一次 latest。
24. 冲突后不会自动重发 PATCH。
25. 基于旧版本的表单禁用提交。
26. 用户明确基于最新结果继续后可再次提交，且不重置输入。
27. metadata 异常禁止继续写入并提示管理员。
28. 审计上限禁止继续人工评分或修订。
29. 最后一项人工评分成功后只按服务端 computed 展示。
30. reviewQueue 清空且全部资格满足后显示确认入口。
31. 有 warning 时不显示可用确认。
32. 有 pending 项时不能确认。
33. 确认意见少于 3 字符不能提交。
34. 未勾选 checkbox 不能确认。
35. confirm 只发送 confirm、reviewNote、expectedUpdatedAt。
36. confirm 期间人工评分与重复 confirm 禁用。
37. 确认成功后 status=confirmed。
38. 确认成功后 isFinal=true 与 totalScore.isFinal 使用服务端事实。
39. qualityStatus=passed 只显示“评分复核流程已通过”。
40. 确认成功后 confirmation 安全摘要正确。
41. alreadyConfirmed=true 按成功处理且不再次 POST。
42. confirmed 页面不显示人工评分输入和确认按钮。
43. locked 页面只读，且不把 confirmed 称为 locked。
44. confirmation 缺失时不冒充施测或复核操作者。
45. confirmation conflict 后保留意见、清除 checkbox 并刷新 latest。
46. confirmation warning 不允许忽略。
47. confirmed 不显示成 locked。
48. confirmed 总分显示为确认得分。
49. groupScores 显示为分组得分，不称为认知域。
50. 评分区域不显示原始作答、expectedValue、scoringRule、正确答案或 isCorrect。
51. 页面不显示 previousScoreValue、metadata 或完整审计历史。
52. 页面不输出诊断阈值、正常 / 异常或疾病判断。
53. 页面不存在 lock、void、reopen、rerun 或 runNo=2 入口。
54. A18 401 返回登录页。
55. A18 403 显示无权限，保留已有安全结果与本地输入。
56. 网络失败保留本地人工评分与确认输入。
57. 页面刷新不保留未提交人工评分、确认意见、updatedAt 或回执。
58. 全部验证不使用真实患者或医疗数据。
59. 页面没有新增路由，题目定位不修改 URL 且不丢失各类草稿。
60. lint、typecheck、build 均通过。

### 5.3 B9 认知域计算与安全展示：52 项

Fixture 前置：准备无评分、needs_review / computed、confirmed / locked / voided ScoreResult，认知域无结果、computed / locked / voided、单域、多域、excluded、null、mapping 异常、冲突、401/403 与网络失败状态。

1. 未生成评分结果时不请求认知域 latest。
2. needs_review / computed 未确认评分不请求认知域 latest。
3. confirmed 评分自动查询认知域 latest。
4. B8 confirm 成功后自动查询一次 latest。
5. latest 无结果显示“尚未计算”，不是系统错误。
6. 页面加载不自动 compute。
7. 计算前出现重叠归因和非诊断说明。
8. 未勾选 checkbox 不能计算。
9. compute 只发送 confirm=true。
10. 本地作答 / 媒体 / 评分草稿或写请求阻止 compute。
11. compute 期间重复操作禁用。
12. compute 成功展示结果。
13. alreadyComputed=true 按成功处理。
14. 页面刷新后 latest 返回同一结果。
15. 已有结果不显示重算按钮。
16. computed 结果显示尚未独立确认。
17. locked / voided 结果只读。
18. domain score 不按分数排名。
19. scoreValue=null 不显示为 0。
20. scorePercent 只使用服务端值。
21. scorePercent 文案不是正常率或疾病概率。
22. domainScores 不进行前端求和。
23. 页面明确认知域不能相加解释为量表总分。
24. 单 domain 项展示正确。
25. 多 domain 项保留多条合法贡献。
26. 多 domain 项不平均拆分分值。
27. 同 item 同 domain 后端去重结果不被前端重复生成。
28. countsTowardDomain=false 显示排除。
29. contribution 没有伪造 minScore。
30. contribution 能定位原题。
31. itemResponseId=null 不提供虚假定位。
32. 定位不丢失其他分组草稿。
33. mapping policy 展示正确。
34. interpretation 四项安全字面值展示正确。
35. interpretation 异常时显示安全警告。
36. computation / versionTrace 展示正确。
37. source ScoreResult 摘要展示正确。
38. warning 不显示为患者风险。
39. `COGNITIVE_DOMAIN_RESULT_INCOMPLETE` 显示管理员处理提示。
40. `COGNITIVE_DOMAIN_RESULT_VOIDED` 不提供重算。
41. `COGNITIVE_DOMAIN_COMPUTATION_CONFLICT` 后刷新 latest。
42. `COGNITIVE_DOMAIN_SOURCE_SCORE_NOT_FINAL` 不自动确认评分。
43. `COGNITIVE_DOMAIN_MAPPING_UNAVAILABLE` 不提供客户端自定义映射。
44. 401 返回登录页。
45. 403 显示无权限而非无结果。
46. 网络错误不影响题目、媒体和评分展示。
47. 页面不显示原始作答、评分意见或评分规则。
48. 页面不显示诊断阈值、正常 / 异常或疾病结论。
49. 页面没有认知域人工编辑、确认、lock、void 或 rerun。
50. 页面没有新增路由。
51. 小屏幕认知域区域可正常使用。
52. 不使用真实患者或医疗数据。

### 5.4 B10 规则化临床报告草稿：95 项

Fixture 前置：准备 Visit 无报告、合法 scope、不同实例状态、draft / confirmed / voided / incomplete 报告、scope/source 冲突、缺评分/认知域/媒体、历史 confirmation、401/403 与网络失败；报告内容和意见必须脱敏且无临床含义。

1. 访视详情成功后自动查询 report latest。
2. 量表目录失败不阻止 latest。
3. latest 无报告显示正常 not_found。
4. latest 失败不清除访视详情和实例列表。
5. latest 提供独立手工重试，新请求取消旧请求，Abort 不显示错误。
6. 页面不自动 generate。
7. draft 实例不可选择。
8. in_progress 实例不可选择。
9. voided 实例不可选择。
10. completed 实例可作为候选。
11. locked 实例可作为候选。
12. completed / locked 不显示成“已满足全部报告条件”。
13. 初始不自动勾选任何实例。
14. scope 最少 1 项。
15. scope 最多 10 项。
16. 重复 ID 与非法 MongoId 被阻止且不静默去重。
17. scope 按 scaleCode / instanceNo / id 稳定顺序发送。
18. 更改 scope 后关闭确认区、清除 checkbox 与旧生成错误。
19. 全选只由用户触发且最多选择稳定前 10 项。
20. report loaded 时不显示 scope 控件。
21. Visit locked 时无首次生成入口。
22. Visit voided 时无首次生成入口。
23. 生成前显示 version 1 与 scope 固定性说明。
24. 生成前显示未使用 AI。
25. 生成前显示 draft 尚未经医生确认。
26. 生成前显示非诊断、认知域重叠和媒体仅索引边界。
27. 未勾选确认 checkbox 不能生成。
28. generate body 只发送 confirm 与 primaryScaleInstanceIds。
29. 请求不包含 snapshot、narrative、metadata、状态、版本或服务器编号。
30. generate 期间 scope 与量表初始化提交真实 disabled。
31. generate 不自动重试、不轮询、不自动刷新整页。
32. generate 成功直接展示服务端完整报告。
33. alreadyGenerated=false 显示首次生成 draft 回执。
34. alreadyGenerated=true 按成功处理并说明未重复生成。
35. 相同 scope 不显示为重生成能力。
36. scope conflict 后自动 latest 一次。
37. scope conflict 不提供覆盖或改写入口。
38. voided report 只读且不提供重生成。
39. generation conflict 后不自动重发 POST。
40. source scale not ready 保留 scope 与量表查看入口。
41. source score not final 保留 scope并引导量表评分确认。
42. source domain result required 不自动调用 A19。
43. source media invalid 不显示对象键或内部错误猜测。
44. patient inactive 显示稳定状态且不猜测患者其他状态。
45. report incomplete 不伪造空报告并提示管理员处理。
46. draft 显示“规则化报告草稿”。
47. draft 显示尚未经医生确认，不称为正式报告。
48. status / isFinal 不一致显示安全警告且不自行纠正。
49. system_draft 不显示为 AI 或医生确认。
50. quality passed 只解释流程标记，不显示患者正常。
51. patientSnapshot 仅显示 subjectCode / displayName / sex / birthDate / educationYears。
52. patientSnapshot 为 null 不从当前档案补齐。
53. visitSnapshot 只显示允许字段且不显示 clinicalContext / metadata。
54. scaleTrace 有合法 ID 时可打开既有单量表路由。
55. scaleTrace 无 ID 或非法 ID 时不伪造链接。
56. score null 不显示为 0。
57. scorePercent 只显示服务端值且不在前端计算。
58. score summary 显示为规则化安全摘要，不称为医生意见。
59. domainSnapshot 不编造 minScore。
60. domainSnapshot 不跨域求和或生成报告级认知域总分。
61. domain scorePercent 不显示成疾病概率。
62. evidenceSnapshot 不显示预览、原文件或下载。
63. evidenceSnapshot 不显示 media / item 内部 ID 或对象键。
64. A20 系统 narrative 只显示 chief / score / domain / evidence / limitations 五个安全字段；B11 clinician-owned 字段在独立分区展示。
65. narrative 使用普通文本且不使用 `dangerouslySetInnerHTML`。
66. 系统五段 narrative 不出现编辑框；B11 编辑器只出现 doctorOpinion / recommendationText。
67. narrative 不显示 trendSummary；doctorOpinion / recommendationText 仅作为临床人员明确填写内容展示。
68. generation.aiUsed=false 显示未使用 AI。
69. generation=null 时不猜测 AI 使用情况、生成时间或操作者。
70. generation actor 不重点展示 operatorId。
71. historical confirmation 只读安全展示公开字段。
72. confirmed 但 confirmation=null 时不冒充访视操作者。
73. voided 报告显示公开 voidReason。
74. report.id 不作为业务编号展示，也没有 reportId 路由。
75. 页面只提供 B11 clinician-owned 字段受控编辑，不提供系统摘要、scope 或快照编辑。
76. 页面只在 pending_confirmation 且当前角色为 doctor / admin 时提供最终确认按钮。
77. 页面没有签名按钮。
78. 页面没有 lock / archive / correct / void 按钮。
79. 页面没有重生成或 version 2。
80. 页面没有 PDF、打印模板或下载。
81. 页面没有 AI 操作或 LLM 调用。
82. 系统规则内容不输出阈值、等级、风险、诊断或治疗建议；临床人员明确填写的原文只按流程状态展示，不由系统解释。
83. A20 401 返回登录页。
84. A20 403 仅影响报告区域，不伪装成 not_found。
85. 网络错误保留当前 scope 并提供手工操作。
86. scope 不写 localStorage / sessionStorage / URL。
87. 页面刷新后未提交 scope 消失。
88. 报告区域在小屏幕保持纵向可读且无内容溢出阻断。
89. checkbox、按钮、量表链接和原生 details 支持键盘。
90. 没有新增独立报告路由。
91. 没有调用 A17 / A18 / A19 readiness 扇出或写接口。
92. 页面与文档没有使用真实患者或医疗数据。
93. `npm run lint` 通过。
94. `npm run typecheck` 通过。
95. `npm run build` 通过。

## 6. Batch D 当前待验合同：B11–B15（含 B14.1）

Batch D 尚未启动。Fixture 必须支持 doctor、admin、nurse、research_assistant、system，真实双 Session 并发，报告各生命周期状态，Patient / Visit 历史状态，审计异常、网络不确定、401/403 和稳定错误。所有 note、opinion、reason、summary 均使用无临床含义的脱敏文本。

阶段所有权口径同第 5 节：B11–B15 的“不存在/不实现”验证目标是当前 Action 不越界、不自动串联、不伪造后续事实，不要求移除后来已经实现且在当前状态合法的 sibling 能力。B16 / WP-02 只证明 replacement V2+ 的特定闭环，不能替代 B11–B15 各自的完整角色、草稿、并发、错误、可访问性和隐私矩阵。

### 6.1 B11 报告编辑、提交与确认：70 项

1. system_draft draft 可打开编辑。
2. 只显示 doctorOpinion / recommendationText 编辑字段。
3. 五段系统摘要不可编辑。
4. 结构化快照不可编辑。
5. doctorOpinion 少于 3 字不能保存。
6. doctorOpinion 超过 4000 字不能保存。
7. recommendation 为空可以清除。
8. recommendation 非空少于 3 字不能保存。
9. editNote 必填且为 3–1000 字。
10. 无正文变化不能保存。
11. PATCH 只发送 doctorOpinion、可选 recommendationText、editNote、expectedUpdatedAt。
12. expectedUpdatedAt 来自服务端 report.updatedAt，不使用浏览器当前时间。
13. 保存后 source=mixed。
14. 保存后系统摘要和快照不变。
15. editorial 显示最新编辑摘要。
16. editReceipt 只在当前会话显示。
17. 不显示完整审计历史。
18. 不显示 previousValues / nextValues / metadata。
19. 编辑草稿或 editNote 触发 beforeunload。
20. edit conflict 保留医生意见、建议与 editNote。
21. conflict 后自动 latest 一次。
22. conflict 后不自动 PATCH。
23. stale 状态禁止保存。
24. 用户明确基于最新报告继续后可保存，且本地输入不重置。
25. audit limit 禁止继续编辑。
26. pending_confirmation 不可编辑。
27. confirmed / archived / corrected / voided 不可编辑。
28. doctorOpinion 保存后显示提交入口。
29. submissionNote 为 3–2000 字。
30. 未勾选 checkbox 不能提交。
31. submit 只发送 confirm、submissionNote、expectedUpdatedAt。
32. 提交成功变为 pending_confirmation。
33. alreadySubmitted 按成功处理且不再次 POST。
34. pending 显示 submission 摘要。
35. pending 不显示编辑或重复提交按钮。
36. submit conflict 保留 note 并清除 checkbox。
37. submit conflict 不自动 POST。
38. nurse / research_assistant 不显示可用确认入口。
39. doctor 显示确认入口。
40. admin 显示确认入口。
41. 网络面板确认 B11 不发第二次 `/auth/me`。
42. confirmationNote 为 3–2000 字。
43. 未勾选 checkbox 不能确认。
44. confirm 只发送 confirm、confirmationNote、expectedUpdatedAt。
45. confirm 成功 status=confirmed。
46. confirmed isFinal 使用服务端值。
47. qualityStatus=passed 只显示报告确认流程质量标记通过，不显示患者正常。
48. confirmed 不显示为 locked。
49. confirmationId 弱化安全显示。
50. alreadyConfirmed 按成功处理且不再次 POST。
51. confirm conflict 保留 note 并清除 checkbox。
52. confirm conflict 不自动 POST。
53. confirmed 后所有工作流控件只读。
54. archived / corrected 只读。
55. voided 只读。
56. 不存在退回、reject、reopen 或 withdraw。
57. 不存在签名或 signatureText。
58. 不存在 lock / archive / correct / void 操作。
59. 不存在 PDF、打印或下载。
60. mixed 显示为系统规则与临床人员补充并存，不显示为 AI。
61. recommendation 明确标记为临床人员内容。
62. 系统不自动生成、改写、审核或解释 clinician 文本。
63. A21 401 返回登录页。
64. action 403 不清除已加载报告或本地草稿；confirm 403 提示需 doctor / admin。
65. 网络错误保留本地草稿且不自动重试。
66. localStorage / sessionStorage / IndexedDB 未保存工作流草稿。
67. 页面刷新后未保存草稿与当前会话回执消失。
68. 小屏幕表单纵向可用，textarea / checkbox 均有可见 label。
69. stale / alert / aria-live 文案与真实 disabled 状态正确。
70. `npm run lint`、`npm run typecheck`、`npm run build` 通过。

### 6.2 B12 报告不可逆锁定：88 项

1. draft 报告不显示锁定入口。
2. pending_confirmation 不显示锁定入口。
3. confirmed 未锁定报告显示锁定状态。
4. confirmed 未锁定报告对 doctor 显示锁定入口。
5. confirmed 未锁定报告对 admin 显示锁定入口。
6. nurse 不显示可用锁定入口。
7. research_assistant 不显示可用锁定入口。
8. system 不显示可用锁定入口。
9. 不新增 locked status。
10. 技术信息中的 status 仍为 confirmed。
11. 页面独立显示“尚未锁定”。
12. quality 非 passed 不开放锁定。
13. isFinal=false 不开放锁定。
14. confirmation 缺失不开放锁定。
15. Visit locked / voided 不开放首次锁定。
16. lockedAt 非空不显示再次锁定入口。
17. lock 非空但 lockedAt 为空显示一致性警告。
18. lockedAt 非空但 lock 为空显示审计摘要不完整。
19. lock.lockedAt 与 top-level 不一致显示警告。
20. 锁定前显示不可逆说明。
21. 锁定前说明 status 仍为 confirmed。
22. 锁定前说明只锁报告本身。
23. 锁定前说明不锁来源数据。
24. 锁定前说明不等于归档。
25. 锁定前说明不生成签名或 PDF。
26. lockNote 少于 3 字符不能提交。
27. lockNote 超过 2000 字符不能提交。
28. lockNote 不自动生成。
29. confirmationNote 不自动填入 lockNote。
30. 未勾选 checkbox 不能锁定。
31. lock 只发送 confirm、lockNote、expectedUpdatedAt。
32. expectedUpdatedAt 来自服务端。
33. 锁定期间 edit / submit / confirm / lock 均禁用。
34. 锁定期间报告仍可阅读。
35. 锁定成功使用服务端完整 report。
36. 锁定成功 status 仍为 confirmed。
37. 锁定成功 lockedAt 非空。
38. 锁定成功 lock summary 非空。
39. 锁定成功显示 lockReceipt。
40. alreadyLocked=false 显示首次锁定成功。
41. alreadyLocked=true 按成功处理。
42. alreadyLocked 不自动重发。
43. 重复锁定不显示第二个可用入口。
44. lockId 弱化为技术追溯号。
45. lockedBy 显示姓名和角色。
46. operatorId 不作为主要业务字段。
47. lockNote 标记为锁定流程说明。
48. lockNote 不显示为报告正文。
49. lock conflict 保留 lockNote。
50. lock conflict 清除 checkbox。
51. lock conflict 自动 latest 一次。
52. lock conflict 不自动 POST。
53. stale 时不能锁定。
54. 基于最新报告继续后保留 lockNote。
55. 最新报告已锁定时不能继续提交本地草稿。
56. audit unavailable 不猜测锁定人。
57. metadata unsupported 不显示 metadata。
58. action 403 保留报告和 lockNote。
59. 401 返回登录页。
60. 网络错误保留 lockNote。
61. beforeunload 覆盖 lockNote。
62. lockNote 不写 localStorage。
63. 刷新后未提交 lockNote 消失。
64. 已锁定报告 edit 不可用。
65. 已锁定报告 submit 不可用。
66. 已锁定报告 confirm 不可用。
67. 已锁定报告 lock 不可用。
68. confirmed 不显示为 locked status。
69. isFinal 不作为锁定判断。
70. lockedAt 不显示为归档时间。
71. 页面不存在 unlock。
72. 页面不存在 reopen / return / reject / withdraw。
73. 页面不存在 signature。
74. 页面不存在 archive / correct / void。
75. 页面不存在 PDF / 下载。
76. 页面不存在来源链锁定。
77. 页面不存在 AI 操作。
78. 页面不显示患者、访视或评分已锁定。
79. 页面不把 quality passed 显示为患者正常。
80. 页面不输出诊断结论。
81. 小屏幕锁定表单可用。
82. label、alert、live region 正确。
83. 没有第二次 `/auth/me`。
84. 没有新增路由。
85. 没有使用真实患者或锁定说明。
86. lint 通过。
87. typecheck 通过。
88. build 通过。

### 6.3 B13 报告来源冻结：116 项

1. 未生成报告时无来源冻结区域写入口。
2. draft 报告不允许冻结来源。
3. pending_confirmation 不允许冻结来源。
4. confirmed 未锁定报告提示先锁报告。
5. confirmed 已锁定且 sourceFreeze=null 显示尚未冻结。
6. doctor 显示首次冻结入口。
7. admin 显示首次冻结入口。
8. nurse 不显示可用入口。
9. research_assistant 不显示可用入口。
10. system 不显示可用入口。
11. 没有第二次 `/auth/me`。
12. Visit draft 可首次发起。
13. Visit in_progress 可首次发起。
14. Visit completed 可首次发起。
15. Visit locked 不开放首次发起。
16. Visit voided 不开放首次发起。
17. sourceFreeze=in_progress 时允许 doctor / admin 恢复。
18. in_progress 恢复不因 Visit 后续 locked / voided 被前端擅自阻断。
19. 首次 freezeNote 少于 3 字不能提交。
20. freezeNote 超过 2000 字不能提交。
21. freezeNote 不自动生成。
22. lockNote 不自动填入 freezeNote。
23. confirmationNote 不自动填入 freezeNote。
24. 未勾选 checkbox 不能首次冻结。
25. freeze 请求只发送 confirm、freezeNote、expectedUpdatedAt。
26. 不发送来源 ID。
27. expectedUpdatedAt 来自 report.updatedAt。
28. POST 不自动重试。
29. POST 期间 edit / submit / confirm / lock / freeze 均禁用。
30. POST 期间报告仍可阅读。
31. POST 期间不显示虚假逐项实时进度。
32. 首次成功 sourceFreeze.state=completed。
33. 首次成功显示 alreadyFrozen=false。
34. 首次成功显示 resumedExisting=false。
35. 恢复成功显示 resumedExisting=true。
36. completed 幂等显示 alreadyFrozen=true。
37. alreadyFrozen 不再次写入。
38. sourceFreeze=null 显示来源尚未冻结。
39. in_progress 显示可能已有部分来源冻结。
40. in_progress 不显示已回滚。
41. in_progress 显示原 freezeId。
42. in_progress 显示原 freezeNote。
43. in_progress freezeNote 不可编辑。
44. in_progress 恢复使用服务端 freezeNote。
45. 恢复不生成新 freezeId。
46. 恢复不允许替换首次说明。
47. 恢复必须重新勾选 checkbox。
48. 恢复不自动 POST。
49. completed 不显示再次冻结入口。
50. completed 不显示恢复入口。
51. completed 展示 started / completed actor。
52. completed 展示 expectedCounts。
53. completed 展示 completedCounts。
54. completed 展示 newlyFrozenCounts。
55. completed 展示 previouslyFrozenCounts。
56. 五类来源名称正确。
57. totalSourceCount 正确展示。
58. 前端不重新统计来源。
59. 前端不计算完成百分比。
60. 前端不显示来源 ID。
61. 前端不显示 metadata。
62. sourceFreeze count 非安全整数显示一致性警告。
63. total 与五类之和不一致显示警告。
64. in_progress 包含 completedAt 时显示警告。
65. completed 缺 completedCounts 时显示警告。
66. completed expected / completed 不一致显示警告。
67. 一致性异常时不开放恢复或首次写操作。
68. conflict 保留首次 freezeNote。
69. conflict 清除 checkbox。
70. conflict 自动 latest 一次。
71. conflict 不自动 POST。
72. incomplete 自动 latest 一次。
73. incomplete 不显示已回滚。
74. incomplete latest=in_progress 时显示恢复入口。
75. failed 后保留 freezeNote。
76. failed 后不自动恢复。
77. scope invalid 不显示内部 ID 差异。
78. input invalid 不猜测具体来源。
79. audit unavailable 不猜测完成状态。
80. metadata unsupported 不显示 metadata。
81. 401 返回登录页。
82. action 403 保留报告和首次 freezeNote。
83. 网络错误保留 freezeNote。
84. 网络错误提示手工 latest 核对。
85. 首次 note 纳入 beforeunload。
86. 恢复的只读服务端 note 不额外触发文本 dirty。
87. sourceFreeze 草稿不写 localStorage。
88. 页面刷新后未提交首次 note 消失。
89. sourceFreeze receipt 刷新后消失。
90. 持久事实仍来自 report.sourceFreeze。
91. status 仍显示 confirmed。
92. report.lockedAt 仍表示报告自身锁定。
93. sourceFreeze 单独表示来源冻结。
94. isFinal 不作为来源冻结完成状态。
95. sourceLockedAt 不显示为 report.lockedAt。
96. 页面说明 A23 不是 Mongo transaction。
97. 页面说明 completed 前可能部分冻结。
98. 页面说明不自动解冻。
99. 页面说明不冻结 Patient。
100. 页面说明不冻结 Visit。
101. 页面说明不冻结 Storage。
102. 页面说明 CognitiveDomainResult 冻结不等于确认。
103. 页面不存在 unfreeze。
104. 页面不存在 rollback。
105. 页面不存在后台恢复开关。
106. 页面不存在 archive / correct / void。
107. 页面不存在 PDF / 下载。
108. 页面不存在 AI 操作。
109. 页面不输出诊断结论。
110. 小屏幕计数与确认表单可用。
111. label / alert / live region 正确。
112. 没有新增路由。
113. 没有使用真实患者或冻结说明。
114. lint 通过。
115. typecheck 通过。
116. build 通过。

### 6.4 B14 报告归档：115 项

1. 无报告时无归档入口。
2. draft 不显示归档入口。
3. pending_confirmation 不显示归档入口。
4. confirmed 未锁定不显示归档入口。
5. 已锁定但 sourceFreeze=null 不显示归档入口。
6. sourceFreeze=in_progress 不显示归档入口。
7. confirmed + locked + sourceFreeze completed 显示尚未归档。
8. doctor 显示归档入口。
9. admin 显示归档入口。
10. nurse 不显示可用入口。
11. research_assistant 不显示可用入口。
12. system 不显示可用入口。
13. 没有第二次 /auth/me。
14. Patient active 不作为前端条件。
15. Visit draft 可归档。
16. Visit in_progress 可归档。
17. Visit completed 可归档。
18. Visit locked 不阻断归档。
19. Visit voided 不被前端自行作为 A24 阻断。
20. archiveNote 少于 3 字不能提交。
21. archiveNote 超过 2000 字不能提交。
22. archiveNote 不自动生成。
23. freezeNote 不自动填入。
24. lockNote 不自动填入。
25. confirmationNote 不自动填入。
26. 未勾选 checkbox 不能归档。
27. 请求只发送 confirm、archiveNote、expectedUpdatedAt。
28. 不发送 status。
29. 不发送 archivedAt / archivedBy。
30. 不发送 metadata。
31. expectedUpdatedAt 来自 report.updatedAt。
32. POST 不自动重试。
33. POST 期间六类写操作均禁用。
34. POST 期间报告仍可阅读。
35. 归档成功使用完整服务端 report。
36. 归档成功 status=archived。
37. 归档成功 isFinal 使用服务端值。
38. 归档成功 archivedAt 非空。
39. 归档成功 archive 非空。
40. 首次成功显示 alreadyArchived=false。
41. 幂等成功显示 alreadyArchived=true。
42. alreadyArchived 不表示重复写入。
43. archived 后不显示再次归档入口。
44. archived 后不显示 edit。
45. archived 后不显示 submit。
46. archived 后不显示 confirm。
47. archived 后不显示 lock。
48. archived 后不显示 source-freeze。
49. archiveId 显示为归档追溯号。
50. archivedBy 显示姓名和角色。
51. operatorId 不作为主要业务字段。
52. archiveNote 显示为归档流程说明。
53. sourceFreezeId 显示为冻结锚点。
54. sourceFreezeCompletedAt 单独显示。
55. archivedAt 不显示为 lockedAt。
56. sourceFreezeCompletedAt 不显示为 archivedAt。
57. status、lockedAt、sourceFreeze、archivedAt 分开。
58. 完整 A24 anchor 与 sourceFreeze 一致。
59. anchor 不一致显示警告。
60. status=archived 但 archivedAt=null 显示警告。
61. archivedAt 非空但 archive=null 不开放归档。
62. archive 非空但 archivedAt=null 显示警告。
63. archive 时间与顶层不一致显示警告。
64. confirmed 但 archive 非空显示警告。
65. historical fallback archiveId=null 安全显示。
66. historical fallback role=unknown 安全显示。
67. historical fallback 不猜测说明。
68. historical fallback 不开放再次归档。
69. conflict 保留 archiveNote。
70. conflict 清除 checkbox。
71. conflict 自动 latest 一次。
72. conflict 不自动 POST。
73. latest 仍可归档时要求明确基于最新继续。
74. latest 已归档时本地说明保留。
75. latest 已归档时提示本地说明未写入。
76. failed 后保留 archiveNote。
77. failed 后 latest 一次。
78. failed 后不自动重试。
79. audit unavailable 不猜测归档事实。
80. metadata unsupported 不展示 metadata。
81. voided 不开放归档。
82. 401 返回登录页。
83. action 403 保留报告和 archiveNote。
84. 网络错误保留 archiveNote。
85. 网络错误提示 latest 核对。
86. archiveNote 纳入 beforeunload。
87. archive 草稿不写 localStorage。
88. 页面刷新后未提交 note 消失。
89. archiveReceipt 刷新后消失。
90. 持久事实来自 report.status / archivedAt / archive。
91. 不修改 lockedAt / lock。
92. 不修改 sourceFreeze。
93. 不修改 confirmation。
94. 不修改 narrative / snapshots / scope。
95. 不调用 A14–A19 检查。
96. 不修改 Patient / Visit。
97. 不实现 unarchive。
98. 不实现 restore confirmed。
99. 不实现 correction。
100. 不实现 void / delete。
101. 不实现 unlock / unfreeze。
102. 不实现 PDF / Word / 下载。
103. 不实现 AI。
104. 不显示“患者已归档”。
105. 不显示“访视已归档”。
106. 不显示“报告已删除”。
107. 不显示“PDF 已生成”。
108. 小屏幕归档表单和摘要可用。
109. label / alert / live region 正确。
110. 没有新增路由。
111. 没有新增依赖。
112. 没有使用真实医疗数据。
113. lint 通过。
114. typecheck 通过。
115. build 通过。

### 6.5 B14.1 工作流结构治理：当前仍待验部分

B14.1 的静态拆分合同已经验证：公开 options 9 个、result keys 99 个、七个 mode、组件消费、API Client 方向、单一 activeMode / writingAction / writingRef / mountedRef / beforeunload、唯一 latest 和报告更新入口均保持。当前待验的是拆分后的真实 Browser 行为等价性，不是重新执行静态行数审计。

Fixture 与 Browser 必须覆盖：

1. 公共 façade：七个 mode 仍互斥；路由报告身份变化会清理正确状态；一个 writingAction 期间不能打开或提交另一动作；成功报告只经统一入口应用。
2. Edit：open / update / no-change / save / conflict / 403 / receipt / stale / beforeunload 与 B11 一致；网络或冲突后保留三个本地字段。
3. Submit：readiness、submissionNote、checkbox、success / alreadySubmitted、conflict 与 pending read-only 一致；不自动重发。
4. Confirm：doctor / admin、confirmationNote、checkbox、success / alreadyConfirmed、conflict 与 403 文案一致；不模拟 lock。
5. Lock：doctor / admin、Visit draft / in_progress / completed、success / alreadyLocked、conflict、consistency warning 与 confirmed status 一致；lockNote 保留。
6. Source-freeze：start / resume、服务端持久 note、显式放弃本地内容、in_progress / incomplete / failed、alreadyFrozen / resumedExisting 与 no polling 一致；不自动进入恢复。
7. Archive：doctor / admin、不依赖 Patient active / Visit editable、Visit locked 不阻断、success / alreadyArchived、conflict、historical fallback 与 archived read-only 一致。
8. Browser 公共边界：真实 B11–B14 HTTP、Cookie / CORS、多操作者并发、网络中断后的服务端最终状态、唯一 beforeunload、窄屏和屏幕阅读器 / live region 行为。
9. 写请求最多各执行一次；latest 恢复最多一次；不得出现 Action 互相 import、组件直调 API、自动 retry、polling 或浏览器持久化草稿。

B16 / WP-02 已完成不能替代这组 B14.1 行为等价回归；只有 Batch D 实际覆盖上述项目后才能关闭。

### 6.6 B15 版本化更正：10 组

- 使用脱敏 doctor / admin 账号验证 archived V1 首次更正：原因 3–2000、摘要 3–4000、checkbox、Body 白名单与成功原地切换 V2；确认没有刷新、跳转或额外 latest。
- 使用脱敏 in_progress source 验证显式恢复：correctionId / No.、started actor / time、版本关系与 replacementReportId 可见；reason / summary 只读，必须重新勾选且不生成新 ID。
- 验证 completed 幂等：source 不显示再次发起 / 恢复；alreadyCreated 与 resumedExisting 三类成功文案准确，source 与 receipt 仅当前会话保留。
- 模拟 not correctable / not latest / conflict / incomplete / failed / not found / voided：最多 latest 一次，首次文本保留、checkbox 清除、stale，绝不重发 POST。latest 变 in_progress 时需明确放弃本地内容后恢复；变 corrected / replacement 时提示本地说明未写入。
- 模拟 401 / 403 / audit unavailable / replacement conflict / 网络中断：401 返回登录页；403 保留报告与输入；审计 / 关系冲突不可绕过；网络不确定只提供手工 latest。
- 分别以 doctor/admin 与 nurse/research_assistant 验证合法 V2：仅 doctor/admin 可 edit / submit / confirm；Patient inactive、Visit locked / voided 不阻断 A21；V1 既有角色与资格不放宽。
- 确认 V2 confirmed 后 correction Action 不自动发起或串联 A22–A24；安全 replacement 可以按 B16 显示当前阶段合法入口，但用户未明确操作前 Network 中没有 A22–A24 写请求，也不自动完成编辑、确认、锁定、冻结或归档。
- 验证 source / replacement 摘要没有虚假历史链接、metadata、原始 correctionRecords 或五类来源 ID；刷新后仅使用 replacementOf。
- 验证小屏纵向布局、可见 label / 字符计数、alert / polite live region、键盘操作与 POST 期间全部报告写操作 disabled。
- 验证 beforeunload 只有一个监听器：start 模式 reason / summary trim 后非空触发；resume 只读文本本身不触发；不得写 localStorage / sessionStorage / IndexedDB / URL / Cookie。

## 7. Batch E：8 个真实设备、辅助技术或人工项目

以下 ID 必须逐项保留，不属于 Batch B 已完成的 135 项桌面范围，也不得被自然 viewport、响应式抽查、鼠标 Canvas、automated boundary 或普通原生控件抽样替代：

| 验证 ID | 当前处置 | 执行边界 |
|---|---|---|
| `B5-MV-008` | Batch E 待验 | 原合同分类为真实设备/人工项；不并入桌面 `media_file_validation` 结论 |
| `B5-MV-028` | Batch E 待验 | 原合同分类为真实设备/人工项；不由桌面 mouse-only handwriting 覆盖 |
| `B5-MV-029` | Batch E 待验 | 原合同分类为真实设备/人工项；不由桌面 mouse-only handwriting 覆盖 |
| `B5-MV-058` | Batch E 待验 | 原合同分类为真实设备、辅助技术或人工项；无桌面 fixture primary owner |
| `B5-MV-059` | Batch E 待验 | 原合同分类为真实设备、辅助技术或人工项；无桌面 fixture primary owner |
| `B5-MV-060` | Batch E 待验 | 原合同分类为真实设备、辅助技术或人工项；无桌面 fixture primary owner |
| `B5-MV-061` | Batch E 待验 | 原合同分类为真实设备、辅助技术或人工项；无桌面 fixture primary owner |
| `B5-MV-062` | Batch E 待验 | 原合同分类为真实设备、辅助技术或人工项；无桌面 fixture primary owner |

现有仓库只把这 8 个 ID 固定分类为桌面 Batch B 排除项；本文不凭空补写未在 active contract 中存在的细分描述。执行 Batch E 时必须以这 8 个稳定 ID 建立明确步骤、真实设备/辅助技术条件、人工签收人和证据，不得更换 ID 或静默合并。

## 8. 已完成批次证据索引

| 范围 | 最终状态 | 最终构成与关键证据 | evidence commit | 是否需要重跑 |
|---|---|---|---|---|
| WP-02 / B16 | 已完成 | 基线 `9099f66…` 的 Resume/unsafe 补齐与既有 V1/V2/V3 矩阵，加最终 Web Storage 审计；fixture 双次 cleanup 为 0 | `95b778448603e5eb4f96eafb82136edc36d3ab0e` | 否 |
| WP-04 / B17 | 已完成 | 验收基线 `7dd6f52…`；44/44 scenarioKey，0 fail / 0 未执行；角色、响应式、真实键盘、Network、Runtime Storage 八时点、双次 cleanup 均通过 | `db825a9df57ca1a131fee20159f9c6a38529f1ab` | 否 |
| Batch A / B1–B3 | 已完成 | 67 = Browser 58 + prior covered/automated 6 + human 2 + obsolete 1；27 scenarioKey 全过；双次 cleanup 为 0 | `335c6201f1f4864b371150467f5da6658b068e45` | 否 |
| Batch A 真正大屏抽查 | 已完成 | 普通最大化 Chrome，`window.innerWidth=1536`；5 个代表页通过 | `8b8a9281dd738c5a0694d0c2feea4bcefcae6c66` | 否；后续新代表页按策略抽查 |
| D-038 数据库隔离 | 已实现并认证 | Browser 专用数据库、双向库名/角色门禁、sentinel 隔离和完整后端门禁通过 | `f528efb7152b5770e9f873683fbd03c814108b81` | 否；数据库治理变化时重跑 |
| Batch B / B4–B6 | 桌面范围已完成 | 全合同 143 = Browser 133 + automated boundary 2 + Batch E human/device/AT 8 + obsolete 0；桌面 135 已闭环，post-browser verify 与双次 cleanup 为 0，产品缺陷 0 | `f59f3ac0c93d47e2c7fad4d29f1d7f2a61dc4021` | 桌面范围否；Batch E 8 项仍待验 |

B1–B6 的原始逐项意图通过本轮减肥前基线追溯；active playbook 不再保留已完成范围的大段旧未决清单。表中的验收基线与 evidence commit 已按 Git 提交父子顺序、提交主题和文件范围交叉核对，两者不得混写。

## 9. 认证、安全、医疗与隐私红线

1. 主登录态由后端 Session + HttpOnly Cookie 维护；前端不得读取 HttpOnly Cookie，不保存 raw token、token hash、JWT、`passwordHash` 或其他认证凭证。
2. 401 必须返回登录流程，403 必须显示无权限；入口可见性不替代后端 Guard，也不得把 403 伪装为空结果。
3. GET 使用正确 credentials / no-store / AbortSignal；写请求只发送明确白名单，不自动 retry，不把服务端生成字段、完整对象或内部 ID 回传。
4. React 内存草稿、note、reason、summary、媒体 Blob、strokes、短期 URL、updatedAt 和 receipt 不得写入 localStorage、sessionStorage、IndexedDB、URL、Cookie 或 Console。
5. 页面、Network 摘要、Console、DOM、URL、截图和报告不得泄露患者请求体、原始作答、报告正文、内部 lineage/source ID、metadata、Storage 定位、凭据或后端堆栈。
6. 只使用脱敏人工账号、患者、访视、作答、评分、报告、图片和手写数据；不得使用真实姓名、邮箱、身份证号、手机号、病历号、住址、真实文件名或其他可识别信息。
7. 系统不得把量表分数、认知域比例、趋势、qualityStatus 或 warning 表述为疾病概率、正常/异常、改善/恶化、诊断、风险等级或治疗建议。
8. MMSE / MoCA 核心评估保持医护或研究人员陪伴/监督边界；不得描述为患者居家自测。
9. 认知域重叠归因不得跨域求和；null 不补 0；前端不重算 score、percent、delta、comparison、mapping 或报告结论。
10. 媒体只展示安全公开字段和按需短期访问；不显示原始文件名、bucket/objectKey、checksum、轨迹内容、内部 media/item ID，不把逻辑作废称为物理删除。
11. system_draft、source=mixed、quality passed、confirmed、locked、source frozen 和 archived 必须按各自真实语义展示，不能互相替代或扩展为 AI/诊断/签名/PDF 事实。
12. 未实现的 unlock、unfreeze、unarchive、void/delete、签名、PDF/下载、AI、自动评分、自动确认或自动归档不得通过测试辅助入口伪造。

## 10. 同步规则与历史追溯

- 前端新增或调整测试脚本、页面、路由、组件、API Client、状态协调、权限展示、响应式或关键交互时，应更新当前门禁和对应未决合同；已完成证据只在结论确实变化时更新。
- Fixture 设计必须以本文当前待验合同为输入；不得为了方便执行而删减验证项、放宽角色/状态、引入持久化草稿或改变 API 合同。
- roadmap 业务工作包状态不因 testing playbook 压缩或 Batch 验收自动变化。
- 本轮 testing playbook 减肥前的完整历史基线为 `3c0e373902985b9da09b359ed8f2a0334ef1e5d0`。
- 已删除的 B1–B6、B16、B17 逐阶段命令、原始清单、Browser 操作、失败诊断、旧 namespace/端口和执行日志可通过 Git 历史查看。
- active playbook 不另建 archive，也不复制一份 Validation catalog；已完成历史只保留最终摘要和 evidence commit 索引。
