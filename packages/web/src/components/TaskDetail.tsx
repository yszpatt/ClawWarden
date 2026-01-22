import type { Task } from '@antiwarden/shared';

interface TaskDetailProps {
    task: Task;
    onClose?: () => void;
    onExecute?: () => void;
    onStop?: () => void;
}

export function TaskDetail({ task, onExecute, onStop }: TaskDetailProps) {
    const isRunning = task.status === 'running';

    return (
        <div className="task-detail">
            <div className="form-group">
                <label className="form-label">标题</label>
                <input
                    type="text"
                    className="form-input"
                    value={task.title}
                    readOnly
                />
            </div>

            <div className="form-group">
                <label className="form-label">描述</label>
                <textarea
                    className="form-textarea"
                    value={task.description}
                    readOnly
                />
            </div>

            {task.prompt && (
                <div className="form-group">
                    <label className="form-label">Prompt</label>
                    <textarea
                        className="form-textarea"
                        value={task.prompt}
                        readOnly
                        style={{ minHeight: '150px', fontFamily: 'monospace' }}
                    />
                </div>
            )}

            <div className="form-group">
                <label className="form-label">状态</label>
                <span className={`task-status ${task.status}`}>{task.status}</span>
            </div>

            <div className="form-group">
                <label className="form-label">创建者</label>
                <span className={`task-creator ${task.createdBy}`}>
                    {task.createdBy === 'claude' ? '🤖 Claude 自动创建' : '👤 用户创建'}
                </span>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                {!isRunning ? (
                    <button className="primary-btn" onClick={onExecute}>
                        ▶ 执行
                    </button>
                ) : (
                    <button className="primary-btn" onClick={onStop} style={{ background: '#EF4444' }}>
                        ■ 停止
                    </button>
                )}
            </div>

            {task.executionLogs && task.executionLogs.length > 0 && (
                <div className="form-group" style={{ marginTop: '1rem' }}>
                    <label className="form-label">执行日志</label>
                    <div
                        style={{
                            background: '#0d0d0d',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            padding: '1rem',
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            maxHeight: '300px',
                            overflow: 'auto',
                        }}
                    >
                        {task.executionLogs.map((log, i) => (
                            <div key={i} style={{ color: log.type === 'stderr' ? '#EF4444' : '#10B981' }}>
                                {log.content}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
