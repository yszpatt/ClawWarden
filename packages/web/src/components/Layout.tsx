import type { ReactNode } from 'react';

interface HeaderProps {
    projectName?: string;
    onBackToProjects?: () => void;
    onSettingsClick?: () => void;
}

export function Header({ projectName, onBackToProjects, onSettingsClick }: HeaderProps) {
    return (
        <header className="app-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {onBackToProjects && (
                    <button
                        className="settings-btn"
                        onClick={onBackToProjects}
                        title="返回项目列表"
                    >
                        ←
                    </button>
                )}
                <h1>AntiWarden</h1>
            </div>
            <div className="header-actions">
                {projectName && (
                    <span style={{
                        color: 'var(--text-secondary)',
                        fontSize: '0.875rem',
                        padding: '0.5rem 1rem',
                        background: 'var(--bg-tertiary)',
                        borderRadius: '6px',
                    }}>
                        📁 {projectName}
                    </span>
                )}
                <button className="settings-btn" onClick={onSettingsClick}>
                    ⚙️
                </button>
            </div>
        </header>
    );
}

interface SidebarProps {
    children: ReactNode;
    title?: string;
    onClose?: () => void;
}

export function Sidebar({ children, title = '详情', onClose }: SidebarProps) {
    return (
        <aside className="app-sidebar">
            <div className="sidebar-header">
                <h2>{title}</h2>
                <button className="sidebar-close" onClick={onClose}>×</button>
            </div>
            <div className="sidebar-content">
                {children}
            </div>
        </aside>
    );
}

interface LayoutProps {
    children: ReactNode;
    sidebarContent?: ReactNode;
    sidebarOpen?: boolean;
    sidebarTitle?: string;
    onSidebarClose?: () => void;
    onBackToProjects?: () => void;
    projectName?: string;
}

export function Layout({
    children,
    sidebarContent,
    sidebarOpen,
    sidebarTitle,
    onSidebarClose,
    onBackToProjects,
    projectName,
}: LayoutProps) {
    return (
        <div className="app-layout">
            <Header projectName={projectName} onBackToProjects={onBackToProjects} />
            <div className="app-content">
                <main className="main-content">{children}</main>
                {sidebarOpen && sidebarContent && (
                    <Sidebar title={sidebarTitle} onClose={onSidebarClose}>
                        {sidebarContent}
                    </Sidebar>
                )}
            </div>
        </div>
    );
}
