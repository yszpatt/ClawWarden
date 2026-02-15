import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import type { GlobalConfig, ProjectData } from '@clawwarden/shared';
import { DEFAULT_LANES, DEFAULT_SETTINGS } from '@clawwarden/shared';
import { GLOBAL_CONFIG_FILE, getProjectTasksFile } from './paths';
import { fileWatcher } from '../services/file-watcher';

export async function ensureDir(filePath: string): Promise<void> {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
    }
}

/**
 * Per-file mutex to prevent concurrent writes/reads from different async turns
 */
const fileLocks = new Map<string, Promise<any>>();

async function withLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
    const previous = fileLocks.get(filePath) || Promise.resolve();
    const next = previous.then(fn).catch(() => { });
    fileLocks.set(filePath, next as Promise<any>);
    return previous.then(fn);
}

/**
 * Atomic file writer to prevent corruption
 */
async function atomicWriteFile(filePath: string, content: string): Promise<void> {
    if (!content || content.length < 10) {
        throw new Error(`Refusing to write invalid content to ${filePath} (length: ${content?.length})`);
    }

    await ensureDir(filePath);
    const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).substring(2, 9)}.tmp`;

    try {
        await writeFile(tempPath, content, 'utf-8');
        await rename(tempPath, filePath);
    } catch (err) {
        if (existsSync(tempPath)) {
            const { unlink } = await import('fs/promises');
            await unlink(tempPath).catch(() => { });
        }
        throw err;
    }
}

export async function readGlobalConfig(retries = 3): Promise<GlobalConfig> {
    if (!existsSync(GLOBAL_CONFIG_FILE)) {
        const defaultConfig: GlobalConfig = {
            version: '1.0.0',
            projects: [],
            settings: DEFAULT_SETTINGS,
        };
        await writeGlobalConfig(defaultConfig);
        return defaultConfig;
    }

    let lastError: any;
    for (let i = 0; i < retries; i++) {
        try {
            const content = await readFile(GLOBAL_CONFIG_FILE, 'utf-8');
            if (!content || content.trim() === '') {
                throw new Error('Empty global config');
            }
            const config = JSON.parse(content) as GlobalConfig;

            // Deep merge with defaults for migration support
            config.settings = {
                ...DEFAULT_SETTINGS,
                ...config.settings,
                claude: { ...DEFAULT_SETTINGS.claude, ...config.settings?.claude },
                notifications: { ...DEFAULT_SETTINGS.notifications, ...config.settings?.notifications },
                // For lanePrompts: merge defaults with user config (user config takes priority)
                lanePrompts: { ...DEFAULT_SETTINGS.lanePrompts, ...config.settings?.lanePrompts },
            };

            // Save merged config back to disk to ensure defaults are visible in the file
            await writeGlobalConfig(config);

            return config;
        } catch (err) {
            lastError = err;
            console.warn(`[JSONStore] Attempt ${i + 1} to read global config failed: ${err instanceof Error ? err.message : String(err)}`);
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, 50 * (i + 1)));
            }
        }
    }

    throw new Error(`Failed to read global config after ${retries} attempts: ${lastError?.message || 'Unknown error'}`);
}

export async function writeGlobalConfig(config: GlobalConfig): Promise<void> {
    const content = JSON.stringify(config, null, 2);
    await withLock(GLOBAL_CONFIG_FILE, () => atomicWriteFile(GLOBAL_CONFIG_FILE, content));
}

export async function readProjectData(projectPath: string, retries = 3): Promise<ProjectData> {
    const filePath = getProjectTasksFile(projectPath);
    if (!existsSync(filePath)) {
        throw new Error(`Project not initialized: ${projectPath}`);
    }

    let lastError: any;
    for (let i = 0; i < retries; i++) {
        try {
            const content = await readFile(filePath, 'utf-8');
            if (!content || content.trim() === '') {
                throw new Error('Empty file content');
            }
            const data = JSON.parse(content) as ProjectData;
            return migrateProjectData(projectPath, data);
        } catch (err) {
            lastError = err;
            console.warn(`[JSONStore] Attempt ${i + 1} to read project data failed: ${err instanceof Error ? err.message : String(err)}`);
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, 50 * (i + 1))); // Exponential-ish backoff
            }
        }
    }

    throw new Error(`Failed to read project data after ${retries} attempts: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Separated migration logic from reading
 */
async function migrateProjectData(projectPath: string, data: ProjectData): Promise<ProjectData> {
    let migrated = false;

    // 1. Migrate tasks
    if (data.tasks) {
        data.tasks.forEach(task => {
            if (task.laneId === 'design' as any) {
                task.laneId = 'plan';
                migrated = true;
            }
            // Field rename: designPath -> planPath
            if ((task as any).designPath && !task.planPath) {
                task.planPath = (task as any).designPath;
                delete (task as any).designPath;
                migrated = true;
            }
        });
    }

    // 2. Migrate lanes configuration
    if (data.lanes) {
        const designLaneIndex = data.lanes.findIndex(l => l.id === 'design' as any);
        if (designLaneIndex !== -1) {
            data.lanes[designLaneIndex].id = 'plan';
            data.lanes[designLaneIndex].name = '计划';
            migrated = true;
        }

        // Ensure plan lane exists if missing (but develop exists)
        if (!data.lanes.find(l => l.id === 'plan')) {
            data.lanes.unshift({ id: 'plan', name: '计划', order: -1, color: '#8B5CF6' });
            migrated = true;
        }
    }

    if (migrated) {
        console.log(`[Migration] Migrated data for project: ${projectPath}`);
        await writeProjectData(projectPath, data);
    }

    return data;
}

export async function writeProjectData(projectPath: string, data: ProjectData): Promise<void> {
    const filePath = getProjectTasksFile(projectPath);
    const content = JSON.stringify(data, null, 2);
    await withLock(filePath, () => atomicWriteFile(filePath, content));

    // Manually trigger file watcher for immediate UI update
    fileWatcher.emit('change', {
        type: 'change',
        path: filePath,
        projectPath
    });
}

/**
 * Atomic patch for a single task across projects
 */
export async function patchTask(taskId: string, patch: any): Promise<boolean> {
    const config = await readGlobalConfig();
    for (const proj of config.projects) {
        const filePath = getProjectTasksFile(proj.path);

        // Use lock for the whole Read-Modify-Write cycle
        const result = await withLock(filePath, async () => {
            const data = await readProjectData(proj.path);
            const taskIndex = data.tasks.findIndex(t => t.id === taskId);

            if (taskIndex !== -1) {
                data.tasks[taskIndex] = {
                    ...data.tasks[taskIndex],
                    ...patch,
                    updatedAt: new Date().toISOString()
                };

                const content = JSON.stringify(data, null, 2);
                await atomicWriteFile(filePath, content);

                // Trigger file watcher for real-time updates
                fileWatcher.emit('change', {
                    type: 'change',
                    path: filePath,
                    projectPath: proj.path
                });

                return true;
            }
            return false;
        });

        if (result) return true;
    }
    return false;
}

export async function initializeProject(projectPath: string, projectId: string): Promise<ProjectData> {
    const data: ProjectData = {
        projectId,
        lanes: DEFAULT_LANES,
        tasks: [],
    };
    await writeProjectData(projectPath, data);
    return data;
}

export async function readTaskSummary(projectPath: string, taskId: string, retries = 3): Promise<any[]> {
    const { getProjectSummaryFile } = await import('./paths');
    const filePath = getProjectSummaryFile(projectPath, taskId);
    if (!existsSync(filePath)) return [];

    let lastError: any;
    for (let i = 0; i < retries; i++) {
        try {
            const content = await readFile(filePath, 'utf-8');
            if (!content || content.trim() === '') {
                // If it's an empty file, we treat it as an empty summary list but it shouldn't happen with atomic writes
                return [];
            }
            const data = JSON.parse(content);
            return Array.isArray(data) ? data : [data];
        } catch (err) {
            lastError = err;
            console.warn(`[JSONStore] Attempt ${i + 1} to read task summary failed: ${err instanceof Error ? err.message : String(err)}`);
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, 50 * (i + 1)));
            }
        }
    }

    return []; // Return empty on complete failure rather than crashing
}

export async function writeTaskSummary(projectPath: string, taskId: string, summary: any): Promise<void> {
    const { getProjectSummaryFile } = await import('./paths');
    const filePath = getProjectSummaryFile(projectPath, taskId);

    await withLock(filePath, async () => {
        const existing = await readTaskSummary(projectPath, taskId);
        existing.push(summary);

        const content = JSON.stringify(existing, null, 2);
        await atomicWriteFile(filePath, content);
    });
}

/**
 * Find a task across all projects
 */
export async function findTask(taskId: string): Promise<{ project: any, data: ProjectData, task: any } | null> {
    const config = await readGlobalConfig();
    for (const proj of config.projects) {
        const data = await readProjectData(proj.path);
        const task = data.tasks.find(t => t.id === taskId);
        if (task) return { project: proj, data, task };
    }
    return null;
}
