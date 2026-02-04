import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import type { GlobalConfig, ProjectData } from '@clawwarden/shared';
import { DEFAULT_LANES, DEFAULT_SETTINGS } from '@clawwarden/shared';
import { GLOBAL_CONFIG_FILE, getProjectTasksFile } from './paths';

export async function ensureDir(filePath: string): Promise<void> {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
    }
}

export async function readGlobalConfig(): Promise<GlobalConfig> {
    if (!existsSync(GLOBAL_CONFIG_FILE)) {
        const defaultConfig: GlobalConfig = {
            version: '1.0.0',
            projects: [],
            settings: DEFAULT_SETTINGS,
        };
        await writeGlobalConfig(defaultConfig);
        return defaultConfig;
    }
    const content = await readFile(GLOBAL_CONFIG_FILE, 'utf-8');
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
    // This addresses the user request to have default prompts visible in config file
    await writeGlobalConfig(config);

    return config;
}

export async function writeGlobalConfig(config: GlobalConfig): Promise<void> {
    await ensureDir(GLOBAL_CONFIG_FILE);
    await writeFile(GLOBAL_CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function readProjectData(projectPath: string): Promise<ProjectData> {
    const filePath = getProjectTasksFile(projectPath);
    if (!existsSync(filePath)) {
        throw new Error(`Project not initialized: ${projectPath}`);
    }
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
}

export async function writeProjectData(projectPath: string, data: ProjectData): Promise<void> {
    const filePath = getProjectTasksFile(projectPath);
    await ensureDir(filePath);
    await writeFile(filePath, JSON.stringify(data, null, 2));
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

export async function readTaskSummary(projectPath: string, taskId: string): Promise<any[]> {
    const { getProjectSummaryFile } = await import('./paths');
    const filePath = getProjectSummaryFile(projectPath, taskId);
    if (!existsSync(filePath)) return [];
    const content = await readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    return Array.isArray(data) ? data : [data];
}

export async function writeTaskSummary(projectPath: string, taskId: string, summary: any): Promise<void> {
    const { getProjectSummaryFile } = await import('./paths');
    const filePath = getProjectSummaryFile(projectPath, taskId);
    await ensureDir(filePath);

    // Append to existing array if it exists
    let existing: any[] = [];
    if (existsSync(filePath)) {
        const content = await readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        existing = Array.isArray(data) ? data : [data];
    }

    // Check for duplicates of the same type/phase to avoid re-adding during retries?
    // For now, just pushing is simpler.
    existing.push(summary);

    await writeFile(filePath, JSON.stringify(existing, null, 2));
}
