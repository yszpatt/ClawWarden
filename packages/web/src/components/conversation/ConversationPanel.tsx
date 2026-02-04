import { useState, useEffect, memo } from 'react';
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

const ConversationPanel = memo(function ConversationPanel({
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
        <div className="conversation-panel">
            {/* Tab bar */}
            <div className="chat-tab-bar">
                <button
                    onClick={() => handleTabChange('conversation')}
                    className={`chat-tab-btn ${activeTab === 'conversation' ? 'active' : ''}`}
                >
                    <MessageSquare size={16} />
                    对话
                </button>
                <button
                    onClick={() => handleTabChange('terminal')}
                    className={`chat-tab-btn ${activeTab === 'terminal' ? 'active' : ''}`}
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
                <div style={{ flex: 1, padding: '0.5rem', overflow: 'hidden' }}>
                    <TerminalComponent
                        ref={terminalRef}
                        onData={onTerminalData}
                        onResize={onTerminalResize}
                    />
                </div>
            )}
        </div>
    );
});

export { ConversationPanel };
