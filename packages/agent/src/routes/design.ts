import type { FastifyInstance } from 'fastify';
import { promises as fs } from 'fs';
import path from 'path';
import { readGlobalConfig, readProjectData, writeProjectData } from '../utils/json-store';

export async function designRoutes(fastify: FastifyInstance) {
    // 获取设计方案内容
    fastify.get<{
        Params: { projectId: string; taskId: string };
    }>('/api/projects/:projectId/tasks/:taskId/design', async (request) => {
        const config = await readGlobalConfig();
        const project = config.projects.find(p => p.id === request.params.projectId);
        if (!project) throw { statusCode: 404, message: 'Project not found' };

        const data = await readProjectData(project.path);
        const task = data.tasks.find(t => t.id === request.params.taskId);
        if (!task) throw { statusCode: 404, message: 'Task not found' };

        if (!task.designPath) {
            throw { statusCode: 404, message: 'Design document not found' };
        }

        // Design files are now stored in project directory: {projectPath}/.clawwarden/designs/
        const designFullPath = path.join(project.path, task.designPath);
        const content = await fs.readFile(designFullPath, 'utf-8');

        return {
            designPath: task.designPath,
            content
        };
    });

    // 更新设计方案内容
    fastify.put<{
        Params: { projectId: string; taskId: string };
        Body: { content: string };
    }>('/api/projects/:projectId/tasks/:taskId/design', async (request) => {
        const config = await readGlobalConfig();
        const project = config.projects.find(p => p.id === request.params.projectId);
        if (!project) throw { statusCode: 404, message: 'Project not found' };

        const data = await readProjectData(project.path);
        const task = data.tasks.find(t => t.id === request.params.taskId);
        if (!task) throw { statusCode: 404, message: 'Task not found' };

        if (!task.designPath) {
            throw { statusCode: 400, message: 'Task has no design document' };
        }

        // Design files are now stored in project directory: {projectPath}/.clawwarden/designs/
        const designFullPath = path.join(project.path, task.designPath);
        await fs.writeFile(designFullPath, request.body.content, 'utf-8');

        task.updatedAt = new Date().toISOString();
        await writeProjectData(project.path, data);

        return {
            success: true,
            designPath: task.designPath
        };
    });
}
