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
            padding: '1rem 1.5rem',
        }}>
            {/* Action buttons (Regenerate, Clear/Stop) */}
            <div style={{
                display: 'flex',
                gap: '0.5rem',
                marginBottom: '1rem',
            }}>
                <button
                    onClick={onRegenerate}
                    disabled={isStreaming}
                    className="btn-unified secondary"
                    style={{ fontSize: '0.75rem', padding: '0.375rem 0.75rem' }}
                    title="重新生成"
                >
                    <RotateCcw size={14} />
                    重新生成
                </button>
                {isStreaming ? (
                    <button
                        onClick={onStop}
                        className="btn-unified danger"
                        style={{ fontSize: '0.75rem', padding: '0.375rem 0.75rem' }}
                        title="停止"
                    >
                        <Square size={14} />
                        停止
                    </button>
                ) : (
                    <button
                        onClick={onClear}
                        className="btn-unified ghost"
                        style={{ fontSize: '0.75rem', padding: '0.375rem 0.75rem' }}
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
                gap: '0.75rem',
                alignItems: 'flex-end',
            }}>
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="输入消息... (Enter 发送)"
                    disabled={disabled}
                    style={{
                        flex: 1,
                        minHeight: '44px',
                        maxHeight: '120px',
                        padding: '0.75rem 1rem',
                        border: '1px solid var(--border-color)',
                        borderRadius: '12px',
                        background: 'var(--bg-card)',
                        color: 'var(--text-primary)',
                        fontSize: '0.875rem',
                        resize: 'none',
                        fontFamily: 'inherit',
                        lineHeight: '1.5',
                        outline: 'none',
                    }}
                />
                <button
                    onClick={handleSend}
                    disabled={disabled || !input.trim()}
                    className="btn-unified primary"
                    style={{
                        width: '44px',
                        height: '44px',
                        padding: 0,
                        borderRadius: '12px',
                    }}
                    title="发送 (Enter)"
                >
                    <Send size={18} />
                </button>
            </div>
        </div>
    );
}
