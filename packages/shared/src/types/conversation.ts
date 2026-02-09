/**
 * Conversation types for streaming chat interface
 * Shared between frontend and backend
 */

export interface Conversation {
    taskId: string;
    createdAt: string;
    updatedAt: string;
    messages: ConversationMessage[];
}

/**
 * Each message is a discrete unit that gets rendered in sequence
 * - User messages contain user's input
 * - System messages are info/warning/error
 * - Assistant messages are broken into blocks (text, thinking, tool_call) that appear in order
 */
export type ConversationMessage =
    | UserMessage
    | AssistantMessage
    | SystemMessage;

export interface BaseMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    timestamp: string;
}

export interface UserMessage extends BaseMessage {
    role: 'user';
    content: string;
    metadata?: MessageMetadata;
}

/**
 * Assistant messages represent one "chunk" of output
 * Could be text content, thinking, or a tool call
 */
export interface AssistantMessage extends BaseMessage {
    role: 'assistant';

    // Exactly one of these should be set
    content?: string;          // Plain text content
    thinking?: string;        // Thinking process
    toolCall?: ToolCall;      // Tool invocation

    // Status for streaming
    status?: MessageStatus;

    // Group ID to link multiple assistant messages together
    groupId?: string;
}

export interface SystemMessage extends BaseMessage {
    role: 'system';
    content: string;
    type: SystemMessageType;
}

export type MessageStatus = 'streaming' | 'complete' | 'error';
export type SystemMessageType = 'info' | 'warning' | 'error' | 'success';

export interface ToolCall {
    name: string;
    input: unknown;
    output?: string;
    status: ToolCallStatus;
    duration?: number;
}

export type ToolCallStatus = 'pending' | 'success' | 'error';

export interface MessageMetadata {
    command?: string;
    attachments?: Attachment[];
}

export interface Attachment {
    type: 'file' | 'code' | 'image';
    content: string;
    language?: string;
}

// WebSocket message types for conversation
export interface ConversationWsMessage {
    type: 'conversation.user_input' | 'conversation.execute_start' | 'conversation.plan_start' |
    'conversation.chunk_start' | 'conversation.chunk' | 'conversation.chunk_end' |
    'conversation.thinking' | 'conversation.tool_call_start' | 'conversation.tool_call_output' |
    'conversation.tool_call_end' | 'conversation.error' | 'conversation.plan_complete' |
    'conversation.plan_complete_detected' | 'conversation.plan_waiting' | 'conversation.execute_complete' | 'task_status' | 'structured-output';
    taskId: string;
    projectId?: string;
    messageId?: string;
    groupId?: string;  // Group multiple assistant messages together
    content?: string;
    toolCall?: ToolCall;
    error?: string;
    planPath?: string;
    structuredOutput?: unknown;
    output?: unknown;
    status?: string;
    laneId?: string;
}

// Slash command definitions
export interface SlashCommand {
    command: string;
    description: string;
    handler: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
    { command: '/read', description: '读取文件内容', handler: 'handleRead' },
    { command: '/write', description: '写入文件', handler: 'handleWrite' },
    { command: '/run', description: '运行命令', handler: 'handleRun' },
    { command: '/test', description: '运行测试', handler: 'handleTest' },
    { command: '/clear', description: '清除会话历史', handler: 'handleClear' },
    { command: '/export', description: '导出对话为 Markdown', handler: 'handleExport' },
    { command: '/retry', description: '重新生成上次回复', handler: 'handleRetry' },
];

// Quick action definitions
export interface QuickAction {
    id: string;
    icon: string;
    label: string;
    prompt: string;
}

export const QUICK_ACTIONS: QuickAction[] = [
    { id: 'gen-test', icon: '🧪', label: '生成测试', prompt: '为当前代码生成单元测试' },
    { id: 'add-docs', icon: '📝', label: '添加文档', prompt: '为当前代码添加注释和文档' },
    { id: 'review', icon: '🔍', label: '代码审查', prompt: '审查当前代码质量' },
    { id: 'find-bugs', icon: '🐛', label: '查找问题', prompt: '分析代码中可能存在的问题' },
    { id: 'refactor', icon: '♻️', label: '重构建议', prompt: '提供重构建议' },
];
