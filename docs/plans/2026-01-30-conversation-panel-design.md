# 对话面板设计 - 流式交互式会话

> 日期: 2026-01-30
> 状态: 设计完成，待实施

## 概述

将现有 xterm 终端替换为混合模式交互界面，保留原始输出能力的同时，新增类似 ChatGPT 的流式对话体验。支持会话持久化、工具调用折叠展示、斜杠命令和快捷操作。

---

## 用户需求

1. **混合模式界面** - 保留 xterm 作为"原始输出"标签页，新增"对话"标签页
2. **折叠模式展示** - 显示用户输入和 AI 回复，工具调用以可折叠卡片展示
3. **增强输入方式** - 支持快捷操作按钮 + 斜杠命令
4. **文件级持久化** - 会话保存到 `.antiwarden/tasks/{taskId}/conversation.json`
5. **流式渲染** - Markdown + 语法高亮 + 思考过程展示
6. **持续会话** - 支持多轮对话 + 快捷操作按钮

---

## 界面设计

```
┌─────────────────────────────────────────────────────────────────┐
│  任务详情: [标题]                              [编辑] [删除]    │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐│
│ │ [对话] [原始输出]                              ───────── ●  ││
│ ├─────────────────────────────────────────────────────────────┤│
│ │                                                             ││
│ │  消息列表区域（可滚动）                                      ││
│ │  ┌───────────────────────────────────────────────────────┐ ││
│ │  │ 用户: 帮我创建一个登录页面                              │ ││
│ │  ├───────────────────────────────────────────────────────┤ ││
│ │  │ Claude: 好的，我将创建一个响应式登录页面...           │ ││
│ │  │ ▶ [使用工具] Read (3) + Write (1)                     │ ││
│ │  ├───────────────────────────────────────────────────────┤ ││
│ │  │ 用户: 请调整一下颜色                                    │ ││
│ │  ├───────────────────────────────────────────────────────┤ ││
│ │  │ Claude: 我将把主色调改为蓝色...                         │ ││
│ │  └───────────────────────────────────────────────────────┘ ││
│ │                                                             ││
│ ├─────────────────────────────────────────────────────────────┤│
│ │ 输入区域                                                    ││
│ │ [/read 命令] [重新生成] [停止] [清除]                      ││
│ │ ┌───────────────────────────────────────────────────────┐ ││
│ │ │ 输入消息... (@代码 文件 #任务)              [发送 ↑]  │ ││
│ │ └───────────────────────────────────────────────────────┘ ││
│ └─────────────────────────────────────────────────────────────┘│
│                                                              │
│  右侧：任务信息和操作                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 数据模型

### 会话数据结构 (`.antiwarden/tasks/{taskId}/conversation.json`)

```typescript
interface Conversation {
    taskId: string;
    createdAt: string;
    updatedAt: string;
    messages: ConversationMessage[];
}

type ConversationMessage =
    | UserMessage
    | AssistantMessage
    | SystemMessage;

interface UserMessage {
    id: string;
    role: 'user';
    content: string;
    timestamp: string;
    metadata?: {
        command?: string;
        attachments?: Attachment[];
    };
}

interface AssistantMessage {
    id: string;
    role: 'assistant';
    content: string;
    timestamp: string;
    thinking?: string;
    toolCalls?: ToolCall[];
    status: 'streaming' | 'complete' | 'error';
}

interface SystemMessage {
    id: string;
    role: 'system';
    content: string;
    type: 'info' | 'warning' | 'error';
    timestamp: string;
}

interface ToolCall {
    name: string;
    input: unknown;
    output?: string;
    status: 'pending' | 'success' | 'error';
    duration?: number;
}

interface Attachment {
    type: 'file' | 'code' | 'image';
    content: string;
    language?: string;
}
```

### WebSocket 消息扩展

```typescript
type ConversationWsMessage =
    | { type: 'conversation.user_input'; taskId: string; content: string; }
    | { type: 'conversation.chunk_start'; taskId: string; messageId: string; }
    | { type: 'conversation.chunk'; taskId: string; messageId: string; content: string; }
    | { type: 'conversation.chunk_end'; taskId: string; messageId: string; }
    | { type: 'conversation.thinking_start'; taskId: string; content: string; }
    | { type: 'conversation.thinking_end'; taskId: string; }
    | { type: 'conversation.tool_call'; taskId: string; toolCall: ToolCall; }
    | { type: 'conversation.error'; taskId: string; error: string; };
```

### 斜杠命令定义

```typescript
const SLASH_COMMANDS = [
    { command: '/read', description: '读取文件内容' },
    { command: '/write', description: '写入文件' },
    { command: '/run', description: '运行命令' },
    { command: '/test', description: '运行测试' },
    { command: '/clear', description: '清除会话历史' },
    { command: '/export', description: '导出对话为 Markdown' },
    { command: '/retry', description: '重新生成上次回复' },
];
```

---

## 核心组件

### ConversationPanel 主组件

```typescript
interface ConversationPanelProps {
    taskId: string;
    projectId: string;
    claudeSession?: { id: string };
    onSendMessage: (content: string, metadata?: MessageMetadata) => void;
}

function ConversationPanel({ taskId, projectId, claudeSession, onSendMessage }: ConversationPanelProps) {
    const [messages, setMessages] = useState<ConversationMessage[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [activeTab, setActiveTab] = useState<'conversation' | 'terminal'>('conversation');

    // 加载保存的会话历史
    useEffect(() => {
        loadConversation(taskId).then(setMessages);
    }, [taskId]);

    // 监听 WebSocket 流式消息
    useWebSocketSubscription(taskId, {
        onChunk: (messageId, content) => {
            setMessages(prev => appendChunk(prev, messageId, content));
        },
        onToolCall: (toolCall) => {
            setMessages(prev => appendToolCall(prev, toolCall));
        },
    });

    return (
        <div className="conversation-panel">
            <TabBar activeTab={activeTab} onChange={setActiveTab} />
            {activeTab === 'conversation' ? (
                <>
                    <MessageList messages={messages} isStreaming={isStreaming} />
                    <QuickActions taskId={taskId} />
                    <MessageInput onSend={onSendMessage} disabled={isStreaming} />
                </>
            ) : (
                <TerminalPanel taskId={taskId} projectId={projectId} />
            )}
        </div>
    );
}
```

### MessageBubble 组件

```typescript
function MessageBubble({ message, isLast }: MessageBubbleProps) {
    const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);
    const [isToolsExpanded, setIsToolsExpanded] = useState(false);

    if (message.role === 'user') {
        return (
            <div className="message-bubble user">
                <div className="message-content">{message.content}</div>
                <div className="message-meta">
                    {message.metadata?.command && <Tag>{message.metadata.command}</Tag>}
                    <time>{formatTime(message.timestamp)}</time>
                </div>
            </div>
        );
    }

    // Assistant message with thinking and tool calls
    return (
        <div className="message-bubble assistant">
            {message.thinking && (
                <CollapsibleSection
                    title="💭 思考过程"
                    isExpanded={isThinkingExpanded}
                    onToggle={setIsThinkingExpanded}
                >
                    <Markdown content={message.thinking} />
                </CollapsibleSection>
            )}

            <MarkdownRenderer content={message.content} />

            {message.toolCalls && message.toolCalls.length > 0 && (
                <CollapsibleSection
                    title={`🔧 使用工具 (${message.toolCalls.length})`}
                    isExpanded={isToolsExpanded}
                    onToggle={setIsToolsExpanded}
                >
                    {message.toolCalls.map(tool => (
                        <ToolCallCard key={tool.name + tool.input} tool={tool} />
                    ))}
                </CollapsibleSection>
            )}

            <MessageStatus status={message.status} />
        </div>
    );
}
```

### MessageInput 组件

```typescript
function MessageInput({ onSend, disabled }: MessageInputProps) {
    const [input, setInput] = useState('');
    const [showCommandMenu, setShowCommandMenu] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // 支持快捷键
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="message-input-container">
            <QuickActionButtons
                onRegenerate={() => onSend('/retry')}
                onStop={() => {/* 停止流式输出 */}}
                onClear={() => {/* 清除历史 */}}
            />

            <div className="input-wrapper">
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="输入消息... (按 Enter 发送, Shift+Enter 换行)"
                    disabled={disabled}
                    rows={1}
                    autoResize
                />
                <button className="send-button" onClick={handleSend}>
                    <SendIcon />
                </button>
            </div>

            {showCommandMenu && (
                <CommandMenu
                    input={input}
                    onSelect={(cmd) => {
                        setInput(cmd + ' ');
                        setShowCommandMenu(false);
                        textareaRef.current?.focus();
                    }}
                />
            )}
        </div>
    );
}
```

### QuickActions 快捷操作

```typescript
function QuickActions({ taskId }: QuickActionsProps) {
    const actions = [
        { icon: '🧪', label: '生成测试', handler: () => sendQuickMessage(taskId, '为当前代码生成单元测试') },
        { icon: '📝', label: '添加文档', handler: () => sendQuickMessage(taskId, '为当前代码添加注释和文档') },
        { icon: '🔍', label: '代码审查', handler: () => sendQuickMessage(taskId, '审查当前代码质量') },
        { icon: '🐛', label: '查找问题', handler: () => sendQuickMessage(taskId, '分析代码中可能存在的问题') },
        { icon: '♻️', label: '重构建议', handler: () => sendQuickMessage(taskId, '提供重构建议') },
    ];

    return (
        <div className="quick-actions">
            {actions.map(action => (
                <QuickActionButton
                    key={action.label}
                    icon={action.icon}
                    label={action.label}
                    onClick={action.handler}
                />
            ))}
        </div>
    );
}
```

---

## 后端集成

### AgentManager 扩展

```typescript
async sendUserMessage(
    taskId: string,
    projectPath: string,
    userMessage: string,
    callbacks?: AgentCallbacks,
    existingSessionId?: string
): Promise<void> {
    const resumeSessionId = existingSessionId || getSessionId(taskId);

    try {
        let messageId = uuid();
        let isThinking = false;

        for await (const message of query({
            prompt: userMessage,
            queryOptions,
            resumeSessionId,
        })) {
            // 处理思考过程
            if (message.type === 'thinking_start') {
                isThinking = true;
                callbacks?.onConversationThinkingStart?.((message as any).thinking || '');
            } else if (message.type === 'thinking_end') {
                isThinking = false;
                callbacks?.onConversationThinkingEnd?.();
            }

            // 处理工具调用
            else if (message.type === 'tool_use' && !isThinking) {
                callbacks?.onConversationToolCall?.({
                    name: (message as any).name,
                    input: (message as any).input,
                    status: 'pending',
                });
            }

            // 处理文本内容（流式）
            else if (message.type === 'content_block_start') {
                callbacks?.onConversationChunk?.(messageId, '');
            } else if (message.type === 'content_block_delta') {
                const delta = (message as any).delta?.text || '';
                callbacks?.onConversationChunk?.(messageId, delta);
            } else if (message.type === 'content_block_stop') {
                callbacks?.onConversationComplete?.(messageId);
                messageId = uuid();
            }
        }
    } catch (error) {
        callbacks?.onError?.(error as Error);
    }
}
```

### 会话存储服务

```typescript
class FileConversationStorage {
    private getConversationPath(taskId: string): string {
        return path.join(os.homedir(), '.antiwarden', 'tasks', taskId, 'conversation.json');
    }

    async load(taskId: string): Promise<Conversation | null> {
        const filePath = this.getConversationPath(taskId);
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(content);
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
        const conversation = await this.load(taskId) || {
            taskId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: []
        };
        conversation.messages.push(message);
        await this.save(taskId, conversation);
    }
}
```

---

## 文件结构

```
packages/
├── agent/
│   ├── src/
│   │   ├── services/
│   │   │   ├── agent-manager.ts          # 扩展：添加 sendUserMessage
│   │   │   ├── conversation-storage.ts   # 新增：会话存储
│   │   │   └── slash-commands.ts         # 新增：斜杠命令
│   │   ├── routes/
│   │   │   └── conversation.ts            # 新增：对话 API
│   │   └── websocket/
│   │       └── execution.ts              # 扩展：对话消息
│   └── src/types/
│       └── conversation.ts               # 新增：对话类型
│
├── shared/
│   └── src/types/
│       └── conversation.ts                # 共享对话类型
│
└── web/
    └── src/
        ├── components/
        │   ├── conversation/
        │   │   ├── ConversationPanel.tsx
        │   │   ├── MessageList.tsx
        │   │   ├── MessageBubble.tsx
        │   │   ├── MessageInput.tsx
        │   │   ├── QuickActions.tsx
        │   │   ├── CommandMenu.tsx
        │   │   ├── CollapsibleSection.tsx
        │   │   └── ToolCallCard.tsx
        │   └── markdown/
        │       ├── MarkdownRenderer.tsx
        │       └── SyntaxHighlighter.tsx
        ├── hooks/
        │   └── useConversation.ts
        └── api/
            └── conversation.ts
```

---

## 实施步骤

### 阶段 1：基础结构
1. 创建共享类型 (`packages/shared/src/types/conversation.ts`)
2. 创建会话存储服务 (`packages/agent/src/services/conversation-storage.ts`)
3. 添加后端 API 路由 (`packages/agent/src/routes/conversation.ts`)

### 阶段 2：前端组件
4. 创建 ConversationPanel 主组件
5. 创建 MessageList 和 MessageBubble 组件
6. 创建 MessageInput 组件
7. 添加标签页切换功能

### 阶段 3：Markdown 渲染
8. 集成 react-markdown
9. 添加代码语法高亮 (react-syntax-highlighter)
10. 实现流式文本渲染

### 阶段 4：工具调用展示
11. 创建 CollapsibleSection 组件
12. 创建 ToolCallCard 组件
13. 实现思考过程折叠展示

### 阶段 5：斜杠命令
14. 创建 CommandMenu 组件
15. 实现命令解析和执行
16. 添加命令提示和自动完成

### 阶段 6：快捷操作
17. 创建 QuickActions 组件
18. 实现预设快捷操作按钮
19. 连接到后端 API

### 阶段 7：后端集成
20. 扩展 AgentManager.sendUserMessage
21. 扩展 WebSocket 处理对话消息
22. 实现流式消息转发

### 阶段 8：持久化与优化
23. 实现会话自动保存
24. 添加会话导出功能
25. 性能优化

---

## 依赖包

```json
{
  "dependencies": {
    "react-markdown": "^9.0.0",
    "react-syntax-highlighter": "^15.5.0",
    "remark-gfm": "^4.0.0",
    "lucide-react": "^0.400.0"
  }
}
```
