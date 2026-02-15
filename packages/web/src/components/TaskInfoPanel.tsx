
import React, { useState, useEffect } from 'react';
import type { Task, StructuredOutput, LaneConfig, PlanOutput, DevelopmentOutput, TestingOutput } from '@clawwarden/shared';
import {
    Activity, User, Box, Code2,
    FileText, Terminal, Play, Square,
    Save, Edit2, Trash2, X, Zap, Palette, Package, ShieldCheck, GitMerge, CheckCircle, XCircle, RotateCcw
} from 'lucide-react';

interface TaskInfoPanelProps {
    task: Task;
    projectId: string;
    laneConfigs: Record<string, LaneConfig> | null;
    isTaskRunning: boolean;
    handleDelete: () => void;
    handleStop: () => void;
    handleAction: (actionId: string) => void;
    onTaskUpdate: (taskId: string, updates: Partial<Task>) => Promise<void>;
    structuredOutputs: StructuredOutput[];
}

export function TaskInfoPanel({
    task,
    laneConfigs,
    handleDelete,
    isTaskRunning,
    handleStop,
    handleAction,
    onTaskUpdate,
    structuredOutputs
}: TaskInfoPanelProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({
        title: task.title,
        description: task.description,
        prompt: task.prompt || ''
    });

    // Reset form when task changes
    useEffect(() => {
        setEditForm({
            title: task.title,
            description: task.description,
            prompt: task.prompt || ''
        });
        setIsEditing(false); // Exit edit mode when switching tasks
    }, [task.id, task.title, task.description, task.prompt]);

    const handleSave = async () => {
        try {
            await onTaskUpdate(task.id, editForm);
            setIsEditing(false);
        } catch (error) {
            console.error('Failed to update task:', error);
            alert('Failed to update task');
        }
    };

    const laneConfig = laneConfigs?.[task.laneId];
    const nextLaneConfig = (laneConfigs && laneConfig?.onCompleteLane) ? laneConfigs[laneConfig.onCompleteLane] : null;
    const latestOutput = structuredOutputs.length > 0 ? structuredOutputs[structuredOutputs.length - 1] : task.structuredOutput;

    const handleMoveToNextLane = async () => {
        if (!laneConfig?.onCompleteLane) return;
        try {
            await onTaskUpdate(task.id, {
                laneId: laneConfig.onCompleteLane,
                status: 'idle'
            });
        } catch (error) {
            console.error('Failed to move lane:', error);
        }
    };

    const handleResetStatus = async () => {
        try {
            await onTaskUpdate(task.id, { status: 'idle' });
        } catch (error) {
            console.error('Failed to reset status:', error);
        }
    };

    const ActionIcon = ({ icon, size = 20 }: { icon?: string; size?: number }) => {
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

    // Helper to get Color based on Lane or Status
    const getStatusColor = () => {
        if (task.status === 'running') return 'var(--status-running)';
        if (task.status === 'completed') return 'var(--status-completed)';
        if (task.status === 'failed') return 'var(--status-failed)';
        if (task.status === 'awaiting-review') return 'var(--status-pending)';
        return 'var(--text-muted)';
    };

    const StatusBadge = () => (
        <div className={`status-badge-modern ${task.status}`}>
            <span className="status-dot" style={{ background: getStatusColor() }}></span>
            {task.status === 'idle' ? 'Ready' :
                task.status === 'running' ? 'Running' :
                    task.status === 'completed' ? 'Done' :
                        task.status === 'awaiting-review' ? 'Review' : task.status}
        </div>
    );

    const LaneBadge = () => (
        <div className="meta-pill" style={{ borderColor: laneConfig?.color || 'var(--border-color)', color: laneConfig?.color || 'var(--text-secondary)' }}>
            <Box size={12} />
            {laneConfig?.name || task.laneId}
        </div>
    );

    // Smart Content Renderers
    const renderSmartContext = () => {
        if (!latestOutput) return null;

        const data = latestOutput.data as any;

        // Plan Summary
        if (latestOutput.type === 'plan') {
            const plan = data as PlanOutput;
            return (
                <div className="smart-context-card plan">
                    <div className="smart-header">
                        <FileText size={14} className="accent-icon" />
                        <span>Execution Plan Strategy</span>
                    </div>
                    <div className="smart-body">
                        <div className="smart-stat-row">
                            <span className="label">Complexity</span>
                            <span className={`value tag ${plan.estimatedComplexity}`}>{plan.estimatedComplexity}</span>
                        </div>
                        <div className="smart-summary">{plan.summary}</div>
                        {plan.components && plan.components.length > 0 && (
                            <div className="smart-list">
                                <span className="list-title">Key Components:</span>
                                {plan.components.map((c, i) => (
                                    <div key={i} className="list-item">• {c.name}</div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        // Development Summary
        if (latestOutput.type === 'development') {
            const dev = data as DevelopmentOutput;
            return (
                <div className="smart-context-card develop">
                    <div className="smart-header">
                        <Code2 size={14} className="accent-icon" />
                        <span>Development Activity</span>
                    </div>
                    <div className="smart-body">
                        <div className="smart-stat-grid">
                            <div className="stat-item">
                                <span className="stat-val">{dev.changes?.length || 0}</span>
                                <span className="stat-label">Files Changed</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-val">{dev.testsAdded?.length || 0}</span>
                                <span className="stat-label">Tests Added</span>
                            </div>
                        </div>
                        <div className="smart-summary">{dev.summary}</div>
                    </div>
                </div>
            );
        }

        // Testing Summary
        if (latestOutput.type === 'testing') {
            const test = data as TestingOutput;
            const passRate = test.testsRun > 0 ? Math.round((test.testsPassed / test.testsRun) * 100) : 0;
            return (
                <div className="smart-context-card test">
                    <div className="smart-header">
                        <Activity size={14} className="accent-icon" />
                        <span>Test Report</span>
                    </div>
                    <div className="smart-body">
                        <div className="test-progress-bar">
                            <div className="progress-fill" style={{ width: `${passRate}%`, background: passRate === 100 ? 'var(--status-completed)' : 'var(--status-pending)' }}></div>
                        </div>
                        <div className="smart-stat-grid three-col">
                            <div className="stat-item success">
                                <span className="stat-val">{test.testsPassed}</span>
                                <span className="stat-label">Passed</span>
                            </div>
                            <div className="stat-item error">
                                <span className="stat-val">{test.testsFailed}</span>
                                <span className="stat-label">Failed</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-val">{test.testsRun}</span>
                                <span className="stat-label">Total</span>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        return null;
    };

    return (
        <div className="task-info-panel">
            {/* Header Section */}
            <div className="panel-header-modern">
                <div className="header-top">
                    <StatusBadge />
                    <div className="header-actions">
                        {!isEditing ? (
                            <>
                                <button
                                    className="icon-btn-ghost"
                                    onClick={() => setIsEditing(true)}
                                    disabled={isTaskRunning}
                                    title="Edit Task"
                                >
                                    <Edit2 size={16} />
                                </button>
                                <button
                                    className="icon-btn-danger"
                                    onClick={handleDelete}
                                    disabled={isTaskRunning}
                                    title="Delete Task"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </>
                        ) : (
                            <>
                                <button className="btn-save-mini" onClick={handleSave}>
                                    <Save size={14} /> Save
                                </button>
                                <button className="icon-btn-ghost" onClick={() => setIsEditing(false)}>
                                    <X size={16} />
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {isEditing ? (
                    <div className="edit-form-group">
                        <input
                            className="title-input-large"
                            value={editForm.title}
                            onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                            placeholder="Task Title"
                        />
                    </div>
                ) : (
                    <h1 className="task-title-large">
                        {task.title}
                    </h1>
                )}

                <div className="meta-row">
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <LaneBadge />
                        <div className="meta-pill">
                            <User size={12} />
                            <span className="pill-val">{task.createdBy === 'claude' ? 'Claude' : 'User'}</span>
                        </div>
                    </div>

                    {task.autoExecute && (
                        <div className="meta-pill auto-active">
                            <Zap size={12} /> Auto
                        </div>
                    )}
                </div>
            </div>

            <div className="panel-scroll-content">
                {/* description */}
                <div className="section-block">
                    {isEditing ? (
                        <textarea
                            className="desc-textarea"
                            value={editForm.description}
                            onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                            placeholder="Task Description"
                        />
                    ) : (
                        <p className="task-desc-text">{task.description}</p>
                    )}
                </div>

                {/* Technical Context (Prompt) */}
                <div className="section-block prompt-section-block">
                    {isEditing ? (
                        <div className="form-group">
                            <label className="form-label">Prompt</label>
                            <textarea
                                className="code-textarea"
                                value={editForm.prompt}
                                onChange={e => setEditForm({ ...editForm, prompt: e.target.value })}
                                placeholder="Enter system prompt instructions..."
                                style={{ minHeight: '120px' }}
                            />
                        </div>
                    ) : (
                        task.prompt && (
                            <div className="prompt-card">
                                <div className="prompt-header">
                                    <Terminal size={14} className="accent-icon" />
                                    <span>Prompt</span>
                                </div>
                                <div className="prompt-content custom-scrollbar">
                                    {task.prompt}
                                </div>
                            </div>
                        )
                    )}
                </div>

                {/* Smart Context (Dynamic based on Lane/Output) */}
                {renderSmartContext()}


            </div>

            {/* Fixed Footer Area for Actions */}
            <div className="panel-footer-fixed">
                {/* Main Action Area */}
                <div className="action-center" style={{ marginTop: latestOutput ? '1rem' : 0 }}>
                    {isTaskRunning ? (
                        <button className="action-btn is-running" onClick={handleStop}>
                            <div className="btn-content">
                                <Square size={20} fill="currentColor" />
                                <div className="text-group">
                                    <span className="main-text">Stop Execution</span>
                                    <span className="sub-text">Task is currently running...</span>
                                </div>
                            </div>
                            <div className="live-indicator">
                                <span className="pulse-dot"></span>
                                Live
                            </div>
                        </button>
                    ) : task.status === 'awaiting-review' && nextLaneConfig ? (
                        <div className="action-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                            <button className="action-btn success" onClick={handleMoveToNextLane}>
                                <div className="btn-content" style={{ justifyContent: 'center' }}>
                                    <CheckCircle size={20} />
                                    <div className="text-group">
                                        <span className="main-text">Approve</span>
                                        <span className="sub-text">Next Lane</span>
                                    </div>
                                </div>
                            </button>
                            <button className="action-btn" onClick={handleResetStatus} style={{ borderColor: 'var(--status-failed)', color: 'var(--status-failed)', background: 'rgba(239, 68, 68, 0.1)' }}>
                                <div className="btn-content" style={{ justifyContent: 'center' }}>
                                    <XCircle size={20} />
                                    <div className="text-group">
                                        <span className="main-text">Reject</span>
                                        <span className="sub-text">Reset Status</span>
                                    </div>
                                </div>
                            </button>
                        </div>
                    ) : task.status === 'failed' ? (
                        <button className="action-btn" onClick={handleResetStatus}>
                            <div className="btn-content" style={{ justifyContent: 'center' }}>
                                <RotateCcw size={20} />
                                <div className="text-group">
                                    <span className="main-text">Retry Task</span>
                                    <span className="sub-text">Reset status to idle</span>
                                </div>
                            </div>
                        </button>
                    ) : (
                        <div className="action-grid">
                            {laneConfig?.primaryActions.map(action => (
                                <button
                                    key={action.id}
                                    className="action-card-btn"
                                    onClick={() => handleAction(action.id)}
                                    style={{
                                        '--hover-color': laneConfig.color || 'var(--accent)'
                                    } as React.CSSProperties}
                                >
                                    <div className="icon-box" style={{ color: laneConfig.color || 'var(--accent)' }}>
                                        <ActionIcon icon={action.buttonIcon} />
                                    </div>
                                    <div className="text-content">
                                        <span className="action-title">{action.buttonLabel}</span>
                                        <span className="action-desc">{action.name}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
