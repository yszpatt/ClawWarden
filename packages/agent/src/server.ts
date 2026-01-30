import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { projectRoutes } from './routes/projects';
import { taskRoutes } from './routes/tasks';
import { worktreeRoutes } from './routes/worktrees';
import { designRoutes } from './routes/design';
import { settingsRoutes } from './routes/settings';
import { hookRoutes } from './routes/hooks';
import { conversationRoutes } from './routes/conversation';
import { websocketHandler } from './websocket/handler';
import { executionHandler } from './websocket/execution';

export async function createServer() {
    const fastify = Fastify({
        logger: {
            transport: {
                target: 'pino/file',
                options: {
                    destination: './agent.log',
                    mkdir: true
                }
            }
        }
    });

    await fastify.register(cors, {
        origin: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
    });
    await fastify.register(websocket);
    await fastify.register(projectRoutes);
    await fastify.register(taskRoutes);
    await fastify.register(worktreeRoutes);
    await fastify.register(designRoutes);
    await fastify.register(settingsRoutes);
    await fastify.register(hookRoutes);
    await fastify.register(conversationRoutes);
    await fastify.register(websocketHandler);
    await fastify.register(executionHandler);

    fastify.get('/health', async () => ({ status: 'ok' }));

    return fastify;
}
