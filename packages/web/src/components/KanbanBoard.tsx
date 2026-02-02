import type { Task, Lane } from '@antiwarden/shared';

interface TaskCardProps {
    task: Task;
    selected?: boolean;
    onClick?: () => void;
}

export function TaskCard({ task, selected, onClick }: TaskCardProps) {
    // Status translation
    const statusLabels: Record<string, string> = {
        'idle': '待执行',
        'running': '执行中',
        'completed': '已完成',
        'failed': '失败',
        'pending-dev': '待开发',
        'pending-merge': '待合并',
    };

    const statusLabel = statusLabels[task.status] || task.status;

    return (
        <div
            className={`task-card ${selected ? 'selected' : ''}`}
            onClick={onClick}
        >
            <div className="task-title">{task.title}</div>
            {task.description && (
                <div className="task-description">{task.description}</div>
            )}
            <div className="task-meta">
                <span className={`task-status ${task.status}`}>{statusLabel}</span>
                <span className={`task-creator ${task.createdBy}`}>
                    {task.createdBy === 'claude' ? '🤖 Claude' : '👤 用户'}
                </span>
            </div>
        </div>
    );
}

import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragStartEvent,
    type DragEndEvent,
    defaultDropAnimationSideEffects,
    type DropAnimation,
    useDroppable,
    pointerWithin
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import { createPortal } from 'react-dom';

interface SortableTaskCardProps extends TaskCardProps {
    id: string;
}

function SortableTaskCard({ id, ...props }: SortableTaskCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    // Disable drag for running tasks
    const isRunning = props.task.status === 'running';

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
        cursor: isRunning ? 'not-allowed' : undefined,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...(isRunning ? {} : listeners)}
            title={isRunning ? '运行中的任务无法拖动' : undefined}
        >
            <TaskCard {...props} />
        </div>
    );
}

interface KanbanLaneProps {
    lane: Lane;
    tasks: Task[];
    selectedTaskId?: string;
    onTaskClick?: (task: Task) => void;
    onAddTask?: () => void;
}

export function KanbanLane({ lane, tasks, selectedTaskId, onTaskClick, onAddTask }: KanbanLaneProps) {
    const { setNodeRef } = useDroppable({
        id: lane.id,
        data: {
            type: 'lane',
            lane
        }
    });

    return (
        <div className="kanban-lane" ref={setNodeRef}>
            <div className="lane-header">
                <div className="lane-indicator" style={{ backgroundColor: lane.color }} />
                <span className="lane-title">{lane.name}</span>
                <span className="lane-count">{tasks.length}</span>
            </div>
            <div className="lane-content">
                <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    {tasks.map((task) => (
                        <SortableTaskCard
                            key={task.id}
                            id={task.id}
                            task={task}
                            selected={task.id === selectedTaskId}
                            onClick={() => onTaskClick?.(task)}
                        />
                    ))}
                </SortableContext>
                {lane.id === 'design' && (
                    <button className="add-task-btn" onClick={onAddTask}>
                        + 添加任务
                    </button>
                )}
            </div>
        </div>
    );
}

interface KanbanBoardProps {
    lanes: Lane[];
    tasks: Task[];
    selectedTaskId?: string;
    onTaskClick?: (task: Task) => void;
    onAddTask?: () => void;
    onMoveTask?: (taskId: string, targetLaneId: string, index: number) => void;
}

const dropAnimation: DropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
        styles: {
            active: {
                opacity: '0.5',
            },
        },
    }),
};

export function KanbanBoard({ lanes, tasks, selectedTaskId, onTaskClick, onAddTask, onMoveTask }: KanbanBoardProps) {
    const [activeId, setActiveId] = useState<string | null>(null);

    const sortedLanes = [...lanes].sort((a, b) => a.order - b.order);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragStart = (event: DragStartEvent) => {
        console.log('DragStart:', event.active.id);
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;

        const activeTask = tasks.find(t => t.id === activeId);
        if (!activeTask) return;

        console.log('DragEnd:', { activeId, overId });

        // Dropped over a lane?
        const overLane = lanes.find(l => l.id === overId);
        if (overLane) {
            // Moved to empty lane or appended to lane
            if (activeTask.laneId !== overLane.id) {
                const newLaneTasks = tasks.filter(t => t.laneId === overLane.id);
                onMoveTask?.(activeTask.id, overLane.id, newLaneTasks.length);
            } else {
                // If dropping on the container of the same lane, we usually treat it as moving to bottom?
                // Or try to sort based on collision?
                // Simplest: append to end if not dropping on specific task.
                const laneTasks = tasks.filter(t => t.laneId === overLane.id && t.id !== activeId);
                onMoveTask?.(activeTask.id, overLane.id, laneTasks.length);
            }
            return;
        }

        // Dropped over another task
        const overTask = tasks.find(t => t.id === overId);
        if (overTask) {
            const overLaneId = overTask.laneId;
            const activeLaneId = activeTask.laneId;

            if (activeLaneId !== overLaneId) {
                // Moved to different lane
                const overLaneTasks = tasks.filter(t => t.laneId === overLaneId).sort((a, b) => a.order - b.order);
                const newIndex = overLaneTasks.findIndex(t => t.id === overId);
                onMoveTask?.(activeTask.id, overLaneId, newIndex);
            } else {
                // Reorder within same lane
                if (activeId !== overId) {
                    const laneTasks = tasks.filter(t => t.laneId === activeLaneId).sort((a, b) => a.order - b.order);
                    const newIndex = laneTasks.findIndex(t => t.id === overId);
                    onMoveTask?.(activeTask.id, activeLaneId, newIndex);
                }
            }
        }
    };

    const handleDragOver = (event: any) => {
        const { active, over } = event;
        console.log('DragOver:', { activeId: active?.id, overId: over?.id });
    };

    const activeTask = activeId ? tasks.find(t => t.id === activeId) : null;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
        >
            <div className="kanban-board">
                {sortedLanes.map((lane) => (
                    <KanbanLane
                        key={lane.id}
                        lane={lane}
                        tasks={tasks.filter((t) => t.laneId === lane.id).sort((a, b) => a.order - b.order)}
                        selectedTaskId={selectedTaskId}
                        onTaskClick={onTaskClick}
                        onAddTask={onAddTask}
                    />
                ))}
            </div>
            {createPortal(
                <DragOverlay dropAnimation={dropAnimation}>
                    {activeTask ? (
                        <div className="task-card selected" style={{ cursor: 'grabbing' }}>
                            <div className="task-title">{activeTask.title}</div>
                            {activeTask.description && (
                                <div className="task-description">{activeTask.description}</div>
                            )}
                        </div>
                    ) : null}
                </DragOverlay>,
                document.body
            )}
        </DndContext>
    );
}
