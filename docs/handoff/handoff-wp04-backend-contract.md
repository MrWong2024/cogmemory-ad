# WP-04 后端契约：历史评估、报告版本与基础随访趋势

## 0. 文档状态

- 契约状态：**已锁定**。
- 产品状态：**进行中**；后端 A27 历史读取与 A28 基础随访趋势均已实施，四个只读接口已存在；前端尚未实施，因此 WP-04 尚未完成。
- A28 实施基线：`dd79d20fbd3a9dc97d2240978b350d07751dbe57`。
- 范围：四个只读 GET；无 Body、无写入、无 `expectedUpdatedAt`、无 `confirm`、无 AuditLog、无缓存、无导出、无 PDF、无 AI、无诊断。
- 兼容边界：不改变现有 `latest`、Patient / Visit list 或 A17–A26 API；不改变 `ClinicalReportPublicMapper`。
- 日期口径：下文 `Date` 表示服务端 `Date`，经现有 JSON 序列化后为 ISO 8601 字符串；可空日期明确标为 `Date | null`。

## 1. 数据源与历史事实

### 1.1 实际代码盘点

| 数据源 | WP-04 使用的事实 | 当前关键约束 / 索引 | 公开边界 |
|---|---|---|---|
| `Patient` | `status`、`subjectCode`、公开身份摘要 | `subjectCode` unique；`{status, subjectCode}`；`{sourceType, status}` | 历史接口只用 id 做 ownership；不得返回 `externalRefs`、`metadata`，四个响应均不新增患者隐私摘要 |
| `AssessmentVisit` | `visitCode`、`type`、`status`、`assessmentDate`、四类生命周期时间 | `{patientId: 1, assessmentDate: -1}`；另有 visitCode unique、subject/status 日期索引 | 新轻量 mapper 只返回合同列出的 Visit 字段；不返回 `patientId`、`subjectCode`、operator、`clinicalContext`、notes、metadata |
| `ScaleInstance` | `instanceCode`、`instanceNo`、`scaleCode`、`scaleVersion`、`administrationMode`、`versionTrace`、status、duration 和时间 | `{assessmentVisitId, scaleCode, instanceNo}` unique；`{patientId, scaleCode, startedAt}`；`{scaleCode, scaleVersion}` | 同访视同量表可因不同 `instanceNo` 出现多条；趋势不得擅自选一条。公开仅允许 ScaleInstance id，不返回 definition/version 内部 ID、patientId、subjectCode、operator、qualityHints、metadata、notes |
| `ScoreResult` | `runNo`、status、total、qualityStatus、review、confirmed/locked/voided 时间、`versionTrace` | `{scaleInstanceId, runNo}` unique；`{assessmentVisitId, scaleCode, createdAt}`；`{patientId, scaleCode, createdAt}`；状态/版本/质量索引 | A17/A18 mapper 过重，不用于历史/趋势；新轻量 mapper 不返回 source id、item/group scores、reviewer/opinion、manual-review 事件、metadata、qualityHints |
| `CognitiveDomainResult` | `runNo`、status、domainScores、mapping source/mode/snapshot、quality、trace、computation | `{scaleInstanceId, runNo}` unique；`{scoreResultId, runNo}`；Visit/Patient + scaleCode 日期索引；状态/版本/质量/domainCode 索引 | A19 mapper 含 itemContributions，不用于历史/趋势；新轻量 mapper只返回合同列出的 domain 摘要 |
| `ClinicalReport` | code、version、type、status、source、quality、公开快照时间、A22/A23/A24、A25 correction、replacement metadata 与 A26 单跳 lineage | `{assessmentVisitId: 1, reportType: 1, reportVersion: -1}`；reportCode unique；patient/subject 日期索引 | detail 复用现有 mapper；列表和历史摘要使用新轻量 mapper。关系计算可在内部读取 ID/metadata，但绝不公开 |
| 当前量表目录 | 当前可用 `scaleCode`、名称和版本 | 内建 seed 经 `ScaleCatalogService` 校验；持久化 definition/version 另有 code/status 索引 | 趋势校验当前可用目录；历史列表的可选 `scaleCode` 是历史事实过滤，不因目录后来变化而拒绝 |

当前 Patient 安全 identity summary 明确包含 `id`、`subjectCode`、可选 `displayName`、`sourceType`、`sex`、可空 `birthDate` / `educationYears`、`handedness`、`status`、`tags`，detail 另含 notes；`externalRefs` 与 metadata 仅存在于内部 summary。WP-04 四个响应均不需要复制这份身份摘要，只以 patientId 做 ownership。

现有 `ClinicalReportPublicMapper` 已对白名单 detail 公开 patient/visit/scale/score/domain/evidence/narrative 和安全 lifecycle 摘要，并排除 source ID 数组、scoreDetails、clinicalContext、storageObjectKey、metadata 与 AI draftText；它只用于指定历史详情。列表/趋势不得因为该 mapper 已安全就加载整份 detail。

### 1.2 数值与报告事实分工

1. 趋势总分只来自持久化的最终 `ScoreResult`；认知域只来自与该结果精确绑定的 `CognitiveDomainResult`。
2. 不读取 `ItemResponse` 重新评分，不重新执行 A17/A18，不重新执行 A19，不修改历史来源事实。
3. `ClinicalReport` 只用于正式报告历史、归档事实和线性版本导航；其 narrative、score/domain snapshot 均不作为趋势数值来源。
4. 报告的 `latest` 与 `latestArchivedVersion` 是两个不同概念：前者只看最高版本号，后者必须有完整 A24 归档事实。

### 1.3 可复用与禁止复用

- 可直接复用：Patient / Visit / Report ownership 读取；当前 catalog 读取；`ClinicalReportDetailResponse`；`ClinicalReportPublicMapper`；A22/A23/A24/A25 元数据解析规则；A26 `assertClinicalReportReplacementLineageLink()` 单跳纯校验。
- 需新增只读能力：按 ownership + ID 集合的 lean/projection 批量读取；全链 evaluator；历史/趋势显式安全 mapper；趋势 source/comparability 纯函数。
- A26 当前 `hasValidReplacementLifecycleLineage(report)` 只能从单个当前版本向前回溯，不能独立证明完整集合无重复版本、缺口、分支或孤儿；版本列表不得只调用它后直接分页。
- 禁止复用：A17/A18 完整 public mapper、A19 完整 public mapper、包含过量字段的内部 summary spread、`getVisitExecutionDetail()` 的逐实例组合方式、内部 HTTP 调用 latest endpoint。

## 2. 四个只读接口矩阵

| Endpoint | Controller / Module | DTO | Response | 排序 / 范围 | 业务错误 |
|---|---|---|---|---|---|
| `GET /patients/:patientId/assessment-history` | `ClinicalHistoryController` / 新无 Schema `ClinicalHistoryModule` | `PatientHistoryParamDto` + `ListPatientAssessmentHistoryQueryDto` | `PatientAssessmentHistoryResponse` | Visit 日期倒序；分页 | Patient 404；日期 400 |
| `GET /patients/:patientId/visits/:visitId/clinical-reports` | 现有 `ClinicalReportsController` / `ReportsModule` | `ClinicalReportVisitParamDto` + `ListClinicalReportVersionsQueryDto` | `ClinicalReportVersionListResponse` | 完整链先验证，再按版本倒序分页 | Patient/Visit 404；完整性或 lineage 409 |
| `GET /patients/:patientId/visits/:visitId/clinical-reports/:reportId` | 现有 `ClinicalReportsController` / `ReportsModule` | `ClinicalReportHistoryParamDto` | 现有 `ClinicalReportDetailResponse` | 单资源 | Patient/Visit/Report 404；不完整 409 |
| `GET /patients/:patientId/follow-up-trends` | `ClinicalHistoryController` / 新无 Schema `ClinicalHistoryModule` | `PatientHistoryParamDto` + `GetPatientFollowUpTrendQueryDto` | `PatientFollowUpTrendResponse` | Visit 日期升序；最多 `maxPoints` 个 Visit，不截断 | Patient/Scale 404；日期 400；范围 409 |

四个接口统一使用 `SessionAuthGuard`、`RolesGuard` 和 `doctor | nurse | research_assistant | admin`。均不注入 `@CurrentUser()`。

路由无冲突：报告列表使用 controller 根 GET，详情使用 MongoId 参数路由；现有静态 `GET .../latest` 必须继续在 `:reportId` 前注册，`latest` 不会被解释为 reportId，语义不变。

## 3. Param 与 Query DTO

全局 ValidationPipe 继续负责转换、白名单和未知字段拒绝；所有 MongoId 使用现有 canonical MongoId 校验。DTO 校验失败为 400。

### 3.1 Param

| DTO | 字段 | 类型 | 必填 | 规则 |
|---|---|---:|---:|---|
| `PatientHistoryParamDto` | `patientId` | string | 是 | canonical MongoId |
| `ClinicalReportVisitParamDto`（复用） | `patientId` | string | 是 | canonical MongoId |
|  | `visitId` | string | 是 | canonical MongoId |
| `ClinicalReportHistoryParamDto` | `patientId` | string | 是 | canonical MongoId |
|  | `visitId` | string | 是 | canonical MongoId |
|  | `reportId` | string | 是 | canonical MongoId |

### 3.2 `ListPatientAssessmentHistoryQueryDto`

| 字段 | 输入类型 | 必填 | 默认 / 范围 | 规范化与语义 |
|---|---|---:|---|---|
| `page` | integer | 否 | 1；min 1 | 十进制整数 |
| `pageSize` | integer | 否 | 20；min 1；max 100 | 十进制整数 |
| `dateFrom` | ISO date | 否 | null | 含边界，转换为有效 Date |
| `dateTo` | ISO date | 否 | null | 含边界，转换为有效 Date；早于 dateFrom 时 400 `INVALID_DATE_RANGE` |
| `visitType` | `AssessmentVisitType` | 否 | null | 复用现有枚举 |
| `status` | `AssessmentStatus` | 否 | null | 复用现有枚举 |
| `scaleCode` | string | 否 | null | trim + lowercase；空串 400；设置后只统计和返回至少有一个该历史 code 实例的 Visit；不要求仍在当前目录 |

不接受客户端排序字段。

### 3.3 `ListClinicalReportVersionsQueryDto`

| 字段 | 输入类型 | 必填 | 默认 / 范围 |
|---|---|---:|---|
| `page` | integer | 否 | 1；min 1 |
| `pageSize` | integer | 否 | 20；min 1；max 100 |

`reportType` 服务端固定为 `cognitive_assessment`，客户端不得提交；不支持跨类型链或自定义排序。

### 3.4 `GetPatientFollowUpTrendQueryDto`

| 字段 | 输入类型 | 必填 | 默认 / 范围 | 规范化与语义 |
|---|---|---:|---|---|
| `scaleCode` | string | 是 | 非空 | trim + lowercase；必须命中当前 `ScaleCatalogService` 可用目录，否则 404 `SCALE_NOT_AVAILABLE` |
| `dateFrom` | ISO date | 否 | null | 含边界 |
| `dateTo` | ISO date | 否 | null | 含边界；早于 dateFrom 时 400 `INVALID_DATE_RANGE` |
| `maxPoints` | integer | 否 | 50；min 2；max 100 | 限制的是匹配 Visit 数，不是 available 点数 |

不接受 reportVersion、任何 source ID、自定义基线/兼容规则、阈值、平滑、AI 或排序参数。

## 4. 患者历史评估响应

### 4.1 顶层与顺序

`PatientAssessmentHistoryResponse`：

```text
{
  items: PatientAssessmentHistoryItem[],
  page: integer,
  pageSize: integer,
  total: integer
}
```

- `total` 是应用全部过滤条件后的 Visit 总数。
- `items` 先按 `assessmentDate desc`，同日按 Visit `_id desc`，再执行 skip/limit。
- page 超出范围返回 200、`items=[]`，`total` 保持真实值。
- 每个 Visit 的 `scaleSummaries` 按 `scaleCode asc`、`instanceNo asc`、ScaleInstance `_id asc`；`instanceNo` 只用于内部排序，不公开。

### 4.2 Visit

```text
visit: {
  id: string,
  visitCode: string,
  visitType: AssessmentVisitType,
  status: AssessmentStatus,
  assessmentDate: Date,
  startedAt: Date | null,
  completedAt: Date | null,
  lockedAt: Date | null,
  voidedAt: Date | null
}
```

`assessmentDate` 缺失或非法意味着历史来源不完整：不得猜测排序，整个请求返回 409 `CLINICAL_REPORT_INCOMPLETE` 只适用于报告，故 Visit 数据异常作为未预期持久化异常处理，不伪造空历史。正常 Schema 下该字段必有值。

### 4.3 Scale、Score 与 Domain 摘要

```text
scaleSummaries: [{
  scaleInstanceId: string,
  instanceCode: string,
  scaleCode: string,
  scaleVersion: string,
  status: AssessmentStatus,
  administrationMode: ScaleAdministrationMode,
  startedAt: Date | null,
  completedAt: Date | null,
  lockedAt: Date | null,
  voidedAt: Date | null,
  durationMs: number | null,
  scoreSummary: HistoryScoreSummary | null,
  domainSummary: HistoryDomainSummary | null
}]
```

- `durationMs` 只在持久化值是有限非负数时返回，否则为 null。
- `scoreSummary=null` 仅表示不存在绑定该实例的 runNo=1 `ScoreResult`。
- `domainSummary=null` 仅表示不存在同时绑定该实例与该 runNo=1 ScoreResult 的 runNo=1 `CognitiveDomainResult`；若 scoreSummary 为 null，domainSummary 必为 null。
- 如果发现多个同 runNo 结果、跨 ownership 绑定或关系不唯一，不挑选一条；对应非空摘要使用 `source_incomplete`，数值字段置 null。

`HistoryScoreSummary`：

```text
{
  availability: "available" | "source_not_final" | "source_voided" | "source_incomplete",
  status: ScoreResultStatus,
  qualityStatus: ScoreQualityStatus,
  totalScoreValue: number | null,
  totalMinScore: number | null,
  totalMaxScore: number | null,
  scorePercent: number | null,
  confirmedAt: Date | null,
  lockedAt: Date | null,
  versionTrace: {
    scaleVersion: string | null,
    crfVersion: string | null,
    scoringRuleVersion: string | null,
    fieldEncodingVersion: string | null
  }
}
```

只有满足第 8 节总分来源资格时为 `available` 并返回四个有限数值；其余 availability 下四个数值必须全为 null。`source_not_final` 用于非 confirmed/locked，`source_voided` 用于 voided，其他资格缺失/矛盾为 `source_incomplete`。

`HistoryDomainSummary`：

```text
{
  availability: "available" | "source_not_final" | "source_voided" | "source_incomplete",
  status: CognitiveDomainResultStatus,
  qualityStatus: CognitiveDomainQualityStatus,
  mappingVersion: string | null,
  domainCount: integer,
  computedAt: Date | null
}
```

只有满足第 8 节 domain 资格时为 `available`，`mappingVersion` 为完整的 `domainMappingVersion`，`domainCount` 是已验证的唯一 domainCode 数量；其他状态下 `mappingVersion=null`、`domainCount=0`。`computedAt` 仅返回合法 computation 时间，否则 null。

### 4.4 报告摘要

```text
reportSummary: {
  status: "none" | "available" | "incomplete",
  totalVersions: integer,
  latest: {
    id: string,
    reportCode: string,
    reportVersion: integer,
    status: ClinicalReportStatus,
    createdAt: Date
  } | null,
  latestArchivedVersion: {
    id: string,
    reportCode: string,
    reportVersion: integer,
    status: "archived" | "corrected" | "voided",
    archivedAt: Date
  } | null
}
```

- 只统计 `cognitive_assessment`。
- 无报告：`none`、0、两个 pointer 均 null。
- `latest` 是 `reportVersion desc`、`createdAt desc`、`_id desc` 的第一条，**不要求归档**。
- `latestArchivedVersion` 是状态属于 archived/corrected/voided，且存在可完整解析、与 report archivedAt/archivedBy 及 completed source-freeze 锚点一致的 A24 事实的最高版本；不存在则 null。仅有历史 fallback 的 archivedAt/archivedBy、不完整 A24 或 draft latest 均不算。
- 完整链及所有所需轻量字段可信时为 `available`；重复版本、缺口、单边关系、无可安全确定的 latest 或任意相关生命周期事实矛盾时为 `incomplete`。有报告但 latest 的必需字段不可安全映射时 `latest=null`；其他可独立验证的 pointer 仍可返回。历史列表不拼接或修复关系；版本列表端点会以 409 拒绝该链。

## 5. 报告版本列表与历史详情

### 5.1 版本列表响应

```text
{
  items: ClinicalReportVersionListItem[],
  page: integer,
  pageSize: integer,
  total: integer,
  lineage: {
    status: "valid",
    firstVersion: integer,
    latestVersion: integer,
    totalVersions: integer
  }
}
```

无报告返回 200：`items=[]`、`total=0`、`lineage={status:"valid", firstVersion:0, latestVersion:0, totalVersions:0}`。非空链的 firstVersion 固定 1，latestVersion 为连续最大版本，totalVersions 与完整集合条数相同。

分页前对同 ownership、固定 reportType 的**完整轻量投影**验证；通过后按 `reportVersion desc`、`createdAt desc`、`_id desc` 分页。不能只验证当前页。

`ClinicalReportVersionListItem`：

```text
{
  id: string,
  reportCode: string,
  reportVersion: integer,
  reportType: "cognitive_assessment",
  status: ClinicalReportStatus,
  source: ClinicalReportSource,
  qualityStatus: ReportQualityStatus,
  isFinal: boolean,
  createdAt: Date,
  updatedAt: Date,
  confirmedAt: Date | null,
  lockedAt: Date | null,
  sourceFreezeStatus: "none" | "in_progress" | "completed",
  sourceFreezeCompletedAt: Date | null,
  archivedAt: Date | null,
  correctedAt: Date | null,
  voidedAt: Date | null,
  correctionNo: integer | null,
  correctionReason: string | null,
  changeSummary: string | null,
  previous: { reportCode: string, reportVersion: integer } | null,
  replacement: { reportCode: string, reportVersion: integer } | null,
  isLatestVersion: boolean
}
```

- `isFinal` 与现有 mapper 一致：confirmed/archived/corrected 为 true；draft/pending_confirmation/voided 为 false。
- confirmedAt 只来自安全 confirmation；lockedAt 只在 A22/direct fact 一致时返回。
- sourceFreezeStatus 无 namespace 时为 none；合法 in_progress/completed 如实返回；completedAt 仅 completed 时非空。存在但无法安全解析时请求 409 `CLINICAL_REPORT_INCOMPLETE`。
- archivedAt 只在完整 A24 事实存在时返回；corrected 继续保留原归档时间。correctedAt/correctionNo/reason/summary 描述该版本被下一版替代的完整 A25 correction；无 outgoing correction 时均 null。
- previous 描述当前 Vn 的前一版；replacement 描述当前版本的下一版。二者只含 code/version，绝不含内部 ID。

### 5.2 完整线性链规则

1. 每个 reportVersion 必须是正安全整数；集合必须恰好是 V1..Vn，每版恰好一条。
2. V1 无 previous/replacement lineage metadata；Vn（n>1）的 previous 必须恰为 V(n-1)。
3. 每个相邻 hop 复用 A26 单跳纯校验：同 Patient/Visit/type；前序为 corrected；completed A25、唯一 correctionRecord、replacement metadata 与 A22/A23/A24 anchors 双向一致。
4. 每个非 latest 版本必须且只能指向下一版；latest 不得有 completed outgoing correction。不能跳版、分支、合并、孤儿或两个 replacement。
5. latest 可为 draft、pending_confirmation、confirmed、archived 或 voided；corrected 必然要求存在下一版，因此不能作为一条“完整链”的 latest。
6. 先按完整集合建立 version/code/id 唯一映射，再验证每一跳；内部 ID 只用于校验，mapper 只能输出 safe code/version。
7. 任一关系规则失败：409 `CLINICAL_REPORT_HISTORY_LINEAGE_INVALID`，不返回部分链、不自行修复。持久化 report 基础公开字段或独立生命周期 namespace 不完整则 409 `CLINICAL_REPORT_INCOMPLETE`。
8. 不推断未来报告作废如何生成 replacement；voided 只作为当前已存在版本的可读状态，不新增版本链写规则。

### 5.3 指定历史报告详情

- 响应原样复用 `ClinicalReportDetailResponse { report }` 与 `ClinicalReportPublicMapper`，不建立第二套详情 mapper。
- 允许 report status：draft、pending_confirmation、confirmed、archived、corrected、voided。
- 允许 Patient active/inactive/archived；允许 Visit 所有现有状态。
- 依次检查 Patient、Patient 下的 Visit、同时属于该 Patient 和 Visit 且 type 为 cognitive_assessment 的 report；任何跨 ownership 都表现为 404，不暴露真实位置。
- 复用现有 readable report 完整性条件；不完整为 409 `CLINICAL_REPORT_INCOMPLETE`。
- 不附加版本列表或内部 lineage；导航统一来自版本列表端点。

## 6. 基础随访趋势响应

### 6.1 顶层

```text
{
  scale: {
    scaleCode: string,
    displayName: string
  },
  range: {
    dateFrom: Date | null,
    dateTo: Date | null,
    pointCount: integer
  },
  comparabilityPolicy: {
    version: "wp04-exact-trace-v1",
    comparisonDirection: "current_minus_immediately_previous",
    totalScoreRequiresExactTrace: true,
    domainScoreRequiresExactMapping: true,
    scorePercentIsNotProbability: true,
    noDiagnosticInterpretation: true
  },
  points: PatientFollowUpTrendPoint[]
}
```

- `scaleCode` 是规范化目录 code；`displayName` 优先目录 shortName，缺失时使用 name。
- range 原样反映有效查询边界；pointCount 等于 Visit 数并等于 points.length。
- points 按 assessmentDate asc，同日按 Visit `_id asc`；没有 Visit 时 200、points=[]、pointCount=0。
- 先获得完整 Visit 范围；数量大于 maxPoints 时 409 `FOLLOW_UP_TREND_RANGE_TOO_LARGE`，不得截断。

### 6.2 Point

```text
{
  visit: {
    id: string,
    visitCode: string,
    visitType: AssessmentVisitType,
    status: AssessmentStatus,
    assessmentDate: Date
  },
  scaleInstance: {
    id: string,
    instanceCode: string,
    scaleCode: string,
    scaleVersion: string,
    administrationMode: ScaleAdministrationMode,
    status: AssessmentStatus,
    durationMs: number | null,
    versionTrace: {
      scaleVersion: string | null,
      crfVersion: string | null,
      scoringRuleVersion: string | null,
      fieldEncodingVersion: string | null
    }
  } | null,
  dataStatus: TrendDataStatus,
  score: TrendScore | null,
  domains: TrendDomainScore[],
  comparisonToPrevious: TrendComparison
}
```

- 每个 Visit 都有 point，包括从未施测该量表的 Visit。
- 无实例或多个实例时 `scaleInstance=null`；唯一实例即使非 final/voided/incomplete 也返回其安全摘要。
- `score` 仅 `dataStatus=available` 时非空；其他状态一律 null。
- `domains` 与总分独立：仅 domain source 完整时返回，按 domainCode asc；缺失/不完整时为 []，不影响可用总分。

`TrendDataStatus`：`available | source_missing | source_not_final | source_voided | source_incomplete | source_ambiguous`。

`TrendScore`：

```text
{
  status: "confirmed" | "locked",
  qualityStatus: "passed",
  totalScoreValue: number,
  totalMinScore: number,
  totalMaxScore: number,
  scorePercent: number,
  confirmedAt: Date,
  lockedAt: Date | null
}
```

`TrendDomainScore`：

```text
{
  domainCode: string,
  domainTitle: string | null,
  scoreValue: number,
  minScore: number,
  maxScore: number,
  scorePercent: number,
  weightedScore: number | null,
  weightedMaxScore: number | null,
  itemCount: integer
}
```

空/缺失 title 统一为 null；所有数值必须有限，itemCount 必须为非负整数。

### 6.3 Comparison

```text
TrendComparison = {
  status: "first_point" | "comparable" | "not_comparable" | "unavailable",
  reasons: TrendComparisonReasonCode[],
  scoreDelta: number | null,
  scorePercentDelta: number | null,
  domainDeltas: {
    status: "comparable" | "partially_comparable" | "not_comparable" | "unavailable",
    reasons: TrendComparisonReasonCode[],
    items: [{
      domainCode: string,
      status: "comparable" | "not_comparable",
      reasons: TrendComparisonReasonCode[],
      scoreDelta: number | null,
      scorePercentDelta: number | null,
      weightedScoreDelta: number | null
    }]
  }
}
```

- 顶层 status 只描述总分比较；domainDeltas 独立描述认知域比较，因此 domain 不可用不抹掉总分 comparable。
- 第一条时间点固定 first_point、reasons=[]、两个总分 delta=null，domainDeltas 为 unavailable/[]/[]。
- 后续只与数组中紧邻的前一个 Visit 比较，绝不跳过缺失或不可比点。
- 任一相邻 point 的 dataStatus 非 available：顶层 unavailable，delta 均 null；reasons 至少包含两点 dataStatus 映射后的去重稳定列表。若 `source_incomplete` 的已知原因是 trace 缺失，还必须附加 `version_trace_incomplete`；不得用该细分原因代替 `source_incomplete`。
- 两点 available 但总分 exact trace 不一致：not_comparable，delta 均 null。
- 总分 comparable：delta 固定为当前减前一点；不做阈值、临床方向词、平滑或服务端展示舍入。
- 顶层 first_point/unavailable 时 domainDeltas 固定为 unavailable、items=[]；顶层 not_comparable 时 domainDeltas 固定为 not_comparable，reasons 复制适用的总分 reason，并按两点 domainCode 并集输出 delta 全为 null 的 items。只有顶层 comparable 才继续评估 domain exact mapping。
- domain source 任一不合格时 domainDeltas=unavailable、items=[]、reason=`domain_source_incomplete`；总分 status/delta 不受影响。
- domain 全局 mapping/set 不可比时 domainDeltas=not_comparable，按当前与前一点 domainCode 并集输出 items，delta 为 null；范围只在个别 domain 改变时可产生 partially_comparable。

## 7. 趋势数值来源资格

### 7.1 唯一实例与状态

对每个 Visit 和请求 scaleCode：

1. 0 个 ScaleInstance：`source_missing`。
2. 多于 1 个，不论 instanceNo/status：`source_ambiguous`；不挑最新、最高分或 instanceNo=1。
3. 唯一实例 status=voided 或 Visit status=voided：`source_voided`。
4. 唯一实例 status 非 completed/locked：`source_not_final`。
5. ownership、code、实例标识或必要 trace 矛盾：`source_incomplete`。

### 7.2 总分 source

唯一实例必须恰有一个绑定同 Patient/Visit/Instance/scaleCode 的 runNo=1 ScoreResult：

1. 不存在：`source_missing`；违反唯一性或 ownership：`source_incomplete`。
2. status=voided：`source_voided`；status 非 confirmed/locked：`source_not_final`。
3. qualityStatus 必须 passed；review.reviewStatus 必须 reviewed 或 not_required；confirmedAt 必须有效。
4. locked 状态还必须有有效 lockedAt；voidedAt 必须为空。
5. total 的 value/min/max/percent 必须全部是有限数；min <= value <= max 且 min < max；percent 必须与持久化最终结果一致，不重算。
6. ScaleInstance 与 ScoreResult 的 scaleVersion、crfVersion、scoringRuleVersion、fieldEncodingVersion 必须各自非空，且同一点内逐字段完全一致；否则 `source_incomplete`。
7. 满足全部条件才是 `available`。不重新读取原始作答，不执行评分，不从报告推导数值。

### 7.3 Domain source

只有总分 available 后才评估 domain；必须恰有一个同时绑定同 Patient/Visit/Instance/ScoreResult/scaleCode 的 runNo=1 CognitiveDomainResult：

1. status 是 computed/confirmed/locked，qualityStatus=passed，voidedAt=null。
2. mappingSource=scale_config，mappingMode=item_domain_codes。
3. computation 存在且 warningCount=0；computedAt 如为合法日期则供历史摘要返回，否则按 nullable 口径返回 null，不单独抹掉完整 domain 数值。
4. versionTrace 的四个总分 trace 与实例/ScoreResult 完全一致；domainMappingVersion 非空，且与 mappingSnapshot.mappingVersion 一致。
5. domainScores 非空；domainCode trim+lowercase 后非空且唯一；每条 value/min/max/percent 有限、min <= value <= max、min < max；itemCount 为非负整数。
6. weightedScore 与 weightedMaxScore 必须同时为 null，或同时是有限数；仅一边为 null 属于不完整。weightedMaxScore 为数值时必须非负。
7. 任何 domain source 缺失或不完整只使 `domains=[]` / domain comparison unavailable；不改变总分 `available`。
8. 不读取 itemContributions，不执行 A19，不跨 domain 求和。

## 8. 可比性与稳定 reason code

### 8.1 总分 exact trace

两个相邻 available point 只有以下字段全部完全相等才为 comparable：

- scaleCode；
- scaleVersion；
- crfVersion；
- scoringRuleVersion；
- fieldEncodingVersion；
- administrationMode；
- totalMinScore；
- totalMaxScore。

两点均必须满足第 7 节完整最终 source。空字符串不等于可比较值；任一 trace 缺失使用 `version_trace_incomplete`，不得仅因名称同为 MMSE/MoCA 而比较。

总分 / source reason 固定为：

```text
scale_version_changed
crf_version_changed
scoring_rule_version_changed
field_encoding_version_changed
administration_mode_changed
score_range_changed
version_trace_incomplete
source_missing
source_not_final
source_voided
source_incomplete
source_ambiguous
```

所有适用 reason 都返回、去重，并按上述顺序排序。

### 8.2 Domain exact mapping

在总分 comparable 且两边 domain source 合格后：

1. domainMappingVersion、mappingSource、mappingMode 必须完全相等。
2. 规范化 domainCode 集合必须完全相等。
3. 每个同 code domain 的 min/max 完全相等。
4. weightedMaxScore 的 null/number 类型必须相同；为 number 时值完全相等。
5. 参与 delta 的 scoreValue/scorePercent 必须有限；weightedScore 只有两边均为有限数时计算 delta，两边均 null 时 delta=null；一边 null 一边数值时该 domain 不可比。
6. 认知域沿用完整题分重叠归因；domainScores 不是总分分区，不得跨 domain 求和。

Domain reason 固定为：

```text
domain_mapping_version_changed
domain_mapping_source_changed
domain_mapping_mode_changed
domain_set_changed
domain_range_changed
domain_missing
domain_source_incomplete
```

全局 mapping/version/set reason 适用于所有 item；某 domain 范围或 weighted null/value 变化使用 `domain_range_changed`；集合相同但记录无法定位使用 `domain_missing`。适用 reason 按上述顺序排序。

`TrendComparisonReasonCode` 在 `wp04-exact-trace-v1` 中是本节“总分/source reason”与“Domain reason”两组 code 的闭合集合；不返回自由文本 reason。domainDeltas 因总分不可比时可使用总分 reason，其余 domain 比较只使用 Domain reason。

## 9. 缺失、作废与判定优先级

同一点出现多个问题时按以下优先级确定唯一 `dataStatus`：

1. Visit voided、唯一实例 voided 或 ScoreResult voided → `source_voided`。
2. 多个候选 ScaleInstance → `source_ambiguous`。
3. 无实例或无 runNo=1 ScoreResult → `source_missing`。
4. 实例未 completed/locked 或 ScoreResult 未 confirmed/locked → `source_not_final`。
5. ownership、唯一性、trace、质量、review、时间或数值不完整/矛盾 → `source_incomplete`。
6. 全部通过 → `available`。

Visit voided 必须保留 point 且不得 available。Patient inactive/archived 允许只读，不以当前 Patient/Visit 状态改写历史结果。单点问题通过 dataStatus/reasons 表达，不把整个趋势变成 500；真实数据库异常不得吞掉后伪造空列表。

## 10. 权限、ownership 与公开边界

### 10.1 ownership 顺序

1. Guard/DTO 先处理认证、角色和格式。
2. service 先以 patientId 读取 Patient；不存在为 `PATIENT_NOT_FOUND`。
3. Visit 端点再以 patientId + visitId 读取 Visit；不匹配为 `VISIT_NOT_FOUND`。
4. 所有 ScaleInstance/ScoreResult/CognitiveDomainResult/ClinicalReport 批量读取同时带 patientId 与相关 visit/instance/result ownership；不能以客户端 subjectCode 归属。
5. report detail 同时匹配 reportId + patientId + visitId + 固定 type；不匹配为 `CLINICAL_REPORT_NOT_FOUND`。
6. 跨 Patient/Visit 的资源一律 404，不区分不存在与越界，不泄露其真实归属。

### 10.2 mapper 白名单

历史列表、报告版本列表和趋势各用独立显式安全 mapper；不得 spread document 或内部 summary。除合同字段外一律不公开，尤其禁止：

- patientId、subjectCode、scoreResultId、domainResultId、scaleDefinitionId、scaleVersionId；
- previousReportId、replacementReportId、correctionId、sourceArchiveId、sourceFreezeId、audit ID；
- metadata、qualityHints、Mixed 原始结构、operatorNote、确认/复核意见；
- ItemResponse ID、itemScores、itemContributions、原始作答或规则；
- clinicalContext、Visit notes、内部 operator；
- 媒体 objectKey、签名 URL、Storage 信息；
- 完整 report narrative、AI provider/model/draftText；
- 阈值、正常/异常、风险、概率或诊断标签。

仅允许导航 ID：Visit id、ScaleInstance id、ClinicalReport id；它们只能用于当前 ownership 下路由，不能用作公开 lineage 关系。

### 10.3 非诊断解释

后端只返回原始分数、scorePercent、当前减紧邻前一点的简单差值和明确的缺失/不可比原因。不得输出改善、恶化、下降、进展、正常/异常、MCI/AD 风险、转化概率、诊断/治疗建议、回归、插值、预测、年化率、多量表指数、跨量表换算或 AI 解释。`scorePercent` 不是疾病概率。

## 11. 错误合同

| HTTP | code | 使用场景 |
|---:|---|---|
| 400 | DTO validation | MongoId、枚举、整数、上限、未知 query 或 ISO date 非法 |
| 400 | `INVALID_DATE_RANGE` | dateFrom 晚于 dateTo |
| 401 | 现有认证错误 | 未认证/Session 无效 |
| 403 | 现有角色错误 | 不在四角色集合 |
| 404 | `PATIENT_NOT_FOUND` | Patient 不存在 |
| 404 | `VISIT_NOT_FOUND` | Visit 不存在或不属于 Patient |
| 404 | `SCALE_NOT_AVAILABLE` | 趋势 scaleCode 不在当前可用目录 |
| 404 | `CLINICAL_REPORT_NOT_FOUND` | report 不存在或 ownership/type 不匹配 |
| 409 | `CLINICAL_REPORT_INCOMPLETE` | detail/版本列表所需公开事实或独立 lifecycle namespace 不完整 |
| 409 | `CLINICAL_REPORT_HISTORY_LINEAGE_INVALID` | 完整版本集合有重复、缺口、孤儿、分支或 A25/A26 双向关系不可信 |
| 409 | `FOLLOW_UP_TREND_RANGE_TOO_LARGE` | 匹配 Visit 数大于 maxPoints；message 只提示缩小日期范围，不暴露查询/索引细节 |

趋势单点缺失、非 final、voided、不完整、ambiguous 和不可比不是 HTTP 错误。数据库异常不转换为空历史，也不返回原始 Mongo 错误、索引名或内部 ID。

## 12. 查询编排与性能

### 12.1 历史列表

1. Patient ownership 检查。
2. 无 scaleCode 时直接对 AssessmentVisit 做 filter/count/page；有 scaleCode 时先用一次集合查询取得该 Patient + code 的唯一 Visit ID 集合，将其同时用于 count 和 page，确保过滤发生在分页前。
3. 用当前页 Visit IDs 一次批量读取 ScaleInstance。
4. 用实例 IDs 一次批量读取 runNo=1 ScoreResult，再一次批量读取绑定的 runNo=1 CognitiveDomainResult。
5. 用 Visit IDs 一次读取 ClinicalReport 轻量 lineage/lifecycle 投影。
6. 在内存以严格 ownership key 分组，再交给安全 mapper；禁止每 Visit/Instance 单独查询。

### 12.2 报告版本列表 / detail

- 列表一次读取同 Visit + fixed type 的完整轻量投影，投影只含基础列表字段、必要 lifecycle/correction/lineage namespaces 和内部校验 anchors；全链验证后内存分页。绝不为列表读取 narrative、score/domain/evidence snapshots、AI draft 或来源数组。
- detail 使用现有 ownership 读取和现有 mapper，不经版本列表查询，也不改变 latest。

### 12.3 趋势

1. Patient 校验、catalog 校验、日期范围 Visit 查询；可用 `maxPoints + 1` 上限探测超限，但成功响应必须包含全部匹配 Visit。
2. 一次批量读取 Patient + requested code + Visit IDs 的 ScaleInstance 轻量投影。
3. 一次批量读取实例 IDs 的 runNo=1 ScoreResult；一次批量读取与结果/实例绑定的 runNo=1 CognitiveDomainResult。
4. 使用 lean + explicit projection，内存按 ownership key 求唯一性、source 资格和相邻比较。
5. 不读 ItemResponse、MediaEvidence、ClinicalReport narrative；不调用内部 HTTP endpoint。

### 12.4 索引结论

- Visit `{patientId, assessmentDate:-1}` 直接支持 Patient + 日期 +稳定日期扫描（升序可反向扫描）。
- ScaleInstance `{patientId, scaleCode, startedAt:-1}` 支持 Patient + code 批量候选，`{assessmentVisitId, scaleCode, instanceNo}` 支持按 Visit/code 关系与唯一约束核对。
- ScoreResult / CognitiveDomainResult 的 `{assessmentVisitId, scaleCode, createdAt}`、`{patientId, scaleCode, createdAt}` 及 `{scaleInstanceId, runNo}` 支持批量归集和 runNo=1 唯一读取。
- ClinicalReport `{assessmentVisitId, reportType, reportVersion:-1}` 直接支持完整版本集合与报告摘要；reportCode unique 支持 code 唯一性校验。
- status/type 过滤可能在 Patient/date 扫描后过滤，但首版 pageSize/maxPoints 均有上限，且现有索引覆盖主 ownership/range 路径；先以 explain/真实数据观察，不为形式主义预设复合索引。
- **WP-04 首次实现不新增索引**。也不新增 collection、持久化 read model、缓存、预聚合或后台趋势任务。

## 13. 模块与 Service 边界

### 13.1 锁定方案

- 后续新增无 Schema 的 `ClinicalHistoryModule`，由 AppModule 独立引入。
- `ClinicalHistoryController` 只承载 assessment-history 与 follow-up-trends；`ClinicalHistoryQueryService` 只做跨模块只读编排。
- history mapper、trend mapper、trend source evaluator、comparability evaluator 为无 IO 纯函数/显式 provider。
- 报告列表与历史详情留在 `ClinicalReportsController` / `ReportsModule`；ReportsModule 不依赖 ClinicalHistoryModule。
- Controller 不直接访问 Mongoose Model；ClinicalHistoryModule 不重复 `MongooseModule.forFeature()` 注册任何现有 Schema。

### 13.2 exports/imports 与循环依赖

现有 `PatientsModule`、`AssessmentsModule`、`ScalesModule`、`ScoringModule`、`CognitiveDomainsModule`、`ReportsModule` 已分别 export 所需 service/catalog；ReportsModule 已单向依赖前五者。ClinicalHistoryModule 可单向 imports 这些模块，ReportsModule 不反向 import，故不形成循环。

后续实现只在确有需要时给既有 Service 增加最小、内部、read-only、ownership-scoped、lean/projection 批量方法；不 export Model，不复制 Schema，不将跨域编排塞入底层 Service。

## 14. 后续实施拆分

### 后端实施阶段一

- 患者历史评估列表；
- 报告版本列表、全链 evaluator 和安全关系 mapper；
- 指定历史报告详情；
- 相应 unit 与真实 HTTP E2E；
- 不实现趋势。

### 后端实施阶段二

- 单量表基础随访趋势；
- source/dataStatus evaluator；
- exact trace / domain mapping comparability 纯函数；
- 缺失、作废、ambiguous 与相邻比较；
- 相应 unit 与真实 HTTP E2E。

### 前端阶段

待两个后端阶段响应稳定后再实现患者历史入口、Visit 历史、报告版本/详情、总分/domain 趋势及缺失/不可比提示；不实施诊断解释。阶段编号由后续审核决定，本文不分配。

## 15. Unit、E2E 与前端验收矩阵

### 15.1 Unit

- DTO：默认值、边界、未知字段、trim/lowercase、日期倒置。
- History mapper：nullable、字段白名单、排序、score/domain availability、latest 与 latestArchivedVersion 区分。
- Lineage：空链、V1、V2、V3；重复版本、缺 V1、跳版、分支/孤儿、单边 metadata、错误 ownership/anchor、in-progress correction；校验必须先于分页。
- Trend source：无实例、多实例、Visit/Instance/Score voided、非 final、缺 Score、quality/review/time/total/trace/ownership 不完整；domain 缺失不抹总分。
- Comparability：所有 exact trace 字段逐项变化、范围变化、相邻缺失不跳点、domain mapping/source/mode/set/range/weighted null-value 变化、reason 顺序与 delta 方向。
- Mapper 安全：禁止字段和 Mixed/raw fields 均不能出现。

### 15.2 E2E

- 四角色 200，未认证 401，非许可角色 403；跨 Patient/Visit report 统一 404。
- History 的过滤、含边界日期、分页/total、同日 `_id` tie-break、退役 code 历史过滤、空页。
- Report list 的完整链后分页、safe previous/replacement、invalid lineage 409；detail 六状态与 inactive/archived Patient、所有 Visit 状态可读；latest 回归不变。
- Trend 对每个 Visit 产点、空范围 200、有效但未施测全为 missing、超过 maxPoints 409、不静默截断；多个实例 ambiguous；不可比点不跨越。
- 响应断言不含 patient/source/lineage internal IDs、metadata、raw answer、opinions、narrative、media/storage、AI 或诊断字段。

### 15.3 前端验收

- latest 与正式归档 pointer 不混淆；draft latest 不显示为已归档。
- 报告版本顺序、V1/V2/Vn 导航和状态明确，不展示内部关系 ID。
- 趋势图/表保留 missing/voided/incomplete/ambiguous Visit，断线而非连到更早点。
- 明示版本/施测方式/范围/mapping 变化原因；scorePercent 标注为得分比例而非概率。
- 只表达分数增加/减少，不表达临床改善/恶化或诊断。

## 16. 明确非目标

A28 不实现前端、图表、report diff、narrative 比较、跨量表换算/合成、诊断/概率/AI、随访计划/提醒、科研导出、PDF/打印/下载、AuditLog、报告作废新流程、签名/撤销、患者/Visit 编辑合并删除、自动保存、缓存/预聚合/异步任务、report-by-code 路由、MMSE/MoCA/CRF/seed/评分规则修改或既有 scoring 格式技术债。

与后续工作包边界：WP-05 消费稳定历史访问但自行定义导出/脱敏；WP-06 自行定义 AI 输入审核；WP-07 自行定义读取/操作审计；TC-05 自行定义报告作废及相关链路规则。WP-04 不预设这些契约。

## 17. 零未决项

- 接口路径、Controller 归属、Param/Query 字段、默认值、上限、排序、分页、角色、ownership、错误码、nullable、dataStatus、comparison status/reason、数值来源、exact trace、domain mapping、查询编排、索引和模块方向均已锁定。
- 未决产品/技术项：**0**。
- 后端已按本文完成 A27 与 A28：`assessment-history`、`clinical-reports` 版本列表、`clinical-reports/:reportId` 与 `follow-up-trends` 均已实施。
- A28 实测为变更范围定向 lint、build、88 suites / 751 unit tests 与 17 suites / 76 E2E tests 通过；完整 lint 仍仅有既存 scoring 三文件的 51 个 Prettier errors、0 warnings。
- WP-04 后端范围已完成；前端趋势图/表、版本导航与产品验收尚未实施，所以工作包继续进行中，下一阶段不在本文预分配编号。
