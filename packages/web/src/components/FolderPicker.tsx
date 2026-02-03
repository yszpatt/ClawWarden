import { useState, useEffect } from 'react';
import { fetchFsList } from '../api/projects';
import type { FsItem, FsListResponse } from '@clawwarden/shared';

interface FolderPickerProps {
    onSelect: (path: string) => void;
    onCancel: () => void;
    initialPath?: string;
}

export function FolderPicker({ onSelect, onCancel, initialPath }: FolderPickerProps) {
    const [currentPath, setCurrentPath] = useState<string>(initialPath || '');
    const [items, setItems] = useState<FsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadPath(currentPath);
    }, [currentPath]);

    const loadPath = async (path?: string) => {
        try {
            setLoading(true);
            setError(null);
            const data: FsListResponse = await fetchFsList(path);
            setItems(data.items.filter(item => item.isDirectory)); // Only show directories
            setCurrentPath(data.currentPath);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load directory');
        } finally {
            setLoading(false);
        }
    };

    const handleNavigate = (path: string) => {
        setCurrentPath(path);
    };

    const handleBack = () => {
        // Simple parent directory navigation
        const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
        setCurrentPath(parent);
    };

    return (
        <div className="folder-picker">
            <div className="folder-picker-header">
                <div className="current-path-display">
                    <span className="label">当前目录:</span>
                    <span className="path" title={currentPath}>{currentPath}</span>
                </div>
                <button className="back-btn" onClick={handleBack} disabled={currentPath === '/'}>
                    ↑ 返回上级
                </button>
            </div>

            <div className="folder-picker-content">
                {loading ? (
                    <div className="picker-loading">加载中...</div>
                ) : error ? (
                    <div className="picker-error">{error}</div>
                ) : (
                    <div className="folder-list">
                        {items.length === 0 ? (
                            <div className="empty-folders">此目录下没有文件夹</div>
                        ) : (
                            items.map((item) => (
                                <div
                                    key={item.path}
                                    className="folder-item"
                                    onClick={() => handleNavigate(item.path)}
                                >
                                    <span className="icon">📁</span>
                                    <span className="name">{item.name}</span>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            <div className="folder-picker-footer">
                <button className="cancel-btn" onClick={onCancel}>
                    取消
                </button>
                <button
                    className="primary-btn"
                    onClick={() => onSelect(currentPath)}
                    disabled={loading}
                >
                    确认选择当前目录
                </button>
            </div>
        </div>
    );
}
