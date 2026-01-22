import type { ReactNode } from 'react';

interface HeaderProps {
    projectName?: string;
    onProjectChange?: () => void;
    onSettingsClick?: () => void;
}

export function Header({ projectName, onSettingsClick }: HeaderProps) {
    return (
        <header className="app-header">
            <h1>AntiWarden</h1>
            <div className="header-actions">
                <select className="project-selector" defaultValue="">
                    <option value="" disabled>选择项目...</option>
                    {projectName && <option value="current">{projectName}</option>}
                </select>
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
    projectName?: string;
}

export function Layout({
    children,
    sidebarContent,
    sidebarOpen,
    sidebarTitle,
    onSidebarClose,
    projectName,
}: LayoutProps) {
    return (
        <div className="app-layout">
            <Header projectName={projectName} />
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
