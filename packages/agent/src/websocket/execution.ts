import type { FastifyInstance } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import { ptyManager, PtyOutput } from '../services/pty-manager';
import { readGlobalConfig, readProjectData, writeProjectData } from '../utils/json-store';

interface ExecuteMessage {
    type: 'execute';
    taskId: string;
    projectId: string;
}

interface InputMessage {
    type: 'input';
    sessionId: string;
    data: string;
}

interface StopMessage {
    type: 'stop';
    taskId: string;
}

interface ResizeMessage {
    type: 'resize';
    sessionId: string;
    cols: number;
    rows: number;
}

type ClientMessage = ExecuteMessage | InputMessage | StopMessage | ResizeMessage;

export async function executionHandler(fastify: FastifyInstance) {
    fastify.get('/ws/execute', { websocket: true }, (connection, _request) => {

        // Handle incoming messages from client
        connection.socket.on('message', async (rawMessage) => {
            try {
                const message = JSON.parse(rawMessage.toString()) as ClientMessage;

                switch (message.type) {
                    case 'execute':
                        await handleExecute(connection, message);
                        break;
                    case 'input':
                        handleInput(connection, message);
                        break;
                    case 'stop':
                        handleStop(connection, message);
                        break;
                    case 'resize':
                        handleResize(message);
                        break;
                }
            } catch (err) {
                console.error('Execution WebSocket error:', err);
                connection.socket.send(JSON.stringify({
                    type: 'error',
                    message: err instanceof Error ? err.message : 'Unknown error',
                }));
            }
        });

        // Forward PTY output to client
        const outputHandler = (output: PtyOutput) => {
            if (connection.socket.readyState === 1) {
                connection.socket.send(JSON.stringify({
                    type: output.type === 'exit' ? 'exit' : 'output',
                    sessionId: output.sessionId,
                    taskId: output.taskId,
                    data: output.data,
                    exitCode: output.exitCode,
                }));
            }
        };

        ptyManager.on('output', outputHandler);

        connection.socket.on('close', () => {
            ptyManager.off('output', outputHandler);
        });
    });
}

async function handleExecute(connection: SocketStream, message: ExecuteMessage) {
    const config = await readGlobalConfig();
    const project = config.projects.find(p => p.id === message.projectId);
    if (!project) {
        throw new Error('Project not found');
    }

    const data = await readProjectData(project.path);
    const task = data.tasks.find(t => t.id === message.taskId);
    if (!task) {
        throw new Error('Task not found');
    }

    if (!task.prompt) {
        throw new Error('Task has no prompt');
    }

    // Update task status to running
    task.status = 'running';
    task.updatedAt = new Date().toISOString();
    await writeProjectData(project.path, data);

    // Start PTY session
    const sessionId = ptyManager.startSession(task.id, project.path, task.prompt);

    connection.socket.send(JSON.stringify({
        type: 'started',
        sessionId,
        taskId: task.id,
    }));
}

function handleInput(connection: SocketStream, message: InputMessage) {
    const success = ptyManager.sendInput(message.sessionId, message.data);
    if (!success) {
        connection.socket.send(JSON.stringify({
            type: 'error',
            message: 'Session not found',
        }));
    }
}

function handleStop(connection: SocketStream, message: StopMessage) {
    const session = ptyManager.getSessionByTaskId(message.taskId);
    if (session) {
        ptyManager.killSession(session.id);
        connection.socket.send(JSON.stringify({
            type: 'stopped',
            taskId: message.taskId,
        }));
    }
}

function handleResize(message: ResizeMessage) {
    ptyManager.resize(message.sessionId, message.cols, message.rows);
}
