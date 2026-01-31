import { useState } from 'react';
import { Bot, AlertCircle, Info, AlertTriangle } from 'lucide-react';
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
