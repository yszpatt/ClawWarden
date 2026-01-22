import type { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import { readGlobalConfig, readProjectData, writeProjectData } from '../utils/json-store';
import type { Task } from '@antiwarden/shared';

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

        const task: Task = {
            id: uuid(),
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

        data.tasks.push(task);
        await writeProjectData(project.path, data);
        return task;
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
        data.tasks = data.tasks.filter(t => t.id !== request.params.taskId);
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
}
