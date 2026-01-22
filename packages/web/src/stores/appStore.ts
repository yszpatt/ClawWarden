import { create } from 'zustand';
import type { Task, ProjectRef, ProjectData } from '@antiwarden/shared';

interface AppState {
    // Current project
    currentProject: ProjectRef | null;
    projectData: ProjectData | null;

    // UI state
    selectedTaskId: string | null;
    sidebarOpen: boolean;

    // Actions
    setCurrentProject: (project: ProjectRef | null) => void;
    setProjectData: (data: ProjectData | null) => void;
    selectTask: (taskId: string | null) => void;
    openSidebar: () => void;
    closeSidebar: () => void;
    updateTask: (taskId: string, updates: Partial<Task>) => void;
    addTask: (task: Task) => void;
}

export const useAppStore = create<AppState>((set) => ({
    currentProject: null,
    projectData: null,
    selectedTaskId: null,
    sidebarOpen: false,

    setCurrentProject: (project) => set({ currentProject: project }),

    setProjectData: (data) => set({ projectData: data }),

    selectTask: (taskId) => set({ selectedTaskId: taskId, sidebarOpen: !!taskId }),

    openSidebar: () => set({ sidebarOpen: true }),

    closeSidebar: () => set({ sidebarOpen: false, selectedTaskId: null }),

    updateTask: (taskId, updates) =>
        set((state) => {
            if (!state.projectData) return state;
            return {
                projectData: {
                    ...state.projectData,
                    tasks: state.projectData.tasks.map((task) =>
                        task.id === taskId ? { ...task, ...updates } : task
                    ),
                },
            };
        }),

    addTask: (task) =>
        set((state) => {
            if (!state.projectData) return state;
            return {
                projectData: {
                    ...state.projectData,
                    tasks: [...state.projectData.tasks, task],
                },
            };
        }),
}));
