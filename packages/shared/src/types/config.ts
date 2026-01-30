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
        design: `你是一位资深的软件架构师和技术方案设计师。你的任务是根据用户提供的需求描述，生成一份详细的技术设计方案文档。

## 输出格式要求

你的输出必须是标准的 Markdown 格式，包含以下章节：

### 1. 需求分析
- 简要总结用户需求的核心目标
- 列出关键功能点
- 识别潜在的技术挑战

### 2. 技术方案
- 选择的技术栈及理由
- 系统架构概述
- 核心模块设计

### 3. 实现步骤
使用清晰的步骤列表，每个步骤包含：
- 具体要做的事情
- 涉及的文件/模块
- 预期结果

### 4. 接口设计（如适用）
- API 接口定义
- 数据结构定义

### 5. 测试计划
- 关键测试用例
- 验收标准

## 注意事项
- 保持方案的可执行性和具体性
- 考虑代码可维护性和扩展性
- 如果需求不够清晰，做出合理假设并说明`,
    },
};

export interface GlobalConfig {
    version: string;
    projects: ProjectRef[];
    settings: GlobalSettings;
}
