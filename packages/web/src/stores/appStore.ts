import { create } from 'zustand';
import type { Task, ProjectRef, ProjectData } from '@antiwarden/shared';
import { batchUpdateTasks, updateTask as apiUpdateTask, deleteTask as apiDeleteTask, fetchProjectData } from '../api/projects';

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
    updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
    removeTask: (taskId: string) => Promise<void>;
    addTask: (task: Task) => void;
    moveTask: (taskId: string, targetLaneId: string, newIndex: number) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
    currentProject: null,
    projectData: null,
    selectedTaskId: null,
    sidebarOpen: false,

    setCurrentProject: (project) => set({ currentProject: project }),

    setProjectData: (data) => set({ projectData: data }),

    selectTask: (taskId) => set({ selectedTaskId: taskId, sidebarOpen: !!taskId }),

    openSidebar: () => set({ sidebarOpen: true }),

    closeSidebar: () => set({ sidebarOpen: false, selectedTaskId: null }),

    updateTask: async (taskId, updates) => {
        const state = get();
        if (!state.currentProject || !state.projectData) return;

        // Optimistic update
        set((s) => {
            if (!s.projectData) return s;
            return {
                projectData: {
                    ...s.projectData,
                    tasks: s.projectData.tasks.map((task) =>
                        task.id === taskId ? { ...task, ...updates } : task
                    ),
                },
            };
        });

        try {
            await apiUpdateTask(state.currentProject.id, taskId, updates);
        } catch (error) {
            console.error('Failed to update task:', error);
            // Revert needed in real app
        }
    },

    removeTask: async (taskId) => {
        const state = get();
        if (!state.currentProject || !state.projectData) return;

        // Optimistic update
        set((s) => {
            if (!s.projectData) return s;
            return {
                projectData: {
                    ...s.projectData,
                    tasks: s.projectData.tasks.filter((t) => t.id !== taskId),
                },
                // Close sidebar if selected task is deleted
                selectedTaskId: s.selectedTaskId === taskId ? null : s.selectedTaskId,
                sidebarOpen: s.selectedTaskId === taskId ? false : s.sidebarOpen,
            };
        });

        try {
            await apiDeleteTask(state.currentProject.id, taskId);
        } catch (error) {
            console.error('Failed to delete task:', error);
        }
    },

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

    moveTask: async (taskId, targetLaneId, newIndex) => {
        console.log('appStore moveTask called:', { taskId, targetLaneId, newIndex });
        const state = get();
        if (!state.projectData || !state.currentProject) {
            console.error('appStore moveTask aborted: missing data', { hasProjectdata: !!state.projectData, hasCurrentProject: !!state.currentProject });
            return;
        }

        const { tasks } = state.projectData;
        const task = tasks.find((t) => t.id === taskId);
        if (!task) return;

        const sourceLaneId = task.laneId;
        const oldIndex = task.order;

        // Create a new array of tasks to modify (shallow clone items)
        const newTasks = tasks.map(t => ({ ...t }));

        // Remove task from source
        // We need to shift orders in source lane
        newTasks.forEach(t => {
            if (t.laneId === sourceLaneId && t.order > oldIndex) {
                t.order--;
            }
        });

        // Insert into target
        // Shift orders in target lane
        newTasks.forEach(t => {
            if (t.laneId === targetLaneId && t.order >= newIndex) {
                if (t.id !== taskId) t.order++;
            }
        });

        // Update moved task
        const movedTaskIndex = newTasks.findIndex(t => t.id === taskId);
        if (movedTaskIndex !== -1) {
            newTasks[movedTaskIndex] = {
                ...newTasks[movedTaskIndex],
                laneId: targetLaneId,
                order: newIndex
            };
        }

        console.log('moveTask computed:', newTasks.map(t => ({ id: t.id, lane: t.laneId, order: t.order })));


        // Apply local update
        set((s) => s.projectData ? { projectData: { ...s.projectData, tasks: newTasks } } : s);

        // Calculate updates for API
        // We only need to send tasks that changed order or lane
        const updates = newTasks
            .filter(t => {
                const oldT = tasks.find(ot => ot.id === t.id);
                return oldT && (t.laneId !== oldT.laneId || t.order !== oldT.order);
            })
            .map(t => ({ id: t.id, laneId: t.laneId, order: t.order }));

        try {
            await batchUpdateTasks(state.currentProject.id, updates);

            // Refetch project data to get worktree info created by server
            const { data } = await fetchProjectData(state.currentProject.id);
            set({ projectData: data });
        } catch (error) {
            console.error('Failed to save task order:', error);
            // Revert would go here, maybe reload project data
        }
    },
}));
