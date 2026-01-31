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

export type ConversationMessage =
    | UserMessage
    | AssistantMessage
    | SystemMessage;

export interface UserMessage {
    id: string;
    role: 'user';
    content: string;
    timestamp: string;
    metadata?: MessageMetadata;
}

export interface AssistantMessage {
    id: string;
    role: 'assistant';
    content: string;
    timestamp: string;
    thinking?: string;
    toolCalls?: ToolCall[];
    status: MessageStatus;
}

export interface SystemMessage {
    id: string;
    role: 'system';
    content: string;
    type: SystemMessageType;
    timestamp: string;
}

export type MessageStatus = 'streaming' | 'complete' | 'error';
export type SystemMessageType = 'info' | 'warning' | 'error';

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
    type: 'conversation.user_input' | 'conversation.execute_start' | 'conversation.design_start' | 'conversation.chunk_start' | 'conversation.chunk' |
           'conversation.chunk_end' | 'conversation.thinking_start' | 'conversation.thinking_end' |
           'conversation.tool_call' | 'conversation.error' | 'conversation.design_complete' | 'conversation.execute_complete' |
           'structured-output';
    taskId: string;
    projectId?: string;
    messageId?: string;
    content?: string;
    toolCall?: ToolCall;
    error?: string;
    designPath?: string;  // For design_complete
    structuredOutput?: unknown;  // For execute_complete or structured-output
    output?: unknown;  // For structured-output
}

// Slash command definitions
export interface SlashCommand {
    command: string;
    description: string;
    handler: string; // Backend handler name
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
