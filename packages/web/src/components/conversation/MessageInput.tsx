import { useState, useRef, useEffect } from 'react';
import { Send, Square } from 'lucide-react';

interface MessageInputProps {
    onSend: (content: string) => void;
    onStop?: () => void;
    disabled?: boolean;
    isStreaming?: boolean;
}

export function MessageInput({
    onSend,
    onStop,
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
        <div className="message-input-container">
            {/* Input area */}
            <div className="input-box-wrapper">
                <textarea
                    className="chat-textarea"
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="输入消息... (Enter 发送)"
                    disabled={disabled}
                    rows={1}
                />
                <div className="input-actions-right">
                    {isStreaming ? (
                        <button
                            onClick={onStop}
                            className="btn-icon-primary danger pulse"
                            title="停止"
                        >
                            <Square size={16} fill="currentColor" />
                        </button>
                    ) : (
                        <button
                            onClick={handleSend}
                            disabled={disabled || !input.trim()}
                            className="btn-icon-primary"
                            title="发送 (Enter)"
                        >
                            <Send size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* Bottom Actions Row */}
            <div className="input-bottom-actions">
                <div className="left-actions">
                </div>
                <div className="right-hint">
                    Enter 发送
                </div>
            </div>
        </div>
    );
}
