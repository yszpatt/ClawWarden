import { useState } from 'react';
import { AlertCircle, Info, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import type { ConversationMessage, AssistantMessage } from '@clawwarden/shared';
import { MarkdownRenderer } from '../markdown/MarkdownRenderer';

interface MessageBubbleProps {
    message: ConversationMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
    if (message.role === 'user') {
        return (
            <div className="message-bubble user" style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginBottom: '0.5rem',
            }}>
                <div style={{
                    maxWidth: '80%',
                    background: 'var(--accent)',
                    color: 'white',
                    padding: '0.75rem 1rem',
                    borderRadius: '12px 12px 0 12px',
                }}>
                    <div style={{ fontSize: '0.9rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
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
                marginBottom: '0.5rem',
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.875rem',
                    color: 'var(--text-secondary)',
                    padding: '0.5rem 1rem',
                    background: 'var(--bg-secondary)',
                    borderRadius: '8px',
                }}>
                    <Icon size={16} />
                    {message.content}
                </div>
            </div>
        );
    }

    // Assistant message - could be text or thinking (tool calls are grouped in MessageList)
    const msg = message as AssistantMessage;

    // Text content
    if (msg.content) {
        return (
            <div className="message-bubble assistant-text" style={{
                display: 'flex',
                justifyContent: 'flex-start',
                marginBottom: '0.5rem',
            }}>
                <div style={{ fontSize: '0.9rem', lineHeight: '1.6', color: 'var(--text-primary)' }}>
                    <MarkdownRenderer content={msg.content} />
                </div>
            </div>
        );
    }

    // Thinking content
    if (msg.thinking) {
        return <ThinkingBlock content={msg.thinking} />;
    }

    // Tool calls are handled in MessageList grouping, return null here
    return null;
}

/**
 * Thinking block - collapsible
 */
function ThinkingBlock({ content }: { content: string }) {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div style={{ marginBottom: '0.5rem' }}>
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.5rem 0.75rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    color: 'var(--text-secondary)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span>💭 思考过程</span>
            </button>
            {isExpanded && (
                <div style={{
                    marginTop: '0.5rem',
                    padding: '0.75rem',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    color: 'var(--text-secondary)',
                }}>
                    <MarkdownRenderer content={content} />
                </div>
            )}
        </div>
    );
}
