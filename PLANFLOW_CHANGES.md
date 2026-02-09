# Branch Changes: `planflow` vs `main`

本项目分支 `planflow` 实现了**两阶段计划生成（Two-Phase Plan Generation）**流程，解决了计划泳道任务提前完成、硬编码提示词以及 UI 状态不同步的问题。

## 1. 核心协议与配置变更

### 1.1 协议扩展
- **[Shared] `ConversationWsMessage`**: 新增 `conversation.plan_complete_detected` 消息类型，用于后端主动向前端推送已检测到完成标记（如 `<!-- PLAN_COMPLETE -->`）但尚未最终确认的状态。

### 1.2 配置项迁移
- **[Shared] `DEFAULT_SETTINGS`**: 
    - 移除了后端硬编码的提示词。
    - 将“对话设计阶段”的指令（建议多轮对话、禁止自动总结等）整合进默认设置。
    - 允许用户在设置界面直接修改计划泳道的行为逻辑。

## 2. 后端执行逻辑 (agent)

### 2.1 状态流转优化 (`execution.ts`)
- **禁用 `outputFormat`**: 计划泳道在第一阶段（对话阶段）不再强行注入 `StructuredOutput` 工具，从而避免 Claude 为追求结构化输出而中断自然对话。
- **状态回归**: 修复了对话过程中的状态归属问题。现在每一轮对话结束时，任务会正确返回 `idle` 状态，并包含完整的 `laneId` 信息，防止前端卡片“消失”。
- **任务监听重构**: `statusUpdateListener` 现在会使用 `findTask` 辅助函数更可靠地定位任务，并针对 `plan` 泳道禁用了自动移入下一泳道的行为。

### 2.2 新增功能函数
- **`handleConversationPlanComplete`**: 实现了“阶段二：生成总结”。当用户在 UI 点击确认后，该函数会聚合整个对话历史，并最终生成结构化的 Markdown 文档保存到 `.clawwarden/plans/`。

## 3. 前端交互增强 (web)

### 3.1 对话钩子优化 (`useConversation.ts`)
- **状态重置**: 切换任务时会自动清理消息流状态 (`isStreaming`) 和消息列表，防止内容残留。
- **完成回调**: 监听 `conversation.plan_complete` 等事件，及时重置界面流转状态。

### 3.2 细节修复 (`TaskDetail.tsx`)
- **逻辑清理**: 修复了任务在没有 `planPath` 时界面内容未及时清空的逻辑错误。

## 总结
`planflow` 分支将原本单一的“用户输入 -> 自动总结”流程，改进为更符合人类协作习惯的“讨论 -> 达成共识 -> 自动总结”三步走模式，极大地提升了复杂任务设计的灵活性。
