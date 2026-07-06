# CogMemory AD / 智忆评 前端组件地图

## 1. 文档定位

本文档用于记录 CogMemory AD 前端稳定复用组件的路径、职责、输入输出、使用页面和注意事项。

## 2. 当前状态

- 当前已初始化 `frontend\src\components\ui` 最小公共 UI 组件。
- 当前组件均为无业务语义公共组件。
- 当前组件遵循医疗系统 / 临床评估 / 低干扰 / 高可读性 / 冷静可信视觉基线。
- 当前不包含业务组件、业务 layout、反馈中心或项目类组件。

## 3. 当前组件清单

- 组件名称：`Button`
- 组件路径：`frontend\src\components\ui\Button.tsx`
- 职责：提供低干扰、高可读的基础按钮
- 输入：原生 `button` 属性，`variant` 支持 `primary`、`secondary`、`ghost`，`size` 支持 `sm`、`md`、`lg`
- 输出：`button` 元素
- 使用页面：当前未在首页强依赖，供后续公共页面复用
- 视觉约束：低饱和蓝绿、清晰焦点态、禁用态清晰
- 是否含业务语义：否
- 后续注意事项：不得加入登录、权限、评估流程等业务语义

- 组件名称：`Card`
- 组件路径：`frontend\src\components\ui\Card.tsx`
- 职责：提供基础信息容器及标题、描述、内容组合结构
- 输入：基础 HTML 属性，导出 `Card`、`CardHeader`、`CardTitle`、`CardDescription`、`CardContent`
- 输出：基础容器元素
- 使用页面：`frontend\app\page.tsx`、`frontend\app\not-found.tsx`
- 视觉约束：浅色背景、浅边框、低阴影、清晰分区
- 是否含业务语义：否
- 后续注意事项：不得把具体评估、报告或患者数据模型写入组件内部

- 组件名称：`Badge`
- 组件路径：`frontend\src\components\ui\Badge.tsx`
- 职责：提供低饱和状态标签
- 输入：基础 `span` 属性，`tone` 支持 `neutral`、`info`、`success`、`warning`
- 输出：`span` 元素
- 使用页面：`frontend\app\page.tsx`、`frontend\app\not-found.tsx`
- 视觉约束：低饱和状态色，不使用高饱和大面积色块
- 是否含业务语义：否
- 后续注意事项：新增状态前需确认是否服务医疗评估可读性

## 4. 后续同步规则

- 组件事实以实际前端代码和页面使用情况为准。
- 临时页面内组件可不进入本文档，除非形成稳定复用边界。
- 不得在组件未实现前写成已存在组件。
- 新增稳定组件后，应同步检查其视觉、交互和可读性是否符合前端设计基线。
