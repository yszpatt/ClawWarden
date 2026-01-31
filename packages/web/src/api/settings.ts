import type { GlobalSettings } from '@antiwarden/shared';

const API_BASE = 'http://localhost:4001';

export async function fetchSettings(): Promise<GlobalSettings> {
    const res = await fetch(`${API_BASE}/api/settings`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch settings');
    return res.json();
}

export async function updateSettings(settings: Partial<GlobalSettings>): Promise<GlobalSettings> {
    const res = await fetch(`${API_BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error('Failed to update settings');
    return res.json();
}

// ========== Claude Code Hooks API ==========

interface HooksStatus {
    scriptInstalled: boolean;
    scriptPath: string;
    settingsConfigured: boolean;
    settingsPath: string;
}

interface HooksInstallResult {
    success: boolean;
    message: string;
    installedPath?: string;
    settingsPath?: string;
}

export async function fetchHooksStatus(): Promise<HooksStatus> {
    const res = await fetch(`${API_BASE}/api/settings/hooks/status`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch hooks status');
    return res.json();
}

export async function installHooks(): Promise<HooksInstallResult> {
    const res = await fetch(`${API_BASE}/api/settings/hooks/install`, {
        method: 'POST',
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to install hooks');
    }
    return res.json();
}

export async function uninstallHooks(): Promise<HooksInstallResult> {
    const res = await fetch(`${API_BASE}/api/settings/hooks/uninstall`, {
        method: 'DELETE',
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to uninstall hooks');
    }
    return res.json();
}

