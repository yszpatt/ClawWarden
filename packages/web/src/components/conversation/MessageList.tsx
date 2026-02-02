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
                groupedMessages.map((item, index) => {
                    if (typeof item === 'object' && 'type' in item && item.type === 'tool_group') {
                        const uniqueId = `tool-${item.groupId}-${index}`;
                        const isExpanded = expandedIds.has(uniqueId);

                        return (
                            <div key={uniqueId} style={{ marginBottom: '0.5rem' }}>
                                <div
                                    onClick={() => toggleGroup(uniqueId)}
                                    style={{
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '8px',
                                        overflow: 'hidden',
                                    }}
                                >
                                    <div style={{
                                        padding: '0.5rem 1rem',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        fontSize: '0.875rem',
                                        color: 'var(--text-secondary)',
                                    }}>
                                        <span style={{ fontSize: '0.75rem' }}>
                                            {isExpanded ? '▼' : '▶'}
                                        </span>
                                        <Wrench size={14} style={{ color: 'var(--accent)' }} />
                                        <span>工具调用 ({item.tools.length})</span>
                                    </div>
                                    {isExpanded && (
                                        <div style={{
                                            padding: '0.5rem 1rem',
                                            borderTop: '1px solid var(--border-color)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.5rem',
                                        }}>
                                            {item.tools.map((toolMsg, i) => {
                                                const tool = toolMsg.toolCall;
                                                if (!tool) return null;
                                                return (
                                                    <div key={`${toolMsg.id}-${i}`} style={{
                                                        background: 'var(--bg-card)',
                                                        border: '1px solid var(--border-color)',
                                                        borderRadius: '4px',
                                                        padding: '0.5rem',
                                                    }}>
                                                        <div style={{
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                        }}>
                                                            <div style={{
                                                                fontWeight: 500,
                                                                color: 'var(--accent)',
                                                            }}>
                                                                {tool.name}
                                                            </div>
                                                            {tool.status === 'pending' && (
                                                                <span style={{ fontSize: '0.75rem', color: 'orange' }}>
                                                                    ⏳ 执行中...
                                                                </span>
                                                            )}
                                                            {tool.status === 'success' && (
                                                                <span style={{ fontSize: '0.75rem', color: 'green' }}>
                                                                    ✓ 完成
                                                                </span>
                                                            )}
                                                            {tool.status === 'error' && (
                                                                <span style={{ fontSize: '0.75rem', color: 'red' }}>
                                                                    ✗ 失败
                                                                </span>
                                                            )}
                                                        </div>
                                                        {(tool.input as any) && (
                                                            <pre style={{
                                                                fontSize: '0.75rem',
                                                                overflow: 'auto',
                                                                maxHeight: '100px',
                                                                marginTop: '0.25rem',
                                                            }}>
                                                                {typeof tool.input === 'string' ? tool.input : JSON.stringify(tool.input, null, 2) as string}
                                                            </pre>
                                                        )}
                                                        {(tool.output as any) && (
                                                            <pre style={{
                                                                fontSize: '0.75rem',
                                                                overflow: 'auto',
                                                                maxHeight: '150px',
                                                                marginTop: '0.25rem',
                                                                whiteSpace: 'pre-wrap',
                                                                wordBreak: 'break-word',
                                                            }}>
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
