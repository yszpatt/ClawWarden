import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import type { GlobalConfig, ProjectData } from '@antiwarden/shared';
import { DEFAULT_LANES } from '@antiwarden/shared';
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
            settings: { agentPort: 3001, theme: 'dark' },
        };
        await writeGlobalConfig(defaultConfig);
        return defaultConfig;
    }
    const content = await readFile(GLOBAL_CONFIG_FILE, 'utf-8');
    return JSON.parse(content);
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
