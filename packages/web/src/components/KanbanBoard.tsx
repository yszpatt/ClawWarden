import type { Task, Lane } from '@antiwarden/shared';

interface TaskCardProps {
    task: Task;
    selected?: boolean;
    onClick?: () => void;
}

export function TaskCard({ task, selected, onClick }: TaskCardProps) {
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
                <span className={`task-status ${task.status}`}>{task.status}</span>
                <span className={`task-creator ${task.createdBy}`}>
                    {task.createdBy === 'claude' ? '🤖 Claude' : '👤 User'}
                </span>
            </div>
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
    return (
        <div className="kanban-lane">
            <div className="lane-header">
                <div className="lane-indicator" style={{ backgroundColor: lane.color }} />
                <span className="lane-title">{lane.name}</span>
                <span className="lane-count">{tasks.length}</span>
            </div>
            <div className="lane-content">
                {tasks.map((task) => (
                    <TaskCard
                        key={task.id}
                        task={task}
                        selected={task.id === selectedTaskId}
                        onClick={() => onTaskClick?.(task)}
                    />
                ))}
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
}

export function KanbanBoard({ lanes, tasks, selectedTaskId, onTaskClick, onAddTask }: KanbanBoardProps) {
    const sortedLanes = [...lanes].sort((a, b) => a.order - b.order);

    return (
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
    );
}
