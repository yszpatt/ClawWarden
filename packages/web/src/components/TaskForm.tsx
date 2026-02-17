import { useState, useEffect, useRef } from 'react';
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

    // Auto-focus title on mount
    const titleInputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (titleInputRef.current) {
            titleInputRef.current.focus();
        }
    }, []);

    const handleSubmit = async () => {
        if (!title.trim() || submitting) return;
        setSubmitting(true);
        try {
            await onSubmit({ title: title.trim(), description: description.trim(), prompt: prompt.trim(), autoExecute });
        } finally {
            setSubmitting(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
        }

        if (e.key === 'Escape') {
            onClose();
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal-content bento-module"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: '550px', width: '100%', padding: '1.5rem' }}
            >
                <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                    <Zap size={20} className="accent-text" style={{ color: 'var(--accent)' }} />
                    创建新任务
                </h2>

                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <div className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                        <Activity size={12} /> 标题
                    </div>
                    <input
                        ref={titleInputRef}
                        type="text"
                        className="premium-title-input"
                        placeholder="任务标题..."
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onKeyDown={handleKeyDown}
                        style={{ padding: '0.6rem 0.8rem', fontSize: '1rem', marginBottom: '0' }}
                    />
                </div>

                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <div className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                        <FileText size={12} /> 描述
                    </div>
                    <textarea
                        className="premium-textarea"
                        placeholder="简单描述一下这个任务..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onKeyDown={handleKeyDown}
                        style={{ minHeight: '60px', padding: '0.6rem 0.8rem', fontSize: '0.9rem' }}
                    />
                </div>

                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <div className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                        <Terminal size={12} /> Claude Prompt
                    </div>
                    <div className="prompt-card editing" style={{ minHeight: 'auto' }}>
                        <textarea
                            className="premium-textarea code-textarea-premium"
                            placeholder="Claude 执行此任务时使用的具体指令..."
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={handleKeyDown}
                            style={{ minHeight: '160px', padding: '0.6rem 0.8rem', fontSize: '0.85rem' }}
                        />
                    </div>
                </div>

                <div className="form-group" style={{ marginTop: '1rem', marginBottom: '1.25rem' }}>
                    <div
                        className={`auto-execute-toggle-premium ${autoExecute ? 'active' : ''}`}
                        onClick={() => setAutoExecute(!autoExecute)}
                        style={{ padding: '0.75rem' }}
                    >
                        <div className="toggle-icon" style={{ width: '32px', height: '32px' }}>
                            <Zap size={16} />
                        </div>
                        <div className="toggle-info">
                            <div className="toggle-title" style={{ fontSize: '0.875rem' }}>
                                自动执行模式
                            </div>
                            <div className="toggle-desc" style={{ fontSize: '0.7rem' }}>
                                任务完成后自动进入下一阶段
                            </div>
                        </div>
                        {/* Hidden checkbox for semantic purpose */}
                        <input
                            type="checkbox"
                            checked={autoExecute}
                            onChange={(e) => setAutoExecute(e.target.checked)}
                            style={{ display: 'none' }}
                        />
                    </div>
                </div>

                <div className="modal-actions" style={{ marginTop: '0' }}>
                    <button className="btn-unified ghost" onClick={onClose} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                        取消
                    </button>
                    <button
                        className="btn-unified primary"
                        onClick={handleSubmit}
                        disabled={submitting || !title.trim()}
                        title="按 Cmd+Enter 快速提交"
                        style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
                    >
                        {submitting ? '创建中...' : (
                            <>
                                <Zap size={14} />
                                创建任务
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
