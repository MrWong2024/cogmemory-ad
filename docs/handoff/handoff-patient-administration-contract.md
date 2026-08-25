# CogMemory AD / 智忆评 受监督患者施测合同

## 1. 文档定位、基线与强制原则

- 本文是 WP-10 受监督患者施测的稳定合同入口，锁定一期院内受监督 MMSE / MoCA 所必需的业务、媒体、数据、安全和人工复核边界。
- 本合同最初形成时所依据的代码基线为 `4141953e7bd3700ed585bf6ebe1ad789afbcbc50`；该 SHA 仅用于合同形成过程追溯，不表示当前开发或 Codex 执行 Git 基线。本合同形成时依据该历史基线的 roadmap、backend / frontend handoff、直接相关代码，以及 `.local/reference/MMSE+MoCA.pdf`。
- 本次核对的 PDF 为 8 页，SHA-256 为 `9BEB51BC8C509E17F6519154F059817875D861E13F8DE2BD6BBE78FD4DE6E59A`。该值用于来源追溯，不替代后续正式资产包自身的逐文件校验。
- **最低充分复杂度优先。** 在满足业务目标，并保证数据完整性、权限、安全、隐私、正常主流程、不可逆业务事实、必要防重复和关键失败恢复的前提下，多个方案均能满足要求时，优先采用实现、测试和维护复杂度最低的方案。该原则属于项目全生命周期长期原则；本文虽锁定一期合同，也不得把它解释为只在一期适用或可以为简单而牺牲正确性。
- 优先复用既有 `ScaleVersion`、`ScaleInstance`、`ItemResponse`、`MediaEvidence`、Storage、staff Session、审计、提交屏障、评分和报告链。每个新增概念、状态、持久事实、抽象或实现要求都必须证明为当前合同所必需；无法证明者必须删除、列为非目标，或留待真实需求出现后重新评估。本文不授权建设通用量表平台，也不授权把患者原始作答直接写成正式临床答案。
- 本文锁定稳定业务、安全和数据语义；当前 Schema、字段、集合、DTO、endpoint、错误码、Cookie 名称、Service 划分和测试资产以最新代码及对应 handoff maps / snapshot 为准，不在本合同重复维护。

## 2. 当前事实与合同适用方式

- 本合同复用现有 `ScaleVersion`、`ScaleInstance`、`PatientAdministrationSession`、`ItemResponse`、`MediaEvidence`、Storage、staff Session、CAS、提交屏障、评分和报告链，不建立平行模型或旁路写入。
- 患者原始事实、ASR 候选与现场医护观察的事实来源语义保持可区分；医护 / 医生通过现有 `ItemResponse` 草稿、readiness 与 A16 整体提交链形成本次正式结果，具体技术形状以最新实现为准。
- 当前 Schema、endpoint、DTO、Service 和测试资产等实现事实由最新代码及 backend API / DTO / service maps 与 snapshot 维护；本文只维护稳定业务、安全和数据语义。

## 3. 一期范围与职责

- 一期仅服务院内、医护在场或监督下的 MMSE / MoCA；患者施测终端与临床工作端协同完成量表。
- 三种施测方式必须保持区分：`clinician_administered` 表示系统操作主要由医护完成；`supervised_patient_input + same_device` 表示医护准备后把同一设备安全交给患者，由患者直接完成患者端正式操作；`supervised_patient_input + cross_device` 表示医护与患者分别使用独立设备。单设备不等于或默认 `clinician_administered`。
- `supervised_patient_input + same_device` 与 `supervised_patient_input + cross_device` 均为正常支持方式，根据现场设备数量、屏幕条件和临床工作方式选择；不得将其中一种规定为默认、推荐、次要或降级模式。两种方式都必须遵守同一患者原始事实、医生复核和正式结果边界。
- 患者终端只展示当前步骤所需的最少信息，不展示答案、评分标准、得分、报告、诊断倾向、医生意见、其他患者信息或完整量表目录。
- 正常 happy path 中，医护负责准备、现实中的实物提供、动作观察和必要辅助；患者负责连续完成患者端正常题目主链。医护端不要求逐题同步写入，“医护需要观察”不等于“当前步骤必须由 staff 系统按钮才能推进”。
- 暂停、接管、重做、technical replay、重签和终止用于异常恢复或控制，不嵌入每条正常患者 Browser 主链，也不把医护端变成正常流程的逐题第二写入者。
- 医护 / 医生负责整份量表的作答复核：先查看系统整理的完整施测结果与现有 `ItemResponse` 草稿，对需要人工观察判断的题目依据现场医护观察补录答案，有业务需要时再查看录音、ASR 候选、书写绘图和施测控制事实，通过现有 `ItemResponse` 草稿链形成或修订结构化答案，并由具备现有 A16 权限的临床工作用户在 readiness 满足后执行整体正式提交；既有评分和报告链继续在正式提交之后运行。
- 医生可以同时承担施测和复核职责；本文不新增长期患者账号、patient 角色、互斥 staff 角色或第二套临床应用。

## 4. 三类存储边界

| 类别 | 位置 | 保存内容 | 强制边界 |
|---|---|---|---|
| 题目呈现资产 | 应用仓库内部的私有只读运行目录 | 静态题目图片、固定测量刺激 MP3、固定题目及指导语 MP3、单包 manifest | 属于量表版本和施测步骤发布资产；版本化；released 后不可原地覆盖；只允许有效患者会话读取当前步骤获准资产；不属于 `MediaEvidence` |
| 回答与证据对象 | OSS 私有 Bucket | 适用口头步骤的患者短录音、患者最终绘图和书写结果、纸笔结果照片及其他当前步骤必要证据 | 关联患者、访视、`ScaleInstance`、`ItemResponse` 或对应施测事实；记录上传、访问、作废和保留事实；不提供公开永久 URL；正式与已作废对象不原地覆盖 |
| 结构化业务数据 | MongoDB | 量表版本与步骤合同、资产逻辑键、展示和播放规则、OSS 对象键与元数据、当前代码明确需要持久化的患者原始事实、ASR 候选、既有控制 / 影响因素事实、医护在复核中通过现有 `ItemResponse` 形成的正式观察结论，以及其他已明确需要持久化的业务事实、整体提交、评分、报告和审计事实 | 不保存图片或录音二进制，不保存 Base64 文件；患者候选、复核草稿与整体提交后的正式结果必须可区分；“医护观察”是事实来源语义，不默认要求独立 observation persistence |

题目呈现资产与患者证据不得混存：前者是只读发布资产，后者是临床作答证据。MongoDB 只保存逻辑关系和元数据，不成为文件仓库。

## 5. 题目呈现资产包

### 5.1 唯一目录

一期目录固定如下，不增加语言、机构、租户、地区、环境或其他当前无需求层级：

```text
cogmemory-ad/
  .local/
    reference/
      MMSE+MoCA.pdf
    presentation-assets/
      mmse/
        1.0/
          package-001/
            manifest.json
            images/
            audio/
      moca/
        1.0/
          package-001/
            manifest.json
            images/
            audio/
```

`.local/reference/MMSE+MoCA.pdf` 和 `.local/presentation-assets/` 中的正式资产都是私有本地或部署资产，不提交到当前公开 Git 仓库。不得增加 `cn-1.0`、机构号、租户号或其他推测性目录。

### 5.2 正式图片

当前 PDF 中至少有四项患者视觉刺激：

| 量表 | 步骤 | 来源页 | 资产边界 |
|---|---|---:|---|
| MMSE | 相交五边形复制 | PDF 第 2 页 | 单一刺激图 |
| MoCA | 交替连线图 | PDF 第 3 页 | 保持点位、文字和整体布局 |
| MoCA | 立方体 | PDF 第 4 页 | 单一刺激图 |
| MoCA | 三种动物组合图 | PDF 第 5 页 | 保持原组合和动物顺序，不拆分重排 |

图片只能从 PDF 精确提取或裁剪，去除无关页眉、页脚、表格、评分栏和上传控件文字，保持原始比例、布局和刺激内容，并转换为清晰 PNG。严禁 AI 重绘、生成替代图、美化、补线、纠正图形、改变动物顺序、改变连线点位、拆开组合图后重新响应式排版，或向患者呈现答案与评分标准。

MMSE 命名继续使用真实手表和铅笔，不生成或寻找替代图片。MoCA 钟表由患者自行绘制，不生成标准钟表刺激图。

### 5.3 固定题目音频

- 正式题目音频统一为 MP3、中文普通话成年女声，平静、中性、清晰，无背景音乐、环境音或装饰音效。
- 当前固定题目音频使用 `node-edge-tts` 在生产运行链之外联网预生成，不使用需要账户或 API Key 的 TTS 服务，不使用 Python；`node-edge-tts` 不进入 backend、frontend 或生产环境正式依赖。正式施测只播放冻结 MP3，不调用实时 TTS。
- 同一资产包统一使用经人工确认的普通话成年女声、语言、MP3 输出格式、音调和音量。普通指导语保持正常或稍慢、自然、清晰和中性，以已验收样本的整体听感为参考；不得将某个全局 `rate` 参数作为所有指导语的绝对门禁。
- 每个 MP3 生成后必须由人工逐个试听；全部图片和 MP3 完成人工验收前，资产包必须保持 `draft`。只有用户明确确认整包通过后才能改为 `released`；released 后不得原地替换，修订必须形成新 package。
- 音频业务角色只允许三种：`guidance`（普通指导或问题）、`stimulus`（内容本身属于测量刺激）、`prompt`（医护按条件解锁的补充提示）。不得增加供应商、音色或通用音频工作流角色。
- 只有播放权限或重播规则不同才拆分音频。指导与受控刺激的重播边界不同，必须分开；同一权限和播放规则下不得为管理方便无意义拆分。
- 数字串按逐位读法制作，不得把连续数字直接交给 TTS 当整数朗读。
- 对 PDF 明确要求每秒一个词或数字的测量刺激，必须按具体题项单独制作和人工验收，实际播放节奏优先于 `rate` 参数。已验收的 MMSE 三词样本只作为听感参考，不作为全部量表或全部刺激的统一节奏标准；一期不建设毫秒级自动节奏判定。
- 固定复述句和多步骤动作指令应保持自然、清晰和中性，不额外添加提示，不通过人为拖慢、重复强调或拆解原文改变施测条件。

### 5.4 单一 manifest

每个 package 只保留一个 `manifest.json`，同时登记图片和 MP3。manifest 只承担：

- package 标识、量表、版本和 `draft` / `released` 状态；
- 来源 PDF 名称、校验算法与校验值；
- 资产逻辑键、对应施测步骤、`image` / `audio` 类型；
- 音频的 `guidance` / `stimulus` / `prompt` 角色（图片不虚构音频角色）；
- package 内相对路径、音频朗读文本、来源页；
- 文件校验和，以及音频时长等运行所需基本元数据；
- 整包人工验收人和验收时间。

manifest 不承担独立资产数据库、资产管理后台、多级审批、TTS 厂商历史、音色管理、在线编辑、通用媒体发布、CDN、启动下载、多服务器同步、热更新或自动回滚。

## 6. 题目资产访问与播放

- 前端只使用逻辑资产键，不取得服务器绝对路径；题目资产不得放入公开静态目录。
- 患者端不得一次取得完整量表资产列表。有效患者会话只能读取服务端当前步骤允许的资产；换步后按服务端当前事实重新授权。
- 条件提示不得提前下发、预加载或出现在 HTML / 页面状态中。
- 未经 staff 授权，患者不得重播 `stimulus`；technical replay 必须由 staff 授权并记录原因，授权后患者端可显式触发一次获授权的 `stimulus` 播放，服务端仍负责最终裁决。
- `guidance` 可在当前步骤受控重播，记录必要的播放次数；是否由患者按钮发起或由医护代为发起按逐题矩阵执行，不扩展为任意播放列表。
- `prompt` 只在医护确认前一阶段失败后解锁；未解锁时患者设备不得取得文件或文本。
- 私有资产响应采用不可缓存口径；患者结束、终止、过期或换设备后旧凭证不得继续取回资产。
- 一期不建设 DRM、媒体加密、专用播放设备、CDN 或媒体同步平台。

## 7. 正式施测前准备与练习

正式开始前由医护完成并确认：

1. 当前患者、访视和量表实例核对。
2. 屏幕显示与基本操作确认。
3. 音量试听。
4. 适用的麦克风本地检查。
5. 记录明显影响因素。

本地 `PatientAdministrationPreparation` 的 `ready` 只承担 `screen`、`input`、`sound`、`microphone` 四项必要设备检查。`microphone=true` 只表示当前页面已经通过实际 `MediaRecorder` 流程取得 `Blob.size > 0`、可供本地回放的短录音；每次重新检查都会先撤销旧成功事实。浏览器不支持录音、权限拒绝、麦克风设备不可用、录音初始化或运行失败、无法形成非空本地录音时均保持 `microphone=false`，不得以“已检查但不可用”、影响因素或手工勾选视为完成。

当前支持的 supervised MMSE workflow 包含必须形成患者 audio Evidence 的 speech steps，因此上述麦克风失败均表示必要设备检查未完成；必须检查权限，或更换麦克风、设备、支持录音的浏览器后重新检查成功，才能开始正式患者施测。该门禁限定当前支持的 supervised MMSE workflow，不把所有未来 Scale 永久规定为必须使用麦克风。四项全部完成后，same-device 可继续既有 preparation confirm；cross-device 患者可告知医护本机必要设备检查已完成，再由医护按既有合同显式确认。本地测试录音只存在于当前页面内存，不上传、不保存、不进入 Evidence、不调用 ASR，也不建立 checklist Schema 或设备可信历史。

触摸 / 书写不计分操作练习推荐给不熟悉设备的患者，按需展开使用，不是每次正式施测的强制门槛，也不影响 preparation `ready`。患者已熟悉设备时可以完全跳过练习。练习不使用正式刺激，画布只存在于当前患者设备内存；不上传、不计分、不保存，不进入正式 timing、`ItemResponse`、`MediaEvidence`、报告或正式播放次数，离开或 reset 后自然丢弃。

当前一期中文量表的施测语言由既定 `ScaleVersion` 与呈现资产合同决定，准备页不通过本地 checkbox 选择或改变施测语言；未来多语言能力另行设计。不得建设麦克风分贝分析、噪声评分、设备质量报告或练习历史系统。

## 8. 患者施测会话与控制权

### 8.1 最低充分会话语义

- 不创建患者长期账号或 patient 角色。同设备和跨设备都使用短期受控患者施测会话。
- `supervised_patient_input` 的设备方式必须在创建 `PatientAdministrationSession` 时由客户端明确选择并持久化为 `same_device` 或 `cross_device`；两者是同级正常方式，创建后不可修改，也不存在第三种设备方式。选择错误时可终止当前开放会话，并仅在该 `ScaleInstance` 不存在 completed 历史时重新创建；不提供 switch / change-flow 接口。
- `same_device` 创建时不生成、不持久化也不返回六位进入码；完成准备确认后通过同设备安全 handoff 签发患者凭证。只有 `cross_device` 创建、重签和兑换六位进入码。
- 同设备安全交接进入患者模式后，当前浏览器的 staff Session 必须失效，浏览器只持有 patient 身份；患者不能通过后退、刷新、历史记录或普通导航进入临床工作端。医护现实中一直在患者旁边，不等于浏览器中的 staff Session 可以继续保留。
- same-device handoff 同时承担 prepared 首次交接、paused 凭证替换，以及未过期 active Session 在医护显式重新认证后的安全再次交接。prepared 首次 handoff 才从 prepared 进入 active 并首次启动计时；paused handoff 保持 paused；active re-handoff 保持 active，并复用同一 Session、当前步骤、首次 `startedAt`、原 `expiresAt`、准备事实和患者已完成事实，只轮换 patient credential、使旧 credential 立即失效并撤销本次 staff 身份。active re-handoff 不续期、不重置施测、不创建新 Session，也不重新启动或改写 Visit / ScaleInstance；paused 与 cross-device 的既有合同保持原义。
- 跨设备使用六位数字的一次性短期进入码：十分钟有效，只能成功兑换一次。进入码不是患者账号或长期凭据；患者设备持有 patient Session，独立医护设备继续保留 staff Session。
- 同一 `ScaleInstance` 同时只允许一个有效患者设备。换设备时旧患者凭证立即失效。
- 患者会话绝对有效期为两小时，不做空闲心跳、滑动续期或自动续期。
- 会话必须表达准备、活动、暂停、完成、终止和过期语义；这些是业务语义，不预先规定最终枚举名或 Schema。
- `prepared` 仅表示患者施测会话已准备，不代表 Visit 或 ScaleInstance 已真正开始；创建会话、same-device 准备确认、cross-device 进入码创建 / 重发 / 兑换和单纯查看页面都保持父级 `draft / startedAt=null`。same-device 仅在首次安全 handoff 使 Session 从 prepared 转 active 时开始，cross-device 仅在准备确认真正使 Session 从 prepared 转 active 时开始；Session、当前 ScaleInstance 与所属 Visit 必须共用同一个服务端首次 start timestamp，并把父级 draft 推进为 in_progress。pause / resume、换凭证和后续复核不得重置或覆盖该时间。
- `completed` 是同一 `ScaleInstance` 患者施测成功完成的永久终点；历史中存在任意 completed `PatientAdministrationSession` 时，不得再次创建患者施测会话。`terminated` / `expired` 表示未成功完成，只有在不存在 completed 历史时才允许重新创建；terminate + recreate 仅用于失败、中止或设备方式选择错误后的恢复，不是 completed 后重测。
- terminate / expiry 本身继续保留失败施测事实，不自动删除任何 Session、Evidence 或实例。对于不存在 completed 历史、没有开放 Session、没有 submission barrier / 正式结果且满足当前 backend eligibility 的 `supervised_patient_input` 未完成实例，医护可另行显式执行窄范围物理删除；该动作把 terminated/expired Session、患者原始 Evidence 及其明确持有的私有 Storage objects 作为整个失败 attempt 一并清除。completed Session 永不进入该能力，DELETE 也不自动 terminate。
- 对 MMSE `supervised_patient_input`，completed 是进入正式医护复核与量表提交的唯一成功门槛。无 Session、prepared、active、paused、terminated、expired 都仍属于患者施测阶段：前端不开放正式 ItemResponse、readiness / submit、评分或认知域；后端 A14 正式 draft write 返回 `PATIENT_ADMINISTRATION_NOT_COMPLETED`，A16 readiness 返回 blocking `SCALE_INSTANCE_PATIENT_ADMINISTRATION_INCOMPLETE`，直接 submit 复用同一 evaluation 不能绕过。该门禁只读历史 completed 事实，不改变 Session 生命周期、same-device / cross-device、父级 startedAt 或任何 Session。
- 患者只能读取和完成服务端当前步骤，不能自行跳题；但正常 happy path 应由患者端连续推进整个正常题目主链。条件提示等合同明确的受控步骤仍由医护解锁，不能把“需要医护临床观察”机械等同为“需要 staff 同步系统写入才能进入下一题”。
- cross-device 存在保持有效 staff Session 的独立医护终端时，医护可通过该终端执行暂停、接管、纠正、恢复、换设备或终止等已存在控制操作。
- same-device 安全交接后，当前浏览器 staff Session 已失效，患者施测期间不保留隐藏 staff 权限，也不承诺医护可以在同一设备上无须重新认证就实时执行 staff 控制。正常 happy path 由患者连续完成主链，医护进行现实观察和必要辅助。
- same-device 确需系统内异常干预时，必须先停止患者操作，将设备交回医护，由医护显式重新认证取得 staff 权限后再执行必要控制。
- 无论 same-device 或 cross-device，旧患者设备或旧患者操作在控制权变化后提交的 stale write 都必须被服务端安全拒绝，不能覆盖已经成功的新服务端事实；既有 CAS、安全拒绝、读取最新状态和用户显式重试原则不变。
- 患者刷新或网络恢复后只从服务端权威状态恢复当前步骤；不依赖浏览器历史、客户端步骤号或本地持久队列决定进度。
- 一期使用普通 HTTP 与服务端权威状态；不建设 WebSocket、SSE、Redis、在线心跳中心、屏幕镜像或双端协同编辑。
- 合同修正前缺少设备方式的 legacy 会话不得根据患者凭证、准备时间或进入码过期时间推断或写回模式；对外摘要返回 null，终止仍允许，handoff、重签、准备确认等 mode-specific mutation 使用既有 session conflict fail closed。

长期默认不要求患者端与临床端同时写入时进行无缝自动协调。控制权变化或并发写入时，服务端可以安全拒绝已经过期的操作；被拒绝的一方应重新读取服务端权威状态，并由患者或医护显式决定是否重试。不得自动重放可能产生业务副作用的操作，已经成功的事实也不得被旧操作覆盖。该原则用于降低并发协调复杂度，不削弱数据一致性、控制权边界或关键失败恢复。

系统级允许正常并行：医护 A 服务患者 A、医护 B 服务患者 B，以及不同 `Patient`、`Visit`、`ScaleInstance` 或 `PatientAdministrationSession` 的工作无需全局串行。读操作正常并发。同一个业务聚合、同一个 `ScaleInstance` 或同一个 Session 内，业务允许时优先一个阶段只有一个主要写入主体，不把多人实时协同编辑同一评估作为默认能力。“串行优先”不表示 Node 单线程、全局 mutex、MongoDB 全局锁、Redis 锁、`session locked` 字段、所有 HTTP 请求排队、分布式锁或 worker 全局串行。

具体 HTTP 路径、刷新频率、凭证载体、Cookie 名称和服务拆分由 WP-10 根据最新代码确定，但不得改变上述业务语义。

### 8.2 单设备与双设备正常流程

`supervised_patient_input + same_device` 的正常流程固定为：

医护登录
→ 选择患者 / 访视 / 量表
→ 完成必要设备检查；患者需要时可先进行不计分操作练习
→ same-device 安全交接
→ staff Session 失效，浏览器进入 patient 身份
→ 患者在医护现场监督下连续完成正常正式施测
→ 患者结束并交还设备
→ 医护 / 医生重新认证
→ 进入复核和正式结果流程。

same-device 中重新认证是有意接受的简单安全边界，也是共享设备从 patient 身份重新取得 staff 权限的明确授权动作。患者施测期间不承诺实时 staff 系统控制；确需干预时先停止患者操作、交回设备并完成显式重新认证。允许为此多一次登录；不得为了减少一次重新认证而建设同一浏览器内 staff + patient 双身份长期共存、隐藏 staff Session、临时 PIN 解锁、自动恢复 staff 身份、双身份 Cookie 或快速切换状态机。

`supervised_patient_input + cross_device` 中，staff 设备保留 staff Session，patient 设备持有 patient Session；存在有效 staff 终端时，医护可直接执行必要异常控制。患者端负责正常题目呈现和患者操作，医护端主要负责准备、现实观察、必要辅助和异常控制。双设备只是角色分工，不等于双写者；正常 happy path 尽量不要求医护端逐题写入同一 Session。设备屏幕大小不决定角色，具体屏幕分配与响应式合同以 frontend design baseline 为准。

### 8.3 完成与安全退出

- 患者完成只表示患者侧步骤结束，不等于量表正式提交、评分确认或报告形成。
- 完成、终止或过期后立即清除患者页面中的身份、题目、资产、回答预览和短期访问状态。
- 患者结束页只提示已结束并交还设备，不显示分数、报告、医生意见或诊断信息。
- 返回临床工作端必须由医护重新登录或通过其他显式重新验证；不得仅依赖后退、关闭患者遮罩或普通导航恢复 staff 权限。

## 9. MMSE 逐题呈现与作答矩阵

表中“技术重播”均指 staff 授权并记录原因；授权后患者端可显式触发一次获授权的 `stimulus` 播放。“医生确认”描述最终专业判断与临床责任；相关答案通过现有 `ItemResponse` 草稿链复核，并由具备现有权限的临床工作用户在整份量表满足 readiness 后执行 A16 整体正式提交，不表示确认后才创建或复制 `ItemResponse`，也不重新定义 A14 / A16 技术接口角色；具体写权限继续服从当前 backend 授权合同。矩阵中“医生核对录音后确认”等表述只描述可参考的证据和最终专业判断，不要求正常复核机械逐题播放全部录音、打开全部图片或检查全部 ASR；系统应先提供可直接支持复核的结构化摘要，有业务需要时再展开原始媒体。所有明确口头回答的步骤默认形成该步骤短录音，不进行整场持续录音。

| 题目 / 步骤 | 患者可见文字 | 视觉刺激 | 音频角色与内容 | 默认播放 | 重播边界 | 患者作答 | OSS 证据 | 医护职责 | 正式评分确认 |
|---|---|---|---|---|---|---|---|---|---|
| 时间定向 | 当前子问文字，可依次显示年、季节、月、日、星期；不显示答案 | 无 | `guidance`：当前子问 | 每个子问进入时自动 | 当前子问可受控重播；记录次数 | 口头回答 | 本步骤短录音 | 确认问题顺序、记录影响因素 | 医生核对录音 / 记录后确认五个子项 |
| 地点定向 | 当前子问文字，可依次显示城市、区 / 城区、街道、楼层、地点；不显示答案 | 无 | `guidance`：当前子问 | 每个子问进入时自动 | 同上 | 口头回答 | 短录音 | 确认当前地点口径，不向患者提示答案 | 医生确认五个子项 |
| 即刻回忆 | 只显示“请听题并口头回答”，不显示三个词 | 无 | `guidance`：任务说明；`stimulus`：皮球、国旗、树木 | guidance 后自动播放 stimulus 一次 | guidance 可受控重播；未经 staff 授权不得重播 stimulus；technical replay 按已授权的一次播放执行 | 口头复述 | 短录音 | 确认刺激完整播放并记录异常 | 医生确认三个词表现 |
| 注意力和计算力 | 显示“请从 100 开始连续减 7，并把每次答案说出来”；不显示正确序列 | 无 | `guidance`：题目说明 | 进入时自动 | 可受控重播；不得播报正确答案 | 口头连续回答 | 短录音 | 必要时记录中断或无法完成 | 医生逐步确认五次结果 |
| 延迟回忆 | 只显示“请回忆刚才记住的三种东西”，不显示词语 | 无 | `guidance`：回忆问题 | 进入时自动 | 可受控重播，不补充词语提示 | 口头回答 | 短录音 | 不提供未获准提示 | 医生确认三个词 |
| 命名 | 显示“请说出医护展示物品的名称”，不显示物品名 | 医护依次出示真实手表和铅笔；无图片资产 | `guidance`：命名问题 | 医护出示实物后自动或规范口述 | guidance 可受控重播 | 口头命名 | 短录音 | 控制实物和顺序，不能用替代图片 | 医生确认两个命名结果 |
| 重复 | 只显示“请听完后原样重复”，不显示短句 | 无 | `stimulus`：大家齐心协力拉紧绳 | 进入时自动一次 | 未经 staff 授权不得重播；technical replay 按已授权的一次播放执行 | 口头复述 | 短录音 | 确认播放完整 | 医生按 PDF 标准确认 |
| 阅读并执行 | 明确要求患者念出目标文字并按其意思执行；目标文字仍为“请闭上您的眼睛”，不显示评分标准 | 目标文字“请闭上您的眼睛”本身 | 无，不得语音播报目标文字 | 不播放 | 不适用 | 阅读目标文字并闭眼 | 本步骤短录音，只记录患者实际阅读证据 | 现实观察是否闭眼；后续可按需参考录音 / ASR 候选核对实际阅读；记录文盲或其他影响因素 | 仍由医护按原 MMSE 标准独立确认 0 / 1；录音、ASR 和闭眼观察均不自动评分 |
| 三步指令 | 只显示“请听完指令并按要求完成”，不显示三步原文 | 真实纸张 | `stimulus`：用右手拿纸、双手对折、放在左腿；也可由医护按同一规范发出 | 音频一次，或由医护规范口述一次 | 未经 staff 授权不得重播；technical replay 按已授权的一次播放执行 | 完成实物动作 | 默认无录音、无视频 | 逐步观察右手拿纸、对折、放左腿 | 医生确认三个观察子项 |
| 表达 / 写完整句子 | 显示“请写一个完整的句子” | 空白书写区或纸张 | `guidance`：书写要求 | 进入时自动 | 可受控重播 | 平板书写，或纸笔书写后拍照 | 最终书写 PNG 或纸笔照片 | 确认输入方式并记录文盲 / 手部影响 | 医生查看原件 / 图像后确认 |
| 绘图 | 显示“请照着这个图形画下来”，不显示评分标准 | PDF 精确提取的相交五边形 PNG | `guidance`：复制图形要求 | 图片显示后自动 | guidance 可受控重播；图片只在当前步骤可见 | 平板绘图，或纸笔绘图后拍照 | 最终绘图 PNG 或纸笔照片 | 确认刺激未变形、记录操作影响 | 医生按 PDF 标准人工确认 |

MMSE 的命名、阅读并执行、三步指令等观察型步骤遵循同一正常主链原则：患者完成题目或动作后继续患者端流程，医护现场观察，观察结论在后续医护 / 医生复核阶段形成正式记录。谁负责临床判定与谁推动 patient Session 到下一步必须解耦；正常流程不得仅因这些步骤需要观察而要求 staff 逐题同步系统写入。

## 10. MoCA 逐题呈现与作答矩阵

| 题目 / 步骤 | 患者可见文字 | 视觉刺激 | 音频角色与内容 | 默认播放 | 重播边界 | 患者作答 | OSS 证据 | 医护职责 | 正式评分确认 |
|---|---|---|---|---|---|---|---|---|---|
| 交替连线 | 显示必要连线指导，不显示正确完成图或评分标准 | PDF 精确提取的整幅交替连线 PNG | `guidance`：PDF 指导语 | 进入时自动 | guidance 可受控重播 | 平板连线，或纸笔完成后拍照 | 最终图 / 照片 | 指明起点和终点、观察自我纠正并记录用时 | 医生确认顺序、交叉和用时事实 |
| 立方体 | 显示“请照着图形画下来”，不显示评分标准 | PDF 精确提取的立方体 PNG | `guidance`：复制要求 | 进入时自动 | guidance 可受控重播 | 平板绘图或纸笔照片 | 最终图 / 照片 | 确认图片原比例呈现 | 医生按 PDF 标准确认 |
| 钟表 | 显示画圆形钟表、填全部数字并指示 11 点 10 分的要求 | 无标准钟表刺激图；空白作图区 | `guidance`：完整绘制要求 | 进入时自动 | guidance 可受控重播 | 平板绘图或纸笔照片 | 最终图 / 照片 | 不展示标准答案图 | 医生分别确认轮廓、数字、指针 |
| 动物命名 | 显示“请从左到右说出图中动物名称”，不显示名称或答案 | PDF 精确提取的三种动物组合 PNG，不拆分 | `guidance`：命名问题 | 进入时自动 | guidance 可受控重播 | 口头回答 | 短录音 | 保持图片顺序和整体布局 | 医生确认三个命名结果 |
| 即刻记忆第一次 | 只显示“请听题并说出记住的词”，不显示词语 | 无 | `guidance`：第一次说明；`stimulus`：面孔、丝绸、学校、菊花、红色，按 PDF 节奏 | guidance 后自动播放 stimulus 一次 | 未经 staff 授权不得重播 stimulus；technical replay 按已授权的一次播放执行 | 口头回忆 | 本试次短录音 | 记录原始表现，不提示答案 | 不计总分；医生确认记录 |
| 即刻记忆第二次 | 同上，不显示第一次结果或词语 | 无 | `guidance`：第二次说明；`stimulus`：同一词表 | 医护进入第二试后自动一次 | 同上 | 口头回忆 | 本试次短录音 | 确认第二试独立记录 | 不计总分；医生确认记录 |
| 数字广度顺背 | 只显示“请听完后按原顺序复述”，不显示数字 | 无 | `guidance`：任务说明；`stimulus`：2、1、8、5、4，逐位按节奏 | guidance 后自动播放 stimulus 一次 | 未经 staff 授权不得重播 stimulus；technical replay 按已授权的一次播放执行 | 口头复述 | 短录音 | 确认播放完整 | 医生确认 |
| 数字广度倒背 | 只显示“请听完后倒序复述”，不显示数字或正确答案 | 无 | `guidance`：任务说明；`stimulus`：7、4、2，逐位按节奏 | guidance 后自动播放 stimulus 一次 | 同上 | 口头复述 | 短录音 | 确认播放完整 | 医生确认 |
| 警觉性 | 只显示“听到目标数字时敲一下桌子”，不得显示数字串 | 无 | `guidance`：听到 1 敲桌；`stimulus`：`52139411806215194511141905112`，逐位按 PDF 节奏 | guidance 后由医护确认开始，stimulus 自动一次 | 未经 staff 授权不得重播 stimulus；technical replay 按已授权的一次播放执行 | 敲桌，不改成屏幕点击 | 默认无录音、无视频 | 观察漏敲 / 误敲并记录错误次数 | 医生确认观察结果 |
| 连续减 7 | 显示从 100 连续减 7 的要求，不显示正确序列 | 无 | `guidance`：题目说明 | 进入时自动 | 可受控重播，不播报答案 | 口头连续回答 | 短录音 | 记录中止或无法完成 | 医生逐步确认 |
| 句子复述 | 只显示“请听完后原样重复”，不得显示句子 | 无 | 两个独立 `stimulus`：PDF 两个复述句；按步骤依次播放 | 每句各自动一次 | 未经 staff 授权不得重播；technical replay 按已授权的一次播放执行 | 每句口头复述 | 每句或本步骤短录音 | 控制两句顺序，不提前下发第二句 | 医生分别确认两句 |
| 词语流畅性 | 显示“请在一分钟内尽可能多地说出动物名称” | 无 | `guidance`：完整要求与开始提示 | 进入时自动，医护确认后开始计时 | guidance 可受控重播；正式开始后不重启以掩盖结果 | 连续口头回答 | 一分钟步骤短录音 | 启停计时、记录中断和影响因素 | 医生核对名称记录与时间后确认 |
| 抽象：火车和自行车 | 只显示“请听题并说明共同点”，不显示标准答案 | 无 | `guidance`：当前词对问题 | 进入时自动 | 可受控重播，不提供额外启发 | 口头回答 | 短录音 | 不提供未获准解释 | 医生确认 |
| 抽象：手表和秤 | 同上 | 无 | `guidance`：当前词对问题 | 进入时自动 | 同上 | 口头回答 | 短录音 | 同上 | 医生确认 |
| 延迟回忆 | 只显示自由回忆的中性说明；不得显示五个词、分类或选项 | 无 | `guidance`：自由回忆；失败后由医护逐词解锁 `prompt` 分类提示，再按条件解锁多选提示 | 先播放自由回忆 guidance；prompt 仅在前一阶段失败后取得并播放 | 未解锁 prompt 不下发；prompt 技术重播需原因 | 自由回忆及必要的提示后口头回答 | 各阶段短录音 | 逐词确认失败后解锁下一层，不越级提示 | 只有自由回忆计分；提示后表现不计正式得分，医生分别确认 |
| 定向 | 可依次显示年、月、日、星期、地点、城市问题；不显示答案 | 无 | `guidance`：当前子问 | 每个子问进入时自动 | 当前子问可受控重播 | 口头回答 | 短录音 | 必要时按 PDF 补全问题，不暗示答案 | 医生确认六个子项 |

非语音步骤不因存在患者端而默认录音。动作观察、实物操作和专业判断不使用默认视频、摄像头、传感器或自动动作识别。绘图默认只保存最终图像或必要纸笔照片，不保存完整压力、速度、停顿或全量事件回放。

## 11. 患者原始事实、量表作答复核与正式结果

数据语义固定分为五层：

1. 患者原始作答与必要证据，包括点击 / 选择、短录音、最终书写绘图和上传状态。
2. ASR 机器候选文本。
3. 医护动作观察、实物操作结果、控制动作和影响因素；这里描述临床事实来源类别，不表示每一类都必须具有独立 Schema、collection、DTO 或 endpoint。正常现场观察可以在 F3 直接形成现有 `ItemResponse` 草稿内容，不要求逐题同步写入才能推进患者 Session。
4. 医护 / 医生复核过程中人工形成、修订并拟提交的结构化答案；该层通过现有 `ItemResponse` 草稿承载。
5. 具备现有 A16 权限的临床工作用户对满足既有 readiness 的整份 `ScaleInstance` 执行显式整体提交后形成的正式提交结果。

第 1～3 层不得自动成为 `ItemResponse` 正式答案；患者完成、ASR 候选、原始录音、医护观察、媒体上传成功、自动评分或系统规则均不得自动写入正式答案。对 supervised 流程，只有服务端历史 completed PatientAdministrationSession 才允许医护 / 医生进入第 4 层并通过现有 A14 revision / CAS 草稿 PATCH 受控录入或修订答案；其它 Session 状态和无 Session 均 fail closed，且失败不写草稿或启动 Visit / ScaleInstance。第 4 层继续复用 step、prompt、`operatorNote` 等既有字段，并按既有规则 `markAsAnswered`。第 5 层不创建或复制第二份答案；全部 `ItemResponse` 满足包含该 completed 门禁的 submission readiness 后，由具备现有权限的临床工作用户使用现有 A16 `submit(confirm=true)` 对整份 `ScaleInstance` 做整体正式提交。提交成功后，这批既有 `ItemResponse` 作为该次已提交 `ScaleInstance` 的正式作答结果，再进入既有评分、认知域和报告链。

F3 不修改 A14、readiness 或 A16 的当前技术权限模型，具体 role list 只由当前 backend API / `RolesGuard` 合同维护；不新增 F3 专属 role、reviewer、审批人、doctor-confirm 前置状态，也不把 A14 或 A16 改为 doctor-only。医生继续按既有产品 / 临床合同承担临床解释、需要专业判断的题目、下游评分复核、`ClinicalReport` 和医疗业务责任，但专业责任不自动等价于 A16 endpoint 必须 doctor-only；未来如明确要求只有医生可正式提交，必须作为新的权限需求单独治理和实现。

F3 统一称为“量表作答复核”或“患者施测作答复核”，首先服务正常完成的患者施测，不首先服务异常处理。正常 happy path 固定为：已完成的患者施测 → 医护 / 医生打开现有 `ScaleInstance` 临床工作页 → 查看系统按量表项目整理的患者施测结果、患者原始事实、现有 `ItemResponse` 草稿、待补录或修订项与 readiness 阻断 → 对需要现场观察判断的题目依据医护现场观察补录答案 → 有业务需要时查看录音、图片 / handwriting、已有 ASR 候选和 `reviewEvents` → 正式需要患者已有图片 / handwriting 时，受控采用同一个既有 `MediaEvidence` 到现有 `ItemResponse.evidenceRefs` → 通过现有 A14 单题 PATCH 补录或修订正式答案草稿，并按既有规则对需要完成的题目使用 `markAsAnswered` → 查看 submission readiness → readiness 满足后由具备现有权限的临床工作用户使用现有 A16 `submit(confirm=true)` 整体正式提交 → 再进入既有评分、认知域和报告链。医生最终复核的是整份量表，不要求先进入异常中心或待处理任务列表。

患者施测中已经合法形成且仍有效的 `MediaEvidence` 是可复用的原始临床证据，不得仅因进入 F3 而要求重新上传、下载后重传、复制 OSS object、创建内容相同的第二个 `MediaEvidence`，或转换为“医生 Evidence”副本。患者上传当前只在施测 Session 的 step / run 中记录引用，C2 review 可安全读取，但不写 `ItemResponse.evidenceRefs`；现有 readiness 对 photo / handwriting 等正式媒体要求只读取 `ItemResponse.evidenceRefs`，因此患者 Evidence 的存在不自动满足正式 evidence requirement。对 photo、handwriting 或未来其他既有 evidenceRef 类型，若 ownership、`ScaleInstance`、Item、step / run、evidence type、有效状态与本次有效施测事实均匹配，且未 void / delete，F3 应允许已授权 staff 在复核后明确采用同一个既有 `MediaEvidence`，使其受控进入现有 `ItemResponse.evidenceRefs`。

Evidence adoption 与答案形成是两个独立动作。采用时必须继续校验 staff 授权、ownership、Item / step / evidenceType、`ScaleInstance` / `ItemResponse` 可编辑性和 submission barrier，由服务端最终裁决；该动作不得自动修改答案、`markAsAnswered`、提交 `ScaleInstance`、评分、生成报告、接受 ASR，或认定图片 / 绘图正确。F3 实现 discovery 应优先评估现有 A15 `MediaEvidence` 体系、`ItemResponse.evidenceRefs` 绑定逻辑、C2 ownership / evidence mapping、submission barrier 与 CAS / fail-closed 机制，再选择实现、测试和维护复杂度最低的方案；本合同不提前规定 endpoint、DTO 或 Service 形状，也不要求自动绑定全部患者媒体或批量采用。

患者施测原始 `MediaEvidence` 与正式 `ItemResponse.evidenceRef` 的生命周期必须解耦：采用只建立指向同一 MediaEvidence ID 的正式引用；撤销采用只清除该正式引用，不得把患者原始 MediaEvidence 标记 voided、删除或移出患者复核，也不得删除 / 覆盖 Storage object。撤销后原始 Evidence 仍须保持可访问并可再次采用。只有不具有 patient-administration provenance 的 direct formal upload 才继续使用“清正式引用 + void MediaEvidence”的既有作废语义；generic void 不得绕过该来源保护。正式 readiness 始终只读取 `ItemResponse.evidenceRefs`，不得因保留患者原始 Evidence 而视为已满足。

completed supervised review 中的患者手写 / 绘图事实必须来自患者正式施测阶段；医护在复核阶段查看患者原始 Evidence，并在需要时采用同一个既有 MediaEvidence 到正式 evidenceRef，而不是通过正式编辑器重新绘制或重采集 handwriting。该阶段前端不渲染 handwriting capture / canvas / upload，正式 media upload API 对 `supervised_patient_input + completed PatientAdministrationSession + handwriting` 同样以 409 `MEDIA_EVIDENCE_HANDWRITING_RECAPTURE_NOT_ALLOWED` fail closed；patient Evidence 自身的 capture API、adoption / revoke-adoption 不受该门禁影响。adoption 是建立正式引用，不是重新采集；clinician-administered handwriting 与 completed supervised 的正式 photo 采集继续保留，既有 direct formal handwriting 历史也不因本边界被隐藏或自动作废。

“谁负责临床判定”与“谁推动 patient Session 到下一步”是两个独立职责。正常患者主链由患者端连续推进，医护在现实中观察和辅助；`staff_observation` 首先表示该题的正式临床判断主要来自这种现场观察，不表示 F2 必须持久化独立 `StaffObservation` 记录。正常链为现实观察 → F3 直接填写或修订现有 `ItemResponse`；只有未来某量表明确要求观察事实独立长期留存、审计或跨流程复用时，才另行评估最小持久化。暂停、接管、重做、technical replay、重签和终止只在异常或控制需要时使用。

WP-10 应优先复用现有 `ItemResponse` 的分步、提示、计时、缺失、证据引用和 CAS，以及 `MediaEvidence` 和提交屏障。患者原始事实若不能由当前代码安全表达，只增加本合同所需的最小持久事实，并保持与正式 `ItemResponse` 的边界；不得再建设平行的通用答案、Attempt、Capture、Review、事件溯源或投影平台。

F3 的组织原则是“正常复核优先，重点项目适度提示”。系统可对 `ItemResponse` 尚未完整、按 responseMode / 题目合同需要人工观察判断且当前正式答案尚待医护依据现场观察补录、书写 / 绘图或 ASR 候选、pause / takeover / redo 等既有控制事实、影响因素、无法完成原因和 readiness blocking issue 等已有事实进行视觉标记、排序、分组或展开提示；这些 attention cue 只辅助整份量表的正常复核，不表示数据库中已有 observation record 待 review，也不创建 Anomaly / Review / ReviewItem 实体、风险等级、队列、持久化待处理状态或新工作流状态机。

允许汇总呈现多个简单客观项目、减少跳转并提供快速逐项复核，但不建设批量确认写协议。正式答案写入继续使用 A14 单题 PATCH，需要形成有效完成状态时继续使用既有 `markAsAnswered`，提交前完整性继续由 readiness 判断，整份量表最终只由 A16 `submit(confirm=true)` 整体提交；“确认需要确认的项目”仅指这些现有业务动作，不新增 `reviewed`、`confirmed`、`reviewCompleted`、`doctorConfirmed`、`reviewRevision` 等表示“医生看过”的持久状态。

现有 `GET .../patient-administration/review` 只作为患者施测事实的安全只读参考来源，可安全展示 Session 引用的患者 `MediaEvidence`；允许投影 MIME / 扩展名 / 大小、图片尺寸、手写摘要和音频时长等只读 review metadata，但不得公开 Storage identity、object key / prefix、checksum、trajectory key、公开 / 签名 URL 或凭据。其中 step 的 `structuredFieldCodes` 只是可用时用于就近展示的 review placement 关联事实，空数组表示没有安全具体字段关联，不改变患者原始事实、Evidence 或正式答案的权威边界。review 不存储正式答案、修改 `ItemResponse.evidenceRefs`、保存复核 / 确认 / 异常状态或扩张为写接口；正式答案仍只进入既有 A14 / readiness / A16 链，采用已有患者 Evidence 的最小写动作也与该只读 projection 分离。医生对正式提交结果承担相应专业责任，患者原始事实、ASR、现场医护观察和需专业判断的书写 / 绘图均不得自动成为正式答案；readiness 必须通过，A16 必须显式整体提交，关键操作与必要原始证据继续留痕和可追溯。

保留现有 `operatorNote`，但它是按业务需要填写的可选说明，不是正常首次复核的形式性逐题必填项，也不填写“已确认”“正常”“无异常”等无业务价值文字。只有实质纠正需要解释、原始事实与正式答案存在值得说明的明显差异、临床判断需要额外解释，或某题真实业务合同明确要求说明时，才填写必要 note。继续复用现有 `operatorNote`、submission actor / time、Audit 和提交留痕，不新增 `reviewNote`、`correctionReason`、`confirmationReason`、`doctorComment` 等第二套 note / reason 体系。

## 12. 录音、ASR、上传与降级

- 明确要求口头回答的步骤按步骤形成短录音，不整场持续录音。题目 MP3 与患者录音格式不要求相同。
- 患者录音使用目标浏览器和设备实际支持的格式；不为统一 MP3 引入转码链。
- 患者录音上传至私有 OSS，并由既有 `MediaEvidence` 或其最小扩展承载；访问仍采用受控短期方式，不公开 object key 或永久 URL。
- 一期只接入一种基础 ASR。ASR 只生成候选文本，不做实时字幕、流式转写、方言识别、多供应商路由、自动结构化、自动计分、声纹、情绪识别或诊断分析，也不预建消息队列或通用 AI Provider 平台。
- F3 不在页面打开时或正常复核中自动对全部录音批量 ASR。已有 transcription 可直接显示；没有 transcription 时，仅由医护 / 医生在认为有业务需要时显式触发现有 ASR，不需要则不调用。ASR candidate 不自动写入 `ItemResponse`，也不新增 batch job、queue、自动 retry 或多供应商 fallback。
- ASR 失败不阻断施测、医生复核或正式提交。医生可以听取录音、重新发起转写或直接人工录入；机器候选、医生修订和最终确认结果必须可区分。
- 正常语音步骤必须在录音成功上传后进入下一步骤。上传失败时保留当前页面内存中的录音并允许人工触发重试，不自动重新录音。
- 不建设离线答题、IndexedDB 持久化上传队列或跨设备离线迁移。刷新或关闭页面可能丢失尚未上传的内存录音，页面必须在该状态阻止普通导航并清楚提示医护处理。
- 当前支持的 supervised MMSE speech step 必须在录音成功上传并形成 audio Evidence 后才能继续。麦克风或上传持续不可用时，医护可暂停并处理权限、设备或网络问题，必要时使用既有接管控制，但不得以影响因素、人工文本或接管本身绕过当前步骤的 audio Evidence；施测中异常控制也不得反向成为准备阶段麦克风失败时允许正常开始的降级路径。
- ASR 失败绝不成为现有提交屏障的新增阻断条件；缺少 ASR 候选时仍由医护 / 医生依据已保存的录音及现场事实通过现有 `ItemResponse` 草稿链复核，并经具备现有权限的临床工作用户执行 A16 整体正式提交后成为正式结果。

## 13. 影响因素与无法完成

最低分类固定为：

- 感官；
- 手部操作；
- 语言 / 文化 / 教育；
- 指令理解；
- 疲劳 / 情绪 / 拒绝；
- 环境；
- 设备 / 网络；
- 其他。

影响因素可多选并补充自由说明，不自动改分、不自动形成诊断；它们与无法完成原因都属于量表作答复核的参考事实，仅在正常复核页面存在相关事实时适度提示，不创建独立异常处理流程。无法完成继续复用或最小扩展现有缺失语义和原因，不建设独立无法完成状态机。

## 14. 保留、备份、删除与访问

- 题目呈现资产保存在服务器私有只读目录；回答与证据对象保存在 OSS 私有 Bucket；结构化业务事实保存在 MongoDB。
- 正式证据和已作废证据不得原地覆盖。普通用户不得物理删除正式临床证据；作废继续保留逻辑状态和追溯关系。
- 上述正式证据保留边界不排除一个窄例外：eligible `supervised_patient_input` 未完成失败实例可经显式不可逆 DELETE 整体物理清理。该例外不适用于 completed Session、已提交/评分/报告事实，不删除 Visit 或同 Visit 其他实例；删除成功后可在同一 Visit 重新初始化同一量表形成新实例。
- 试用期内不实现未经院方确认的自动删除年限，不虚构五年、十年或其他期限。后续由医院、伦理或研究协议明确后，再实施统一删除策略。
- 麦克风测试和不计分练习不上传，不进入保留合同。
- 正式备份范围与可验证恢复归入 WP-09；本合同只要求后续 WP-09 能识别医院最终确认的 MongoDB 与 OSS 正式备份范围。
- 不默认保存完整绘图事件历史、全部失败草稿、每次自动保存快照或无业务价值的中间数据。
- 题目资产与证据访问都必须通过服务端校验当前身份、ownership、步骤或临床权限；不得把服务器绝对路径、OSS object key、Bucket、凭据或永久 URL 暴露给患者端。

## 15. 最低审计与安全边界

复用现有审计能力并只记录必要关键事实：患者会话建立与兑换、设备绑定 / 失效、暂停、接管、纠正、恢复、换设备、终止 / 过期、条件提示解锁、刺激技术重播及原因、证据上传 / 作废、ASR 候选与重新转写、医生修订 / 整体确认，以及正式结果进入既有提交、评分和报告链。不得为本文新增 Audit ID 体系或记录每个无临床价值的界面事件。

患者端响应和日志不得泄露完整量表、答案、评分规则、其他患者数据、staff 权限、Cookie / token、服务器路径、OSS 定位、ASR 供应商内部信息或敏感错误详情。共享设备上不把临床草稿、患者凭据或回答写入 URL、localStorage、sessionStorage、IndexedDB、Cache Storage 或可恢复浏览器历史。

## 16. 稳定合同与后续技术事实职责

### A. 已锁定稳定合同

- 项目全生命周期的最低充分复杂度优先和最低充分复用原则，不降低数据、权限、安全、隐私、正常主流程、防重复或关键恢复底线。
- 三类存储、唯一私有资产目录、图片提取规则、冻结女声 MP3、单一 manifest 及 released 不可覆盖。
- 当前步骤最小授权、提示不预加载、刺激 / guidance / prompt 的播放和重播边界。
- 两张逐题矩阵，以及口头回答默认短录音、非语音不默认录音、动作由医护观察、绘图不默认全事件回放。
- 四项必要设备检查门槛、可选不计分操作练习隔离、既定 `ScaleVersion` / 呈现资产决定当前施测语言、短期患者会话、创建时持久化且不可切换的 same-device / cross-device、same-device 不签发进入码、cross-device 六位一次性进入码十分钟、无 completed 历史时可因失败 / 中止 / 选择错误 terminate 或 expire 后 recreate、任意 completed 历史永久禁止同一 `ScaleInstance` 再次 create、legacy 模式不推断且 mode-specific mutation fail closed、同一 `ScaleInstance` 同时只允许一个有效患者设备、两小时绝对有效期、same-device staff Session 失效与重新认证、cross-device staff Session 保留、服务端权威步骤和安全退出。
- terminated / expired 默认保留失败施测事实；只有 eligible supervised 未完成失败实例经独立显式 DELETE 才整体物理清除其失败 Session、patient-origin Evidence 和 owned private objects。completed Session 与正式结果链永久排除在该窄能力之外。
- 患者正常题目主链连续推进，医护现场观察与后续复核记录解耦；双设备不等于双写者，独立患者 / 独立 `ScaleInstance` 正常并行，同一评估不默认多人实时协同编辑。
- 患者原始事实、ASR 候选、现场医护观察的事实来源、量表作答复核草稿和整体正式提交结果的五层语义；现场观察可在 F3 直接形成现有 `ItemResponse`，不默认要求独立 Observation 数据层。F3 正常复核优先、原始证据按需查看，患者已有有效 `MediaEvidence` 可经明确采用受控进入现有 `evidenceRefs` 而不重新上传或复制；第 4 层由现有 A14 `ItemResponse` 单题草稿与 `markAsAnswered` 承载，第 5 层通过 readiness 后的现有 A16 整体提交使同一批 `ItemResponse` 成为正式作答结果，不创建第二套答案、复核状态或批量确认写协议，A14 / A16 技术权限继续服从当前 backend 授权合同。
- MMSE supervised 执行阶段严格按 server-owned PatientAdministrationSession completed 事实收口：completed 前 UI 只呈现患者施测与基础信息，backend 同时阻断正式 A14 写与 A16 submit；completed 后才开放 unified review / readiness / submission，ScaleInstance completed / locked / voided 后才展示评分，final/history ScoreResult 后才展示认知域。前端 progressive disclosure 不替代后端 invariant。
- 一种基础 ASR、上传门禁、内存重试和人工降级；ASR 不阻断。
- 影响因素、无法完成、保留 / 作废 / 删除、WP-09 备份责任和最低审计边界。

### B. 技术事实与后续选择

已实施的 Schema、DTO、endpoint、Cookie、凭证、当前步骤、`MediaEvidence` audio、ASR 和 Service 等技术事实不在本合同重复维护，以最新代码及 backend API / DTO / service maps 和 snapshot 为准。

后续只有在尚未实现的合同确有最低必要技术选择时，才按最低充分复杂度原则决定；能够安全复用现有能力时不得新增平行模型、接口、状态或持久事实。

## 17. 明确非目标

- 无人监督居家施测、患者长期账号、家庭门户、第三方医院集成。
- 多语言、多机构、多租户、多供应商，以及仅为推测性超大规模建设的多节点 / 高并发平台或通用量表流程引擎；这不限制独立患者和独立 `ScaleInstance` 的正常并行。
- 资产管理后台、通用媒体发布中心、CDN、热更新、自动回滚、在线音频编辑器。
- 实时 TTS、实时字幕、流式 ASR、多供应商路由、自动结构化、自动计分或诊断分析。
- WebSocket、SSE、Redis、消息队列、在线心跳中心、离线答题和持久化上传队列。
- 同一浏览器 staff + patient 双身份长期共存、隐藏 staff Session、临时 PIN 解锁、自动恢复 staff 身份、双身份 Cookie、快速切换状态机，以及同一评估的多人实时协同编辑。
- DRM、媒体加密、专用设备、视频监控、摄像头通用前置、传感器或自动动作识别。
- `ReviewAnswer`、`DoctorAnswer`、`PendingAnswer`、`FormalAnswer` 等第二套答案集合，独立 Answer / Attempt / Capture / Review / Anomaly / ReviewItem、`ReviewStatus` / `AnomalyStatus` / risk level / review queue / anomaly queue、确认后复制到 `ItemResponse`、batch-confirm endpoint、multi-item PATCH、bulk review write、新 overall-confirm endpoint、新审核状态机、事件溯源或通用 AI Provider 平台。
- `StaffObservation` Schema / collection / DTO / API、`ObservationStatus`、observation queue / confirmation / review workflow 或 observation event sourcing；`EvidenceReview` / `EvidenceAdoption` Schema、`ReviewEvidence` collection、evidence migration / copy、Storage copy、新 OSS object、batch evidence adoption、evidence approval state machine 或 evidence queue。
- 未经医院、伦理或研究协议确认的自动删除年限，以及完整绘图行为分析。
- 本合同完成不表示 WP-10、WP-11、WP-12、患者施测产品或临床上线能力完成。
