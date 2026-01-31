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
