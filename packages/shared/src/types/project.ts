import type { Lane } from './lane';
import type { Task } from './task';

export interface ProjectRef {
    id: string;
    name: string;
    path: string;
    createdAt: string;
    lastOpenedAt: string;
}

export interface ProjectData {
    projectId: string;
    lanes: Lane[];
    tasks: Task[];
}
