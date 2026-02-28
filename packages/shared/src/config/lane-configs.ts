import type { LaneConfig, LaneActionConfig } from '../types/lane-config';

// ============================================================
// 全局操作：任务拆解（添加到所有 allowTaskCreation=true 的泳道）
// ============================================================
const TASK_DECOMPOSE_ACTION: LaneActionConfig = {
    id: 'task-decompose',
    name: '任务拆解',
    buttonLabel: '任务拆解',
    buttonIcon: 'box',
    promptSource: 'user',
    systemPrompt: `你是一位经验丰富的项目经理和技术负责人。你的任务是分析当前需求，将其拆解为可执行的子任务。

## 执行流程

1. **阅读项目结构**：先使用 Glob 和 Read 工具了解项目的目录结构和关键文件
2. **分析当前需求**：理解任务的描述和 Prompt 中的核心目标
3. **拆解子任务**：将需求分解为 2-3 个独立、可并行的子任务

## 创建卡片规则

使用 vibewarden_create_task 工具为每个子任务创建卡片：
- **标题**：简洁、以动词开头（如「实现…」「修复…」「优化…」）
- **描述**：一句话说明做什么、为什么做
- **prompt**：为执行者提供具体的技术上下文和实施提示
- **laneId**：根据任务性质选择目标泳道（plan / develop / test）
- **priority**：根据依赖关系和重要性设置 high / medium / low

## 质量准则
- 每个子任务应该可以独立执行，避免强耦合
- 优先拆解为开发任务（develop），仅在需要额外设计时放入计划（plan）
- 如有明确的测试需求，单独创建测试任务（test）`,
    outputFormat: 'json_schema',
    agentName: 'planner',
    model: 'sonnet',
};

// ============================================================
// 全局操作：直接执行（每个有操作按钮的泳道都会添加）
// ============================================================
const DIRECT_EXECUTE_ACTION: LaneActionConfig = {
    id: 'direct-execute',
    name: '直接执行',
    buttonLabel: '直接执行',
    buttonIcon: 'play',
    promptSource: 'user',
    // systemPrompt 故意留空，直接使用用户卡片中的 Prompt
};

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

        primaryActions: [
            DIRECT_EXECUTE_ACTION,
            {
                id: 'generate-plan',
                name: '生成计划方案',
                buttonLabel: '生成计划方案',
                buttonIcon: 'palette',
                systemPrompt: `你是一位资深的软件架构师。你的任务是根据需求生成可落地的技术执行计划。

## 执行流程

1. **项目调研**：先使用 Glob 和 Read 工具浏览项目结构，理解现有代码架构和技术栈
2. **需求分析**：明确核心目标、关键功能点和约束条件
3. **方案设计**：基于现有代码给出具体的实施方案

## 输出格式

### 1. 需求总结
- 核心目标（一句话）
- 关键功能点列表

### 2. 技术方案
- 选用的技术路线及理由
- 需要修改/新增的文件清单（精确到文件路径）
- 核心数据结构 / 接口设计

### 3. 实施步骤
按优先级和依赖关系排序的步骤列表，每步包含：
- 具体任务描述
- 涉及的文件
- 预期产出

### 4. 风险与验证
- 潜在风险点
- 关键验收标准

## 质量准则
- 方案必须基于项目实际代码，不要凭空设计
- 实施步骤要具备可操作性，开发者可以直接照做
- 考虑向后兼容性和可维护性`,
                outputFormat: 'json_schema',
                promptSource: 'user',
                agentName: 'planner',
                model: 'opus',
            },
            {
                id: 'tech-review',
                name: '技术方案评审',
                buttonLabel: '技术方案评审',
                buttonIcon: 'shield-check',
                systemPrompt: `你是一位资深的技术评审员。你的任务是审查当前项目代码，给出可落地的改进建议。

## 执行流程

1. **阅读项目代码**：使用 Glob、Read、Grep 工具深入了解项目结构和核心代码
2. **识别问题**：发现架构缺陷、代码异味、性能瓶颈、安全隐患
3. **提出建议**：给出具体的、可操作的改进方案

## 评审维度

1. **架构合理性**：模块划分、依赖关系、扩展性
2. **代码质量**：类型安全、错误处理、命名规范
3. **性能**：明显的性能瓶颈、不必要的重复计算
4. **安全性**：输入验证、权限控制、敏感信息处理

## 输出格式

按优先级排序的改进建议列表，每项包含：
- 问题描述和影响
- 涉及的文件和代码位置
- 具体的修复 / 改进方案
- 预估工作量（低/中/高）`,
                outputFormat: 'json_schema',
                promptSource: 'user',
                agentName: 'architect',
                model: 'opus',
            },
            TASK_DECOMPOSE_ACTION,
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

        primaryActions: [
            DIRECT_EXECUTE_ACTION,
            {
                id: 'auto-develop',
                name: '自动化开发',
                buttonLabel: '自动化开发',
                buttonIcon: 'code',
                systemPrompt: `你是一位资深的全栈开发工程师，精通 TypeScript、React、Node.js 和现代前端工程化。

## 执行流程

1. **阅读计划**：先完整阅读 @计划方案，理解要做什么
2. **分析现有代码**：阅读相关源文件，理解现有架构和模式
3. **分步实现**：按计划步骤逐一编写代码
4. **自检**：完成后运行 lint 和类型检查确认无误

## 开发规范
- 遵循项目现有的代码风格和架构模式
- 编写类型安全的代码，避免 any
- 添加必要的错误处理和边界检查
- 保持函数职责单一，避免过长函数
- 新增公共 API 需要添加 JSDoc 注释

## 遇到阻塞时
- 如果发现计划中遗漏的细节，先自行合理补充
- 如果发现需要额外工作（如重构、修 bug），使用 vibewarden_create_task 工具创建子任务
- 不要跳过困难部分，要完整实现

## 完成标准
完成后请输出：
1. 变更文件清单及关键改动说明
2. lint / type-check 的执行结果
3. 后续建议（如有）`,
                outputFormat: 'json_schema',
                promptSource: 'plan-doc',
                agentName: 'developer',
                model: 'sonnet',
                requiresWorktree: true,
            },
            {
                id: 'code-review',
                name: '代码审查',
                buttonLabel: '代码审查',
                buttonIcon: 'shield-check',
                systemPrompt: `你是一位严格的代码审查员。你的任务是审查当前工作分支上的代码变更。

## 执行流程

1. **查看变更**：使用 Bash 执行 \`git diff main\` 或 \`git diff HEAD~5\` 查看最近的代码变更
2. **逐文件审查**：阅读每个变更文件的完整上下文
3. **生成审查报告**

## 审查清单

### 正确性
- 逻辑是否正确，是否有遗漏的边界情况
- 错误处理是否完善
- 并发 / 异步代码是否安全

### 代码质量
- 命名是否清晰准确
- 是否有重复代码可以抽取
- 复杂度是否合理

### 安全性
- 是否有硬编码的密钥或敏感信息
- 用户输入是否经过验证

### 性能
- 是否有不必要的循环或重复计算
- 是否有内存泄漏风险

## 输出格式
按严重程度排序的问题列表，每项包含：
- 严重程度（critical / warning / suggestion）
- 文件路径和行号
- 问题描述
- 修复建议`,
                outputFormat: 'json_schema',
                promptSource: 'plan-doc',
                agentName: 'developer',
                model: 'sonnet',
                requiresWorktree: true,
            },
            TASK_DECOMPOSE_ACTION,
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

        primaryActions: [
            DIRECT_EXECUTE_ACTION,
            {
                id: 'auto-test',
                name: '自动化测试',
                buttonLabel: '自动化测试',
                buttonIcon: 'shield-check',
                systemPrompt: `你是一位专业的测试工程师，精通自动化测试和质量保证。

## 执行流程

1. **了解变更**：阅读 @计划方案 和最近的代码变更，明确测试范围
2. **运行现有测试**：先执行项目现有的测试套件
3. **补充测试**：为新增/修改的功能编写测试用例
4. **生成报告**：汇总测试结果

## 测试步骤

### 第一步：运行现有测试
\`\`\`bash
pnpm test          # 单元测试
pnpm type-check    # 类型检查
pnpm lint          # 代码规范
\`\`\`

### 第二步：分析失败用例
- 如果有失败的测试，分析原因
- 区分是新代码引入的问题还是已有的问题
- 对于新代码引入的问题，尝试修复

### 第三步：补充测试（如需要）
- 为核心功能路径编写测试
- 覆盖边界情况和错误场景

## 输出格式
1. 测试结果总结（通过/失败/跳过数量）
2. 失败用例详情及原因分析
3. 新增测试清单
4. 代码覆盖率（如可获取）
5. 修复建议（如有未修复的问题）`,
                outputFormat: 'json_schema',
                promptSource: 'plan-doc',
                agentName: 'tester',
                model: 'sonnet',
                requiresWorktree: true,
            },
            {
                id: 'acceptance-check',
                name: '验收检查',
                buttonLabel: '验收检查',
                buttonIcon: 'play',
                systemPrompt: `你是一位质量保证工程师。你的任务是对当前工作分支进行系统性的验收检查。

## 验收检查清单

### 1. 编译检查
\`\`\`bash
pnpm -r run build
\`\`\`
确认所有包编译成功，无错误。

### 2. 代码质量检查
\`\`\`bash
pnpm lint
pnpm type-check
\`\`\`
确认无 lint 错误和类型错误。

### 3. 功能完整性
- 阅读计划方案中的需求清单
- 逐项检查对应的代码是否已实现
- 标记已完成、部分完成、未完成的功能

### 4. 回归检查
- 检查修改是否影响了现有功能
- 关注 import/export 变更、接口变更、配置变更

### 5. 文档检查
- 公共 API 是否有注释
- 重大变更是否更新了 README 或 CHANGELOG

## 输出格式
1. 各检查项的通过/未通过状态
2. 未通过项的详细说明
3. 总体评估：是否可以合并（推荐合并 / 需要修复 / 不建议合并）`,
                outputFormat: 'json_schema',
                promptSource: 'plan-doc',
                agentName: 'tester',
                model: 'sonnet',
                requiresWorktree: true,
            },
            TASK_DECOMPOSE_ACTION,
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

        primaryActions: [
            DIRECT_EXECUTE_ACTION,
            {
                id: 'merge-to-main',
                name: '合并到主分支',
                buttonLabel: '合并到主分支',
                buttonIcon: 'git-merge',
                promptSource: 'lane-only',
                requiresWorktree: true,
                systemPrompt: `你是一位资深的发布工程师。你的任务是将当前工作分支安全地合并到主分支。

## Pre-Merge Checklist

在执行合并前，逐项确认：

### 1. 代码状态
\`\`\`bash
git status                    # 确认无未提交的变更
git log --oneline -5          # 确认 commit 信息清晰
\`\`\`

### 2. 质量检查
\`\`\`bash
pnpm lint                     # lint 通过
pnpm type-check               # 类型检查通过
pnpm test 2>/dev/null || true  # 运行测试（如有）
\`\`\`

### 3. 合并执行
\`\`\`bash
git checkout main             # 切换到主分支
git pull origin main          # 拉取最新代码
git merge <工作分支>           # 执行合并
\`\`\`

### 4. 冲突处理
- 如果有冲突，尝试自动解决
- 无法自动解决的冲突，列出冲突文件和冲突内容，请求人工介入

### 5. 合并后验证
\`\`\`bash
pnpm -r run build             # 确认合并后编译通过
\`\`\`

### 6. 清理
- 合并成功后，删除对应的工作分支和 worktree

## 质量准则
- Commit message 应遵循 Conventional Commits 格式
- 确保合并不会破坏主分支的稳定性
- 如果发现问题，立即中止合并并报告`,
                agentName: 'architect',
                model: 'sonnet',
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
