import { useState, useEffect, memo } from 'react';
import { MessageSquare, FileText, Edit2, Save, X, Activity } from 'lucide-react';
import { useConversation } from '../../hooks/useConversation';
import { connectionManager } from '../../services/ConnectionManager';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { QuickActions } from './QuickActions';
import { MarkdownRenderer } from '../markdown/MarkdownRenderer';
import { StructuredOutputViewer } from '../StructuredOutput';
import type { StructuredOutput } from '@clawwarden/shared';

interface ConversationPanelProps {
    taskId: string;
    projectId: string;
    /** Control the active tab from parent (optional) */
    activeTab?: 'conversation' | 'plan' | 'summary';
    /** Callback when tab changes */
    onTabChange?: (tab: 'conversation' | 'plan' | 'summary') => void;

    /** Structured output to display in Summary tab */
    structuredOutput?: StructuredOutput | StructuredOutput[] | null;

    // Design Props
    designContent?: string | null;
    onSaveDesign?: (content: string) => Promise<void>;
    isEditingDesign?: boolean;
    setIsEditingDesign?: (v: boolean) => void;
    editedDesignContent?: string;
    setEditedDesignContent?: (v: string) => void;
}

const ConversationPanel = memo(function ConversationPanel({
    taskId,
    projectId,
    activeTab: controlledActiveTab,
    onTabChange,

    designContent,
    onSaveDesign,
    isEditingDesign,
    setIsEditingDesign,
    editedDesignContent,
    setEditedDesignContent,
    structuredOutput,
}: ConversationPanelProps) {
    const [internalActiveTab, setInternalActiveTab] = useState<'conversation' | 'plan' | 'summary'>('conversation');

    // Use controlled tab if provided, otherwise use internal state
    const activeTab = controlledActiveTab ?? internalActiveTab;

    const handleTabChange = (tab: 'conversation' | 'plan' | 'summary') => {
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

    const handleDesignSave = async () => {
        if (onSaveDesign && editedDesignContent) {
            await onSaveDesign(editedDesignContent);
        }
    };

    return (
        <div className="conversation-panel">
            {/* Tab bar (Panel Header) */}
            <div className="chat-tab-bar">
                <button
                    onClick={() => handleTabChange('conversation')}
                    className={`chat-tab-btn ${activeTab === 'conversation' ? 'active' : ''}`}
                >
                    <MessageSquare size={16} />
                    对话
                </button>
                {/* Only show plan tab if content exists or we are passed handlers to edit it */}
                {(designContent || setIsEditingDesign) && (
                    <button
                        onClick={() => handleTabChange('plan')}
                        className={`chat-tab-btn ${activeTab === 'plan' ? 'active' : ''}`}
                    >
                        <FileText size={16} />
                        计划方案
                    </button>
                )}
                {/* Summary Tab (always show if output exists or generic summary) */}
                <button
                    onClick={() => handleTabChange('summary')}
                    className={`chat-tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
                >
                    <Activity size={16} />
                    总结
                </button>
            </div>

            {/* Content & Footer Area */}
            {activeTab === 'conversation' ? (
                <>
                    <div className="message-list-container">
                        <MessageList messages={messages} isStreaming={isStreaming} />
                    </div>
                    <QuickActions onAction={handleQuickAction} disabled={isStreaming} />
                    <MessageInput
                        onSend={handleSend}
                        onClear={clearMessages}
                        disabled={isStreaming}
                        isStreaming={isStreaming}
                    />
                </>
            ) : activeTab === 'plan' ? (
                <div className="design-panel">
                    {/* Plan Tab Content Area (Scrollable) */}
                    <div className="design-content-area">
                        {isEditingDesign && setEditedDesignContent ? (
                            <textarea
                                className="design-textarea"
                                box-sizing="border-box"
                                value={editedDesignContent}
                                onChange={e => setEditedDesignContent(e.target.value)}
                                placeholder="在此输入计划方案..."
                                autoFocus
                            />
                        ) : (
                            <div className="markdown-content">
                                <MarkdownRenderer content={designContent || '*暂无计划方案*'} />
                            </div>
                        )}
                    </div>

                    {/* Bottom Toolbar to match MessageInput position */}
                    <div className="design-toolbar">
                        {isEditingDesign ? (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    className="btn-unified primary"
                                    onClick={handleDesignSave}
                                >
                                    <Save size={14} />
                                    保存
                                </button>
                                <button
                                    className="btn-unified secondary"
                                    onClick={() => {
                                        setIsEditingDesign?.(false);
                                        setEditedDesignContent?.(designContent || '');
                                    }}
                                >
                                    <X size={14} />
                                    取消
                                </button>
                            </div>
                        ) : (
                            <button
                                className="btn-unified secondary"
                                onClick={() => setIsEditingDesign?.(true)}
                            >
                                <Edit2 size={14} />
                                编辑
                            </button>
                        )}
                    </div>
                </div>
            ) : activeTab === 'summary' ? (
                <div className="unified-panel" style={{ border: 'none' }}>
                    <div className="panel-content" style={{ padding: '2rem' }}>
                        {structuredOutput ? (
                            <StructuredOutputViewer outputs={structuredOutput} />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: '1rem' }}>
                                <Activity size={32} opacity={0.3} />
                                <span>暂无总结信息。请在执行完成后查看。</span>
                            </div>
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    );
});

export { ConversationPanel };
