import type { LaneConfig, LaneActionConfig } from '../types/lane-config';

/**
 * 默认泳道配置
 */
export const DEFAULT_LANE_CONFIGS: Record<string, LaneConfig> = {
    plan: {
        id: 'plan',
        name: '计划',
        order: 0,
        color: '#8B5CF6',
        description: '需求分析与方案设计阶段',

        // 多个核心操作
        primaryActions: [
            {
                id: 'generate-plan',
                name: '生成计划方案',
                buttonLabel: '生成计划方案',
                buttonIcon: 'palette',
                systemPrompt: `你是一位资深的软件架构师和技术方案设计师。你的任务是根据用户需求描述，生成详细的技术执行计划和方案文档。

## 输出格式要求

### 1. 计划总结
- 简要总结任务的核心目标
- 列出关键功能点和交付物

### 2. 技术方案
- 核心架构设计和技术选型
- 详细的执行思路

### 3. 实施步骤
使用清晰的步骤列表，记录每个阶段的实施计划：
- 具体任务描述
- 涉及的文件/组件
- 预期结果

### 4. 测试与验证
- 关键测试用例
- 验收标准

## 质量准则
- 确保计划具备可落地性
- 考虑代码质量和长期可维护性

## 完成与输出
当你认为方案已经完整且准备好进入开发阶段时，请明确告知用户。此时系统会自动请求你提供一个结构化的 JSON 总结。确保你在整个过程中记录了关键的设计决策，以便生成最终总结。
`,
                outputFormat: 'json_schema',
                agentName: 'planner',
                model: 'opus',
            },
            {
                id: 'architecture-design',
                name: '架构设计',
                buttonLabel: '架构设计',
                buttonIcon: 'box',
                systemPrompt: `你是一位系统架构师，精通分布式系统设计、微服务架构和性能优化。

请分析当前项目结构，提供架构改进建议：
1. 分析现有架构的优缺点
2. 提出重构建议和迁移路径
3. 识别潜在的性能瓶颈
4. 提供架构决策记录（ADR）`,
                outputFormat: 'json_schema',
                agentName: 'architect',
                model: 'opus',
            },
            {
                id: "taskcard",
                name: "卡片生成测试",
                buttonLabel: "卡片生成测试",
                buttonIcon: "code",
                systemPrompt: "分析项目中可进行优化的3个功能点，使用vibewarden_create_task工具，在测试泳道创建卡片，给出任务的标题、简单描述、任务提示词",
                outputFormat: "json_schema",
                agentName: "developer",
                model: "opus",
                requiresWorktree: true
            }
        ],

        promptSource: 'user',
        requiresPlan: false,
        generatesPlan: true,
        onCompleteLane: 'develop',
        showInBoard: true,
        allowTaskCreation: true,
    },

    develop: {
        id: 'develop',
        name: '开发',
        order: 1,
        color: '#3B82F6',
        description: '代码实现阶段',

        // 多个核心操作
        primaryActions: [
            {
                id: 'auto-develop',
                name: '自动化开发',
                buttonLabel: '进入自动化开发',
                buttonIcon: 'code',
                systemPrompt: `你是一位资深的全栈开发工程师，精通 TypeScript、React、Node.js 和现代前端工程化。

## 开发任务执行
请严格按照 @计划方案 中的实施步骤进行代码实现：
1. 遵循项目现有的代码规范和架构模式
2. 编写类型安全、可维护的代码
3. 添加必要的错误处理和日志记录
4. 确保代码通过测试（lint、type-check）

## 完成与输出
完成后请输出：
1. 实施总结：简要说明完成的工作
2. 代码变更：列出修改/新增的文件和关键改动
3. 测试结果：相关测试是否通过
4. 后续步骤：提出下一阶段的任务或建议

当你认为开发任务已经完成，请明确告知。确保你通过结构化输出（JSON）提供了完整的变更详情。
`,
                outputFormat: 'json_schema',
                agentName: 'developer',
                model: 'sonnet',
                requiresWorktree: true,
            },
        ],

        promptSource: 'plan-doc',
        requiresPlan: true,
        generatesPlan: false,
        onCompleteLane: 'test',
        showInBoard: true,
        allowTaskCreation: true,
    },

    test: {
        id: 'test',
        name: '测试',
        order: 2,
        color: '#10B981',
        description: '自动化测试阶段',

        // 多个核心操作
        primaryActions: [
            {
                id: 'auto-test',
                name: '自动化测试',
                buttonLabel: '开始自动化测试',
                buttonIcon: 'shield-check',
                systemPrompt: `你是一位专业的测试工程师，精通自动化测试、单元测试、集成测试和端到端测试。

## 测试任务执行
请严格按照 @计划方案 中的测试用例执行测试：
1. 运行单元测试：pnpm test
2. 运行类型检查：pnpm type-check
3. 执行必要的集成测试
4. 生成测试报告并记录问题

## 完成与输出
完成后请输出：
1. 测试总结：通过/失败的测试数量
2. 问题清单：列出发现的 bug 和问题
3. 覆盖率：代码覆盖率百分比
4. 改进建议：对发现问题的修复建议

当你认为测试任务已完成，请提供详细的测试结果 structured output。
`,
                outputFormat: 'json_schema',
                agentName: 'tester',
                model: 'sonnet',
                requiresWorktree: true,
            },
            {
                id: 'manual-test',
                name: '手动测试',
                buttonLabel: '手动测试',
                buttonIcon: 'play',
                systemPrompt: '请执行手动测试步骤。',
                requiresWorktree: true,
            },
        ],

        promptSource: 'plan-doc',
        requiresPlan: true,
        generatesPlan: false,
        onCompleteLane: 'pending-merge',
        showInBoard: true,
        allowTaskCreation: true,
    },

    'pending-merge': {
        id: 'pending-merge',
        name: '待合并',
        order: 3,
        color: '#F59E0B',
        description: '合并前准备',

        // 合并操作（使用 Agent 执行）
        primaryActions: [
            {
                id: 'merge-to-main',
                name: '合并到主分支',
                buttonLabel: '合并到主分支',
                buttonIcon: 'git-merge',
                requiresWorktree: true,
                systemPrompt: `你是一位资深的发布工程师。你的任务是将当前任务的工作树分支安全地合并到主分支（main/master）。

## 执行步骤
1. 确认当前分支状态：检查是否有未提交的更改。
2. 验证测试结果：确保之前的自动化测试已通过。
3. 执行合并：将当前开发分支合并到主分支。
4. 冲突处理：如果发生冲突，请尝试自动修复。如果无法自动修复，请列出冲突点并请求人工干预。
5. 清理工作：合并成功后，删除对应的本地工作树和开发分支。

## 质量准则
- 确保合并不会破坏主分支的稳定性
- 在合并前最后运行一次关键测试（如 pnpm lint）
- 合并信息描述要清晰准确`,
                agentName: 'architect',
                model: 'sonnet'
            },
        ],

        promptSource: 'lane-only',
        requiresPlan: false,
        generatesPlan: false,
        onCompleteLane: 'archived',
        showInBoard: true,
        allowTaskCreation: false,
    },

    archived: {
        id: 'archived',
        name: '已归档',
        order: 4,
        color: '#6B7280',
        description: '已完成的任务',
        primaryActions: [],
        promptSource: 'lane-only',
        requiresPlan: false,
        generatesPlan: false,
        showInBoard: false,
        allowTaskCreation: false,
    },

    deprecated: {
        id: 'deprecated',
        name: '已废弃',
        order: 5,
        color: '#EF4444',
        description: '废弃的任务',
        primaryActions: [],
        promptSource: 'lane-only',
        requiresPlan: false,
        generatesPlan: false,
        showInBoard: false,
        allowTaskCreation: false,
    },
};

/**
 * 获取泳道配置
 * @param laneId - 泳道 ID
 * @returns 泳道配置，如果不存在则返回 undefined
 */
export function getLaneConfig(laneId: string): LaneConfig | undefined {
    return DEFAULT_LANE_CONFIGS[laneId];
}

/**
 * 获取所有泳道配置
 * @returns 泳道配置数组，按 order 排序
 */
export function getAllLaneConfigs(): LaneConfig[] {
    return Object.values(DEFAULT_LANE_CONFIGS).sort((a, b) => a.order - b.order);
}

/**
 * 获取可见泳道配置（看板中显示的）
 * @returns 可见泳道配置数组
 */
export function getVisibleLaneConfigs(): LaneConfig[] {
    return getAllLaneConfigs().filter(c => c.showInBoard);
}

/**
 * 获取泳道的主操作
 * @param laneId - 泳道 ID
 * @returns 操作配置数组
 */
export function getPrimaryActions(laneId: string): LaneActionConfig[] {
    const config = getLaneConfig(laneId);
    return config?.primaryActions || [];
}
