import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';

export async function createServer() {
    const fastify = Fastify({ logger: true });

    await fastify.register(cors, { origin: true });
    await fastify.register(websocket);

    fastify.get('/health', async () => ({ status: 'ok' }));

    return fastify;
}
