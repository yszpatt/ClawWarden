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
