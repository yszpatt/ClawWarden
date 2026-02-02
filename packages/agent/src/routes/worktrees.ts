import type { FastifyInstance } from 'fastify';
import { readGlobalConfig, readProjectData, writeProjectData } from '../utils/json-store';
import { worktreeManager } from '../services/worktree-manager';

export async function worktreeRoutes(fastify: FastifyInstance) {
    // Create worktree for a task (when moving to develop lane)
    fastify.post<{
        Params: { projectId: string; taskId: string };
        Body: { baseBranch?: string };
    }>('/api/projects/:projectId/tasks/:taskId/worktree', async (request) => {
        const config = await readGlobalConfig();
        const project = config.projects.find(p => p.id === request.params.projectId);
        if (!project) throw { statusCode: 404, message: 'Project not found' };

        const data = await readProjectData(project.path);
        const task = data.tasks.find(t => t.id === request.params.taskId);
        if (!task) throw { statusCode: 404, message: 'Task not found' };

        // Check if worktree already exists
        if (task.worktree) {
            return { worktree: task.worktree, created: false };
        }

        // Create worktree
        const worktree = await worktreeManager.createWorktree(
            project.path,
            task.id,
            request.body.baseBranch
        );

        if (!worktree) {
            throw { statusCode: 400, message: 'Project is not a git repository, cannot create worktree' };
        }

        // Update task with worktree info
        task.worktree = worktree;
        task.updatedAt = new Date().toISOString();
        await writeProjectData(project.path, data);

        return { worktree, created: true };
    });

    // Merge worktree (when moving to archived from pending-merge)
    fastify.post<{
        Params: { projectId: string; taskId: string };
        Body: { targetBranch?: string };
    }>('/api/projects/:projectId/tasks/:taskId/merge', async (request) => {
        const config = await readGlobalConfig();
        const project = config.projects.find(p => p.id === request.params.projectId);
        if (!project) throw { statusCode: 404, message: 'Project not found' };

        const data = await readProjectData(project.path);
        const task = data.tasks.find(t => t.id === request.params.taskId);
        if (!task) throw { statusCode: 404, message: 'Task not found' };

        if (!task.worktree) {
            throw { statusCode: 400, message: 'Task has no worktree' };
        }

        const result = await worktreeManager.mergeWorktree(
            project.path,
            task.worktree.path,
            task.worktree.branch,
            request.body.targetBranch
        );

        if (result.success) {
            // Update task: mark worktree as removed but keep info for historical tracking
            if (task.worktree) {
                task.worktree.removedAt = new Date().toISOString();
            }
            task.laneId = 'archived';
            task.status = 'completed';
            task.updatedAt = new Date().toISOString();
            await writeProjectData(project.path, data);
        }

        return result;
    });

    // Remove worktree (when moving to deprecated)
    fastify.delete<{
        Params: { projectId: string; taskId: string };
    }>('/api/projects/:projectId/tasks/:taskId/worktree', async (request) => {
        const config = await readGlobalConfig();
        const project = config.projects.find(p => p.id === request.params.projectId);
        if (!project) throw { statusCode: 404, message: 'Project not found' };

        const data = await readProjectData(project.path);
        const task = data.tasks.find(t => t.id === request.params.taskId);
        if (!task) throw { statusCode: 404, message: 'Task not found' };

        if (task.worktree) {
            await worktreeManager.removeWorktree(project.path, task.worktree.path);
            // Mark worktree as removed but keep info for historical tracking
            task.worktree.removedAt = new Date().toISOString();
            task.updatedAt = new Date().toISOString();
            await writeProjectData(project.path, data);
        }

        return { success: true };
    });

    // Cleanup orphaned worktrees
    fastify.post<{
        Params: { projectId: string };
    }>('/api/projects/:projectId/worktrees/cleanup', async (request) => {
        const config = await readGlobalConfig();
        const project = config.projects.find(p => p.id === request.params.projectId);
        if (!project) throw { statusCode: 404, message: 'Project not found' };

        await worktreeManager.cleanup(project.path);
        return { success: true };
    });
}
