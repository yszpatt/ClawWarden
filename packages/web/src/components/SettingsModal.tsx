import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import type { GlobalSettings, ClaudeSettings, NotificationSettings } from '@clawwarden/shared';
import { DEFAULT_SETTINGS, DEFAULT_LANES } from '@clawwarden/shared';
import { fetchSettings, updateSettings } from '../api/settings';

interface SettingsModalProps {
    onClose: () => void;
}

type TabId = 'basic' | 'claude' | 'notifications' | 'lanePrompts';

export function SettingsModal({ onClose }: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState<TabId>('basic');
    const [settings, setSettings] = useState<GlobalSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { setTheme } = useTheme();

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

    const tabs: { id: TabId; label: string }[] = [
        { id: 'basic', label: '基础' },
        { id: 'claude', label: 'Claude' },
        { id: 'notifications', label: '通知' },
        { id: 'lanePrompts', label: '泳道提示词' },
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


