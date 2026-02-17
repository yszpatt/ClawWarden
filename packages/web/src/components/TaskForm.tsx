import { useState } from 'react';
import { Zap, Activity, FileText, Terminal } from 'lucide-react';

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
            <div className="modal-content bento-module" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', padding: '2rem' }}>
                <h2 style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                    <Zap size={24} className="accent-text" fill="var(--accent)" />
                    创建新任务
                </h2>

                <div className="edit-section-premium" style={{ marginBottom: '1.5rem' }}>
                    <div className="edit-section-header">
                        <Activity size={12} /> 标题
                    </div>
                    <input
                        type="text"
                        className="premium-textarea"
                        placeholder="任务标题..."
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        style={{ fontSize: '1.1rem', fontWeight: 600 }}
                    />
                </div>

                <div className="edit-section-premium" style={{ marginBottom: '1.5rem' }}>
                    <div className="edit-section-header">
                        <FileText size={12} /> 描述
                    </div>
                    <textarea
                        className="premium-textarea"
                        placeholder="简单描述一下这个任务..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        style={{ minHeight: '80px' }}
                    />
                </div>

                <div className="edit-section-premium" style={{ marginBottom: '1.5rem' }}>
                    <div className="edit-section-header">
                        <Terminal size={12} /> Claude Prompt
                    </div>
                    <textarea
                        className="premium-textarea code-textarea-premium"
                        placeholder="Claude 执行此任务时使用的具体指令..."
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        style={{ minHeight: '120px' }}
                    />
                </div>

                <div className="form-group" style={{ marginTop: '1rem' }}>
                    <div
                        className={`auto-execute-toggle-premium ${autoExecute ? 'active' : ''}`}
                        onClick={() => setAutoExecute(!autoExecute)}
                        style={{ background: 'rgba(255,255,255,0.02)' }}
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

                <div className="modal-actions" style={{ marginTop: '2rem' }}>
                    <button className="secondary-btn" onClick={onClose} style={{ borderRadius: '10px' }}>
                        取消
                    </button>
                    <button
                        className="btn-primary"
                        onClick={handleSubmit}
                        disabled={submitting || !title.trim()}
                        style={{ borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                    >
                        {submitting ? '创建中...' : (
                            <>
                                <Zap size={16} fill="white" />
                                创建任务
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
