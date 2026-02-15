import { useState, useEffect, useRef } from 'react';
import type { Task, StructuredOutput } from '@clawwarden/shared';
import { useTerminalConnection } from './Terminal';
import { ConversationPanel } from './conversation/ConversationPanel';
import { TaskInfoPanel } from './TaskInfoPanel';
import { useAppStore } from '../stores/appStore';
import { fetchPlan, updatePlan, fetchTask, fetchTaskSummary } from '../api/projects';
import { connectionManager } from '../services/ConnectionManager';

interface TaskDetailProps {
    task: Task;
    projectId: string;
    onClose?: () => void;
    onStatusChange?: (status: Task['status']) => void;
}



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
                <TaskInfoPanel
                    task={task}
                    projectId={projectId}
                    laneConfigs={laneConfigs}
                    isEditing={isEditing}
                    setIsEditing={setIsEditing}
                    editForm={editForm}
                    setEditForm={setEditForm}
                    handleSave={handleSave}
                    handleDelete={handleDelete}
                    isTaskRunning={isTaskRunning}
                    handleStop={handleStop}
                    handleAction={handleAction}
                    structuredOutputs={structuredOutputs}
                />
            </div>
        </div>
    );
}
