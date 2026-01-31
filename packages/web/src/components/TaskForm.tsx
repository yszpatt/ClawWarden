import { useState } from 'react';

interface TaskFormProps {
    onSubmit: (task: { title: string; description: string; prompt: string }) => void;
    onClose: () => void;
}

export function TaskForm({ onSubmit, onClose }: TaskFormProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [prompt, setPrompt] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!title.trim()) return;
        setSubmitting(true);
        await onSubmit({ title: title.trim(), description: description.trim(), prompt: prompt.trim() });
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
