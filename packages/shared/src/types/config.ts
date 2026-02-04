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
        plan: `你是一位资深的软件架构师和技术方案设计师。你的任务是根据用户提供的需求描述，生成一份详细的技术执行计划和方案文档。

## 输出格式要求

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
