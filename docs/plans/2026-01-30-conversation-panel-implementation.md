# Conversation Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a streaming interactive chat interface that complements the xterm terminal, with conversation persistence, collapsible tool calls, slash commands, and quick actions.

**Architecture:** Hybrid tabbed interface (Conversation + Terminal), WebSocket-based streaming, file-backed conversation storage, react-markdown for rendering, lucide-react for icons.

**Tech Stack:** React 18, TypeScript, Fastify, ws, react-markdown, react-syntax-highlighter, remark-gfm, lucide-react

---

## Prerequisites

### Install Dependencies

**Step 1: Install frontend dependencies**

Run:
```bash
pnpm add react-markdown react-syntax-highlighter remark-gfm lucide-react
pnpm add -D @types/react-syntax-highlighter
```

Expected: Dependencies added to `packages/web/package.json`

**Step 2: Commit**

```bash
git add packages/web/package.json packages/web/pnpm-lock.yaml
git commit -m "deps: add conversation panel dependencies"
```

---

## Task 1: Shared Types

**Files:**
- Create: `packages/shared/src/types/conversation.ts`

**Step 1: Create the conversation types file**

Create `packages/shared/src/types/conversation.ts`:

```typescript
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
    type: 'conversation.user_input' | 'conversation.chunk_start' | 'conversation.chunk' |
           'conversation.chunk_end' | 'conversation.thinking_start' | 'conversation.thinking_end' |
           'conversation.tool_call' | 'conversation.error';
    taskId: string;
    messageId?: string;
    content?: string;
    toolCall?: ToolCall;
    error?: string;
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
```

**Step 2: Export from shared index**

Add to `packages/shared/src/types/index.ts`:

```typescript
export * from './conversation';
```

**Step 3: Build shared package to verify**

Run:
```bash
pnpm --filter @antiwarden/shared build
```

Expected: No errors

**Step 4: Commit**

```bash
git add packages/shared/src/types/
git commit -m "feat(shared): add conversation types"
```

---

## Task 2: Backend - Conversation Storage Service

**Files:**
- Create: `packages/agent/src/services/conversation-storage.ts`

**Step 1: Create conversation storage service**

Create `packages/agent/src/services/conversation-storage.ts`:

```typescript
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { Conversation, ConversationMessage } from '@antiwarden/shared';

/**
 * File-based conversation storage
 * Stores conversations at ~/.antiwarden/tasks/{taskId}/conversation.json
 */
export class ConversationStorage {
    private getBaseDir(): string {
        return path.join(os.homedir(), '.antiwarden', 'tasks');
    }

    private getConversationPath(taskId: string): string {
        return path.join(this.getBaseDir(), taskId, 'conversation.json');
    }

    async load(taskId: string): Promise<Conversation | null> {
        const filePath = this.getConversationPath(taskId);
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(content) as Conversation;
        } catch {
            return null;
        }
    }

    async save(taskId: string, conversation: Conversation): Promise<void> {
        const filePath = this.getConversationPath(taskId);
        const dir = path.dirname(filePath);

        await fs.mkdir(dir, { recursive: true });
        conversation.updatedAt = new Date().toISOString();

        await fs.writeFile(filePath, JSON.stringify(conversation, null, 2));
    }

    async appendMessage(taskId: string, message: ConversationMessage): Promise<void> {
        const conversation = await this.load(taskId) || this.createEmpty(taskId);
        conversation.messages.push(message);
        await this.save(taskId, conversation);
    }

    async clear(taskId: string): Promise<void> {
        const conversation = await this.load(taskId);
        if (conversation) {
            conversation.messages = [];
            await this.save(taskId, conversation);
        }
    }

    async delete(taskId: string): Promise<void> {
        const filePath = this.getConversationPath(taskId);
        try {
            await fs.unlink(filePath);
        } catch {
            // Ignore if file doesn't exist
        }
    }

    private createEmpty(taskId: string): Conversation {
        return {
            taskId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: [],
        };
    }
}

// Singleton instance
export const conversationStorage = new ConversationStorage();
```

**Step 2: Build agent package to verify**

Run:
```bash
pnpm --filter @antiwarden/agent build
```

Expected: No errors

**Step 3: Commit**

```bash
git add packages/agent/src/services/conversation-storage.ts
git commit -m "feat(agent): add conversation storage service"
```

---

## Task 3: Backend - Conversation API Routes

**Files:**
- Create: `packages/agent/src/routes/conversation.ts`

**Step 1: Create conversation routes**

Create `packages/agent/src/routes/conversation.ts`:

```typescript
import { FastifyInstance } from 'fastify';
import { conversationStorage } from '../services/conversation-storage.js';
import { readGlobalConfig, readProjectData } from '../utils/json-store.js';
import type { Conversation } from '@antiwarden/shared';

export async function conversationRoutes(fastify: FastifyInstance) {
    // Get conversation for a task
    fastify.get<{
        Params: { projectId: string; taskId: string };
    }>('/api/projects/:projectId/tasks/:taskId/conversation', async (request) => {
        const { projectId, taskId } = request.params;

        const config = await readGlobalConfig();
        const project = config.projects.find(p => p.id === projectId);
        if (!project) {
            throw { statusCode: 404, message: 'Project not found' };
        }

        const conversation = await conversationStorage.load(taskId);
        return { conversation };
    });

    // Append message to conversation
    fastify.post<{
        Params: { projectId: string; taskId: string };
        Body: { message: ConversationMessage };
    }>('/api/projects/:projectId/tasks/:taskId/conversation/messages', async (request) => {
        const { projectId, taskId } = request.params;
        const { message } = request.body;

        const config = await readGlobalConfig();
        const project = config.projects.find(p => p.id === projectId);
        if (!project) {
            throw { statusCode: 404, message: 'Project not found' };
        }

        await conversationStorage.appendMessage(taskId, message);
        return { success: true };
    });

    // Clear conversation
    fastify.delete<{
        Params: { projectId: string; taskId: string };
    }>('/api/projects/:projectId/tasks/:taskId/conversation', async (request) => {
        const { projectId, taskId } = request.params;

        const config = await readGlobalConfig();
        const project = config.projects.find(p => p.id === projectId);
        if (!project) {
            throw { statusCode: 404, message: 'Project not found' };
        }

        await conversationStorage.clear(taskId);
        return { success: true };
    });

    // Export conversation as Markdown
    fastify.get<{
        Params: { projectId: string; taskId: string };
    }>('/api/projects/:projectId/tasks/:taskId/conversation/export', async (request, reply) => {
        const { projectId, taskId } = request.params;

        const config = await readGlobalConfig();
        const project = config.projects.find(p => p.id === projectId);
        if (!project) {
            throw { statusCode: 404, message: 'Project not found' };
        }

        const conversation = await conversationStorage.load(taskId);
        if (!conversation) {
            throw { statusCode: 404, message: 'Conversation not found' };
        }

        const markdown = conversationToMarkdown(conversation);
        reply.type('text/markdown');
        return markdown;
    });
}

function conversationToMarkdown(conversation: Conversation): string {
    let md = `# Conversation - ${conversation.taskId}\n\n`;
    md += `Created: ${new Date(conversation.createdAt).toLocaleString()}\n`;
    md += `Updated: ${new Date(conversation.updatedAt).toLocaleString()}\n\n---\n\n`;

    for (const message of conversation.messages) {
        const timestamp = new Date(message.timestamp).toLocaleTimeString();

        if (message.role === 'user') {
            md += `## 👤 User (${timestamp})\n\n${message.content}\n\n`;
        } else if (message.role === 'assistant') {
            md += `## 🤖 Assistant (${timestamp})\n\n${message.content}\n\n`;
            if (message.thinking) {
                md += `<details>\n<summary>💭 思考过程</summary>\n\n${message.thinking}\n\n</details>\n\n`;
            }
            if (message.toolCalls && message.toolCalls.length > 0) {
                md += `<details>\n<summary>🔧 工具调用 (${message.toolCalls.length})</summary>\n\n`;
                for (const tool of message.toolCalls) {
                    md += `- **${tool.name}**: ${JSON.stringify(tool.input)}\n`;
                }
                md += `\n</details>\n\n`;
            }
        } else if (message.role === 'system') {
            md += `> ℹ️ ${message.content}\n\n`;
        }
    }

    return md;
}
```

**Step 2: Register routes in server**

Modify `packages/agent/src/server.ts` to register conversation routes:

```typescript
import { conversationRoutes } from './routes/conversation.js';

// After other route registrations
await fastify.register(conversationRoutes);
```

**Step 3: Build to verify**

Run:
```bash
pnpm --filter @antiwarden/agent build
```

Expected: No errors

**Step 4: Commit**

```bash
git add packages/agent/src/routes/conversation.ts packages/agent/src/server.ts
git commit -m "feat(agent): add conversation API routes"
```

---

## Task 4: Backend - WebSocket Conversation Handler

**Files:**
- Modify: `packages/agent/src/websocket/execution.ts`

**Step 1: Add conversation message handler to execution.ts**

Add to `packages/agent/src/websocket/execution.ts` after the existing message handlers:

```typescript
import type { ConversationWsMessage, ConversationMessage } from '@antiwarden/shared';
import { conversationStorage } from '../services/conversation-storage.js';

// Add to the handleMessage switch case:

async function handleConversationUserMessage(connection: SocketStream, message: ConversationWsMessage) {
    const { taskId, content } = message;
    console.log('[Execution] Conversation user input:', taskId, content);

    const currentTask = getCurrentTask(taskId);
    if (!currentTask) {
        connection.socket.send(JSON.stringify({
            type: 'conversation.error',
            taskId,
            error: 'Task not found'
        }));
        return;
    }

    const workingDir = getProjectWorkingDir(currentTask.projectId);
    const sessionId = currentTask.claudeSession?.id;

    // Save user message
    const userMessage: ConversationMessage = {
        id: uuid(),
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
        metadata: {
            command: content.startsWith('/') ? content.split(' ')[0] : undefined,
        },
    };
    await conversationStorage.appendMessage(taskId, userMessage);

    // Create assistant message placeholder
    const assistantMessageId = uuid();
    const assistantMessage: ConversationMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        status: 'streaming',
        toolCalls: [],
    };
    await conversationStorage.appendMessage(taskId, assistantMessage);

    // Send chunk_start
    connection.socket.send(JSON.stringify({
        type: 'conversation.chunk_start',
        taskId,
        messageId: assistantMessageId,
    }));

    // Build callbacks for streaming
    const callbacks: AgentCallbacks = {
        onConversationChunk: async (msgId, content) => {
            connection.socket.send(JSON.stringify({
                type: 'conversation.chunk',
                taskId,
                messageId: msgId,
                content,
            }));
            // Update message in storage (debounced in real impl)
        },

        onConversationThinkingStart: async (content) => {
            connection.socket.send(JSON.stringify({
                type: 'conversation.thinking_start',
                taskId,
                content,
            }));
        },

        onConversationThinkingEnd: async () => {
            connection.socket.send(JSON.stringify({
                type: 'conversation.thinking_end',
                taskId,
            }));
        },

        onConversationToolCall: async (toolCall) => {
            connection.socket.send(JSON.stringify({
                type: 'conversation.tool_call',
                taskId,
                toolCall,
            }));
        },

        onConversationComplete: async (msgId) => {
            connection.socket.send(JSON.stringify({
                type: 'conversation.chunk_end',
                taskId,
                messageId: msgId,
            }));

            // Mark message as complete
            const conversation = await conversationStorage.load(taskId);
            if (conversation) {
                const msg = conversation.messages.find(m => m.id === msgId);
                if (msg && msg.role === 'assistant') {
                    (msg as any).status = 'complete';
                }
                await conversationStorage.save(taskId, conversation);
            }
        },

        onError: (error) => {
            connection.socket.send(JSON.stringify({
                type: 'conversation.error',
                taskId,
                error: error.message,
            }));
        },
    };

    // Call agent with user message
    try {
        await agentManager.sendUserMessage(
            taskId,
            workingDir,
            content,
            callbacks,
            sessionId
        );
    } catch (error: any) {
        console.error('[Execution] Conversation error:', error);
        connection.socket.send(JSON.stringify({
            type: 'conversation.error',
            taskId,
            error: error.message,
        }));
    }
}
```

**Step 2: Add to message handler switch**

In `handleMessage` function, add case for `conversation.user_input`:

```typescript
if (message.type === 'conversation.user_input') {
    await handleConversationUserMessage(connection, message as ConversationWsMessage);
    return;
}
```

**Step 3: Build to verify**

Run:
```bash
pnpm --filter @antiwarden/agent build
```

Expected: No errors

**Step 4: Commit**

```bash
git add packages/agent/src/websocket/execution.ts
git commit -m "feat(agent): add WebSocket conversation message handler"
```

---

## Task 5: Frontend - Conversation API Client

**Files:**
- Create: `packages/web/src/api/conversation.ts`

**Step 1: Create conversation API client**

Create `packages/web/src/api/conversation.ts`:

```typescript
const API_BASE = 'http://localhost:4001';

import type {
    Conversation,
    ConversationMessage,
} from '@antiwarden/shared';

export async function fetchConversation(
    projectId: string,
    taskId: string
): Promise<{ conversation: Conversation | null }> {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}/conversation`);
    if (!res.ok) throw new Error('Failed to fetch conversation');
    return res.json();
}

export async function appendConversationMessage(
    projectId: string,
    taskId: string,
    message: ConversationMessage
): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}/conversation/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
    });
    if (!res.ok) throw new Error('Failed to append message');
    return res.json();
}

export async function clearConversation(
    projectId: string,
    taskId: string
): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}/conversation`, {
        method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to clear conversation');
    return res.json();
}

export async function exportConversationAsMarkdown(
    projectId: string,
    taskId: string
): Promise<string> {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}/conversation/export`);
    if (!res.ok) throw new Error('Failed to export conversation');
    return res.text();
}
```

**Step 2: Build to verify**

Run:
```bash
pnpm --filter @antiwarden/web build
```

Expected: No errors

**Step 3: Commit**

```bash
git add packages/web/src/api/conversation.ts
git commit -m "feat(web): add conversation API client"
```

---

## Task 6: Frontend - Conversation Hook

**Files:**
- Create: `packages/web/src/hooks/useConversation.ts`

**Step 1: Create useConversation hook**

Create `packages/web/src/hooks/useConversation.ts`:

```typescript
import { useState, useEffect, useRef, useCallback } from 'react';
import { connectionManager } from '../services/ConnectionManager';
import type { Conversation, ConversationMessage, ToolCall } from '@antiwarden/shared';
import { fetchConversation, appendConversationMessage } from '../api/conversation';

interface UseConversationOptions {
    taskId: string;
    projectId: string;
}

export function useConversation({ taskId, projectId }: UseConversationOptions) {
    const [messages, setMessages] = useState<ConversationMessage[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);
    const currentMessageRef = useRef<Map<string, string>>(new Map());

    // Load conversation on mount
    useEffect(() => {
        fetchConversation(projectId, taskId)
            .then(({ conversation }) => {
                if (conversation) {
                    setMessages(conversation.messages);
                }
            })
            .catch(err => {
                console.error('[useConversation] Failed to load conversation:', err);
            });
    }, [taskId, projectId]);

    // Subscribe to WebSocket messages
    useEffect(() => {
        const handleMessage = (message: any) => {
            if (message.taskId !== taskId) return;

            switch (message.type) {
                case 'conversation.chunk_start':
                    setCurrentMessageId(message.messageId);
                    setIsStreaming(true);
                    // Add placeholder message
                    setMessages(prev => [...prev, {
                        id: message.messageId,
                        role: 'assistant',
                        content: '',
                        timestamp: new Date().toISOString(),
                        status: 'streaming',
                    }]);
                    currentMessageRef.current.set(message.messageId, '');
                    break;

                case 'conversation.chunk':
                    if (message.messageId === currentMessageId) {
                        const existing = currentMessageRef.current.get(message.messageId) || '';
                        const updated = existing + (message.content || '');
                        currentMessageRef.current.set(message.messageId, updated);
                        setMessages(prev => prev.map(msg =>
                            msg.id === message.messageId
                                ? { ...msg, content: updated }
                                : msg
                        ));
                    }
                    break;

                case 'conversation.chunk_end':
                    setIsStreaming(false);
                    setCurrentMessageId(null);
                    setMessages(prev => prev.map(msg =>
                        msg.id === message.messageId
                            ? { ...msg, status: 'complete' as const }
                            : msg
                    ));
                    break;

                case 'conversation.thinking_start':
                    setMessages(prev => [...prev, {
                        id: `thinking-${Date.now()}`,
                        role: 'system',
                        content: message.content || '',
                        type: 'info' as const,
                        timestamp: new Date().toISOString(),
                    }]);
                    break;

                case 'conversation.tool_call':
                    setMessages(prev => {
                        const lastMsg = prev[prev.length - 1];
                        if (lastMsg && lastMsg.role === 'assistant') {
                            return prev.map((msg, i) =>
                                i === prev.length - 1
                                    ? {
                                        ...msg,
                                        toolCalls: [...(msg.toolCalls || []), message.toolCall],
                                    } as any
                                    : msg
                            );
                        }
                        return prev;
                    });
                    break;

                case 'conversation.error':
                    setIsStreaming(false);
                    setCurrentMessageId(null);
                    setMessages(prev => [...prev, {
                        id: `error-${Date.now()}`,
                        role: 'system',
                        content: message.error || 'An error occurred',
                        type: 'error' as const,
                        timestamp: new Date().toISOString(),
                    }]);
                    break;
            }
        };

        const unsubscribe = connectionManager.subscribe(taskId, handleMessage);
        return () => unsubscribe();
    }, [taskId]);

    const sendMessage = useCallback(async (content: string, metadata?: any) => {
        if (isStreaming) return;

        const userMessage: ConversationMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content,
            timestamp: new Date().toISOString(),
            metadata,
        };

        setMessages(prev => [...prev, userMessage]);

        // Send via WebSocket
        connectionManager.send({
            type: 'conversation.user_input',
            taskId,
            content,
        });
    }, [taskId, isStreaming]);

    const clearMessages = useCallback(async () => {
        setMessages([]);
        const { clearConversation } = await import('../api/conversation');
        await clearConversation(projectId, taskId);
    }, [projectId, taskId]);

    return {
        messages,
        isStreaming,
        sendMessage,
        clearMessages,
    };
}
```

**Step 2: Create hooks directory index**

Create `packages/web/src/hooks/index.ts`:

```typescript
export { useConversation } from './useConversation';
```

**Step 3: Build to verify**

Run:
```bash
pnpm --filter @antiwarden/web build
```

Expected: No errors

**Step 4: Commit**

```bash
git add packages/web/src/hooks/
git commit -m "feat(web): add useConversation hook"
```

---

## Task 7: Frontend - Markdown Renderer Component

**Files:**
- Create: `packages/web/src/components/markdown/MarkdownRenderer.tsx`

**Step 1: Create MarkdownRenderer component**

Create `packages/web/src/components/markdown/MarkdownRenderer.tsx`:

```typescript
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MarkdownRendererProps {
    content: string;
    className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
    return (
        <div className={className}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    code({ node, inline, className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        const language = match ? match[1] : '';

                        return !inline && language ? (
                            <SyntaxHighlighter
                                style={oneDark}
                                language={language}
                                PreTag="div"
                                customStyle={{
                                    borderRadius: '8px',
                                    margin: '0.5rem 0',
                                }}
                            >
                                {String(children).replace(/\n$/, '')}
                            </SyntaxHighlighter>
                        ) : (
                            <code
                                className="inline-code"
                                style={{
                                    background: 'var(--bg-secondary)',
                                    padding: '0.2rem 0.4rem',
                                    borderRadius: '4px',
                                    fontSize: '0.9em',
                                }}
                            >
                                {children}
                            </code>
                        );
                    },
                    pre({ children }) {
                        return <>{children}</>;
                    },
                    p({ children }) {
                        return <p style={{ margin: '0.5rem 0', lineHeight: '1.6' }}>{children}</p>;
                    },
                    ul({ children }) {
                        return <ul style={{ paddingLeft: '1.5rem', margin: '0.5rem 0' }}>{children}</ul>;
                    },
                    ol({ children }) {
                        return <ol style={{ paddingLeft: '1.5rem', margin: '0.5rem 0' }}>{children}</ol>;
                    },
                    a({ href, children }) {
                        return (
                            <a
                                href={href}
                                style={{ color: 'var(--accent)', textDecoration: 'underline' }}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {children}
                            </a>
                        );
                    },
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}
```

**Step 2: Build to verify**

Run:
```bash
pnpm --filter @antiwarden/web build
```

Expected: No errors

**Step 3: Commit**

```bash
git add packages/web/src/components/markdown/
git commit -m "feat(web): add MarkdownRenderer component"
```

---

## Task 8: Frontend - Collapsible Section Component

**Files:**
- Create: `packages/web/src/components/conversation/CollapsibleSection.tsx`

**Step 1: Create CollapsibleSection component**

Create `packages/web/src/components/conversation/CollapsibleSection.tsx`:

```typescript
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface CollapsibleSectionProps {
    title: string;
    isExpanded?: boolean;
    onToggle?: (expanded: boolean) => void;
    children: React.ReactNode;
}

export function CollapsibleSection({ title, isExpanded: controlledExpanded, onToggle, children }: CollapsibleSectionProps) {
    const [internalExpanded, setInternalExpanded] = useState(false);

    const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

    const handleToggle = () => {
        const newState = !isExpanded;
        if (onToggle) {
            onToggle(newState);
        } else {
            setInternalExpanded(newState);
        }
    };

    return (
        <details
            className="collapsible-section"
            style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                margin: '0.5rem 0',
                overflow: 'hidden',
            }}
            open={isExpanded}
        >
            <summary
                onClick={(e) => {
                    e.preventDefault();
                    handleToggle();
                }}
                style={{
                    padding: '0.5rem 1rem',
                    cursor: 'pointer',
                    userSelect: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.875rem',
                }}
            >
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                {title}
            </summary>
            <div style={{
                padding: '0.5rem 1rem',
                borderTop: '1px solid var(--border-color)',
            }}>
                {children}
            </div>
        </details>
    );
}
```

**Step 2: Build to verify**

Run:
```bash
pnpm --filter @antiwarden/web build
```

Expected: No errors

**Step 3: Commit**

```bash
git add packages/web/src/components/conversation/CollapsibleSection.tsx
git commit -m "feat(web): add CollapsibleSection component"
```

---

## Task 9: Frontend - Message Bubble Component

**Files:**
- Create: `packages/web/src/components/conversation/MessageBubble.tsx`

**Step 1: Create MessageBubble component**

Create `packages/web/src/components/conversation/MessageBubble.tsx`:

```typescript
import { useState } from 'react';
import { User, Bot, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import type { ConversationMessage } from '@antiwarden/shared';
import { MarkdownRenderer } from '../markdown/MarkdownRenderer';
import { CollapsibleSection } from './CollapsibleSection';

interface MessageBubbleProps {
    message: ConversationMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
    const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);
    const [isToolsExpanded, setIsToolsExpanded] = useState(false);

    if (message.role === 'user') {
        return (
            <div className="message-bubble user" style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginBottom: '1rem',
            }}>
                <div style={{
                    maxWidth: '80%',
                    background: 'var(--accent)',
                    color: 'white',
                    padding: '0.75rem 1rem',
                    borderRadius: '12px 12px 0 12px',
                }}>
                    <div style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>
                        {message.content}
                    </div>
                    {message.metadata?.command && (
                        <div style={{
                            fontSize: '0.75rem',
                            opacity: 0.8,
                            marginTop: '0.25rem',
                        }}>
                            {message.metadata.command}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (message.role === 'system') {
        const icons = {
            info: Info,
            warning: AlertTriangle,
            error: AlertCircle,
        };
        const Icon = icons[message.type || 'info'];

        return (
            <div className="message-bubble system" style={{
                display: 'flex',
                justifyContent: 'center',
                marginBottom: '1rem',
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.875rem',
                    color: 'var(--text-secondary)',
                }}>
                    <Icon size={16} />
                    {message.content}
                </div>
            </div>
        );
    }

    // Assistant message
    const msg = message as any;
    return (
        <div className="message-bubble assistant" style={{
            display: 'flex',
            justifyContent: 'flex-start',
            marginBottom: '1rem',
        }}>
            <div style={{
                display: 'flex',
                gap: '0.75rem',
                maxWidth: '85%',
            }}>
                <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                }}>
                    <Bot size={18} />
                </div>
                <div style={{
                    flex: 1,
                    minWidth: 0,
                }}>
                    {/* Thinking process */}
                    {msg.thinking && (
                        <CollapsibleSection
                            title="💭 思考过程"
                            isExpanded={isThinkingExpanded}
                            onToggle={setIsThinkingExpanded}
                        >
                            <MarkdownRenderer content={msg.thinking} />
                        </CollapsibleSection>
                    )}

                    {/* Main content */}
                    <MarkdownRenderer content={message.content} />

                    {/* Tool calls */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                        <CollapsibleSection
                            title={`🔧 使用工具 (${msg.toolCalls.length})`}
                            isExpanded={isToolsExpanded}
                            onToggle={setIsToolsExpanded}
                        >
                            {msg.toolCalls.map((tool: any, i: number) => (
                                <div key={i} style={{
                                    background: 'var(--bg-card)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '4px',
                                    padding: '0.5rem',
                                    marginBottom: '0.5rem',
                                }}>
                                    <div style={{
                                        fontWeight: 500,
                                        color: 'var(--accent)',
                                        marginBottom: '0.25rem',
                                    }}>
                                        {tool.name}
                                    </div>
                                    <pre style={{
                                        fontSize: '0.75rem',
                                        overflow: 'auto',
                                        maxHeight: '100px',
                                    }}>
                                        {JSON.stringify(tool.input, null, 2)}
                                    </pre>
                                    {tool.status === 'pending' && (
                                        <div style={{ fontSize: '0.75rem', color: 'orange' }}>
                                            ⏳ 执行中...
                                        </div>
                                    )}
                                    {tool.status === 'success' && (
                                        <div style={{ fontSize: '0.75rem', color: 'green' }}>
                                            ✓ 完成 {tool.duration && `(${tool.duration}ms)`}
                                        </div>
                                    )}
                                    {tool.status === 'error' && (
                                        <div style={{ fontSize: '0.75rem', color: 'red' }}>
                                            ✗ 失败
                                        </div>
                                    )}
                                </div>
                            ))}
                        </CollapsibleSection>
                    )}

                    {/* Streaming indicator */}
                    {msg.status === 'streaming' && (
                        <div style={{ display: 'flex', gap: '4px', marginTop: '0.5rem' }}>
                            <span className="typing-dot" style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: 'var(--accent)',
                                animation: 'typing 1.4s infinite',
                            }} />
                            <span className="typing-dot" style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: 'var(--accent)',
                                animation: 'typing 1.4s 0.2s infinite',
                            }} />
                            <span className="typing-dot" style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: 'var(--accent)',
                                animation: 'typing 1.4s 0.4s infinite',
                            }} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
```

**Step 2: Add typing animation to CSS**

Add to `packages/web/src/index.css`:

```css
@keyframes typing {
    0%, 60%, 100% { transform: translateY(0); }
    30% { transform: translateY(-4px); }
}
```

**Step 3: Build to verify**

Run:
```bash
pnpm --filter @antiwarden/web build
```

Expected: No errors

**Step 4: Commit**

```bash
git add packages/web/src/components/conversation/MessageBubble.tsx packages/web/src/index.css
git commit -m "feat(web): add MessageBubble component with typing animation"
```

---

## Task 10: Frontend - Message List Component

**Files:**
- Create: `packages/web/src/components/conversation/MessageList.tsx`

**Step 1: Create MessageList component**

Create `packages/web/src/components/conversation/MessageList.tsx`:

```typescript
import { useEffect, useRef } from 'react';
import type { ConversationMessage } from '@antiwarden/shared';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
    messages: ConversationMessage[];
    isStreaming?: boolean;
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isStreaming]);

    return (
        <div className="message-list" style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
        }}>
            {messages.length === 0 ? (
                <div style={{
                    textAlign: 'center',
                    color: 'var(--text-secondary)',
                    marginTop: '2rem',
                }}>
                    <p>👋 开始对话</p>
                    <p style={{ fontSize: '0.875rem' }}>输入消息与 Claude 进行交互</p>
                </div>
            ) : (
                messages.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                ))
            )}
            {isStreaming && (
                <div ref={messagesEndRef} />
            )}
        </div>
    );
}
```

**Step 2: Build to verify**

Run:
```bash
pnpm --filter @antiwarden/web build
```

Expected: No errors

**Step 3: Commit**

```bash
git add packages/web/src/components/conversation/MessageList.tsx
git commit -m "feat(web): add MessageList component"
```

---

## Task 11: Frontend - Message Input Component

**Files:**
- Create: `packages/web/src/components/conversation/MessageInput.tsx`

**Step 1: Create MessageInput component**

Create `packages/web/src/components/conversation/MessageInput.tsx`:

```typescript
import { useState, useRef, useEffect } from 'react';
import { Send, Square, RotateCcw, Trash2 } from 'lucide-react';

interface MessageInputProps {
    onSend: (content: string) => void;
    onStop?: () => void;
    onClear?: () => void;
    onRegenerate?: () => void;
    disabled?: boolean;
    isStreaming?: boolean;
}

export function MessageInput({
    onSend,
    onStop,
    onClear,
    onRegenerate,
    disabled,
    isStreaming,
}: MessageInputProps) {
    const [input, setInput] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    }, [input]);

    const handleSend = () => {
        if (input.trim() && !disabled) {
            onSend(input.trim());
            setInput('');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="message-input" style={{
            borderTop: '1px solid var(--border-color)',
            padding: '1rem',
        }}>
            {/* Quick action buttons */}
            <div style={{
                display: 'flex',
                gap: '0.5rem',
                marginBottom: '0.75rem',
            }}>
                <button
                    onClick={onRegenerate}
                    disabled={isStreaming}
                    className="secondary-btn"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.75rem',
                        padding: '0.25rem 0.5rem',
                    }}
                    title="重新生成"
                >
                    <RotateCcw size={14} />
                    重新生成
                </button>
                {isStreaming ? (
                    <button
                        onClick={onStop}
                        className="danger-btn"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            fontSize: '0.75rem',
                            padding: '0.25rem 0.5rem',
                        }}
                        title="停止"
                    >
                        <Square size={14} />
                        停止
                    </button>
                ) : (
                    <button
                        onClick={onClear}
                        className="secondary-btn"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            fontSize: '0.75rem',
                            padding: '0.25rem 0.5rem',
                        }}
                        title="清除历史"
                    >
                        <Trash2 size={14} />
                        清除
                    </button>
                )}
            </div>

            {/* Input area */}
            <div style={{
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'flex-end',
            }}>
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="输入消息... (按 Enter 发送, Shift+Enter 换行)"
                    disabled={disabled}
                    style={{
                        flex: 1,
                        minHeight: '44px',
                        maxHeight: '120px',
                        padding: '0.75rem',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        background: 'var(--bg-card)',
                        color: 'var(--text-primary)',
                        fontSize: '0.875rem',
                        resize: 'none',
                        fontFamily: 'inherit',
                    }}
                />
                <button
                    onClick={handleSend}
                    disabled={disabled || !input.trim()}
                    className="primary-btn"
                    style={{
                        width: '44px',
                        height: '44px',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '8px',
                    }}
                    title="发送 (Enter)"
                >
                    <Send size={18} />
                </button>
            </div>
        </div>
    );
}
```

**Step 2: Build to verify**

Run:
```bash
pnpm --filter @antiwarden/web build
```

Expected: No errors

**Step 3: Commit**

```bash
git add packages/web/src/components/conversation/MessageInput.tsx
git commit -m "feat(web): add MessageInput component"
```

---

## Task 12: Frontend - Quick Actions Component

**Files:**
- Create: `packages/web/src/components/conversation/QuickActions.tsx`

**Step 1: Create QuickActions component**

Create `packages/web/src/components/conversation/QuickActions.tsx`:

```typescript
import { QUICK_ACTIONS } from '@antiwarden/shared';

interface QuickActionsProps {
    onAction: (prompt: string) => void;
    disabled?: boolean;
}

export function QuickActions({ onAction, disabled }: QuickActionsProps) {
    return (
        <div className="quick-actions" style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            borderBottom: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
        }}>
            {QUICK_ACTIONS.map((action) => (
                <button
                    key={action.id}
                    onClick={() => onAction(action.prompt)}
                    disabled={disabled}
                    className="quick-action-btn"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.375rem 0.75rem',
                        fontSize: '0.75rem',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '20px',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        opacity: disabled ? 0.5 : 1,
                        transition: 'all 0.2s',
                    }}
                    title={action.prompt}
                    onMouseEnter={(e) => {
                        if (!disabled) {
                            e.currentTarget.style.borderColor = 'var(--accent)';
                        }
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                    }}
                >
                    <span>{action.icon}</span>
                    <span>{action.label}</span>
                </button>
            ))}
        </div>
    );
}
```

**Step 2: Build to verify**

Run:
```bash
pnpm --filter @antiwarden/web build
```

Expected: No errors

**Step 3: Commit**

```bash
git add packages/web/src/components/conversation/QuickActions.tsx
git commit -m "feat(web): add QuickActions component"
```

---

## Task 13: Frontend - Conversation Panel Main Component

**Files:**
- Create: `packages/web/src/components/conversation/ConversationPanel.tsx`

**Step 1: Create ConversationPanel main component**

Create `packages/web/src/components/conversation/ConversationPanel.tsx`:

```typescript
import { useState } from 'react';
import { MessageSquare, Terminal } from 'lucide-react';
import { useConversation } from '../../hooks/useConversation';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { QuickActions } from './QuickActions';
import { Terminal } from '../Terminal';

interface ConversationPanelProps {
    taskId: string;
    projectId: string;
    terminalRef?: any;
    onTerminalData?: (data: string) => void;
    onTerminalResize?: (cols: number, rows: number) => void;
}

export function ConversationPanel({
    taskId,
    projectId,
    terminalRef,
    onTerminalData,
    onTerminalResize,
}: ConversationPanelProps) {
    const [activeTab, setActiveTab] = useState<'conversation' | 'terminal'>('conversation');
    const { messages, isStreaming, sendMessage, clearMessages } = useConversation({ taskId, projectId });

    const handleSend = (content: string) => {
        sendMessage(content);
    };

    const handleQuickAction = (prompt: string) => {
        sendMessage(prompt);
    };

    return (
        <div className="conversation-panel" style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            overflow: 'hidden',
        }}>
            {/* Tab bar */}
            <div style={{
                display: 'flex',
                borderBottom: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
            }}>
                <button
                    onClick={() => setActiveTab('conversation')}
                    className="tab-button"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.75rem 1rem',
                        fontSize: '0.875rem',
                        border: 'none',
                        background: activeTab === 'conversation' ? 'var(--bg-card)' : 'transparent',
                        borderBottom: activeTab === 'conversation' ? '2px solid var(--accent)' : '2px solid transparent',
                        cursor: 'pointer',
                    }}
                >
                    <MessageSquare size={16} />
                    对话
                </button>
                <button
                    onClick={() => setActiveTab('terminal')}
                    className="tab-button"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.75rem 1rem',
                        fontSize: '0.875rem',
                        border: 'none',
                        background: activeTab === 'terminal' ? 'var(--bg-card)' : 'transparent',
                        borderBottom: activeTab === 'terminal' ? '2px solid var(--accent)' : '2px solid transparent',
                        cursor: 'pointer',
                    }}
                >
                    <Terminal size={16} />
                    原始输出
                </button>
            </div>

            {/* Content */}
            {activeTab === 'conversation' ? (
                <>
                    <MessageList messages={messages} isStreaming={isStreaming} />
                    <QuickActions onAction={handleQuickAction} disabled={isStreaming} />
                    <MessageInput
                        onSend={handleSend}
                        onClear={clearMessages}
                        disabled={isStreaming}
                        isStreaming={isStreaming}
                    />
                </>
            ) : (
                <div style={{
                    flex: 1,
                    padding: '0.5rem',
                    overflow: 'hidden',
                }}>
                    <Terminal
                        ref={terminalRef}
                        onData={onTerminalData}
                        onResize={onTerminalResize}
                    />
                </div>
            )}
        </div>
    );
}
```

**Step 2: Build to verify**

Run:
```bash
pnpm --filter @antiwarden/web build
```

Expected: No errors

**Step 3: Commit**

```bash
git add packages/web/src/components/conversation/ConversationPanel.tsx
git commit -m "feat(web): add ConversationPanel main component"
```

---

## Task 14: Frontend - Integrate ConversationPanel into TaskDetail

**Files:**
- Modify: `packages/web/src/components/TaskDetail.tsx`

**Step 1: Import ConversationPanel and modify layout**

Modify `packages/web/src/components/TaskDetail.tsx`:

```typescript
import { ConversationPanel } from './conversation/ConversationPanel';
```

**Step 2: Replace the Terminal section with ConversationPanel**

Find and replace the Terminal section (around line 414-435) with:

```typescript
{/* Conversation Panel (includes Terminal tab) */}
{showTerminal && (
    <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        height: '100%'
    }}>
        <ConversationPanel
            taskId={task.id}
            projectId={projectId}
            terminalRef={setTerminalRef}
            onTerminalData={(data) => sendInput(data)}
            onTerminalResize={(cols, rows) => handleResize(cols, rows)}
        />
    </div>
)}
```

**Step 3: Build to verify**

Run:
```bash
pnpm --filter @antiwarden/web build
```

Expected: No errors

**Step 4: Commit**

```bash
git add packages/web/src/components/TaskDetail.tsx
git commit -m "feat(web): integrate ConversationPanel into TaskDetail"
```

---

## Task 15: Backend - AgentManager sendUserMessage Implementation

**Files:**
- Modify: `packages/agent/src/services/agent-manager.ts`

**Step 1: Add sendUserMessage method to AgentManager**

Add to `packages/agent/src/services/agent-manager.ts`:

```typescript
import { v4 as uuid } from 'uuid';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { ConversationMessage, ToolCall } from '@antiwarden/shared';

// In AgentManager class, add the method:

async sendUserMessage(
    taskId: string,
    projectPath: string,
    userMessage: string,
    callbacks?: AgentCallbacks,
    existingSessionId?: string
): Promise<string> {
    console.log(`[AgentManager] sendUserMessage for task: ${taskId}`);

    const resumeSessionId = existingSessionId || this.getSessionId(taskId);

    const queryOptions: Record<string, unknown> = {
        allowedTools: ['Read', 'Glob', 'Grep', 'Bash'],
        settingSources: ['project'],
        cwd: projectPath,
    };

    try {
        let messageId = uuid();
        let isThinking = false;
        let pendingToolCalls: Map<string, ToolCall> = new Map();

        for await (const message of query({
            prompt: userMessage,
            queryOptions,
            resumeSessionId,
        })) {
            // Store session ID
            if ((message as any).session_id && !this.getSessionId(taskId)) {
                this.setSessionId(taskId, (message as any).session_id);
                callbacks?.onSessionStart?.((message as any).session_id);
            }

            // Handle thinking process
            if (message.type === 'thinking_start') {
                isThinking = true;
                const thinking = (message as any).thinking || '';
                callbacks?.onConversationThinkingStart?.(thinking);
            } else if (message.type === 'thinking_end') {
                isThinking = false;
                callbacks?.onConversationThinkingEnd?.();
            }

            // Handle tool calls
            else if (message.type === 'tool_use' && !isThinking) {
                const toolName = (message as any).name;
                const toolInput = (message as any).input;
                const toolId = `${messageId}-${toolName}`;

                const toolCall: ToolCall = {
                    name: toolName,
                    input: toolInput,
                    status: 'pending',
                };
                pendingToolCalls.set(toolId, toolCall);
                callbacks?.onConversationToolCall?.(toolCall);
            }

            // Handle tool result (update tool call status)
            else if (message.type === 'tool_result') {
                const toolName = (message as any).name;
                const toolId = `${messageId}-${toolName}`;
                const toolCall = pendingToolCalls.get(toolId);
                if (toolCall) {
                    toolCall.status = (message as any).isError ? 'error' : 'success';
                    toolCall.output = JSON.stringify((message as any).result);
                    callbacks?.onConversationToolCall?.(toolCall);
                }
            }

            // Handle text content (streaming)
            else if (message.type === 'content_block_start') {
                callbacks?.onConversationChunk?.(messageId, '');
            } else if (message.type === 'content_block_delta') {
                const delta = (message as any).delta?.text || '';
                callbacks?.onConversationChunk?.(messageId, delta);
            } else if (message.type === 'content_block_stop') {
                callbacks?.onConversationComplete?.(messageId);
                messageId = uuid();
                pendingToolCalls.clear();
            }

            // Handle regular output (for terminal compatibility)
            else if (message.type === 'output') {
                const output = (message as any).output || '';
                callbacks?.onOutput?.(output);
            }
        }

        return resumeSessionId || '';

    } catch (error: any) {
        console.error('[AgentManager] sendUserMessage error:', error);
        if (callbacks?.onError) {
            callbacks.onError(error);
        } else {
            throw error;
        }
        return '';
    }
}

private setSessionId(taskId: string, sessionId: string): void {
    const session = this.sessions.get(taskId);
    if (session) {
        session.claudeSessionId = sessionId;
    } else {
        this.sessions.set(taskId, {
            queryInstance: null as any,
            inputQueue: [],
            inputNotify: null,
            inputStream: null,
            claudeSessionId: sessionId,
            outputBuffer: '',
            completed: false,
        });
    }
}

private getSessionId(taskId: string): string | undefined {
    return this.sessions.get(taskId)?.claudeSessionId;
}
```

**Step 2: Build to verify**

Run:
```bash
pnpm --filter @antiwarden/agent build
```

Expected: No errors

**Step 3: Commit**

```bash
git add packages/agent/src/services/agent-manager.ts
git commit -m "feat(agent): add sendUserMessage method to AgentManager"
```

---

## Task 16: Testing and Verification

**Step 1: Start backend**

Run:
```bash
pnpm --filter @antiwarden/agent dev
```

Expected: Server running on port 4001

**Step 2: Start frontend**

Run:
```bash
pnpm --filter @antiwarden/web dev
```

Expected: Dev server running, frontend accessible

**Step 3: Manual testing**

Test the following:
1. Open a task in the design lane
2. Switch between "对话" and "原始输出" tabs
3. Send a message in the conversation tab
4. Verify streaming response appears
5. Check that tool calls appear in collapsible sections
6. Test quick action buttons
7. Test slash commands
8. Close and reopen task panel - conversation should persist

**Step 4: Fix any issues**

Address any bugs found during testing.

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete conversation panel implementation"
```

---

## Summary

This implementation plan creates a complete streaming conversation interface with:

1. **Shared types** - Frontend/backend type safety
2. **File-based persistence** - Conversations saved to disk
3. **WebSocket streaming** - Real-time message chunks
4. **Markdown rendering** - With syntax highlighting
5. **Collapsible sections** - For thinking process and tool calls
6. **Quick actions** - Predefined prompts
7. **Tabbed interface** - Conversation + Terminal

Total estimated tasks: 16
Total estimated time: 4-6 hours for a skilled developer
