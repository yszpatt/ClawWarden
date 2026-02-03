import { useState, useEffect } from 'react';
import { MessageSquare, Terminal } from 'lucide-react';
import { useConversation } from '../../hooks/useConversation';
import { connectionManager } from '../../services/ConnectionManager';
import type { TerminalRef } from '../Terminal';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { QuickActions } from './QuickActions';
import { Terminal as TerminalComponent } from '../Terminal';

interface ConversationPanelProps {
    taskId: string;
    projectId: string;
    terminalRef?: React.RefObject<TerminalRef | null>;
    onTerminalData?: (data: string) => void;
    onTerminalResize?: (cols: number, rows: number) => void;
    /** Control the active tab from parent (optional) */
    activeTab?: 'conversation' | 'terminal';
    /** Callback when tab changes */
    onTabChange?: (tab: 'conversation' | 'terminal') => void;
}

export function ConversationPanel({
    taskId,
    projectId,
    terminalRef,
    onTerminalData,
    onTerminalResize,
    activeTab: controlledActiveTab,
    onTabChange,
}: ConversationPanelProps) {
    const [internalActiveTab, setInternalActiveTab] = useState<'conversation' | 'terminal'>('conversation');

    // Use controlled tab if provided, otherwise use internal state
    const activeTab = controlledActiveTab ?? internalActiveTab;

    const handleTabChange = (tab: 'conversation' | 'terminal') => {
        if (controlledActiveTab === undefined) {
            setInternalActiveTab(tab);
        }
        onTabChange?.(tab);
    };
    const { messages, isStreaming, sendMessage, clearMessages } = useConversation({ taskId, projectId });

    // Ensure WebSocket is connected when panel mounts
    useEffect(() => {
        connectionManager.connect();
    }, []);

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
                    onClick={() => handleTabChange('conversation')}
                    className={`tab-button ${activeTab === 'conversation' ? 'active' : ''}`}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.75rem 1.5rem',
                        fontSize: '0.875rem',
                        fontWeight: activeTab === 'conversation' ? '600' : '400',
                        border: 'none',
                        color: activeTab === 'conversation' ? 'var(--text-primary)' : 'var(--text-secondary)',
                        background: activeTab === 'conversation' ? 'var(--bg-card)' : 'transparent',
                        borderBottom: activeTab === 'conversation' ? '2px solid var(--accent)' : '2px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                    }}
                >
                    <MessageSquare size={16} />
                    对话
                </button>
                <button
                    onClick={() => handleTabChange('terminal')}
                    className={`tab-button ${activeTab === 'terminal' ? 'active' : ''}`}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.75rem 1.5rem',
                        fontSize: '0.875rem',
                        fontWeight: activeTab === 'terminal' ? '600' : '400',
                        border: 'none',
                        color: activeTab === 'terminal' ? 'var(--text-primary)' : 'var(--text-secondary)',
                        background: activeTab === 'terminal' ? 'var(--bg-card)' : 'transparent',
                        borderBottom: activeTab === 'terminal' ? '2px solid var(--accent)' : '2px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
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
                    <TerminalComponent
                        ref={terminalRef}
                        onData={onTerminalData}
                        onResize={onTerminalResize}
                    />
                </div>
            )}
        </div>
    );
}
