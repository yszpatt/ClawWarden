import type { FastifyInstance } from 'fastify';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { readGlobalConfig, readProjectData, writeProjectData } from '../utils/json-store';
import { worktreeManager } from '../services/worktree-manager';
import { agentManager } from '../services/agent-manager';
import type { Lane, ProjectData } from '@antiwarden/shared';

// 获取泳道提示词：优先项目级，其次全局，无配置则返回空
function getLanePrompt(laneId: string, projectData: ProjectData, globalLanePrompts: Record<string, string>): string {
    // 1. 检查项目级泳道配置
    const lane = projectData.lanes.find((l: Lane) => l.id === laneId);
    if (lane?.systemPrompt) {
        return lane.systemPrompt;
    }

    // 2. 检查全局泳道提示词配置
    if (globalLanePrompts[laneId]) {
        return globalLanePrompts[laneId];
    }

    // 3. 无配置则返回空字符串，直接使用任务的 prompt
    return '';
}

export async function designRoutes(fastify: FastifyInstance) {
    // 生成设计方案
    fastify.post<{
        Params: { projectId: string; taskId: string };
    }>('/api/projects/:projectId/tasks/:taskId/design', async (request, reply) => {
        const config = await readGlobalConfig();
        const project = config.projects.find(p => p.id === request.params.projectId);
        if (!project) throw { statusCode: 404, message: 'Project not found' };

        const data = await readProjectData(project.path);
        const task = data.tasks.find(t => t.id === request.params.taskId);
        if (!task) throw { statusCode: 404, message: 'Task not found' };

        // 更新任务状态为 running
        task.status = 'running';
        task.updatedAt = new Date().toISOString();
        await writeProjectData(project.path, data);

        try {
            // Step 1: Create worktree if not exists (only for git repos)
            if (!task.worktree) {
                console.log('[Design] Attempting to create worktree for task:', task.id);
                const worktree = await worktreeManager.createWorktree(project.path, task.id);
                if (worktree) {
                    task.worktree = worktree;
                    console.log('[Design] Worktree created:', worktree.path);
                } else {
                    console.log('[Design] Project is not a git repo, using project path directly');
                }
            }

            // Step 2: Create Claude session if not exists
            if (!task.claudeSession) {
                const sessionId = uuid();
                task.claudeSession = {
                    id: sessionId,
                    createdAt: new Date().toISOString(),
                };
                console.log('[Design] Claude session created:', sessionId);
            }

            // Save worktree and session info
            await writeProjectData(project.path, data);

            // Step 3: Determine working directory (worktree or project path)
            const workingDir = task.worktree?.path || project.path;

            // Ensure designs directory exists
            const designsDir = path.join(workingDir, '.antiwarden', 'designs');
            await fs.mkdir(designsDir, { recursive: true });

            const designFileName = `${task.id}-design.md`;
            const designPath = path.join(designsDir, designFileName);

            // 构建用户提示词
            const userPrompt = `## 需求信息

**标题**: ${task.title}

**描述**: 
${task.description}

${task.prompt ? `**补充说明**: 
${task.prompt}` : ''}

---

请根据以上需求生成技术设计方案文档。`;

            // Step 4: 获取泳道提示词（优先项目级 > 全局 > 默认）
            const systemPrompt = getLanePrompt('design', data, config.settings.lanePrompts || {});
            console.log('[Design] Starting Claude execution for task:', task.id);
            console.log('[Design] Working directory:', workingDir);
            console.log('[Design] Session ID:', task.claudeSession.id);

            // Use AgentManager for design generation
            const content = await agentManager.generateDesign(
                task.id,
                workingDir,
                userPrompt,
                systemPrompt,
                {
                    onLog: (msg) => {
                        console.log(msg);
                        agentManager.emit('log', { taskId: task.id, message: msg });
                    },
                    onOutput: (chunk) => {
                        // Stream output to WebSocket via AgentManager event
                        process.stdout.write(chunk);
                        agentManager.emit('output', { taskId: task.id, data: chunk });
                    },
                    onError: (err) => {
                        console.error('[Design Error]', err);
                        agentManager.emit('error', { taskId: task.id, error: err });
                    }
                }
            );

            // 保存设计方案到文件
            await fs.writeFile(designPath, content, 'utf-8');

            // 更新任务状态和设计路径
            task.status = 'pending-dev';
            task.designPath = path.relative(workingDir, designPath);
            task.updatedAt = new Date().toISOString();
            await writeProjectData(project.path, data);

            return {
                success: true,
                designPath: task.designPath,
                worktree: task.worktree,
                claudeSession: task.claudeSession,
                content
            };
        } catch (error: any) {
            // 如果执行失败，回退状态
            task.status = 'failed';
            task.updatedAt = new Date().toISOString();
            await writeProjectData(project.path, data);

            throw {
                statusCode: 500,
                message: `设计方案生成失败: ${error.message}`
            };
        }
    });

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

        // Use worktree path if available, otherwise project path
        const workingDir = task.worktree?.path || project.path;
        const designFullPath = path.join(workingDir, task.designPath);
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

        // Use worktree path if available, otherwise project path
        const workingDir = task.worktree?.path || project.path;
        const designFullPath = path.join(workingDir, task.designPath);
        await fs.writeFile(designFullPath, request.body.content, 'utf-8');

        task.updatedAt = new Date().toISOString();
        await writeProjectData(project.path, data);

        return {
            success: true,
            designPath: task.designPath
        };
    });
}


