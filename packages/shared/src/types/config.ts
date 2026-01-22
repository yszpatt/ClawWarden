import type { ProjectRef } from './project';

export interface GlobalSettings {
    agentPort: number;
    theme: 'light' | 'dark';
}

export interface GlobalConfig {
    version: string;
    projects: ProjectRef[];
    settings: GlobalSettings;
}
