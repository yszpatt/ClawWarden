import { homedir } from 'os';
import { join } from 'path';

export const GLOBAL_CONFIG_DIR = join(homedir(), '.clawwarden');
export const GLOBAL_CONFIG_FILE = join(GLOBAL_CONFIG_DIR, 'config.json');

export function getProjectConfigDir(projectPath: string): string {
    return join(projectPath, '.clawwarden');
}

export function getProjectTasksFile(projectPath: string): string {
    return join(getProjectConfigDir(projectPath), 'tasks.json');
}

export function getProjectSummaryDir(projectPath: string): string {
    return join(getProjectConfigDir(projectPath), 'summary');
}

export function getProjectSummaryFile(projectPath: string, taskId: string): string {
    return join(getProjectSummaryDir(projectPath), `${taskId}.json`);
}
