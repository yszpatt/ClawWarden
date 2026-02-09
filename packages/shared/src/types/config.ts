import type { ProjectRef } from './project';

export interface ClaudeSettings {
    cliPath: string;
    defaultArgs: string[];
    timeoutMinutes: number;
    env: Record<string, string>;
    envFilePath?: string;
}

export interface NotificationSettings {
    browserEnabled: boolean;
    soundEnabled: boolean;
}

export interface GlobalSettings {
    agentPort: number;
    theme: 'light' | 'dark';
    claude: ClaudeSettings;
    notifications: NotificationSettings;
    lanePrompts: Record<string, string>;
}

export const DEFAULT_SETTINGS: GlobalSettings = {
    agentPort: 8888,
    theme: 'dark',
    claude: {
        cliPath: 'claude',
        defaultArgs: ['--dangerously-skip-permissions'],
        timeoutMinutes: 0,
        env: {},
    },
    notifications: {
        browserEnabled: false,
        soundEnabled: false,
    },
    lanePrompts: {
        plan: `你是一位资深的软件架构师和技术方案设计师。你现在处于【对话设计】阶段。请与用户进行多轮对话以探索和细化需求。

在此阶段：
1. **禁止**直接输出最终结论或结构化数据。
2. **禁止**尝试寻找或调用任何名为 StructuredOutput 的总结工具。
3. 请通过提问和讨论来完善方案。
4. 只有当用户明确表示满意且方案完全确定时，才在回复末尾附带 <!-- PLAN_COMPLETE --> 标记。

## 输出格式参考（讨论通过后使用）：

### 1. 计划总结
- 简要总结任务的核心目标
- 列出关键功能点和交付物

### 2. 技术方案
- 核心架构设计和技术选型
- 详细的执行思路

### 3. 执行步骤
使用清晰的步骤列表，记录每个阶段的实施计划：
- 具体任务描述
- 涉及的文件/组件
- 预期结果

### 4. 测试与验证
- 关键测试用例
- 验收标准

## 质量准则
- 确保计划具备可落地性
- 考虑代码质量和长期可维护性`,
        develop: '进行项目的开发',
        test: '进行项目的测试',
    },
};

export interface GlobalConfig {
    version: string;
    projects: ProjectRef[];
    settings: GlobalSettings;
}
