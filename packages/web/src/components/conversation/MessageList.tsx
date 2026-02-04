import { useEffect, useRef, useState } from 'react';
import { Wrench } from 'lucide-react';
import type { ConversationMessage, AssistantMessage } from '@clawwarden/shared';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
    messages: ConversationMessage[];
    isStreaming?: boolean;
}

type MessageGroup = ConversationMessage | { type: 'tool_group'; groupId: string; tools: AssistantMessage[] };

export function MessageList({ messages, isStreaming }: MessageListProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    // Scroll to bottom when messages change or when component first mounts
    useEffect(() => {
        // Use immediate scroll on mount, smooth scroll during streaming
        const scrollBehavior = messages.length > 0 ? 'smooth' : 'auto';
        messagesEndRef.current?.scrollIntoView({ behavior: scrollBehavior as ScrollBehavior });
    }, [messages, isStreaming]);

    // Also scroll on mount (for initial load)
    useEffect(() => {
        // Small delay to ensure DOM is rendered
        const timeoutId = setTimeout(() => {
            if (messages.length > 0) {
                messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
            }
        }, 50);
        return () => clearTimeout(timeoutId);
    }, []); // Run once on mount

    // Group consecutive tool calls with the same groupId
    const groupedMessages = messages.reduce<MessageGroup[]>((acc, message) => {
        if (message.role === 'assistant') {
            const assistantMsg = message as AssistantMessage;
            if (assistantMsg.toolCall && assistantMsg.groupId) {
                const lastGroup = acc[acc.length - 1];
                if (lastGroup && typeof lastGroup === 'object' && 'type' in lastGroup && lastGroup.type === 'tool_group' && lastGroup.groupId === assistantMsg.groupId) {
                    // Add to existing group
                    lastGroup.tools.push(assistantMsg);
                } else {
                    // Create new group
                    acc.push({
                        type: 'tool_group',
                        groupId: assistantMsg.groupId,
                        tools: [assistantMsg],
                    });
                }
                return acc;
            }
        }
        acc.push(message);
        return acc;
    }, []);

    const toggleGroup = (uniqueId: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(uniqueId)) {
                next.delete(uniqueId);
            } else {
                next.add(uniqueId);
            }
            return next;
        });
    };

    return (
        <div className="message-list-container">
            {messages.length === 0 ? (
                <div className="chat-empty-state">
                    <p>👋 开始对话</p>
                    <p style={{ fontSize: '0.875rem' }}>输入消息与 Claude 进行交互</p>
                </div>
            ) : (
                groupedMessages.map((item, index) => {
                    if (typeof item === 'object' && 'type' in item && item.type === 'tool_group') {
                        const uniqueId = `tool-${item.groupId}-${index}`;
                        const isExpanded = expandedIds.has(uniqueId);

                        return (
                            <div key={uniqueId} className="tool-group-container">
                                <div className="tool-group-header">
                                    <div
                                        className="tool-group-title"
                                        onClick={() => toggleGroup(uniqueId)}
                                    >
                                        <span style={{ fontSize: '0.75rem' }}>
                                            {isExpanded ? '▼' : '▶'}
                                        </span>
                                        <Wrench size={14} style={{ color: 'var(--accent)' }} />
                                        <span>工具调用 ({item.tools.length})</span>
                                    </div>
                                    {isExpanded && (
                                        <div className="tool-group-content">
                                            {item.tools.map((toolMsg, i) => {
                                                const tool = toolMsg.toolCall;
                                                if (!tool) return null;
                                                return (
                                                    <div key={`${toolMsg.id}-${i}`} className="tool-item">
                                                        <div className="tool-item-header">
                                                            <div className="tool-name">
                                                                {tool.name}
                                                            </div>
                                                            {tool.status === 'pending' && (
                                                                <span className="tool-status-pending">
                                                                    ⏳ 执行中...
                                                                </span>
                                                            )}
                                                            {tool.status === 'success' && (
                                                                <span className="tool-status-success">
                                                                    ✓ 完成
                                                                </span>
                                                            )}
                                                            {tool.status === 'error' && (
                                                                <span className="tool-status-error">
                                                                    ✗ 失败
                                                                </span>
                                                            )}
                                                        </div>
                                                        {(tool.input as any) && (
                                                            <pre className="tool-io-block">
                                                                {typeof tool.input === 'string' ? tool.input : JSON.stringify(tool.input, null, 2) as string}
                                                            </pre>
                                                        )}
                                                        {(tool.output as any) && (
                                                            <pre className="tool-io-block">
                                                                {tool.output}
                                                            </pre>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    }
                    return <MessageBubble key={item.id} message={item} />;
                })
            )}
            {/* Scroll anchor - always rendered to enable scroll to bottom */}
            <div ref={messagesEndRef} style={{ height: '1px' }} />
        </div>
    );
}
