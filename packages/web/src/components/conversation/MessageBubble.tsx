import { useState } from 'react';
import { AlertCircle, Info, AlertTriangle, CheckCircle, ChevronDown, ChevronRight } from 'lucide-react';
import type { ConversationMessage, AssistantMessage } from '@clawwarden/shared';
import { MarkdownRenderer } from '../markdown/MarkdownRenderer';

interface MessageBubbleProps {
    message: ConversationMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
    if (message.role === 'user') {
        return (
            <div className="message-row user">
                <div className="chat-bubble user">
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
            success: CheckCircle,
        };
        const Icon = icons[message.type || 'info'];

        return (
            <div className="message-row system">
                <div className="chat-bubble system">
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
            <div className="message-row assistant">
                <div className="chat-bubble assistant">
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
                className="thinking-btn"
            >
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span>💭 思考过程</span>
            </button>
            {isExpanded && (
                <div className="thinking-content">
                    <MarkdownRenderer content={content} />
                </div>
            )}
        </div>
    );
}
