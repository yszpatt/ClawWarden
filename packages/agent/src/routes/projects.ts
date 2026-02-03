import type { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import * as fs from 'fs';
import { readGlobalConfig, writeGlobalConfig, initializeProject, readProjectData } from '../utils/json-store';
import { installSkills } from '../services/skills-installer';
import type { ProjectRef } from '@clawwarden/shared';

const execAsync = promisify(exec);

/**
 * Check if a directory is a git repository
 */
async function isGitRepo(projectPath: string): Promise<boolean> {
    try {
        await execAsync('git rev-parse --git-dir', { cwd: projectPath });
        return true;
    } catch {
        return false;
    }
}

/**
 * Ensure the project directory is a git repository
 * If not, initialize it
 */
async function ensureGitRepo(projectPath: string): Promise<void> {
    const isGit = await isGitRepo(projectPath);
    if (!isGit) {
        console.log('[Project] Initializing git repository in:', projectPath);
        await execAsync('git init', { cwd: projectPath });
        // Create initial commit with .gitignore
        await execAsync('echo "node_modules/\\n.clawwarden/\\n.worktrees/" > .gitignore', { cwd: projectPath });
        await execAsync('git add .gitignore', { cwd: projectPath });
        await execAsync('git commit -m "Initial commit by ClawWarden"', { cwd: projectPath });
        console.log('[Project] Git repository initialized with initial commit');
    } else {
        console.log('[Project] Project is already a git repository');
    }
}

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

        // Check if project is already registered
        if (config.projects.find(p => p.path === path)) {
            throw { statusCode: 400, message: 'Project already registered' };
        }

        const project: ProjectRef = {
            id: uuid(),
            name,
            path,
            createdAt: new Date().toISOString(),
            lastOpenedAt: new Date().toISOString(),
        };

        const configPath = join(path, '.clawwarden');
        const isExisting = fs.existsSync(configPath);

        if (!isExisting) {
            console.log('[Project] New project detected, initializing...');
            await initializeProject(path, project.id);
            // Auto-initialize git if not already a git repo
            await ensureGitRepo(path);
        } else {
            console.log('[Project] Existing project detected, importing...');
            // Maybe we should update the projectId in tasks.json if it doesn't match?
            // For now, assume it's fine.
        }

        // Auto-install/update ClawWarden skills to the project
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
