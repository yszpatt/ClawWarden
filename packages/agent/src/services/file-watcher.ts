import chokidar from 'chokidar';
import { EventEmitter } from 'events';
import { getProjectTasksFile } from '../utils/paths';

export interface FileChangeEvent {
    type: 'change' | 'add' | 'unlink';
    path: string;
    projectPath: string;
}

export class FileWatcher extends EventEmitter {
    private watchers: Map<string, chokidar.FSWatcher> = new Map();

    watchProject(projectPath: string): void {
        if (this.watchers.has(projectPath)) {
            return;
        }

        const tasksFile = getProjectTasksFile(projectPath);
        const watcher = chokidar.watch(tasksFile, {
            persistent: true,
            ignoreInitial: true,
        });

        watcher.on('change', () => {
            this.emit('change', {
                type: 'change',
                path: tasksFile,
                projectPath,
            } as FileChangeEvent);
        });

        watcher.on('add', () => {
            this.emit('change', {
                type: 'add',
                path: tasksFile,
                projectPath,
            } as FileChangeEvent);
        });

        this.watchers.set(projectPath, watcher);
    }

    unwatchProject(projectPath: string): void {
        const watcher = this.watchers.get(projectPath);
        if (watcher) {
            watcher.close();
            this.watchers.delete(projectPath);
        }
    }

    async close(): Promise<void> {
        for (const watcher of this.watchers.values()) {
            await watcher.close();
        }
        this.watchers.clear();
    }
}

export const fileWatcher = new FileWatcher();
