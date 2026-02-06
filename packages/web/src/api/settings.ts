import type { GlobalSettings } from '@clawwarden/shared';

const API_BASE = 'http://localhost:4001';

async function fetchWithRetry<T>(
    url: string,
    options?: RequestInit,
    retries = 5,
    baseDelay = 500
): Promise<T> {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, options);
            if (!res.ok) throw new Error(`Fetch failed with status: ${res.status}`);
            return await res.json();
        } catch (err) {
            if (i === retries - 1) throw err;
            const delay = baseDelay * Math.pow(1.5, i);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
    throw new Error('Fetch failed after retries');
}

export async function fetchSettings(): Promise<GlobalSettings> {
    return fetchWithRetry<GlobalSettings>(`${API_BASE}/api/settings`, { cache: 'no-store' });
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

