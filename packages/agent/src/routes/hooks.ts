import type { FastifyInstance } from 'fastify';
import { readGlobalConfig, readProjectData, writeProjectData } from '../utils/json-store';
import type { TaskStatus } from '@clawwarden/shared';

/**
 * Hook routes for external triggers (e.g., Claude Code hooks)
 * These endpoints allow external processes to update task status
 */
export async function hookRoutes(fastify: FastifyInstance) {
    /**
     * Task stopped hook - called when task execution is interrupted
     * POST /api/hooks/task-stopped
     */
    fastify.post<{
        Body: { taskId: string; projectId?: string };
    }>('/api/hooks/task-stopped', async (request) => {
        const { taskId, projectId } = request.body;

        if (!taskId) {
            throw { statusCode: 400, message: 'taskId is required' };
        }

        await updateTaskStatusByHook(taskId, 'idle', projectId);
        return { success: true, message: 'Task status updated to idle' };
    });

    /**
     * Task complete hook - called when task execution completes
     * POST /api/hooks/task-complete
     * Optional: moveTo parameter to automatically move to another lane
     */
    fastify.post<{
        Body: { taskId: string; projectId?: string; moveTo?: string };
    }>('/api/hooks/task-complete', async (request) => {
        const { taskId, projectId, moveTo } = request.body;

        if (!taskId) {
            throw { statusCode: 400, message: 'taskId is required' };
        }

        await updateTaskStatusByHook(taskId, 'completed', projectId, moveTo);
        return { success: true, message: `Task completed${moveTo ? `, moved to ${moveTo}` : ''}` };
    });

    /**
     * Task failed hook - called when task execution fails
     * POST /api/hooks/task-failed
     */
    fastify.post<{
        Body: { taskId: string; projectId?: string; reason?: string };
    }>('/api/hooks/task-failed', async (request) => {
        const { taskId, projectId, reason } = request.body;

        if (!taskId) {
            throw { statusCode: 400, message: 'taskId is required' };
        }

        await updateTaskStatusByHook(taskId, 'failed', projectId);
        console.log(`[Hooks] Task ${taskId} marked as failed. Reason: ${reason || 'Not specified'}`);
        return { success: true, message: 'Task marked as failed' };
    });

    /**
     * Move task to lane - used for workflow transitions
     * POST /api/hooks/task-move
     */
    fastify.post<{
        Body: { taskId: string; projectId?: string; laneId: string };
    }>('/api/hooks/task-move', async (request) => {
        const { taskId, projectId, laneId } = request.body;

        if (!taskId || !laneId) {
            throw { statusCode: 400, message: 'taskId and laneId are required' };
        }

        const validLanes = ['plan', 'develop', 'test', 'pending-merge', 'archived'];
        if (!validLanes.includes(laneId)) {
            throw { statusCode: 400, message: `Invalid lane: ${laneId}` };
        }

        await updateTaskStatusByHook(taskId, undefined, projectId, laneId);
        return { success: true, message: `Task moved to ${laneId}` };
    });
}

/**
 * Helper function to update task status from hook endpoints
 */
async function updateTaskStatusByHook(
    taskId: string,
    status?: TaskStatus,
    projectId?: string,
    laneId?: string
): Promise<void> {
    const config = await readGlobalConfig();

    // If projectId is provided, search only that project
    const projects = projectId
        ? config.projects.filter(p => p.id === projectId)
        : config.projects;

    for (const proj of projects) {
        const data = await readProjectData(proj.path);
        const taskIndex = data.tasks.findIndex(t => t.id === taskId);

        if (taskIndex !== -1) {
            if (status) {
                data.tasks[taskIndex].status = status;
            }
            if (laneId) {
                data.tasks[taskIndex].laneId = laneId;
            }
            data.tasks[taskIndex].updatedAt = new Date().toISOString();

            await writeProjectData(proj.path, data);
            console.log(`[Hooks] Updated task ${taskId}: status=${status || 'unchanged'}, lane=${laneId || 'unchanged'}`);
            return;
        }
    }

    throw { statusCode: 404, message: 'Task not found' };
}
