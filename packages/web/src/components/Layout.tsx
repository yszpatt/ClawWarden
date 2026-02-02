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
                <h1>ClawWarden</h1>
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
    wide?: boolean;
}

export function Sidebar({ children, title = '详情', onClose, wide }: SidebarProps) {
    return (
        <aside className={`app-sidebar ${wide ? 'wide' : ''}`}>
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
    onSettingsClick?: () => void;
    projectName?: string;
    sidebarWide?: boolean;
}

export function Layout({
    children,
    sidebarContent,
    sidebarOpen,
    sidebarTitle,
    onSidebarClose,
    onBackToProjects,
    onSettingsClick,
    projectName,
    sidebarWide,
}: LayoutProps) {
    return (
        <div className="app-layout">
            <Header projectName={projectName} onBackToProjects={onBackToProjects} onSettingsClick={onSettingsClick} />
            <div className="app-content">
                <main className="main-content">{children}</main>
                {sidebarOpen && sidebarContent && (
                    <Sidebar title={sidebarTitle} onClose={onSidebarClose} wide={sidebarWide}>
                        {sidebarContent}
                    </Sidebar>
                )}
            </div>
        </div>
    );
}
