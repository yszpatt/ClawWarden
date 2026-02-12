import { useState } from 'react';
import { Zap } from 'lucide-react';

interface TaskFormProps {
    onSubmit: (task: { title: string; description: string; prompt: string; autoExecute?: boolean }) => void;
    onClose: () => void;
}

export function TaskForm({ onSubmit, onClose }: TaskFormProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [prompt, setPrompt] = useState('');
    const [autoExecute, setAutoExecute] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!title.trim()) return;
        setSubmitting(true);
        await onSubmit({ title: title.trim(), description: description.trim(), prompt: prompt.trim(), autoExecute });
        setSubmitting(false);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                <h2>创建新任务</h2>

                <div className="form-group">
                    <label className="form-label">标题 *</label>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="任务标题"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">描述</label>
                    <textarea
                        className="form-textarea"
                        placeholder="任务描述..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">Claude Prompt</label>
                    <textarea
                        className="form-textarea"
                        placeholder="Claude 执行此任务时使用的 prompt..."
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        style={{ minHeight: '150px', fontFamily: 'monospace' }}
                    />
                </div>

                <div className="form-group">
                    <label
                        className="auto-execute-toggle"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '0.75rem 1rem',
                            background: autoExecute ? 'rgba(245, 158, 11, 0.1)' : 'var(--bg-tertiary)',
                            border: `1px solid ${autoExecute ? 'rgba(245, 158, 11, 0.3)' : 'var(--border-color)'}`,
                            borderRadius: '8px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={autoExecute}
                            onChange={(e) => setAutoExecute(e.target.checked)}
                            style={{ display: 'none' }}
                        />
                        <span style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: autoExecute ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.05)',
                            color: autoExecute ? '#F59E0B' : 'var(--text-muted)',
                            transition: 'all 0.2s ease',
                        }}>
                            <Zap size={16} fill={autoExecute ? '#F59E0B' : 'none'} />
                        </span>
                        <div style={{ flex: 1 }}>
                            <div style={{
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                color: autoExecute ? '#F59E0B' : 'var(--text-primary)',
                            }}>
                                自动执行模式
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                任务完成后自动进入下一泳道并启动，到「待合并」停止
                            </div>
                        </div>
                    </label>
                </div>

                <div className="modal-actions">
                    <button className="cancel-btn" onClick={onClose}>
                        取消
                    </button>
                    <button
                        className="primary-btn"
                        onClick={handleSubmit}
                        disabled={submitting || !title.trim()}
                    >
                        {submitting ? '创建中...' : '创建任务'}
                    </button>
                </div>
            </div>
        </div>
    );
}
