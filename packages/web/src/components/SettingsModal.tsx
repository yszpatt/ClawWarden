import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import type { GlobalSettings, ClaudeSettings, NotificationSettings } from '@clawwarden/shared';
import { DEFAULT_SETTINGS, DEFAULT_LANES } from '@clawwarden/shared';
import { fetchSettings, updateSettings, fetchHooksStatus, installHooks, uninstallHooks } from '../api/settings';

interface HooksStatus {
    scriptInstalled: boolean;
    scriptPath: string;
    settingsConfigured: boolean;
    settingsPath: string;
}

interface SettingsModalProps {
    onClose: () => void;
}

type TabId = 'basic' | 'claude' | 'notifications' | 'lanePrompts' | 'hooks';

export function SettingsModal({ onClose }: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState<TabId>('basic');
    const [settings, setSettings] = useState<GlobalSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { setTheme } = useTheme();

    // Hooks management state
    const [hooksStatus, setHooksStatus] = useState<HooksStatus | null>(null);
    const [hooksLoading, setHooksLoading] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const data = await fetchSettings();
            // Theme is handled by ThemeContext, but we might verify consistency if needed
            setSettings(data);
        } catch (err) {
            setError('Failed to load settings');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setError(null);
            await updateSettings(settings);
            onClose();
        } catch (err) {
            setError('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const updateClaude = (updates: Partial<ClaudeSettings>) => {
        setSettings({ ...settings, claude: { ...settings.claude, ...updates } });
    };

    const updateNotifications = (updates: Partial<NotificationSettings>) => {
        setSettings({ ...settings, notifications: { ...settings.notifications, ...updates } });
    };

    const updateLanePrompt = (laneId: string, prompt: string) => {
        setSettings({
            ...settings,
            lanePrompts: { ...settings.lanePrompts, [laneId]: prompt },
        });
    };

    const loadHooksStatus = async () => {
        try {
            setHooksLoading(true);
            const status = await fetchHooksStatus();
            setHooksStatus(status);
        } catch (err) {
            console.error('Failed to load hooks status:', err);
        } finally {
            setHooksLoading(false);
        }
    };

    const handleInstallHooks = async () => {
        try {
            setHooksLoading(true);
            setError(null);
            await installHooks();
            await loadHooksStatus();
        } catch (err: any) {
            setError(err.message || 'Failed to install hooks');
        } finally {
            setHooksLoading(false);
        }
    };

    const handleUninstallHooks = async () => {
        try {
            setHooksLoading(true);
            setError(null);
            await uninstallHooks();
            await loadHooksStatus();
        } catch (err: any) {
            setError(err.message || 'Failed to uninstall hooks');
        } finally {
            setHooksLoading(false);
        }
    };

    const tabs: { id: TabId; label: string }[] = [
        { id: 'basic', label: '基础' },
        { id: 'claude', label: 'Claude' },
        { id: 'notifications', label: '通知' },
        { id: 'lanePrompts', label: '泳道提示词' },
        { id: 'hooks', label: 'Hooks' },
    ];

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>设置</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                {loading ? (
                    <div className="modal-body loading">加载中...</div>
                ) : (
                    <>
                        <div className="settings-tabs">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                                    onClick={() => setActiveTab(tab.id)}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        <div className="modal-body">
                            {error && <div className="error-message">{error}</div>}

                            {activeTab === 'basic' && (
                                <div className="settings-section">
                                    <div className="form-group">
                                        <label>Agent 端口</label>
                                        <input
                                            type="number"
                                            value={settings.agentPort}
                                            onChange={(e) =>
                                                setSettings({ ...settings, agentPort: parseInt(e.target.value) || 8888 })
                                            }
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>主题</label>
                                        <select
                                            value={settings.theme}
                                            onChange={(e) => {
                                                const newTheme = e.target.value as 'light' | 'dark';
                                                setSettings({ ...settings, theme: newTheme });
                                                // Update global theme context for immediate preview
                                                setTheme(newTheme);
                                            }}
                                        >
                                            <option value="dark">深色</option>
                                            <option value="light">浅色</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'claude' && (
                                <div className="settings-section">
                                    <div className="form-group">
                                        <label>Claude CLI 路径</label>
                                        <input
                                            type="text"
                                            value={settings.claude.cliPath}
                                            onChange={(e) => updateClaude({ cliPath: e.target.value })}
                                            placeholder="claude"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>默认执行参数</label>
                                        <input
                                            type="text"
                                            value={settings.claude.defaultArgs.join(' ')}
                                            onChange={(e) =>
                                                updateClaude({ defaultArgs: e.target.value.split(' ').filter(Boolean) })
                                            }
                                            placeholder="--dangerously-skip-permissions"
                                        />
                                        <span className="form-hint">多个参数用空格分隔</span>
                                    </div>
                                    <div className="form-group">
                                        <label>执行超时 (分钟)</label>
                                        <input
                                            type="number"
                                            value={settings.claude.timeoutMinutes}
                                            onChange={(e) =>
                                                updateClaude({ timeoutMinutes: parseInt(e.target.value) || 0 })
                                            }
                                            min={0}
                                        />
                                        <span className="form-hint">0 表示无超时</span>
                                    </div>
                                    <div className="form-group">
                                        <label>环境变量文件路径</label>
                                        <input
                                            type="text"
                                            value={settings.claude.envFilePath || ''}
                                            onChange={(e) => updateClaude({ envFilePath: e.target.value || undefined })}
                                            placeholder="/path/to/.env"
                                        />
                                        <span className="form-hint">可选，指定 .env 文件路径</span>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'notifications' && (
                                <div className="settings-section">
                                    <div className="form-group toggle-group">
                                        <label>浏览器通知</label>
                                        <label className="toggle-switch">
                                            <input
                                                type="checkbox"
                                                checked={settings.notifications.browserEnabled}
                                                onChange={(e) =>
                                                    updateNotifications({ browserEnabled: e.target.checked })
                                                }
                                            />
                                            <span className="toggle-slider"></span>
                                        </label>
                                    </div>
                                    <div className="form-group toggle-group">
                                        <label>声音提示</label>
                                        <label className="toggle-switch">
                                            <input
                                                type="checkbox"
                                                checked={settings.notifications.soundEnabled}
                                                onChange={(e) =>
                                                    updateNotifications({ soundEnabled: e.target.checked })
                                                }
                                            />
                                            <span className="toggle-slider"></span>
                                        </label>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'lanePrompts' && (
                                <div className="settings-section lane-prompts">
                                    {DEFAULT_LANES.map((lane) => (
                                        <div key={lane.id} className="form-group">
                                            <label style={{ color: lane.color }}>{lane.name}</label>
                                            <textarea
                                                value={settings.lanePrompts[lane.id] || ''}
                                                onChange={(e) => updateLanePrompt(lane.id, e.target.value)}
                                                placeholder={`${lane.name}泳道的系统提示词...`}
                                                rows={4}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}

                            {activeTab === 'hooks' && (
                                <div className="settings-section hooks-section">
                                    <div className="hooks-description">
                                        <p style={{ marginBottom: '1rem', opacity: 0.8 }}>
                                            Claude Code Hooks 可以在任务停止或完成时自动更新卡片状态，
                                            无需依赖 worktree 中的 skill 文件。
                                        </p>
                                    </div>

                                    {hooksStatus === null && !hooksLoading && (
                                        <button className="btn-secondary" onClick={loadHooksStatus}>
                                            检查安装状态
                                        </button>
                                    )}

                                    {hooksLoading && (
                                        <div className="hooks-loading">加载中...</div>
                                    )}

                                    {hooksStatus && !hooksLoading && (
                                        <div className="hooks-status">
                                            <div className="status-item">
                                                <span className="status-label">Hook 脚本:</span>
                                                <span className={`status-badge ${hooksStatus.scriptInstalled ? 'installed' : 'not-installed'}`}>
                                                    {hooksStatus.scriptInstalled ? '✓ 已安装' : '✗ 未安装'}
                                                </span>
                                            </div>
                                            {hooksStatus.scriptInstalled && (
                                                <div className="status-path">
                                                    路径: <code>{hooksStatus.scriptPath}</code>
                                                </div>
                                            )}

                                            <div className="status-item" style={{ marginTop: '0.75rem' }}>
                                                <span className="status-label">Claude 配置:</span>
                                                <span className={`status-badge ${hooksStatus.settingsConfigured ? 'installed' : 'not-installed'}`}>
                                                    {hooksStatus.settingsConfigured ? '✓ 已配置' : '✗ 未配置'}
                                                </span>
                                            </div>
                                            {hooksStatus.settingsConfigured && (
                                                <div className="status-path">
                                                    配置文件: <code>{hooksStatus.settingsPath}</code>
                                                </div>
                                            )}

                                            <div className="hooks-actions" style={{ marginTop: '1.5rem' }}>
                                                {(!hooksStatus.scriptInstalled || !hooksStatus.settingsConfigured) ? (
                                                    <button
                                                        className="btn-primary"
                                                        onClick={handleInstallHooks}
                                                        disabled={hooksLoading}
                                                    >
                                                        安装 Hooks
                                                    </button>
                                                ) : (
                                                    <button
                                                        className="btn-secondary btn-danger"
                                                        onClick={handleUninstallHooks}
                                                        disabled={hooksLoading}
                                                    >
                                                        卸载 Hooks
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="modal-footer">
                            <button className="btn-secondary" onClick={onClose}>
                                取消
                            </button>
                            <button className="btn-primary" onClick={handleSave} disabled={saving}>
                                {saving ? '保存中...' : '保存'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}


