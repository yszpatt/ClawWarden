const API_BASE = 'http://localhost:4001';

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
    const res = await fetch(`${API_BASE}/api/projects`);
    if (!res.ok) throw new Error('Failed to fetch projects');
    return res.json();
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
    const res = await fetch(`${API_BASE}/api/projects/${projectId}`);
    if (!res.ok) throw new Error('Failed to fetch project data');
    return res.json();
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

export async function fetchDesign(
    projectId: string,
    taskId: string
): Promise<{ designPath: string; content: string }> {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}/design`);
    if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Failed to fetch design' }));
        throw new Error(error.message);
    }
    return res.json();
}

export async function updateDesign(
    projectId: string,
    taskId: string,
    content: string
): Promise<{ success: boolean; designPath: string }> {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}/design`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
    });
    if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Failed to update design' }));
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
