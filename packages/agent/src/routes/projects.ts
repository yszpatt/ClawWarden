import type { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import * as fs from 'fs';
import { readGlobalConfig, writeGlobalConfig, initializeProject, readProjectData } from '../utils/json-store';
import { installClaudeDirectory, hasClaudeInstalled } from '../services/claude-installer';
import type { ProjectRef } from '@vibewarden/shared';

const execAsync = promisify(exec);

/**
 * Check if a directory is inside a git repository
 */
async function isInsideGitRepo(projectPath: string): Promise<boolean> {
    try {
        await execAsync('git rev-parse --is-inside-work-tree', { cwd: projectPath });
        return true;
    } catch {
        return false;
    }
}

/**
 * Check if a directory is the root of a git repository
 */
async function isGitRoot(projectPath: string): Promise<boolean> {
    try {
        const { stdout } = await execAsync('git rev-parse --show-toplevel', { cwd: projectPath });
        // Normalize paths for comparison
        const toplevel = fs.realpathSync(stdout.trim());
        const current = fs.realpathSync(projectPath);
        return toplevel === current;
    } catch {
        return false;
    }
}

/**
 * Ensure the project directory is a git repository or inside one
 * If not tracked at all, initialize it
 */
async function ensureGitRepo(projectPath: string): Promise<void> {
    const isInside = await isInsideGitRepo(projectPath);

    if (!isInside) {
        console.log('[Project] Directory not tracked by Git. Initializing new repository in:', projectPath);
        await execAsync('git init', { cwd: projectPath });

        // Create initial .gitignore if it doesn't exist
        const gitignorePath = join(projectPath, '.gitignore');
        const defaultIgnore = 'node_modules/\n.vibewarden/\n.worktrees/\n.claude/\n';

        if (!fs.existsSync(gitignorePath)) {
            await fs.promises.writeFile(gitignorePath, defaultIgnore);
        } else {
            const content = await fs.promises.readFile(gitignorePath, 'utf-8');
            if (!content.includes('.vibewarden/')) {
                await fs.promises.appendFile(gitignorePath, '\n# VibeWarden\n.vibewarden/\n.worktrees/\n.claude/\n');
            }
        }

        await execAsync('git add .gitignore', { cwd: projectPath });
        // Check if there are other files to add for initial commit
        const { stdout: status } = await execAsync('git status --porcelain', { cwd: projectPath });
        if (status.trim()) {
            await execAsync('git add .', { cwd: projectPath });
        }

        await execAsync('git commit -m "Initial commit by VibeWarden"', { cwd: projectPath });
        console.log('[Project] Git repository initialized with initial commit');
    } else {
        const isRoot = await isGitRoot(projectPath);
        if (isRoot) {
            console.log('[Project] Project is a Git repository root');
        } else {
            console.log('[Project] Project is inside a Git repository (subfolder/monorepo)');
        }

        // Even if it's already a repo, ensure our critical files are ignored in the nearest .gitignore
        // This is a bit tricky as the .gitignore might be in a parent dir.
        // For now, we at least ensure the project-local .gitignore has them if it exists.
        const gitignorePath = join(projectPath, '.gitignore');
        if (fs.existsSync(gitignorePath)) {
            const content = await fs.promises.readFile(gitignorePath, 'utf-8');
            if (!content.includes('.vibewarden/')) {
                await fs.promises.appendFile(gitignorePath, '\n# VibeWarden\n.vibewarden/\n.worktrees/\n.claude/\n');
                console.log('[Project] Updated existing .gitignore with VibeWarden paths');
            }
        }
    }
}

export async function projectRoutes(fastify: FastifyInstance) {
    // List all projects
    fastify.get('/api/projects', async () => {
        const config = await readGlobalConfig();
        return config.projects;
    });

    // Register a new project
    fastify.post<{
        Body: {
            name: string;
            path: string;
            inheritGlobalRules?: boolean;
        }
    }>('/api/projects', async (request) => {
        const { name, path, inheritGlobalRules = false } = request.body;
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

        const vibewardenConfigPath = join(path, '.vibewarden');
        const hasClawwarden = fs.existsSync(vibewardenConfigPath);
        const hasClaude = hasClaudeInstalled(path);

        const { generateProjectLaneConfig, PROJECT_LANE_CONFIG_FILE } = await import('../utils/lane-config-loader');

        if (!hasClawwarden && !hasClaude) {
            console.log('[Project] New project detected, initializing...');
            await initializeProject(path, project.id);
        } else {
            console.log('[Project] Existing project detected, importing...');
        }

        // Always ensure git repo for all projects to guarantee worktree support
        await ensureGitRepo(path);

        // Ensure lane config exists
        if (!fs.existsSync(join(path, PROJECT_LANE_CONFIG_FILE))) {
            await generateProjectLaneConfig(path);
        }

        // Install .claude directory (always runs, skips if exists)
        const installResult = await installClaudeDirectory(path, {
            inheritGlobalRules,
            createVibeWardenIntegration: true,
            overwriteExisting: false
        });

        if (installResult.created.length > 0) {
            fastify.log.info(`Created .claude files: ${installResult.created.join(', ')}`);
        }

        if (installResult.errors.length > 0) {
            fastify.log.error(`Errors installing .claude: ${installResult.errors.join(', ')}`);
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

        // Also ensure lane config exists for existing projects being opened
        const { generateProjectLaneConfig, PROJECT_LANE_CONFIG_FILE } = await import('../utils/lane-config-loader');
        if (!fs.existsSync(join(project.path, PROJECT_LANE_CONFIG_FILE))) {
            await generateProjectLaneConfig(project.path);
        }

        return { project, data };
    });

    // Get merged lane configurations
    fastify.get<{ Params: { id: string } }>('/api/projects/:id/lane-configs', async (request) => {
        const config = await readGlobalConfig();
        const project = config.projects.find(p => p.id === request.params.id);
        if (!project) throw { statusCode: 404, message: 'Project not found' };

        // We need an utility to get all merged configs for a project
        const { DEFAULT_LANE_CONFIGS } = await import('@vibewarden/shared');
        const { getMergedLaneConfig } = await import('../utils/lane-config-loader');

        const mergedConfigs: Record<string, any> = {};

        for (const [laneId, defaultConfig] of Object.entries(DEFAULT_LANE_CONFIGS)) {
            mergedConfigs[laneId] = await getMergedLaneConfig(laneId, project.path, defaultConfig as any);
        }

        return mergedConfigs;
    });

    // Delete project
    fastify.delete<{ Params: { id: string } }>('/api/projects/:id', async (request) => {
        const config = await readGlobalConfig();
        config.projects = config.projects.filter(p => p.id !== request.params.id);
        await writeGlobalConfig(config);
        return { success: true };
    });
}
