export type TaskStatus = 'idle' | 'running' | 'completed' | 'failed' | 'pending-dev' | 'pending-merge';
export type TaskCreator = 'user' | 'claude';

export interface ExecutionLog {
    timestamp: string;
    type: 'stdout' | 'stderr' | 'input' | 'system';
    content: string;
}

export interface Worktree {
    path: string;
    branch: string;
    createdAt: string;
    removedAt?: string;  // When worktree was deleted (for historical tracking)
}

export interface ClaudeSession {
    id: string;         // Claude Code session ID (--session-id)
    createdAt: string;  // Session creation time
}

// 结构化输出类型
export interface StructuredOutput {
    type: 'design' | 'development' | 'testing' | 'analysis' | 'generic';
    schemaVersion: string;
    data: unknown;
    timestamp: string;
}

// 设计方案的结构化输出
export interface DesignOutput {
    summary: string;
    approach: string;
    components: Array<{
        name: string;
        description: string;
        files: string[];
    }>;
    dependencies: string[];
    considerations: string[];
    estimatedComplexity: 'low' | 'medium' | 'high';
}

// 开发任务的结构化输出
export interface DevelopmentOutput {
    summary: string;
    changes: Array<{
        file: string;
        action: 'created' | 'modified' | 'deleted';
        description: string;
    }>;
    testsAdded: string[];
    breakingChanges: string[];
    nextSteps: string[];
}

// 测试任务的结构化输出
export interface TestingOutput {
    summary: string;
    testsRun: number;
    testsPassed: number;
    testsFailed: number;
    issues: Array<{
        severity: 'low' | 'medium' | 'high' | 'critical';
        description: string;
        location?: string;
    }>;
    coverage?: {
        lines: number;
        functions: number;
        branches: number;
    };
}

export interface Task {
    id: string;
    title: string;
    description: string;
    prompt?: string;
    laneId: string;
    order: number;
    status: TaskStatus;
    createdAt: string;
    updatedAt: string;
    createdBy: TaskCreator;
    executionLogs?: ExecutionLog[];
    worktree?: Worktree;
    claudeSession?: ClaudeSession;  // Claude Code session for lifecycle
    designPath?: string;  // 设计方案文件路径
    structuredOutput?: StructuredOutput;  // 结构化输出
    metadata?: Record<string, unknown>;
}


