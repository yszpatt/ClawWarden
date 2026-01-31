import { useState, useEffect, useRef } from 'react';
import type { Task, StructuredOutput } from '@antiwarden/shared';
import { useTerminalConnection, type TerminalRef } from './Terminal';
import { ConversationPanel } from './conversation/ConversationPanel';
import { StructuredOutputViewer } from './StructuredOutput';
import { useAppStore } from '../stores/appStore';
import { fetchDesign, updateDesign, mergeWorktree, fetchProjectData, fetchTask } from '../api/projects';
import { connectionManager } from '../services/ConnectionManager';

interface TaskDetailProps {
    task: Task;
    projectId: string;
    onClose?: () => void;
    onStatusChange?: (status: Task['status']) => void;
}

export function TaskDetail({ task, projectId, onClose, onStatusChange }: TaskDetailProps) {
    const isRunning = task.status === 'running';
    const [isRunningState, setIsRunningState] = useState(isRunning);
    // Ref to track current task status for auto-attach callback
    const taskStatusRef = useRef(task.status);
    const [isGeneratingDesign, setIsGeneratingDesign] = useState(false);
    const [designContent, setDesignContent] = useState<string | null>(null);
    const [isEditingDesign, setIsEditingDesign] = useState(false);
    const [editedDesignContent, setEditedDesignContent] = useState('');
    const [isMerging, setIsMerging] = useState(false);
    const [structuredOutput, setStructuredOutput] = useState<StructuredOutput | null>(task.structuredOutput || null);
    const [activeTab, setActiveTab] = useState<'conversation' | 'terminal'>('conversation');

    // Store the latest fetched task data (including claudeSession which may be updated by backend)
    const [fetchedTask, setFetchedTask] = useState<Task | null>(null);

    // Create a ref object for the terminal
    const terminalRef = useRef<TerminalRef>(null);

    const {
        connect,
        execute,
        attach,
        sendInput,
        stop,
        disconnect,
        setTerminalRef,
        handleResize
    } = useTerminalConnection(projectId, task.id, {
        onDesignComplete: (content, _designPath) => {
            console.log('[TaskDetail] Design complete, setting content');
            setDesignContent(content);
            setEditedDesignContent(content);
            setIsGeneratingDesign(false);
        },
        onStatusChange: (status) => {
            onStatusChange?.(status as Task['status']);
        },
        onStructuredOutput: (output) => {
            console.log('[TaskDetail] Structured output received:', output);
            setStructuredOutput(output as StructuredOutput);
        }
    });

    // Sync terminalRef with setTerminalRef
    useEffect(() => {
        if (terminalRef.current) {
            setTerminalRef(terminalRef.current);
        }
    }, [terminalRef.current, setTerminalRef]);

    // Sync running state
    useEffect(() => {
        setIsRunningState(task.status === 'running');
        // Update ref to always have current status
        taskStatusRef.current = task.status;
    }, [task.status]);

    // Sync structured output from task
    useEffect(() => {
        setStructuredOutput(task.structuredOutput || null);
    }, [task.structuredOutput]);

    // Fetch fresh task data on mount to get latest structured output and session info
    useEffect(() => {
        fetchTask(projectId, task.id)
            .then(result => {
                console.log('[TaskDetail] Fetched fresh task data:', result.task);
                // Store the complete fetched task (including claudeSession, status, etc.)
                if (result.task) {
                    setFetchedTask(result.task);
                    if (result.task.structuredOutput) {
                        setStructuredOutput(result.task.structuredOutput);
                    }
                }
            })
            .catch(err => {
                console.log('[TaskDetail] Failed to fetch task data:', err);
            });
    }, [projectId, task.id]);

    // Load design content if exists
    useEffect(() => {
        const taskToUse = fetchedTask || task;
        if (taskToUse.designPath) {
            console.log('[TaskDetail] Loading design content for task:', task.id, 'designPath:', taskToUse.designPath);
            fetchDesign(projectId, task.id)
                .then(result => {
                    console.log('[TaskDetail] Design content loaded, length:', result.content?.length || 0);
                    setDesignContent(result.content);
                    setEditedDesignContent(result.content);
                })
                .catch(err => {
                    console.log('[TaskDetail] Failed to load design content:', err);
                    setDesignContent(null);
                });
        } else {
            console.log('[TaskDetail] No designPath, skipping design content load');
            setDesignContent(null);
        }
    }, [task.designPath, projectId, task.id, fetchedTask?.designPath]);

    // Connect terminal on mount
    useEffect(() => {
        return () => {
            disconnect();
        };
    }, []);

    // Handle conversation.design_complete message
    useEffect(() => {
        const handleDesignComplete = (message: any) => {
            if (message.type === 'conversation.design_complete' && message.taskId === task.id) {
                console.log('[TaskDetail] Design complete received, designPath:', message.designPath);
                setIsGeneratingDesign(false);
                onStatusChange?.('pending-dev');

                // Reload task data to get updated design path
                fetchTask(projectId, task.id)
                    .then(result => {
                        if (result.task?.designPath) {
                            return fetchDesign(projectId, task.id);
                        }
                    })
                    .then(result => {
                        if (result?.content) {
                            setDesignContent(result.content);
                            setEditedDesignContent(result.content);
                        }
                    })
                    .catch(err => {
                        console.log('[TaskDetail] Failed to load design after completion:', err);
                    });
            }
        };

        connectionManager.subscribe(task.id, handleDesignComplete);
        return () => {
            // Note: ConnectionManager doesn't support direct unsubscribe
            // but the handler will be filtered by taskId check
        };
    }, [task.id, projectId, onStatusChange]);

    // Auto-attach to existing session when task is running OR has a historical session
    useEffect(() => {
        let cancelOnReady: (() => void) | null = null;

        // Use fetchedTask if available (has latest data from backend), otherwise use prop task
        const taskToCheck = fetchedTask || task;
        const shouldAttach = taskToCheck.status === 'running' || taskToCheck.claudeSession;

        console.log('[TaskDetail] Auto-attach effect:', {
            taskId: task.id,
            propStatus: task.status,
            fetchedStatus: fetchedTask?.status,
            propHasSession: !!task.claudeSession,
            fetchedHasSession: !!fetchedTask?.claudeSession,
            sessionId: taskToCheck.claudeSession?.id,
            shouldAttach
        });

        if (shouldAttach) {
            console.log('[TaskDetail] Calling connect()...');
            cancelOnReady = connect(() => {
                console.log('[TaskDetail] onReady callback fired, calling attach()');
                attach();
            });
            console.log('[TaskDetail] connect() returned, cancelOnReady:', !!cancelOnReady);
        } else {
            console.log('[TaskDetail] Skipping attach, shouldAttach:', shouldAttach);
        }

        return () => {
            if (cancelOnReady) {
                console.log('[TaskDetail] Cleanup: canceling onReady callback');
                cancelOnReady();
            }
        };
    }, [task.id, task.status, task.claudeSession?.id, fetchedTask?.status, fetchedTask?.claudeSession?.id]);

    const handleGenerateDesign = async () => {
        if (isGeneratingDesign) return;

        setIsGeneratingDesign(true);
        setActiveTab('conversation');  // Switch to conversation tab

        // Ensure WebSocket is connected
        connectionManager.connect();

        // Send conversation.design_start message
        connectionManager.send({
            type: 'conversation.design_start',
            taskId: task.id,
            projectId,
        });

        console.log('[TaskDetail] Sent conversation.design_start message');
    };

    const handleSaveDesign = async () => {
        try {
            await updateDesign(projectId, task.id, editedDesignContent);
            setDesignContent(editedDesignContent);
            setIsEditingDesign(false);
        } catch (error: any) {
            alert(`保存设计方案失败: ${error.message}`);
        }
    };

    const handleExecute = () => {
        if (!task.prompt && !task.designPath) {
            alert('任务没有 Prompt 或设计方案，无法执行');
            return;
        }

        // Connect and execute when ready
        connect(() => {
            execute();
            setIsRunningState(true);
            onStatusChange?.('running');
        });
    };

    const handleStop = () => {
        stop();
        setIsRunningState(false);
        onStatusChange?.('idle');
    };

    const { updateTask, removeTask, setProjectData, currentProject } = useAppStore();

    const handleMerge = async () => {
        if (isMerging || !task.worktree) return;

        setIsMerging(true);
        try {
            const result = await mergeWorktree(projectId, task.id);
            if (result.success) {
                // Refresh project data to update task state
                if (currentProject) {
                    const { data } = await fetchProjectData(currentProject.id);
                    setProjectData(data);
                }
            } else {
                alert(`合并失败: ${result.message}`);
            }
        } catch (error: any) {
            alert(`合并失败: ${error.message}`);
        } finally {
            setIsMerging(false);
        }
    };
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({
        title: task.title,
        description: task.description,
        prompt: task.prompt || ''
    });

    // Sync form with task when not editing
    useEffect(() => {
        if (!isEditing) {
            setEditForm({
                title: task.title,
                description: task.description,
                prompt: task.prompt || ''
            });
        }
    }, [task, isEditing]);

    const handleSave = async () => {
        try {
            await updateTask(task.id, {
                title: editForm.title,
                description: editForm.description,
                prompt: editForm.prompt
            });
            setIsEditing(false);
        } catch (error) {
            alert('Failed to update task');
        }
    };

    const handleDelete = async () => {
        if (confirm('Are you sure you want to delete this task?')) {
            try {
                await removeTask(task.id);
                // Sidebar close is handled by store but let's be safe
                if (onClose) onClose();
            } catch (error) {
                alert('Failed to delete task');
            }
        }
    };

    // 根据泳道显示不同的操作按钮
    const renderActionButtons = () => {
        const laneId = task.laneId;

        if (laneId === 'design') {
            // 设计泳道：显示"开始设计"或设计状态
            if (task.status === 'idle') {
                return (
                    <button
                        className="primary-btn"
                        onClick={handleGenerateDesign}
                        disabled={isGeneratingDesign}
                    >
                        {isGeneratingDesign ? '⏳ 正在生成设计方案...' : '🎨 开始设计'}
                    </button>
                );
            } else if (task.status === 'running') {
                return (
                    <button className="primary-btn" disabled>
                        ⏳ 正在生成设计方案...
                    </button>
                );
            } else if (task.status === 'pending-dev') {
                return (
                    <span className="status-badge success">✓ 设计完成，可移至开发泳道</span>
                );
            }
        } else if (laneId === 'develop' || laneId === 'test') {
            // 开发/测试泳道：显示执行按钮
            if (!isRunningState) {
                return (
                    <button
                        className="primary-btn"
                        onClick={handleExecute}
                        disabled={!task.prompt && !task.designPath}
                    >
                        ▶ 开始执行
                    </button>
                );
            } else {
                return (
                    <button
                        className="primary-btn"
                        onClick={handleStop}
                        style={{ background: '#EF4444' }}
                    >
                        ■ 停止
                    </button>
                );
            }
        } else if (laneId === 'pending-merge') {
            return (
                <button
                    className="primary-btn"
                    style={{ background: '#F59E0B' }}
                    onClick={handleMerge}
                    disabled={isMerging || !task.worktree}
                >
                    {isMerging ? '⏳ 正在合并...' : '🔀 合并到主分支'}
                </button>
            );
        } else if (laneId === 'archived') {
            return (
                <span className="status-badge">📁 已归档</span>
            );
        }

        return null;
    };

    // 渲染设计方案预览
    const renderDesignPreview = () => {
        const taskToUse = fetchedTask || task;
        console.log('[renderDesignPreview] task.designPath:', task.designPath, 'fetchedTask.designPath:', fetchedTask?.designPath, 'designContent:', !!designContent);
        if (!taskToUse.designPath && !designContent) return null;

        return (
            <div className="form-group" style={{ marginTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label">设计方案</label>
                    {!isEditingDesign ? (
                        <button
                            className="secondary-btn"
                            onClick={() => setIsEditingDesign(true)}
                            style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                        >
                            编辑
                        </button>
                    ) : (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                className="primary-btn"
                                onClick={handleSaveDesign}
                                style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                            >
                                保存
                            </button>
                            <button
                                className="secondary-btn"
                                onClick={() => {
                                    setIsEditingDesign(false);
                                    setEditedDesignContent(designContent || '');
                                }}
                                style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                            >
                                取消
                            </button>
                        </div>
                    )}
                </div>
                {isEditingDesign ? (
                    <textarea
                        className="form-textarea"
                        value={editedDesignContent}
                        onChange={e => setEditedDesignContent(e.target.value)}
                        style={{
                            minHeight: '300px',
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            whiteSpace: 'pre-wrap'
                        }}
                    />
                ) : (
                    <div
                        className="design-preview"
                        style={{
                            background: 'var(--bg-card)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            padding: '1rem',
                            maxHeight: '400px',
                            overflow: 'auto',
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            whiteSpace: 'pre-wrap',
                            lineHeight: '1.5'
                        }}
                    >
                        {designContent || '加载中...'}
                    </div>
                )}
            </div>
        );
    };

    const showTerminal = task.laneId === 'design' || task.laneId === 'develop' || task.laneId === 'test';

    return (
        <div className="task-detail" style={{
            display: 'flex',
            height: '100%',
            gap: '1.5rem',
            overflow: 'hidden' // Container shouldn't scroll, inner columns should
        }}>
            {/* Left Column: Conversation Panel (includes Terminal tab) */}
            {showTerminal && (
                <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0,
                    height: '100%'
                }}>
                    <ConversationPanel
                        taskId={task.id}
                        projectId={projectId}
                        terminalRef={terminalRef}
                        onTerminalData={(data) => sendInput(data)}
                        onTerminalResize={(cols, rows) => handleResize(cols, rows)}
                        activeTab={activeTab}
                        onTabChange={setActiveTab}
                    />
                </div>
            )}

            {/* Right Column: Task Info & Actions */}
            <div style={{
                width: showTerminal ? '400px' : '100%',
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                overflowY: 'auto',
                paddingRight: '0.5rem' // Space for scrollbar
            }}>
                <div className="task-detail-header" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginBottom: '1rem' }}>
                    {!isEditing ? (
                        <>
                            <button className="secondary-btn" onClick={() => setIsEditing(true)}>编辑</button>
                            <button className="danger-btn" onClick={handleDelete}>删除</button>
                        </>
                    ) : (
                        <>
                            <button className="primary-btn" onClick={handleSave}>保存</button>
                            <button className="secondary-btn" onClick={() => setIsEditing(false)}>取消</button>
                        </>
                    )}
                </div>

                <div className="form-group">
                    <label className="form-label">标题</label>
                    {isEditing ? (
                        <input
                            type="text"
                            className="form-input"
                            value={editForm.title}
                            onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                        />
                    ) : (
                        <input
                            type="text"
                            className="form-input"
                            value={task.title}
                            readOnly
                        />
                    )}
                </div>

                <div className="form-group">
                    <label className="form-label">描述</label>
                    {isEditing ? (
                        <textarea
                            className="form-textarea"
                            value={editForm.description}
                            onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                        />
                    ) : (
                        <textarea
                            className="form-textarea"
                            value={task.description}
                            readOnly
                        />
                    )}
                </div>

                {(task.prompt || isEditing) && (
                    <div className="form-group">
                        <label className="form-label">Prompt</label>
                        {isEditing ? (
                            <textarea
                                className="form-textarea"
                                value={editForm.prompt}
                                onChange={e => setEditForm({ ...editForm, prompt: e.target.value })}
                                style={{ minHeight: '100px', fontFamily: 'monospace', fontSize: '0.75rem' }}
                                placeholder="Claude execution prompt..."
                            />
                        ) : (
                            <textarea
                                className="form-textarea"
                                value={task.prompt}
                                readOnly
                                style={{ minHeight: '100px', fontFamily: 'monospace', fontSize: '0.75rem' }}
                            />
                        )}
                    </div>
                )}

                <div className="form-group">
                    <label className="form-label">状态</label>
                    <span className={`task-status ${task.status}`}>{task.status}</span>
                </div>

                <div className="form-group">
                    <label className="form-label">创建者</label>
                    <span className={`task-creator ${task.createdBy}`}>
                        {task.createdBy === 'claude' ? '🤖 Claude' : '👤 用户'}
                    </span>
                </div>

                {task.claudeSession && (
                    <div className="form-group">
                        <label className="form-label">Claude Session</label>
                        <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                            <div>ID: {task.claudeSession.id}</div>
                            <div style={{ color: 'var(--text-secondary)' }}>Created: {new Date(task.claudeSession.createdAt).toLocaleString()}</div>
                            <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)' }}>
                                <div style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Resume in terminal:</div>
                                <div style={{ background: 'var(--bg-secondary)', padding: '0.25rem 0.5rem', borderRadius: '2px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <code style={{ color: 'var(--accent-color)' }}>cd {task.worktree ? task.worktree.path : 'project-path'} && claude -r {task.claudeSession.id}</code>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {task.worktree && (
                    <div className="form-group">
                        <label className="form-label">Worktree</label>
                        <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                            <div>Path: {task.worktree.path}</div>
                            <div>Branch: {task.worktree.branch}</div>
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', marginBottom: '1rem' }}>
                    {renderActionButtons()}
                </div>

                {/* 设计方案预览 (设计泳道使用 Markdown 文件) */}
                {renderDesignPreview()}

                {/* 结构化输出 (仅非设计泳道显示，如开发/测试) */}
                {structuredOutput && task.laneId !== 'design' && (
                    <StructuredOutputViewer output={structuredOutput} />
                )}
            </div>
        </div>
    );
}
