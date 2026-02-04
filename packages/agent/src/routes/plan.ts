import type { FastifyInstance } from 'fastify';
import { promises as fs } from 'fs';
import path from 'path';
import { readGlobalConfig, readProjectData, writeProjectData } from '../utils/json-store';

export async function planRoutes(fastify: FastifyInstance) {
    // 获取计划方案内容
    fastify.get<{
        Params: { projectId: string; taskId: string };
    }>('/api/projects/:projectId/tasks/:taskId/plan', async (request) => {
        const config = await readGlobalConfig();
        const project = config.projects.find(p => p.id === request.params.projectId);
        if (!project) throw { statusCode: 404, message: 'Project not found' };

        const data = await readProjectData(project.path);
        const task = data.tasks.find(t => t.id === request.params.taskId);
        if (!task) throw { statusCode: 404, message: 'Task not found' };

        if (!task.planPath) {
            throw { statusCode: 404, message: 'Plan document not found' };
        }

        // Plan files are now stored in project directory: {projectPath}/.clawwarden/plans/
        const planFullPath = path.join(project.path, task.planPath);
        const content = await fs.readFile(planFullPath, 'utf-8');

        return {
            planPath: task.planPath,
            content
        };
    });

    // 更新计划方案内容
    fastify.put<{
        Params: { projectId: string; taskId: string };
        Body: { content: string };
    }>('/api/projects/:projectId/tasks/:taskId/plan', async (request) => {
        const config = await readGlobalConfig();
        const project = config.projects.find(p => p.id === request.params.projectId);
        if (!project) throw { statusCode: 404, message: 'Project not found' };

        const data = await readProjectData(project.path);
        const task = data.tasks.find(t => t.id === request.params.taskId);
        if (!task) throw { statusCode: 404, message: 'Task not found' };

        if (!task.planPath) {
            // Create planPath if it doesn't exist
            const plansDir = path.join(project.path, '.clawwarden', 'plans');
            await fs.mkdir(plansDir, { recursive: true });
            task.planPath = `.clawwarden/plans/${request.params.taskId}-plan.md`;
        }

        // Plan files are now stored in project directory: {projectPath}/.clawwarden/plans/
        const planFullPath = path.join(project.path, task.planPath);
        await fs.writeFile(planFullPath, request.body.content, 'utf-8');

        task.updatedAt = new Date().toISOString();
        await writeProjectData(project.path, data);

        return {
            success: true,
            planPath: task.planPath
        };
    });
}
