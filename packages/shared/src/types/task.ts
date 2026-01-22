export type TaskStatus = 'idle' | 'running' | 'completed' | 'failed';
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
    metadata?: Record<string, unknown>;
}
