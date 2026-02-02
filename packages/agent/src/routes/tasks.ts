import type { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import { readGlobalConfig, readProjectData, writeProjectData } from '../utils/json-store';
import { worktreeManager } from '../services/worktree-manager';
import { conversationStorage } from '../services/conversation-storage';
import type { Task } from '@antiwarden/shared';

const execAsync = promisify(exec);

export async function taskRoutes(fastify: FastifyInstance) {
    // Create task
    fastify.post<{
        Params: { projectId: string };
        Body: { title: string; description: string; prompt?: string; laneId: string };
    }>('/api/projects/:projectId/tasks', async (request) => {
        const config = await readGlobalConfig();
        const project = config.projects.find(p => p.id === request.params.projectId);
        if (!project) throw { statusCode: 404, message: 'Project not found' };

        const data = await readProjectData(project.path);
        const laneTasks = data.tasks.filter(t => t.laneId === request.body.laneId);

        const taskId = uuid();
        const task: Task = {
            id: taskId,
            title: request.body.title,
            description: request.body.description,
            prompt: request.body.prompt,
            laneId: request.body.laneId,
            order: laneTasks.length,
            status: 'idle',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: 'user',
        };

        // Create worktree immediately for the task
        try {
            const worktree = await worktreeManager.createWorktree(project.path, taskId);
            if (worktree) {
                task.worktree = worktree;
                console.log(`[Tasks] Created worktree for task ${taskId}:`, worktree.path);
            }
        } catch (error) {
            console.error(`[Tasks] Failed to create worktree for task ${taskId}:`, error);
            // Continue without worktree - non-fatal
        }

        data.tasks.push(task);
        await writeProjectData(project.path, data);
        return task;
    });

    // Get single task
    fastify.get<{
        Params: { projectId: string; taskId: string };
    }>('/api/projects/:projectId/tasks/:taskId', async (request) => {
        const config = await readGlobalConfig();
        const project = config.projects.find(p => p.id === request.params.projectId);
        if (!project) throw { statusCode: 404, message: 'Project not found' };

        const data = await readProjectData(project.path);
        const task = data.tasks.find(t => t.id === request.params.taskId);
        if (!task) throw { statusCode: 404, message: 'Task not found' };

        return { task };
    });

    // Update task
    fastify.patch<{
        Params: { projectId: string; taskId: string };
        Body: Partial<Task>;
    }>('/api/projects/:projectId/tasks/:taskId', async (request) => {
        const config = await readGlobalConfig();
        const project = config.projects.find(p => p.id === request.params.projectId);
        if (!project) throw { statusCode: 404, message: 'Project not found' };

        const data = await readProjectData(project.path);
        const taskIndex = data.tasks.findIndex(t => t.id === request.params.taskId);
        if (taskIndex === -1) throw { statusCode: 404, message: 'Task not found' };

        data.tasks[taskIndex] = {
            ...data.tasks[taskIndex],
            ...request.body,
            updatedAt: new Date().toISOString(),
        };

        await writeProjectData(project.path, data);
        return data.tasks[taskIndex];
    });

    // Delete task
    fastify.delete<{
        Params: { projectId: string; taskId: string };
    }>('/api/projects/:projectId/tasks/:taskId', async (request) => {
        const config = await readGlobalConfig();
        const project = config.projects.find(p => p.id === request.params.projectId);
        if (!project) throw { statusCode: 404, message: 'Project not found' };

        const data = await readProjectData(project.path);
        const task = data.tasks.find(t => t.id === request.params.taskId);
        const taskId = request.params.taskId;

        // Delete worktree if exists
        if (task?.worktree) {
            try {
                console.log(`[Tasks] Removing worktree for task ${taskId}:`, task.worktree.path);
                await worktreeManager.removeWorktree(project.path, task.worktree.path);

                // Also delete the branch
                try {
                    await execAsync(`git branch -D "${task.worktree.branch}"`, { cwd: project.path });
                    console.log(`[Tasks] Deleted branch: ${task.worktree.branch}`);
                } catch (branchError: any) {
                    console.log(`[Tasks] Could not delete branch (may not exist): ${branchError.message}`);
                }
            } catch (error: any) {
                console.error(`[Tasks] Failed to remove worktree:`, error);
                // Continue with task deletion even if worktree removal fails
            }
        }

        // Delete conversation session
        try {
            await conversationStorage.delete(project.path, taskId);
            console.log(`[Tasks] Deleted conversation session for task: ${taskId}`);
        } catch (error: any) {
            console.log(`[Tasks] Could not delete conversation session: ${error.message}`);
        }

        // Delete design file if exists
        try {
            const designPath = path.join(project.path, '.antiwarden', 'designs', `${taskId}-design.md`);
            await fs.unlink(designPath);
            console.log(`[Tasks] Deleted design file for task: ${taskId}`);
        } catch (error: any) {
            // Design file may not exist, ignore
        }

        data.tasks = data.tasks.filter(t => t.id !== taskId);
        await writeProjectData(project.path, data);
        return { success: true };
    });

    // Reorder tasks (for drag-drop)
    fastify.post<{
        Params: { projectId: string };
        Body: { taskId: string; targetLaneId: string; targetOrder: number };
    }>('/api/projects/:projectId/tasks/reorder', async (request) => {
        const config = await readGlobalConfig();
        const project = config.projects.find(p => p.id === request.params.projectId);
        if (!project) throw { statusCode: 404, message: 'Project not found' };

        const { taskId, targetLaneId, targetOrder } = request.body;
        const data = await readProjectData(project.path);

        const taskIndex = data.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) throw { statusCode: 404, message: 'Task not found' };

        const task = data.tasks[taskIndex];
        const oldLaneId = task.laneId;

        // Update task lane and order
        task.laneId = targetLaneId;
        task.order = targetOrder;
        task.updatedAt = new Date().toISOString();

        // Reorder other tasks in affected lanes
        data.tasks.forEach(t => {
            if (t.id === taskId) return;
            if (t.laneId === targetLaneId && t.order >= targetOrder) {
                t.order += 1;
            }
            if (t.laneId === oldLaneId && oldLaneId !== targetLaneId && t.order > task.order) {
                t.order -= 1;
            }
        });

        await writeProjectData(project.path, data);
        return task;
    });
    // Batch update tasks (for drag-drop syncing)
    fastify.put<{
        Params: { projectId: string };
        Body: { updates: { id: string; laneId?: string; order?: number }[] };
    }>('/api/projects/:projectId/tasks/batch', async (request) => {
        const config = await readGlobalConfig();
        const project = config.projects.find(p => p.id === request.params.projectId);
        if (!project) throw { statusCode: 404, message: 'Project not found' };

        const data = await readProjectData(project.path);
        const updates = request.body.updates;
        const now = new Date().toISOString();

        // Check for running tasks - prevent moving them
        for (const update of updates) {
            const task = data.tasks.find(t => t.id === update.id);
            if (task && task.status === 'running' && update.laneId && update.laneId !== task.laneId) {
                throw { statusCode: 400, message: '运行中的任务无法移动，请先停止任务' };
            }
        }

        // Apply updates and track lane changes for worktree creation
        const worktreeCreations: { taskId: string; projectPath: string }[] = [];

        for (const update of updates) {
            const taskIndex = data.tasks.findIndex(t => t.id === update.id);
            if (taskIndex !== -1) {
                const task = data.tasks[taskIndex];
                const oldLaneId = task.laneId;
                const newLaneId = update.laneId || oldLaneId;

                // Check if moving TO develop or test lane from a different lane
                const isMovingToDev = (newLaneId === 'develop' || newLaneId === 'test') && oldLaneId !== newLaneId;

                // If moving to dev/test and no worktree exists, schedule worktree creation
                if (isMovingToDev && !task.worktree) {
                    worktreeCreations.push({ taskId: task.id, projectPath: project.path });
                }

                data.tasks[taskIndex] = {
                    ...task,
                    ...update,
                    updatedAt: now,
                };
            }
        }

        await writeProjectData(project.path, data);

        // Create worktrees for tasks that moved to develop/test
        // Import worktree manager dynamically to avoid circular deps
        if (worktreeCreations.length > 0) {
            const { worktreeManager } = await import('../services/worktree-manager');
            for (const wt of worktreeCreations) {
                try {
                    const worktree = await worktreeManager.createWorktree(wt.projectPath, wt.taskId);
                    // Update task with worktree info (only if worktree was created)
                    if (worktree) {
                        const taskIndex = data.tasks.findIndex(t => t.id === wt.taskId);
                        if (taskIndex !== -1) {
                            data.tasks[taskIndex].worktree = worktree;
                            data.tasks[taskIndex].updatedAt = new Date().toISOString();
                        }
                    }
                } catch (error) {
                    console.error(`Failed to create worktree for task ${wt.taskId}:`, error);
                }
            }
            // Save again with worktree info
            await writeProjectData(project.path, data);
        }

        return { success: true };
    });
}

