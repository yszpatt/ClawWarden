import { useState, useEffect } from 'react';
import type { ProjectRef } from '../api/projects';
import { fetchProjects, createProject } from '../api/projects';
import { SettingsModal } from './SettingsModal';

interface ProjectSelectorProps {
    onSelectProject: (project: ProjectRef) => void;
}

export function ProjectSelector({ onSelectProject }: ProjectSelectorProps) {
    const [projects, setProjects] = useState<ProjectRef[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showNewForm, setShowNewForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newPath, setNewPath] = useState('');
    const [creating, setCreating] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    useEffect(() => {
        loadProjects();
    }, []);

    const loadProjects = async (retryCount = 0, maxRetries = 5) => {
        try {
            setLoading(true);
            setError(null);
            const data = await fetchProjects();
            setProjects(data);
        } catch (err) {
            // Retry if the server is not ready yet (connection refused or fetch failed)
            if (retryCount < maxRetries) {
                const delay = 500 * Math.pow(1.5, retryCount); // Progressive delay: 500ms, 750ms, 1125ms...
                await new Promise(resolve => setTimeout(resolve, delay));
                return loadProjects(retryCount + 1, maxRetries);
            }
            setError(err instanceof Error ? err.message : '加载项目失败');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newName.trim() || !newPath.trim()) return;

        try {
            setCreating(true);
            const project = await createProject(newName.trim(), newPath.trim());
            setProjects([...projects, project]);
            setShowNewForm(false);
            setNewName('');
            setNewPath('');
            onSelectProject(project);
        } catch (err) {
            setError(err instanceof Error ? err.message : '创建项目失败');
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="project-selector-page">
            <div className="project-selector-container">
                <div className="project-selector-header">
                    <div className="logo-section">
                        <h1>🛡️ AntiWarden</h1>
                        <p>Claude Code 任务编排系统</p>
                    </div>
                    <button className="settings-btn" onClick={() => setShowSettings(true)} title="设置">
                        ⚙️
                    </button>
                </div>

                {error && (
                    <div className="error-banner">
                        {error}
                        <button onClick={() => setError(null)}>×</button>
                    </div>
                )}

                <div className="project-selector-content">
                    <div className="section-title">
                        <h2>选择项目</h2>
                        <button className="new-project-btn" onClick={() => setShowNewForm(true)}>
                            + 新建项目
                        </button>
                    </div>

                    {loading ? (
                        <div className="loading-state">加载中...</div>
                    ) : projects.length === 0 ? (
                        <div className="empty-projects">
                            <p>暂无项目</p>
                            <p className="hint">点击上方「新建项目」开始</p>
                        </div>
                    ) : (
                        <div className="project-list">
                            {projects.map((project) => (
                                <div
                                    key={project.id}
                                    className="project-card"
                                    onClick={() => onSelectProject(project)}
                                >
                                    <div className="project-icon">📁</div>
                                    <div className="project-info">
                                        <h3>{project.name}</h3>
                                        <span className="project-path">{project.path}</span>
                                    </div>
                                    <div className="project-arrow">→</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {showNewForm && (
                    <div className="modal-overlay" onClick={() => setShowNewForm(false)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <h2>新建项目</h2>
                            <div className="form-group">
                                <label className="form-label">项目名称</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="My Project"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">项目路径</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="/path/to/project"
                                    value={newPath}
                                    onChange={(e) => setNewPath(e.target.value)}
                                />
                            </div>
                            <div className="modal-actions">
                                <button className="cancel-btn" onClick={() => setShowNewForm(false)}>
                                    取消
                                </button>
                                <button
                                    className="primary-btn"
                                    onClick={handleCreate}
                                    disabled={creating || !newName.trim() || !newPath.trim()}
                                >
                                    {creating ? '创建中...' : '创建'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
            </div>
        </div>
    );
}
