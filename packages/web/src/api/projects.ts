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

export async function fetchProjectData(projectId: string): Promise<{ project: ProjectRef; data: ProjectData }> {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}`);
    if (!res.ok) throw new Error('Failed to fetch project data');
    return res.json();
}
