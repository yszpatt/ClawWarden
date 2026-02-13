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
                        style={{ minHeight: '120px', fontFamily: 'var(--font-mono)' }}
                    />
                </div>

                <div className="form-group">
                    <div
                        className={`auto-execute-toggle-premium ${autoExecute ? 'active' : ''}`}
                        onClick={() => setAutoExecute(!autoExecute)}
                    >
                        <div className="toggle-icon">
                            <Zap size={16} fill={autoExecute ? 'currentColor' : 'none'} />
                        </div>
                        <div className="toggle-info">
                            <div className="toggle-title">
                                自动执行模式
                            </div>
                            <div className="toggle-desc">
                                任务完成后自动进入下一阶段
                            </div>
                        </div>
                        <input
                            type="checkbox"
                            checked={autoExecute}
                            onChange={(e) => setAutoExecute(e.target.checked)}
                            style={{ display: 'none' }}
                        />
                    </div>
                </div>

                <div className="modal-actions">
                    <button className="btn-unified secondary" onClick={onClose}>
                        取消
                    </button>
                    <button
                        className="btn-unified primary"
                        onClick={handleSubmit}
                        disabled={submitting || !title.trim()}
                    >
                        {submitting ? '创建中...' : (
                            <>
                                <Zap size={14} fill="currentColor" />
                                创建任务
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
