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

export interface ProjectRef {
    id: string;
    name: string;
    path: string;
    createdAt: string;
    lastOpenedAt: string;
}

export interface ProjectData {
    projectId: string;
    lanes: any[];
    tasks: any[];
}

export async function fetchProjects(): Promise<ProjectRef[]> {
    return fetchWithRetry<ProjectRef[]>(`${API_BASE}/api/projects`);
}

export async function createProject(name: string, path: string): Promise<ProjectRef> {
    const res = await fetch(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path }),
    });
    if (!res.ok) throw new Error('Failed to create project');
    return res.json();
}

export async function deleteProject(projectId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}`, {
        method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete project');
}

export async function fetchProjectData(projectId: string): Promise<{ project: ProjectRef; data: ProjectData }> {
    return fetchWithRetry<{ project: ProjectRef; data: ProjectData }>(`${API_BASE}/api/projects/${projectId}`);
}

export async function createTask(
    projectId: string,
    task: { title: string; description: string; prompt?: string; laneId: string }
): Promise<any> {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
    });
    if (!res.ok) throw new Error('Failed to create task');
    return res.json();
}

export async function batchUpdateTasks(
    projectId: string,
    updates: { id: string; laneId?: string; order?: number }[]
): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/batch`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
    });
    if (!res.ok) throw new Error('Failed to batch update tasks');
    return res.json();
}

export async function updateTask(
    projectId: string,
    taskId: string,
    updates: Partial<any>
): Promise<any> {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update task');
    return res.json();
}

export async function deleteTask(projectId: string, taskId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}`, {
        method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete task');
    return res.json();
}

export async function fetchPlan(
    projectId: string,
    taskId: string
): Promise<{ planPath: string; content: string }> {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}/plan`);
    if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Failed to fetch plan' }));
        throw new Error(error.message);
    }
    return res.json();
}

export async function updatePlan(
    projectId: string,
    taskId: string,
    content: string
): Promise<{ success: boolean; planPath: string }> {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}/plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
    });
    if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Failed to update plan' }));
        throw new Error(error.message);
    }
    return res.json();
}

export async function fetchTask(
    projectId: string,
    taskId: string
): Promise<{ task: any }> {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}`);
    if (!res.ok) throw new Error('Failed to fetch task');
    return res.json();
}

export async function fetchTaskSummary(
    projectId: string,
    taskId: string
): Promise<{ summary: any }> {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}/summary`);
    if (!res.ok) throw new Error('Failed to fetch task summary');
    return res.json();
}

// Worktree API functions
export async function mergeWorktree(
    projectId: string,
    taskId: string,
    targetBranch?: string
): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetBranch }),
    });
    if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Failed to merge worktree' }));
        throw new Error(error.message);
    }
    return res.json();
}

export async function fetchFsList(path?: string): Promise<any> {
    const url = new URL(`${API_BASE}/api/fs/list`);
    if (path) url.searchParams.set('path', path);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error('Failed to fetch filesystem list');
    return res.json();
}
