import { useState, useEffect, useRef } from 'react';
import type { Task, StructuredOutput } from '@clawwarden/shared';
import { Square, Save, X, Trash2, GitMerge, Palette, Edit2, Info, Database, GitBranch, Code2, ShieldCheck, Play, Package, Check, RotateCcw, Zap } from 'lucide-react';
import { useTerminalConnection } from './Terminal';
import { ConversationPanel } from './conversation/ConversationPanel';
import { useAppStore } from '../stores/appStore';
import { fetchPlan, updatePlan, fetchTask, fetchTaskSummary } from '../api/projects';
import { connectionManager } from '../services/ConnectionManager';

interface TaskDetailProps {
    task: Task;
    projectId: string;
    onClose?: () => void;
    onStatusChange?: (status: Task['status']) => void;
}

const ActionIcon = ({ icon, size = 16 }: { icon?: string; size?: number }) => {
    switch (icon) {
        case 'palette': return <Palette size={size} />;
        case 'box': return <Package size={size} />;
        case 'code': return <Code2 size={size} />;
        case 'shield-check': return <ShieldCheck size={size} />;
        case 'git-merge': return <GitMerge size={size} />;
        case 'play': return <Play size={size} />;
        default: return <Code2 size={size} />;
    }
};

export function TaskDetail({ task, projectId, onClose, onStatusChange }: TaskDetailProps) {
    const [planContent, setPlanContent] = useState<string | null>(null);
    const [isEditingPlan, setIsEditingPlan] = useState(false);
    const [editedPlanContent, setEditedPlanContent] = useState('');
    const [structuredOutputs, setStructuredOutputs] = useState<StructuredOutput[]>([]);
    const [activeTab, setActiveTab] = useState<'conversation' | 'plan' | 'summary'>('conversation');
    const [fetchedTask, setFetchedTask] = useState<Task | null>(null);

    // Track current task to ignore stale messages
    const currentTaskIdRef = useRef(task.id);

    // Derive button state from task.status (single source of truth)
    const isTaskRunning = task.status === 'running';

    const { updateTask, removeTask } = useAppStore();

    // Sync task prop changes to fetchedTask
    useEffect(() => {
        setFetchedTask(prev => ({
            ...(prev || task),
            status: task.status,
            laneId: task.laneId,
            updatedAt: task.updatedAt,
        }));
    }, [task.status, task.laneId, task.updatedAt]);

    const {
        stop,
        disconnect,
    } = useTerminalConnection(projectId, task.id, {
        onPlanComplete: (content, _planPath) => {
            // Ignore if task has changed
            if (currentTaskIdRef.current !== task.id) return;
            console.log('[TaskDetail] Plan complete received via WebSocket');
            setPlanContent(content);
            setEditedPlanContent(content);
            // Refresh task data to get updated planPath and other metadata
            fetchTask(projectId, task.id).then(res => {
                if (res.task) setFetchedTask(res.task);
            });
        },
        onStatusChange: (status) => {
            // Ignore if task has changed
            if (currentTaskIdRef.current !== task.id) return;
            onStatusChange?.(status as Task['status']);

            // If task finished running, refresh data to pick up backend changes (like lane transitions)
            if (status !== 'running') {
                fetchTask(projectId, task.id).then(res => {
                    if (res.task) setFetchedTask(res.task);
                });
            }
        },
        onStructuredOutput: (output) => {
            // Ignore if task has changed
            if (currentTaskIdRef.current !== task.id) return;
            setStructuredOutputs(prev => [...prev, output as StructuredOutput]);
        }
    });


    // Update current task ref when task changes
    useEffect(() => {
        currentTaskIdRef.current = task.id;
        // Reset all tab-related state when switching to a different card
        setPlanContent(null);
        setStructuredOutputs([]);
        setIsEditingPlan(false);
        setEditedPlanContent('');
        setActiveTab('conversation');
    }, [task.id]);

    useEffect(() => {
        fetchTask(projectId, task.id)
            .then(result => {
                if (result.task) {
                    setFetchedTask(result.task);
                }
            })
            .catch(err => console.log('[TaskDetail] Fetch error:', err));
    }, [projectId, task.id]);

    // Fetch summary on tab change to 'summary'
    useEffect(() => {
        if (activeTab === 'summary') {
            fetchTaskSummary(projectId, task.id)
                .then(summaryResult => {
                    if (summaryResult.summary) {
                        const summary = Array.isArray(summaryResult.summary) ? summaryResult.summary : [summaryResult.summary];
                        setStructuredOutputs(summary);
                    }
                })
                .catch(err => console.log('[TaskDetail] Summary fetch error:', err));
        }
    }, [projectId, task.id, activeTab]);

    useEffect(() => {
        const t = fetchedTask || task;
        if (t.planPath) {
            fetchPlan(projectId, task.id)
                .then(r => {
                    setPlanContent(r.content);
                    setEditedPlanContent(r.content);
                })
                .catch(err => console.log('[TaskDetail] Plan load error:', err));
        }
    }, [projectId, task.id, fetchedTask?.planPath]);

    useEffect(() => () => disconnect(), []);

    const handleStop = () => {
        stop();
        onStatusChange?.('idle');
    };

    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({
        title: task.title,
        description: task.description,
        prompt: task.prompt || ''
    });

    const handleSave = async () => {
        try {
            await updateTask(task.id, editForm);
            setIsEditing(false);
        } catch (error) {
            alert('Failed to update task');
        }
    };

    const handleDelete = async () => {
        if (confirm('确定要删除此任务吗？⚠️ 此操作不可撤销！')) {
            try {
                await removeTask(task.id);
                if (onClose) onClose();
            } catch (error) {
                alert('删除任务失败');
            }
        }
    };

    const { laneConfigs } = useAppStore();
    const currentLaneConfig = laneConfigs?.[task.laneId];

    const handleAction = (actionId: string) => {
        if (isTaskRunning) return;
        setActiveTab('conversation');
        connectionManager.connect();
        connectionManager.send({
            type: 'conversation.lane_action_start',
            taskId: task.id,
            projectId,
            laneId: task.laneId,
            actionId
        });
    };

    const renderMainActionButton = () => {
        if (isTaskRunning) {
            return (
                <button className="btn-unified danger" onClick={handleStop} style={{ width: '100%', padding: '0.75rem' }}>
                    <Square size={16} fill="currentColor" />
                    停止执行
                </button>
            );
        }

        if (!currentLaneConfig) return null;

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {currentLaneConfig.primaryActions.map(action => (
                    <button
                        key={action.id}
                        className="btn-unified primary"
                        onClick={() => handleAction(action.id)}
                        style={{
                            width: '100%',
                            padding: '0.75rem',
                            background: currentLaneConfig.color || 'var(--accent)',
                            borderColor: currentLaneConfig.color || 'var(--accent)'
                        }}
                    >
                        <ActionIcon icon={action.buttonIcon} />
                        {action.buttonLabel}
                    </button>
                ))}
            </div>
        );
    };

    return (
        <div className="task-detail-container">
            {/* Left Column: Conversation Panel */}
            <div className="task-detail-sidebar">
                <ConversationPanel
                    taskId={task.id}
                    projectId={projectId}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    designContent={planContent}
                    onSaveDesign={async (content) => {
                        await updatePlan(projectId, task.id, content);
                        setPlanContent(content);
                        setIsEditingPlan(false);
                    }}
                    isEditingDesign={isEditingPlan}
                    setIsEditingDesign={setIsEditingPlan}
                    editedDesignContent={editedPlanContent}
                    setEditedDesignContent={setEditedPlanContent}
                    structuredOutput={structuredOutputs}
                />
            </div>

            {/* Right Column: Task Info & Actions */}
            <div className="task-detail-main">
                {/* Header Actions */}
                <div className="detail-header">
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>任务详情</h2>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {!isEditing ? (
                            <>
                                <button
                                    className="btn-unified ghost"
                                    onClick={() => setIsEditing(true)}
                                    disabled={task.status === 'running'}
                                    title={task.status === 'running' ? '任务运行中无法编辑' : undefined}
                                >
                                    <Edit2 size={14} />
                                    编辑
                                </button>
                                <button
                                    className="btn-unified danger"
                                    onClick={handleDelete}
                                    title="删除任务"
                                    disabled={task.status === 'running'}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </>
                        ) : (
                            <>
                                <button className="btn-unified primary" onClick={handleSave}>
                                    <Save size={14} />
                                    保存
                                </button>
                                <button className="btn-unified secondary" onClick={() => setIsEditing(false)}>
                                    <X size={14} />
                                    取消
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Primary Action Section */}
                <div className="info-card">
                    <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="detail-section-title" style={{ marginBottom: 0 }}>核心操作</span>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <span className={`task-status ${task.status} status-badge-glow`}>
                                {task.status === 'idle' ? '待命' : task.status === 'running' ? '执行中' : task.status === 'completed' ? '已完成' : task.status === 'awaiting-review' ? '需检查' : '结束'}
                            </span>
                            {task.autoExecute && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.625rem', color: '#F59E0B', background: 'rgba(245, 158, 11, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                                    <Zap size={10} fill="#F59E0B" /> 自动
                                </span>
                            )}
                        </div>
                    </div>
                    {task.status === 'awaiting-review' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div style={{ padding: '0.875rem', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '8px', fontSize: '0.8125rem', color: '#F59E0B', lineHeight: 1.5 }}>
                                ✨ 任务执行已告一段落，请检查结果并决定后续操作。
                            </div>
                            <button
                                className="btn-unified primary"
                                style={{ width: '100%', padding: '0.875rem' }}
                                onClick={async () => {
                                    if (!currentLaneConfig?.onCompleteLane) return;
                                    await updateTask(task.id, {
                                        status: 'idle',
                                        laneId: currentLaneConfig.onCompleteLane
                                    });
                                }}
                            >
                                <Check size={16} />
                                确认并进入下一阶段
                            </button>
                            <button
                                className="btn-unified secondary"
                                style={{ width: '100%', padding: '0.875rem' }}
                                onClick={async () => {
                                    await updateTask(task.id, { status: 'idle' });
                                }}
                            >
                                <RotateCcw size={16} />
                                重置为待命状态
                            </button>
                        </div>
                    ) : (
                        <div style={{ marginTop: '0.5rem' }}>
                            {renderMainActionButton()}
                        </div>
                    )}
                </div>

                {/* Task Information Group */}
                <div style={{ marginBottom: '2.5rem' }}>
                    <div className="detail-section-title">
                        <Info size={14} />
                        基本信息
                    </div>

                    <div className="form-group">
                        <label className="form-label">标题</label>
                        {isEditing ? (
                            <input className="form-input" value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} />
                        ) : (
                            <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{task.title}</div>
                        )}
                    </div>

                    <div className="form-group" style={{ marginTop: '1.25rem' }}>
                        <label className="form-label">任务描述</label>
                        {isEditing ? (
                            <textarea className="form-textarea" value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
                        ) : (
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{task.description}</div>
                        )}
                    </div>
                </div>

                {/* Technical Context Group */}
                <div style={{ marginBottom: '2.5rem' }}>
                    <div className="detail-section-title">
                        <Database size={14} />
                        技术上下文
                    </div>

                    {(task.prompt || isEditing) && (
                        <div className="form-group">
                            <label className="form-label">任务 Prompt</label>
                            {isEditing ? (
                                <textarea className="form-textarea" style={{ fontFamily: 'var(--font-mono)', minHeight: '120px' }} value={editForm.prompt} onChange={e => setEditForm({ ...editForm, prompt: e.target.value })} />
                            ) : (
                                <div className="code-block-premium">{task.prompt}</div>
                            )}
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '1.25rem' }}>
                        <div>
                            <label className="form-label">任务 ID</label>
                            <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{task.id}</div>
                        </div>
                        <div>
                            <label className="form-label">创建来源</label>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: task.createdBy === 'claude' ? 'var(--accent)' : 'var(--text-primary)' }}>
                                {task.createdBy === 'claude' ? '🤖 CLAUDE AGENT' : '👤 USER'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Git & Session Context */}
                {(task.worktree || task.claudeSession) && (
                    <div style={{ marginBottom: '1.5rem' }}>
                        <div className="detail-section-title">
                            <GitBranch size={14} />
                            工作环境
                        </div>

                        {task.worktree && (
                            <div className="env-status-item">
                                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--neon-amber)', marginBottom: '0.375rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <GitBranch size={12} />
                                    {task.worktree.branch}
                                </div>
                                <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                                    创建于: {new Date(task.worktree.createdAt).toLocaleString()}
                                </div>
                            </div>
                        )}

                        {task.claudeSession && (
                            <div className="env-status-item">
                                <div style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', marginBottom: '0.375rem' }}>
                                    Session: {task.claudeSession.id}
                                </div>
                                <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                                    关联时间: {new Date(task.claudeSession.createdAt).toLocaleString()}
                                </div>
                            </div>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
}
