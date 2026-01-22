import type { FastifyInstance } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import { fileWatcher, FileChangeEvent } from '../services/file-watcher';
import { readProjectData, readGlobalConfig } from '../utils/json-store';

interface WebSocketClient {
    connection: SocketStream;
    projectId?: string;
}

const clients: Set<WebSocketClient> = new Set();

export async function websocketHandler(fastify: FastifyInstance) {
    fastify.get('/ws', { websocket: true }, (connection, _request) => {
        const client: WebSocketClient = { connection };
        clients.add(client);

        connection.socket.on('message', async (rawMessage) => {
            try {
                const message = JSON.parse(rawMessage.toString());

                if (message.type === 'subscribe' && message.projectId) {
                    client.projectId = message.projectId;

                    // Start watching this project
                    const config = await readGlobalConfig();
                    const project = config.projects.find(p => p.id === message.projectId);
                    if (project) {
                        fileWatcher.watchProject(project.path);
                    }

                    connection.socket.send(JSON.stringify({ type: 'subscribed', projectId: message.projectId }));
                }
            } catch (err) {
                console.error('WebSocket message error:', err);
            }
        });

        connection.socket.on('close', () => {
            clients.delete(client);
        });
    });

    // Listen for file changes and broadcast to clients
    fileWatcher.on('change', async (event: FileChangeEvent) => {
        try {
            const data = await readProjectData(event.projectPath);
            const config = await readGlobalConfig();
            const project = config.projects.find(p => p.path === event.projectPath);

            if (!project) return;

            const message = JSON.stringify({
                type: 'project-update',
                projectId: project.id,
                data,
            });

            for (const client of clients) {
                if (client.projectId === project.id && client.connection.socket.readyState === 1) {
                    client.connection.socket.send(message);
                }
            }
        } catch (err) {
            console.error('File change broadcast error:', err);
        }
    });
}
