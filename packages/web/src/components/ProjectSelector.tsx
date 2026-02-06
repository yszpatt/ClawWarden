import { useState, useEffect } from 'react';
import { Logo } from './Logo';
import type { ProjectRef } from '../api/projects';
import { fetchProjects, createProject, deleteProject } from '../api/projects';
import { SettingsModal } from './SettingsModal';
import { FolderPicker } from './FolderPicker';

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
    const [showFolderPicker, setShowFolderPicker] = useState(false);

    useEffect(() => {
        loadProjects();
    }, []);

    const loadProjects = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await fetchProjects();
            setProjects(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : '加载项目失败');
        } finally {
            setLoading(false);
        }
    };

    const handlePathSelect = (path: string) => {
        setNewPath(path);
        // If name is empty, pre-fill with folder name
        if (!newName.trim()) {
            const folderName = path.split('/').filter(Boolean).pop() || '';
            setNewName(folderName);
        }
        setShowFolderPicker(false);
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

    const handleRemoveProject = async (e: React.MouseEvent, projectId: string) => {
        e.stopPropagation(); // Avoid selecting the project

        if (!confirm('确定要将此项目从列表中移除吗？\n(项目文件将保留在磁盘上)')) {
            return;
        }

        try {
            await deleteProject(projectId);
            setProjects(projects.filter(p => p.id !== projectId));
        } catch (err) {
            setError(err instanceof Error ? err.message : '移除项目失败');
        }
    };

    return (
        <div className="project-selector-page">
            <div className="project-selector-container">
                <div className="project-selector-header">
                    <div className="logo-section" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <Logo size={42} />
                        <h1>ClawWarden</h1>
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
                            + 新建/导入项目
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
                                    <button
                                        className="remove-project-btn"
                                        onClick={(e) => handleRemoveProject(e, project.id)}
                                        title="从列表中移除"
                                    >
                                        🗑️
                                    </button>
                                    <div className="project-arrow">→</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {showNewForm && !showFolderPicker && (
                <div className="modal-overlay" onClick={() => setShowNewForm(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <h2>新建/导入项目</h2>
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
                            <div className="input-with-action">
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="/path/to/project"
                                    value={newPath}
                                    onChange={(e) => setNewPath(e.target.value)}
                                />
                                <button
                                    className="browse-btn"
                                    onClick={() => setShowFolderPicker(true)}
                                >
                                    浏览...
                                </button>
                            </div>
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
                                {creating ? '正在处理...' : '确认'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showFolderPicker && (
                <div className="modal-overlay" onClick={() => setShowFolderPicker(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <h2>选择项目文件夹</h2>
                        <FolderPicker
                            onSelect={handlePathSelect}
                            onCancel={() => setShowFolderPicker(false)}
                            initialPath={newPath}
                        />
                    </div>
                </div>
            )}

            {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        </div>
    );
}
