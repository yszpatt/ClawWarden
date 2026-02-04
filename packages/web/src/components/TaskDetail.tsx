import { useState, useEffect, useRef } from 'react';
import type { Task, StructuredOutput } from '@clawwarden/shared';
import { Square, Save, X, Trash2, GitMerge, Palette, Edit2, Info, Database, GitBranch, Code2, ShieldCheck } from 'lucide-react';
import { useTerminalConnection } from './Terminal';
import { ConversationPanel } from './conversation/ConversationPanel';
import { useAppStore } from '../stores/appStore';
import { fetchPlan, updatePlan, mergeWorktree, fetchProjectData, fetchTask, fetchTaskSummary } from '../api/projects';
import { connectionManager } from '../services/ConnectionManager';
import { DEFAULT_LANES } from '@clawwarden/shared';

const getLaneColor = (laneId: string) => {
    return DEFAULT_LANES.find(l => l.id === laneId)?.color || 'var(--accent)';
};

interface TaskDetailProps {
    task: Task;
    projectId: string;
    onClose?: () => void;
    onStatusChange?: (status: Task['status']) => void;
}

export function TaskDetail({ task, projectId, onClose, onStatusChange }: TaskDetailProps) {
    const isRunning = task.status === 'running';
    const [isRunningState, setIsRunningState] = useState(isRunning);
    const taskStatusRef = useRef(task.status);
    const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
    const [planContent, setPlanContent] = useState<string | null>(null);
    const [isEditingPlan, setIsEditingPlan] = useState(false);
    const [editedPlanContent, setEditedPlanContent] = useState('');
    const [isMerging, setIsMerging] = useState(false);
    const [structuredOutputs, setStructuredOutputs] = useState<StructuredOutput[]>([]);
    const [activeTab, setActiveTab] = useState<'conversation' | 'plan' | 'summary'>('conversation');
    const [fetchedTask, setFetchedTask] = useState<Task | null>(null);

    const { updateTask, removeTask, setProjectData, currentProject } = useAppStore();

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
        onPlanComplete: (content) => {
            setPlanContent(content);
            setEditedPlanContent(content);
            setIsGeneratingPlan(false);
        },
        onStatusChange: (status) => {
            onStatusChange?.(status as Task['status']);
        },
        onStructuredOutput: (output) => {
            setStructuredOutputs(prev => [...prev, output as StructuredOutput]);
        }
    });


    useEffect(() => {
        setIsRunningState(task.status === 'running');
        taskStatusRef.current = task.status;
    }, [task.status]);

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

    const handleGeneratePlan = () => {
        if (isGeneratingPlan) return;
        setIsGeneratingPlan(true);
        setActiveTab('conversation');
        connectionManager.connect();
        connectionManager.send({ type: 'conversation.plan_start', taskId: task.id, projectId });
    };

    const handleExecute = () => {
        if (!task.prompt && !task.planPath) return alert('任务没有 Prompt 或计划方案，无法执行');
        setActiveTab('conversation');
        connectionManager.connect();
        connectionManager.send({ type: 'conversation.execute_start', taskId: task.id, projectId });
    };

    const handleStop = () => {
        stop();
        setIsRunningState(false);
        onStatusChange?.('idle');
    };

    const handleMerge = async () => {
        if (isMerging || !task.worktree) return;
        setIsMerging(true);
        try {
            const result = await mergeWorktree(projectId, task.id);
            if (result.success && currentProject) {
                const { data } = await fetchProjectData(currentProject.id);
                setProjectData(data);
            } else if (!result.success) {
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

    const renderMainActionButton = () => {
        const laneId = task.laneId;
        const themeColor = getLaneColor(laneId);

        if (laneId === 'plan') {
            return (
                <button
                    className="btn-unified primary"
                    onClick={handleGeneratePlan}
                    disabled={isGeneratingPlan}
                    style={{ width: '100%', padding: '0.75rem', background: themeColor, borderColor: themeColor }}
                >
                    <Palette size={16} />
                    {isGeneratingPlan ? '正在生成计划方案...' : '生成计划方案'}
                </button>
            );
        }
        if (laneId === 'develop' || laneId === 'test') {
            if (isRunningState) {
                return (
                    <button className="btn-unified danger" onClick={handleStop} style={{ width: '100%', padding: '0.75rem' }}>
                        <Square size={16} fill="currentColor" />
                        停止执行
                    </button>
                );
            }
            return (
                <button
                    className="btn-unified primary"
                    onClick={handleExecute}
                    disabled={!task.prompt && !task.planPath}
                    style={{ width: '100%', padding: '0.75rem', background: themeColor, borderColor: themeColor }}
                >
                    {laneId === 'test' ? <ShieldCheck size={16} /> : <Code2 size={16} />}
                    {task.status === 'failed' ? '重新执行任务' : laneId === 'test' ? '开始自动化测试' : '进入自动化开发'}
                </button>
            );
        }
        if (laneId === 'pending-merge') {
            return (
                <button
                    className="btn-unified primary"
                    onClick={handleMerge}
                    disabled={isMerging || !task.worktree}
                    style={{ width: '100%', padding: '0.75rem', background: themeColor, borderColor: themeColor }}
                >
                    <GitMerge size={16} />
                    {isMerging ? '正在合并到主分支...' : '合并到主分支 (Main)'}
                </button>
            );
        }
        return null;
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>任务详情</h2>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {!isEditing ? (
                            <>
                                <button className="btn-unified ghost" onClick={() => setIsEditing(true)}>
                                    <Edit2 size={14} />
                                    编辑
                                </button>
                                <button className="btn-unified danger" onClick={handleDelete} title="删除任务">
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
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '2rem' }}>
                    <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>核心操作</span>
                        <span className={`task-status ${task.status} status-badge-glow`}>
                            {task.status === 'idle' ? '闲置' : task.status === 'running' ? '运行中' : task.status === 'completed' ? '已完成' : '已结束'}
                        </span>
                    </div>
                    {renderMainActionButton()}
                </div>

                {/* Task Information Group */}
                <div className="info-group" style={{ marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--accent)', fontSize: '0.8125rem', fontWeight: 600 }}>
                        <Info size={14} />
                        基本信息
                    </div>

                    <div className="form-group">
                        <label className="form-label">标题</label>
                        {isEditing ? (
                            <input className="form-input" value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} />
                        ) : (
                            <div style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-primary)' }}>{task.title}</div>
                        )}
                    </div>

                    <div className="form-group" style={{ marginTop: '1rem' }}>
                        <label className="form-label">描述</label>
                        {isEditing ? (
                            <textarea className="form-textarea" value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
                        ) : (
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{task.description}</div>
                        )}
                    </div>
                </div>

                {/* Technical Context Group */}
                <div className="info-group" style={{ marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--accent)', fontSize: '0.8125rem', fontWeight: 600 }}>
                        <Database size={14} />
                        技术上下文
                    </div>

                    {(task.prompt || isEditing) && (
                        <div className="form-group">
                            <label className="form-label">执行 Prompt</label>
                            {isEditing ? (
                                <textarea className="form-textarea" style={{ fontFamily: 'monospace', minHeight: '100px' }} value={editForm.prompt} onChange={e => setEditForm({ ...editForm, prompt: e.target.value })} />
                            ) : (
                                <div style={{ background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--neon-cyan)', whiteSpace: 'pre-wrap' }}>{task.prompt}</div>
                            )}
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                        <div>
                            <label className="form-label">任务 ID</label>
                            <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{task.id}</div>
                        </div>
                        <div>
                            <label className="form-label">创建者</label>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: task.createdBy === 'claude' ? 'var(--accent)' : 'var(--text-primary)' }}>
                                {task.createdBy === 'claude' ? '🤖 CLAUDE' : '👤 USER'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Git & Session Context */}
                {(task.worktree || task.claudeSession) && (
                    <div className="info-group">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--accent)', fontSize: '0.8125rem', fontWeight: 600 }}>
                            <GitBranch size={14} />
                            环境状态
                        </div>

                        {task.worktree && (
                            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '0.75rem' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--neon-amber)', marginBottom: '0.25rem' }}>Branch: {task.worktree.branch}</div>
                                <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)' }}>Created: {new Date(task.worktree.createdAt).toLocaleString()}</div>
                            </div>
                        )}

                        {task.claudeSession && (
                            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden' }}>Session ID: {task.claudeSession.id}</div>
                                <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Attached: {new Date(task.claudeSession.createdAt).toLocaleString()}</div>
                            </div>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
}
