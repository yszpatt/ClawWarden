import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { projectRoutes } from './routes/projects';
import { taskRoutes } from './routes/tasks';
import { websocketHandler } from './websocket/handler';
import { executionHandler } from './websocket/execution';

export async function createServer() {
    const fastify = Fastify({ logger: true });

    await fastify.register(cors, { origin: true });
    await fastify.register(websocket);
    await fastify.register(projectRoutes);
    await fastify.register(taskRoutes);
    await fastify.register(websocketHandler);
    await fastify.register(executionHandler);

    fastify.get('/health', async () => ({ status: 'ok' }));

    return fastify;
}
