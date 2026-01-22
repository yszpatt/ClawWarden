import type { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import { readGlobalConfig, writeGlobalConfig, initializeProject, readProjectData } from '../utils/json-store';
import { installSkills } from '../services/skills-installer';
import type { ProjectRef } from '@antiwarden/shared';

export async function projectRoutes(fastify: FastifyInstance) {
    // List all projects
    fastify.get('/api/projects', async () => {
        const config = await readGlobalConfig();
        return config.projects;
    });

    // Register a new project
    fastify.post<{ Body: { name: string; path: string } }>('/api/projects', async (request) => {
        const { name, path } = request.body;
        const config = await readGlobalConfig();

        const project: ProjectRef = {
            id: uuid(),
            name,
            path,
            createdAt: new Date().toISOString(),
            lastOpenedAt: new Date().toISOString(),
        };

        await initializeProject(path, project.id);

        // Auto-install AntiWarden skills to the project
        const installedSkills = await installSkills(path);
        if (installedSkills.length > 0) {
            fastify.log.info(`Installed skills: ${installedSkills.join(', ')}`);
        }

        config.projects.push(project);
        await writeGlobalConfig(config);

        return project;
    });

    // Get project data
    fastify.get<{ Params: { id: string } }>('/api/projects/:id', async (request) => {
        const config = await readGlobalConfig();
        const project = config.projects.find(p => p.id === request.params.id);
        if (!project) throw { statusCode: 404, message: 'Project not found' };

        const data = await readProjectData(project.path);
        return { project, data };
    });

    // Delete project
    fastify.delete<{ Params: { id: string } }>('/api/projects/:id', async (request) => {
        const config = await readGlobalConfig();
        config.projects = config.projects.filter(p => p.id !== request.params.id);
        await writeGlobalConfig(config);
        return { success: true };
    });
}
