import type { FastifyInstance } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { readGlobalConfig, readProjectData, writeProjectData } from '../utils/json-store';
import { agentManager } from '../services/agent-manager';
import { worktreeManager } from '../services/worktree-manager';
import { conversationStorage } from '../services/conversation-storage';
import { getSchemaForLane, getOutputTypeForLane } from '../services/schemas';
import type { TaskStatus, Lane, ProjectData, StructuredOutput, ConversationWsMessage, ConversationMessage, Task, ToolCall, AssistantMessage } from '@clawwarden/shared';
import { getLanePrompt } from '@clawwarden/shared';

// Track running lane executions for stop functionality
// Maps taskId to an abort controller or stop flag
const runningLaneExecutions = new Map<string, { stopped: boolean; connection: SocketStream }>();

/**
 * Send a WebSocket message and immediately save to conversation storage
 */
async function sendAndSaveMessage(
    connection: SocketStream,
    taskId: string,
    projectPath: string,
    message: ConversationMessage
): Promise<void> {
    // Send via WebSocket based on message type
    const wsMessage: ConversationWsMessage = { taskId } as ConversationWsMessage;

    if (message.role === 'system') {
        wsMessage.type = 'conversation.chunk';
        wsMessage.messageId = message.id;
        wsMessage.content = (message as any).content;
    } else if (message.role === 'assistant') {
        const assistantMsg = message as AssistantMessage;

        if (assistantMsg.content) {
            wsMessage.type = 'conversation.chunk';
            wsMessage.messageId = message.id;
            wsMessage.content = assistantMsg.content;
            wsMessage.groupId = assistantMsg.groupId;
        } else if (assistantMsg.thinking) {
            wsMessage.type = 'conversation.thinking';
            wsMessage.groupId = assistantMsg.groupId;
            wsMessage.content = assistantMsg.thinking;
        } else if (assistantMsg.toolCall) {
            const tool = assistantMsg.toolCall;
            // Plan A: Only send tool_call_start or tool_call_output
            // tool_call_start: status='pending' (first message)
            // tool_call_output: has output and final status (success/error)
            if (tool.status === 'pending' && !tool.output) {
                wsMessage.type = 'conversation.tool_call_start';
                wsMessage.groupId = assistantMsg.groupId;
                wsMessage.messageId = message.id;  // Include id so frontend can match and update
                wsMessage.toolCall = tool;
                console.log('[Execution] Sending tool_call_start:', { id: message.id, toolName: tool.name, groupId: assistantMsg.groupId });
            } else {
                // Has output or final status - send as tool_call_output
                wsMessage.type = 'conversation.tool_call_output';
                wsMessage.groupId = assistantMsg.groupId;
                wsMessage.messageId = message.id;  // Include id for frontend to match and update
                wsMessage.toolCall = tool;
                console.log('[Execution] Sending tool_call_output:', { id: message.id, toolName: tool.name, status: tool.status, hasOutput: !!tool.output });
            }
        }
    }

    connection.socket.send(JSON.stringify(wsMessage));

    // Immediately save to conversation storage
    await conversationStorage.appendMessage(projectPath, taskId, message);
}

/**
 * Create a new message group with a unique groupId
 */
function createMessageGroup(): { groupId: string; chunkStartMsg: ConversationWsMessage } {
    const groupId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    return {
        groupId,
        chunkStartMsg: {
            type: 'conversation.chunk_start',
            groupId,
        } as ConversationWsMessage,
    };
}

/**
 * Helper function to update task status across all projects
 * Returns the updated task data if found
 */
async function updateTaskStatus(taskId: string, status: TaskStatus, laneId?: string): Promise<boolean> {
    try {
        const config = await readGlobalConfig();

        for (const proj of config.projects) {
            const data = await readProjectData(proj.path);
            const taskIndex = data.tasks.findIndex(t => t.id === taskId);

            if (taskIndex !== -1) {
                data.tasks[taskIndex].status = status;
                data.tasks[taskIndex].updatedAt = new Date().toISOString();

                if (laneId) {
                    data.tasks[taskIndex].laneId = laneId;
                }

                await writeProjectData(proj.path, data);
                console.log(`[Execution] Updated task ${taskId} status to: ${status}${laneId ? `, lane: ${laneId}` : ''}`);
                return true;
            }
        }

        console.warn(`[Execution] Task ${taskId} not found for status update`);
        return false;
    } catch (err) {
        console.error('[Execution] Failed to update task status:', err);
        return false;
    }
}

interface ExecuteMessage {
    type: 'execute';
    taskId: string;
    projectId: string;
}

interface InputMessage {
    type: 'input';
    taskId: string;
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

interface AttachMessage {
    type: 'attach';
    taskId: string;
    projectId: string;
}

interface ConversationUserInputMessage {
    type: 'conversation.user_input';
    taskId: string;
    content: string;
}

interface ConversationDesignStartMessage {
    type: 'conversation.design_start';
    taskId: string;
    projectId: string;
}

interface ConversationExecuteStartMessage {
    type: 'conversation.execute_start';
    taskId: string;
    projectId: string;
}

type ClientMessage = ExecuteMessage | InputMessage | StopMessage | ResizeMessage | AttachMessage | ConversationUserInputMessage | ConversationDesignStartMessage | ConversationExecuteStartMessage;

export async function executionHandler(fastify: FastifyInstance) {
    fastify.get('/ws/execute', { websocket: true }, (connection, _request) => {
        let currentTaskId: string | null = null;

        // Forward Agent events to client
        const outputListener = (event: { taskId: string, data: string }) => {
            if (currentTaskId && event.taskId === currentTaskId && connection.socket.readyState === 1) {
                connection.socket.send(JSON.stringify({
                    type: 'output',
                    taskId: event.taskId,
                    data: event.data
                }));
            }
        };

        const logListener = (event: { taskId: string, message: string }) => {
            if (currentTaskId && event.taskId === currentTaskId && connection.socket.readyState === 1) {
                connection.socket.send(JSON.stringify({
                    type: 'output',
                    taskId: event.taskId,
                    data: `\x1b[90m${event.message}\x1b[0m\r\n` // Gray color for logs
                }));
            }
        };

        const errorListener = (event: { taskId: string, error: Error }) => {
            if (currentTaskId && event.taskId === currentTaskId && connection.socket.readyState === 1) {
                connection.socket.send(JSON.stringify({
                    type: 'error',
                    message: event.error.message
                }));
            }
        };

        const statusUpdateListener = async (event: { taskId: string, status: TaskStatus, moveTo?: string }) => {
            // Auto-lane movement: when task completes, move to next lane
            let targetLane = event.moveTo;
            if (!targetLane && event.status === 'completed') {
                // Find current task's lane
                const config = await readGlobalConfig();
                for (const proj of config.projects) {
                    const data = await readProjectData(proj.path);
                    const task = data.tasks.find(t => t.id === event.taskId);
                    if (task) {
                        // Auto-move based on current lane
                        if (task.laneId === 'develop') {
                            targetLane = 'test';
                        } else if (task.laneId === 'test') {
                            targetLane = 'pending-merge';
                        }
                        break;
                    }
                }
            }

            // Update DB
            await updateTaskStatus(event.taskId, event.status, targetLane);

            // Send status update notification to frontend
            if (connection.socket.readyState === 1) {
                connection.socket.send(JSON.stringify({
                    type: 'task_status',
                    taskId: event.taskId,
                    status: event.status,
                    laneId: targetLane
                }));
            }

            // Determine if we need to send exit/completed to client?
            if (event.status === 'completed' || event.status === 'failed') {
                if (connection.socket.readyState === 1) {
                    connection.socket.send(JSON.stringify({
                        type: 'exit',
                        taskId: event.taskId,
                        exitCode: event.status === 'completed' ? 0 : 1
                    }));
                }
            }
        };

        const sessionStartListener = async (event: { taskId: string, sessionId: string }) => {
            if (currentTaskId && event.taskId === currentTaskId) {
                console.log('[Execution] Session Started/Resumed:', event.sessionId);

                // Send the correct session ID to frontend
                if (connection.socket.readyState === 1) {
                    connection.socket.send(JSON.stringify({
                        type: 'started',
                        taskId: event.taskId,
                        sessionId: event.sessionId,
                    }));
                }

                try {
                    const config = await readGlobalConfig();
                    for (const proj of config.projects) {
                        const data = await readProjectData(proj.path);
                        const taskIndex = data.tasks.findIndex(t => t.id === event.taskId);
                        if (taskIndex !== -1) {
                            if (data.tasks[taskIndex].claudeSession?.id !== event.sessionId) {
                                data.tasks[taskIndex].claudeSession = {
                                    id: event.sessionId,
                                    createdAt: new Date().toISOString()
                                };
                                await writeProjectData(proj.path, data);
                            }
                            break;
                        }
                    }
                } catch (e) {
                    console.error('Failed to save session ID', e);
                }
            }
        };

        const structuredOutputListener = async (event: { taskId: string, output: unknown }) => {
            if (currentTaskId && event.taskId === currentTaskId) {
                console.log('[Execution] Structured output received for task:', event.taskId);

                // Send to frontend
                if (connection.socket.readyState === 1) {
                    connection.socket.send(JSON.stringify({
                        type: 'structured-output',
                        taskId: event.taskId,
                        output: event.output
                    }));
                }

                // Save to task data
                try {
                    const config = await readGlobalConfig();
                    for (const proj of config.projects) {
                        const data = await readProjectData(proj.path);
                        const taskIndex = data.tasks.findIndex(t => t.id === event.taskId);
                        if (taskIndex !== -1) {
                            const task = data.tasks[taskIndex];
                            const outputType = getOutputTypeForLane(task.laneId);
                            const structuredOutput: StructuredOutput = {
                                type: outputType,
                                schemaVersion: '1.0',
                                data: event.output,
                                timestamp: new Date().toISOString()
                            };
                            task.structuredOutput = structuredOutput;
                            task.updatedAt = new Date().toISOString();
                            await writeProjectData(proj.path, data);
                            console.log('[Execution] Saved structured output for task:', event.taskId);
                            break;
                        }
                    }
                } catch (e) {
                    console.error('[Execution] Failed to save structured output:', e);
                }
            }
        };

        // Register listeners
        agentManager.on('output', outputListener);
        agentManager.on('log', logListener);
        agentManager.on('error', errorListener);
        agentManager.on('statusUpdate', statusUpdateListener);
        agentManager.on('sessionStart', sessionStartListener);
        agentManager.on('structuredOutput', structuredOutputListener);

        // Handle incoming messages from client
        connection.socket.on('message', async (rawMessage) => {
            try {
                const message = JSON.parse(rawMessage.toString()) as ClientMessage;

                switch (message.type) {
                    case 'execute':
                        currentTaskId = message.taskId;
                        await handleExecute(connection, message);
                        break;
                    case 'attach':
                        currentTaskId = message.taskId;
                        await handleAttach(connection, message);
                        break;
                    case 'input':
                        if (currentTaskId) {
                            handleInput(currentTaskId, message.data);
                        } else {
                            if (message.taskId) handleInput(message.taskId, message.data);
                        }
                        break;
                    case 'stop':
                        if (message.taskId) handleStop(message.taskId);
                        break;
                    case 'resize':
                        // Agent SDK doesn't support PTY resize
                        break;
                    case 'conversation.user_input':
                        await handleConversationUserMessage(connection, message);
                        break;
                    case 'conversation.design_start':
                        await handleConversationDesignStart(connection, message);
                        break;
                    case 'conversation.execute_start':
                        await handleConversationExecuteStart(connection, message);
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

        connection.socket.on('close', () => {
            agentManager.off('output', outputListener);
            agentManager.off('log', logListener);
            agentManager.off('error', errorListener);
            agentManager.off('statusUpdate', statusUpdateListener);
            agentManager.off('sessionStart', sessionStartListener);
            agentManager.off('structuredOutput', structuredOutputListener);
        });
    });
}

async function handleExecute(connection: SocketStream, message: ExecuteMessage) {
    const config = await readGlobalConfig();
    const project = config.projects.find(p => p.id === message.projectId);
    if (!project) throw new Error('Project not found');

    const data = await readProjectData(project.path);
    const task = data.tasks.find(t => t.id === message.taskId);
    if (!task) throw new Error('Task not found');

    console.log(`[Execution] handleExecute for task: ${task.id}`);
    console.log(`[Execution] Task title: ${task.title}`);
    console.log(`[Execution] Task status: ${task.status}`);
    console.log(`[Execution] Task lane: ${task.laneId}`);
    console.log(`[Execution] Task claudeSession:`, task.claudeSession ? {
        id: task.claudeSession.id,
        createdAt: task.claudeSession.createdAt
    } : 'none');
    console.log(`[Execution] Task worktree:`, task.worktree ? {
        path: task.worktree.path,
        branch: task.worktree.branch
    } : 'none');

    const workingDir = task.worktree?.path || project.path;

    // Determine prompt based on lane
    let prompt: string | undefined;
    const isDevTestLane = task.laneId === 'develop' || task.laneId === 'test';

    if (isDevTestLane && task.designPath) {
        prompt = `请按照 @${task.designPath} 中的设计方案继续执行任务。`;
    } else if (!isDevTestLane && task.prompt) {
        prompt = task.prompt;
    } else if (task.designPath) {
        prompt = `请参考 @${task.designPath} 继续任务。`;
    }

    if (!prompt) throw new Error('Task has no prompt or design document');

    // Update status
    task.status = 'running';
    task.updatedAt = new Date().toISOString();
    await writeProjectData(project.path, data);

    // Call AgentManager
    const resumeSessionId = task.claudeSession?.id;
    const outputFormat = getSchemaForLane(task.laneId);
    console.log(`[Execution] Calling startTaskExecution with resumeSessionId: ${resumeSessionId || 'none'}, outputFormat: ${outputFormat ? 'enabled' : 'none'}`);
    await agentManager.startTaskExecution(task.id, workingDir, prompt, resumeSessionId, outputFormat);
    // Note: 'started' message will be sent by sessionStartListener when the SDK provides the session ID

    // Send any buffered output that might already exist
    const buffered = agentManager.getSessionOutput(task.id);
    if (buffered) {
        connection.socket.send(JSON.stringify({
            type: 'output',
            taskId: task.id,
            data: buffered
        }));
    }
}

async function handleAttach(connection: SocketStream, message: AttachMessage) {
    // Send buffered output as 'attached' message type
    const buffered = agentManager.getSessionOutput(message.taskId);
    if (buffered !== undefined) {
        // Get session ID if available
        const session = agentManager.getSessionInfo(message.taskId);
        connection.socket.send(JSON.stringify({
            type: 'attached',
            taskId: message.taskId,
            sessionId: session?.claudeSessionId || null,
            bufferedOutput: buffered || ''
        }));
    } else {
        // Warn if no session found
        connection.socket.send(JSON.stringify({
            type: 'output',
            taskId: message.taskId,
            data: '[System] No active session found. Please click Start/Resume.'
        }));
    }
}

function handleInput(taskId: string, data: string) {
    agentManager.sendInput(taskId, data);
}

async function handleStop(taskId: string) {
    // First, try to stop agent manager sessions (conversation panel)
    agentManager.stopTask(taskId);

    // Also check if this is a lane execution and stop it
    const laneExecution = runningLaneExecutions.get(taskId);
    if (laneExecution) {
        console.log(`[Execution] Stopping lane execution for task: ${taskId}`);
        laneExecution.stopped = true;

        // Find the task to get its laneId and update status in storage
        const result = await findTask(taskId);
        let laneId: string | undefined;
        if (result) {
            // Update task status to idle in storage
            result.task.status = 'idle';
            result.task.updatedAt = new Date().toISOString();
            await writeProjectData(result.project.path, result.data);
            console.log(`[Execution] Updated task ${taskId} status to idle in storage`);
            laneId = result.task.laneId;

            // Add stop message to conversation
            const stopMessage: ConversationMessage = {
                id: uuid(),
                role: 'system',
                content: '[系统] 任务已被用户停止',
                type: 'info',
                timestamp: new Date().toISOString(),
            };
            await sendAndSaveMessage(laneExecution.connection, taskId, result.project.path, stopMessage);
        }

        // Send stop confirmation to client with laneId
        if (laneExecution.connection.socket.readyState === 1) {
            laneExecution.connection.socket.send(JSON.stringify({
                type: 'task_status',
                taskId,
                status: 'idle',
                laneId,
            } as ConversationWsMessage));
        }

        // Remove from tracking after a short delay
        setTimeout(() => {
            runningLaneExecutions.delete(taskId);
        }, 1000);
    }
}

// Helper to find task across all projects
async function findTask(taskId: string): Promise<{ project: any, data: ProjectData, task: any } | null> {
    const config = await readGlobalConfig();
    for (const proj of config.projects) {
        const data = await readProjectData(proj.path);
        const task = data.tasks.find(t => t.id === taskId);
        if (task) {
            return { project: proj, data, task };
        }
    }
    return null;
}

/**
 * Handle conversation user input message
 * Streams Claude response through WebSocket
 */
async function handleConversationUserMessage(
    connection: SocketStream,
    message: ConversationUserInputMessage
) {
    const { taskId, content } = message;
    console.log('[Execution] Conversation user input:', taskId, content?.substring(0, 50));

    const result = await findTask(taskId);
    if (!result) {
        connection.socket.send(JSON.stringify({
            type: 'conversation.error',
            taskId,
            error: 'Task not found'
        } as ConversationWsMessage));
        return;
    }

    const { project, task } = result;
    const workingDir = task.worktree?.path || project.path;
    const sessionId = task.claudeSession?.id;

    // Save user message
    const userMessage: ConversationMessage = {
        id: uuid(),
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
        metadata: {
            command: content.startsWith('/') ? content.split(' ')[0] : undefined,
        },
    };
    await conversationStorage.appendMessage(project.path, taskId, userMessage);

    // Create assistant message placeholder
    const assistantMessageId = uuid();
    const assistantMessage: ConversationMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        status: 'streaming',
    };
    await conversationStorage.appendMessage(project.path, taskId, assistantMessage);

    // Send chunk_start
    connection.socket.send(JSON.stringify({
        type: 'conversation.chunk_start',
        taskId,
        messageId: assistantMessageId,
    } as ConversationWsMessage));

    // Track accumulated content for storage
    let accumulatedContent = '';
    const toolCallsMap = new Map<string, any>();

    // Build callbacks for streaming
    const callbacks = {
        onLog: (message: string) => {
            // Optional: log to terminal if needed
        },
        onOutput: (data: string) => {
            // Optional: send raw output to terminal
        },
        onError: (error: Error) => {
            console.log('[Execution] conversation.onError:', error.message);
            connection.socket.send(JSON.stringify({
                type: 'conversation.error',
                taskId,
                error: error.message,
            } as ConversationWsMessage));
        },
        onSessionStart: async (newSessionId: string) => {
            console.log('[Execution] Conversation session started:', newSessionId);
            // Save session ID to task for future resume
            if (!task.claudeSession || task.claudeSession.id !== newSessionId) {
                task.claudeSession = {
                    id: newSessionId,
                    createdAt: new Date().toISOString(),
                };
                const result = await findTask(taskId);
                if (result) {
                    result.task.claudeSession = task.claudeSession;
                    await writeProjectData(result.project.path, result.data);
                    console.log('[Execution] Session ID saved to task:', newSessionId);
                }
            }
        },
        onConversationChunk: async (msgId: string, chunk: string) => {
            accumulatedContent += chunk;
            console.log('[Execution] onConversationChunk:', assistantMessageId, 'chunk:', chunk.slice(0, 30));
            // Use assistantMessageId instead of msgId from agentManager
            connection.socket.send(JSON.stringify({
                type: 'conversation.chunk',
                taskId,
                messageId: assistantMessageId,
                content: chunk,
            } as ConversationWsMessage));
        },

        onConversationThinkingStart: async (thinkingContent: string) => {
            console.log('[Execution] onConversationThinkingStart');
            connection.socket.send(JSON.stringify({
                type: 'conversation.thinking',
                taskId,
                content: thinkingContent,
            } as ConversationWsMessage));
        },

        onConversationThinkingEnd: async () => {
            console.log('[Execution] onConversationThinkingEnd');
            // Thinking end is handled by frontend receiving the thinking content
        },

        onConversationToolCall: async (toolCall: any) => {
            // Track tool calls by name for updating
            const key = `${assistantMessageId}-${toolCall.name}`;
            toolCallsMap.set(key, toolCall);
            console.log('[Execution] onConversationToolCall:', toolCall.name, 'status:', toolCall.status, 'has output:', !!toolCall.output);

            // Check if this is a tool start or completion based on output presence
            const isComplete = toolCall.output !== undefined;
            const messageType = isComplete ? 'conversation.tool_call_output' : 'conversation.tool_call_start';

            // Generate a consistent message ID based on assistantMessageId and tool name
            // This allows frontend to match start and end events
            const toolMessageId = `${assistantMessageId}-${toolCall.name}`;

            connection.socket.send(JSON.stringify({
                type: messageType,
                taskId,
                messageId: toolMessageId,
                groupId: assistantMessageId,
                toolCall,
            } as unknown as ConversationWsMessage));
        },

        onConversationComplete: async (msgId: string) => {
            console.log('[Execution] onConversationComplete:', assistantMessageId, 'total content length:', accumulatedContent.length);
            connection.socket.send(JSON.stringify({
                type: 'conversation.chunk_end',
                taskId,
                messageId: assistantMessageId,
            } as ConversationWsMessage));

            // Mark message as complete and save final state
            const conversation = await conversationStorage.load(project.path, taskId);
            if (conversation) {
                const msg = conversation.messages.find((m: any) => m.id === assistantMessageId);
                if (msg && msg.role === 'assistant') {
                    (msg as any).status = 'complete';
                    msg.content = accumulatedContent;
                }
                await conversationStorage.save(project.path, conversation);
            }
        },
    };

    // Call agent with user message
    try {
        await agentManager.sendUserMessage(
            taskId,
            workingDir,
            content,
            callbacks,
            sessionId
        );
    } catch (error: any) {
        console.error('[Execution] Conversation error:', error);
        connection.socket.send(JSON.stringify({
            type: 'conversation.error',
            taskId,
            error: error.message,
        } as ConversationWsMessage));
    }
}

/**
 * Handle design generation through conversation panel
 * Streams the design process with immediate saving
 */
async function handleConversationDesignStart(
    connection: SocketStream,
    message: ConversationDesignStartMessage
) {
    const { taskId, projectId } = message;
    console.log('[Execution] Design conversation start:', taskId);

    const result = await findTask(taskId);
    if (!result) {
        connection.socket.send(JSON.stringify({
            type: 'conversation.error',
            taskId,
            error: 'Task not found'
        } as ConversationWsMessage));
        return;
    }

    const { project, task, data } = result;
    const projectPath = project.path;
    const workingDir = task.worktree?.path || project.path;
    const sessionId = task.claudeSession?.id;

    // Update task status to running
    task.status = 'running';
    task.updatedAt = new Date().toISOString();
    await writeProjectData(project.path, data);
    console.log(`[Execution] Design task ${taskId} status set to running`);

    // Send status update notification to frontend
    if (connection.socket.readyState === 1) {
        connection.socket.send(JSON.stringify({
            type: 'task_status',
            taskId: taskId,
            status: 'running',
            laneId: task.laneId
        }));
    }

    // Initialize conversation if needed
    let conversation = await conversationStorage.load(project.path, taskId);
    if (!conversation) {
        conversation = {
            taskId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: [],
        };
        await conversationStorage.save(project.path, conversation);
    }

    // Send system message indicating design is starting
    const systemMessage: ConversationMessage = {
        id: uuid(),
        role: 'system',
        content: '[系统] 正在生成设计方案...',
        type: 'info',
        timestamp: new Date().toISOString(),
    };
    await sendAndSaveMessage(connection, taskId, projectPath, systemMessage);

    // Build user prompt from task data
    const userPrompt = task.prompt || `## 任务需求\n\n**标题**: ${task.title}\n\n**描述**:\n${task.description}`;

    const config = await readGlobalConfig();
    const lanePrompt = getLanePrompt('design', data, config.settings.lanePrompts || {});

    console.log('[Execution] Lane config:', {
        laneId: 'design',
        projectLanes: data.lanes.map((l: any) => ({ id: l.id, name: l.name, hasSystemPrompt: !!l.systemPrompt })),
        globalLanePrompts: Object.keys(config.settings.lanePrompts || {}),
        lanePromptLength: lanePrompt.length,
    });

    // Combine system prompt with user prompt
    const prompt = lanePrompt
        ? `${lanePrompt}\n\n---\n\n${userPrompt}`
        : userPrompt;

    console.log('[Execution] Starting design generation with streaming, sessionId:', sessionId);
    console.log('[Execution] Lane prompt length:', lanePrompt.length, 'User prompt length:', userPrompt.length);

    // Create message group for this response
    const { groupId, chunkStartMsg } = createMessageGroup();
    chunkStartMsg.taskId = taskId;
    connection.socket.send(JSON.stringify(chunkStartMsg));

    // Track current text content for streaming
    let currentContentMsgId: string | null = null;
    let currentTextContent = '';

    // Use query() for streaming design
    try {
        for await (const sdkMessage of query({
            prompt,
            options: {
                allowedTools: ['Read', 'Glob', 'Grep'],
                settingSources: ['project'],
                cwd: workingDir,
                resume: sessionId,
            },
        })) {
            console.log('[Execution] Design message type:', sdkMessage.type);

            // Track session ID
            if ((sdkMessage as any).session_id) {
                const newSessionId = (sdkMessage as any).session_id;
                if (!task.claudeSession || task.claudeSession.id !== newSessionId) {
                    task.claudeSession = {
                        id: newSessionId,
                        createdAt: new Date().toISOString(),
                    };
                    await writeProjectData(project.path, data);
                    console.log('[Execution] Session saved to task:', newSessionId);
                }
            }

            // Handle stream events
            if (sdkMessage.type === 'stream_event') {
                const event = (sdkMessage as any).event;

                if (event?.type === 'content_block_start' && event.block?.type === 'text') {
                    // Create new content message
                    currentContentMsgId = uuid();
                    currentTextContent = '';
                } else if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                    const delta = event.delta.text || '';
                    currentTextContent += delta;

                    // Send chunk and save immediately
                    const contentMsg: ConversationMessage = {
                        id: currentContentMsgId || uuid(),
                        role: 'assistant',
                        content: delta,
                        groupId,
                        timestamp: new Date().toISOString(),
                        status: 'streaming',
                    };
                    await sendAndSaveMessage(connection, taskId, projectPath, contentMsg);
                } else if (event?.type === 'content_block_stop') {
                    currentContentMsgId = null;
                    currentTextContent = '';
                }
            }

            // Handle assistant messages
            else if (sdkMessage.type === 'assistant') {
                const content = (sdkMessage as any).message?.content;
                if (Array.isArray(content)) {
                    for (const block of content) {
                        if (block.type === 'text' && block.text) {
                            // Text blocks also come through here for some messages
                            const contentMsg: ConversationMessage = {
                                id: uuid(),
                                role: 'assistant',
                                content: block.text,
                                groupId,
                                timestamp: new Date().toISOString(),
                                status: 'streaming',
                            };
                            await sendAndSaveMessage(connection, taskId, projectPath, contentMsg);
                            currentTextContent += block.text;
                        }
                    }
                }
            }

            // Handle result
            else if (sdkMessage.type === 'result') {
                console.log('[Execution] Design generation completed, content length:', currentTextContent.length, 'subtype:', (sdkMessage as any).subtype);

                // Check if execution was successful
                const subtype = (sdkMessage as any).subtype;
                if (subtype === 'error_during_execution') {
                    // Execution failed - don't save design or move lane
                    const errors = (sdkMessage as any).errors || ['Unknown error'];
                    const errorMessage = errors.join('\n');

                    // Update task status to failed
                    task.status = 'failed';
                    task.updatedAt = new Date().toISOString();
                    await writeProjectData(project.path, data);

                    // Send status update
                    if (connection.socket.readyState === 1) {
                        connection.socket.send(JSON.stringify({
                            type: 'task_status',
                            taskId,
                            status: 'failed',
                        } as ConversationWsMessage));
                    }

                    // Add error message to conversation
                    const errorMsg: ConversationMessage = {
                        id: uuid(),
                        role: 'system',
                        content: `错误: ${errorMessage}`,
                        type: 'error',
                        timestamp: new Date().toISOString(),
                    };
                    await sendAndSaveMessage(connection, taskId, projectPath, errorMsg);

                    console.log('[Execution] Design generation failed:', errorMessage);
                } else {
                    // Success - save design and move to next lane
                    // Send chunk_end
                    connection.socket.send(JSON.stringify({
                        type: 'conversation.chunk_end',
                        taskId,
                        groupId,
                    } as ConversationWsMessage));

                    // Only save design if there's actual content
                    if (currentTextContent.trim().length > 0) {
                        // Save design to project directory (not worktree) so it persists after merge
                        const designsDir = path.join(project.path, '.clawwarden', 'designs');
                        await fs.mkdir(designsDir, { recursive: true });
                        const designFileName = `${task.id}-design.md`;
                        const designPath = path.join(designsDir, designFileName);
                        await fs.writeFile(designPath, currentTextContent, 'utf-8');

                        // Store designPath relative to project directory
                        task.designPath = `.clawwarden/designs/${designFileName}`;

                        // Update task status and move to develop lane
                        task.status = 'idle';
                        task.laneId = 'develop';
                        task.updatedAt = new Date().toISOString();
                        await writeProjectData(project.path, data);

                        // Send status update notification to frontend
                        if (connection.socket.readyState === 1) {
                            connection.socket.send(JSON.stringify({
                                type: 'task_status',
                                taskId: taskId,
                                status: 'idle',
                                laneId: 'develop'
                            }));
                        }

                        // Add completion system message
                        const completeMessage: ConversationMessage = {
                            id: uuid(),
                            role: 'system',
                            content: `[系统] 设计方案已生成并保存到: ${task.designPath}，任务已移至开发泳道`,
                            type: 'info',
                            timestamp: new Date().toISOString(),
                        };
                        await sendAndSaveMessage(connection, taskId, project.path, completeMessage);

                        connection.socket.send(JSON.stringify({
                            type: 'conversation.design_complete',
                            taskId,
                            designPath: task.designPath,
                            content: completeMessage.content,
                        } as ConversationWsMessage));

                        // Also send structured-output if design contains structured data
                        const structuredOutput = parseDesignToStructuredOutput(currentTextContent, task);
                        if (structuredOutput) {
                            task.structuredOutput = structuredOutput;
                            await writeProjectData(project.path, data);
                            connection.socket.send(JSON.stringify({
                                type: 'structured-output',
                                taskId,
                                output: structuredOutput,
                            }));
                        }

                        console.log('[Execution] Design saved, task updated, conversation persisted');
                    } else {
                        // No content generated - mark as failed
                        task.status = 'failed';
                        task.updatedAt = new Date().toISOString();
                        await writeProjectData(project.path, data);

                        const errorMsg: ConversationMessage = {
                            id: uuid(),
                            role: 'system',
                            content: '错误: 未生成任何设计方案内容',
                            type: 'error',
                            timestamp: new Date().toISOString(),
                        };
                        await sendAndSaveMessage(connection, taskId, projectPath, errorMsg);
                    }
                }
            }
        }
    } catch (error: any) {
        console.error('[Execution] Design generation error:', error);

        // Update task status to failed
        const result = await findTask(taskId);
        if (result) {
            result.task.status = 'failed';
            result.task.updatedAt = new Date().toISOString();
            await writeProjectData(result.project.path, result.data);
            console.log(`[Execution] Design task ${taskId} status set to failed`);
        }

        // Save error to conversation
        const errorMessage: ConversationMessage = {
            id: uuid(),
            role: 'system',
            content: `错误: ${error.message}`,
            type: 'error',
            timestamp: new Date().toISOString(),
        };
        await sendAndSaveMessage(connection, taskId, projectPath, errorMessage);

        connection.socket.send(JSON.stringify({
            type: 'conversation.error',
            taskId,
            error: error.message,
        } as ConversationWsMessage));
    }
}

/**
 * Handle execution start through conversation panel
 * Routes to appropriate handler based on task lane
 */
async function handleConversationExecuteStart(
    connection: SocketStream,
    message: ConversationExecuteStartMessage
) {
    const { taskId, projectId } = message;
    console.log('[Execution] Execute start:', taskId);

    const result = await findTask(taskId);
    if (!result) {
        connection.socket.send(JSON.stringify({
            type: 'conversation.error',
            taskId,
            error: 'Task not found'
        } as ConversationWsMessage));
        return;
    }

    const { task } = result;
    const laneId = task.laneId;

    // Route to appropriate handler based on lane
    switch (laneId) {
        case 'design':
            console.log('[Execution] Design lane, using handleConversationDesignStart');
            await handleConversationDesignStart(connection, {
                type: 'conversation.design_start',
                taskId,
                projectId,
            } as ConversationDesignStartMessage);
            break;
        case 'develop':
            console.log('[Execution] Routing develop lane to handleConversationDevelopStart');
            await handleConversationDevelopStart(connection, message);
            break;
        case 'test':
            console.log('[Execution] Routing test lane to handleConversationTestStart');
            await handleConversationTestStart(connection, message);
            break;
        default:
            console.log('[Execution] Unknown lane, using default execute handler');
            await handleConversationDefaultExecute(connection, message);
            break;
    }
}

/**
 * Handle develop lane execution through conversation
 */
async function handleConversationDevelopStart(
    connection: SocketStream,
    message: ConversationExecuteStartMessage
) {
    await handleLaneExecutionWithAgent(connection, message, 'develop');
}

/**
 * Handle test lane execution through conversation
 */
async function handleConversationTestStart(
    connection: SocketStream,
    message: ConversationExecuteStartMessage
) {
    await handleLaneExecutionWithAgent(connection, message, 'test');
}

/**
 * Handle default execution (for lanes without specific handlers)
 */
async function handleConversationDefaultExecute(
    connection: SocketStream,
    message: ConversationExecuteStartMessage
) {
    await handleLaneExecutionWithAgent(connection, message, 'generic');
}

/**
 * Common handler for develop/test lane execution with streaming
 * Sends each chunk (text, thinking, tool_call) immediately and saves to file
 */
async function handleLaneExecutionWithAgent(
    connection: SocketStream,
    message: ConversationExecuteStartMessage,
    laneType: 'develop' | 'test' | 'generic'
) {
    const { taskId } = message;
    console.log(`[Execution] Lane execution start: ${laneType}, taskId: ${taskId}`);

    const result = await findTask(taskId);
    if (!result) {
        connection.socket.send(JSON.stringify({
            type: 'conversation.error',
            taskId,
            error: 'Task not found'
        } as ConversationWsMessage));
        return;
    }

    const { project, task, data } = result;
    const projectPath = project.path;
    const workingDir = task.worktree?.path || project.path;
    const sessionId = task.claudeSession?.id;

    // Update task status to running
    task.status = 'running';
    task.updatedAt = new Date().toISOString();
    await writeProjectData(project.path, data);
    console.log(`[Execution] ${laneType} task ${taskId} status set to running`);

    // Register this execution for stop functionality
    const executionContext = { stopped: false, connection };
    runningLaneExecutions.set(taskId, executionContext);
    console.log(`[Execution] Registered lane execution for task: ${taskId}`);

    // Send status update notification to frontend
    if (connection.socket.readyState === 1) {
        connection.socket.send(JSON.stringify({
            type: 'task_status',
            taskId: taskId,
            status: 'running',
            laneId: task.laneId
        }));
    }

    // Initialize conversation if needed
    let conversation = await conversationStorage.load(project.path, taskId);
    if (!conversation) {
        conversation = {
            taskId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: [],
        };
        await conversationStorage.save(project.path, conversation);
    }

    const laneName = laneType === 'develop' ? '开发' : laneType === 'test' ? '测试' : '执行';

    // Send system message indicating task start
    const systemMessage: ConversationMessage = {
        id: uuid(),
        role: 'system',
        content: `[系统] 开始${laneName}任务...`,
        type: 'info',
        timestamp: new Date().toISOString(),
    };
    await sendAndSaveMessage(connection, taskId, projectPath, systemMessage);

    // Build prompt
    // For develop/test lanes: only use lane prompt + design doc reference (no user task description)
    // For design lane: use lane prompt + user prompt
    const config = await readGlobalConfig();
    const lanePrompt = getLanePrompt(task.laneId, data, config.settings.lanePrompts || {});

    let prompt: string;
    if (task.laneId === 'develop' || task.laneId === 'test') {
        // Develop/Test lanes: only lane prompt + design doc
        if (task.designPath) {
            // Design file is in project directory, need to reference from worktree
            // worktree path: {projectPath}/.worktrees/{taskId}
            // design file: {projectPath}/.clawwarden/designs/{taskId}-design.md
            // relative path from worktree: ../../.clawwarden/designs/{taskId}-design.md
            const designFileName = task.designPath.split('/').pop(); // Get {taskId}-design.md
            const relativeDesignPath = `../../.clawwarden/designs/${designFileName}`;
            prompt = `${lanePrompt}\n\n请按照 @${relativeDesignPath} 中的设计方案执行任务。`;
        } else {
            prompt = lanePrompt || '请继续执行任务。';
        }
    } else {
        // Design lane: lane prompt + user prompt
        const userPrompt = task.prompt || `## 任务\n\n**标题**: ${task.title}\n\n**描述**:\n${task.description}`;
        prompt = lanePrompt
            ? `${lanePrompt}\n\n---\n\n${userPrompt}`
            : userPrompt;
    }

    // Get output format for this lane
    const outputFormat = getSchemaForLane(task.laneId);

    // Determine allowed tools based on task's lane
    const allowedTools = task.laneId === 'design'
        ? ['Read', 'Glob', 'Grep']
        : ['Bash', 'Read', 'Edit', 'Glob', 'Grep', 'Find', 'Write'];

    console.log(`[Execution] ${laneName} execution with query(), sessionId:`, sessionId);
    console.log(`[Execution] Prompt length:`, prompt.length);
    console.log(`[Execution] Allowed tools:`, allowedTools);
    console.log(`[Execution] Output format:`, outputFormat ? 'enabled' : 'none');

    // Build query options
    const queryOptions: Record<string, unknown> = {
        allowedTools,
        settingSources: ['project'],
        cwd: workingDir,
        resume: sessionId,
        permissionMode: 'default',
    };

    // Add output format if provided
    if (outputFormat) {
        (queryOptions as any).outputFormat = outputFormat;
    }

    // Create message group for this response
    const { groupId, chunkStartMsg } = createMessageGroup();
    chunkStartMsg.taskId = taskId;
    connection.socket.send(JSON.stringify(chunkStartMsg));

    // Track current text content for streaming (we update the same content message)
    let currentContentMsgId: string | null = null;
    let currentTextContent = '';
    const pendingToolCalls = new Map<string, { name: string; input: unknown; msgId: string }>();

    // Use query() for streaming
    try {
        for await (const sdkMessage of query({
            prompt,
            options: queryOptions,
        })) {
            // Check if execution was stopped
            if (executionContext.stopped) {
                console.log(`[Execution] ${laneName} execution was stopped, breaking loop`);
                break;
            }

            console.log(`[Execution] ${laneName} message type:`, sdkMessage.type);

            // Track session ID
            if ((sdkMessage as any).session_id) {
                const newSessionId = (sdkMessage as any).session_id;
                if (!task.claudeSession || task.claudeSession.id !== newSessionId) {
                    task.claudeSession = {
                        id: newSessionId,
                        createdAt: new Date().toISOString(),
                    };
                    await writeProjectData(project.path, data);
                    console.log(`[Execution] Session saved to task:`, newSessionId);
                }
            }

            // Handle stream events (most content comes through here)
            if (sdkMessage.type === 'stream_event') {
                const event = (sdkMessage as any).event;
                console.log(`[Execution] stream_event type:`, event?.type, 'block type:', event?.block?.type, 'delta type:', event?.delta?.type);

                // Tool result event (when tool completes)
                if (event?.type === 'tool_use_block_stop' || event?.type === 'tool_result') {
                    console.log('[Execution] Tool result event detected:', event?.type);
                }

                // Text content streaming
                if (event?.type === 'content_block_start' && event.block?.type === 'text') {
                    console.log(`[Execution] content_block_start`);
                    // Create new content message
                    currentContentMsgId = uuid();
                    currentTextContent = '';
                } else if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                    const delta = event.delta.text || '';
                    currentTextContent += delta;
                    console.log(`[Execution] text_delta, length:`, delta.length);

                    // Send chunk and save immediately
                    const contentMsg: ConversationMessage = {
                        id: currentContentMsgId || uuid(),
                        role: 'assistant',
                        content: delta,
                        groupId,
                        timestamp: new Date().toISOString(),
                        status: 'streaming',
                    };
                    await sendAndSaveMessage(connection, taskId, projectPath, contentMsg);
                } else if (event?.type === 'content_block_stop') {
                    console.log(`[Execution] content_block_stop`);
                    currentContentMsgId = null;
                    currentTextContent = '';

                    // Check if this is the end of a tool_use block
                    // If so, mark the tool as complete (SDK doesn't send separate tool result events)
                    if (event?.block?.type === 'tool_use') {
                        const toolUseId = event.block.id;  // Use tool_use_id
                        console.log(`[Execution] tool_use block stopped for id:`, toolUseId);

                        // Mark tool as complete since SDK handles execution internally
                        const pendingTool = pendingToolCalls.get(toolUseId);
                        if (pendingTool) {
                            console.log(`[Execution] Marking tool as complete (SDK handled):`, pendingTool.name);

                            // Send tool_call_output message with success status
                            const toolMsg: ConversationMessage = {
                                id: pendingTool.msgId,
                                role: 'assistant',
                                toolCall: {
                                    name: pendingTool.name,
                                    input: pendingTool.input,
                                    output: 'Tool executed by SDK',
                                    status: 'success',
                                },
                                groupId,
                                timestamp: new Date().toISOString(),
                            };
                            await sendAndSaveMessage(connection, taskId, projectPath, toolMsg);

                            pendingToolCalls.delete(toolUseId);
                        }
                    }
                } else if (event?.type === 'content_block_start' && event.block?.type === 'tool_use') {
                    const toolName = event.block.name;
                    const toolInput = event.block.input;
                    const toolUseId = event.block.id;  // Get tool_use_id
                    const toolMsgId = uuid();

                    // Use tool_use_id as key
                    pendingToolCalls.set(toolUseId, {
                        name: toolName,
                        input: toolInput,
                        msgId: toolMsgId,
                    });
                    console.log(`[Execution] stream_event tool_use start:`, toolName, 'id:', toolUseId);

                    // Send tool_call_start message and save
                    const toolMsg: ConversationMessage = {
                        id: toolMsgId,
                        role: 'assistant',
                        toolCall: {
                            name: toolName,
                            input: toolInput,
                            status: 'pending',
                        },
                        groupId,
                        timestamp: new Date().toISOString(),
                    };
                    await sendAndSaveMessage(connection, taskId, projectPath, toolMsg);
                }
            }

            // Handle assistant messages (tool use, text blocks)
            else if (sdkMessage.type === 'assistant') {
                const content = (sdkMessage as any).message?.content;
                if (Array.isArray(content)) {
                    for (const block of content) {
                        if (block.type === 'text') {
                            console.log(`[Execution] assistant text block, length:`, block.text?.length || 0);
                            // Text blocks also come through here for some messages
                            if (block.text) {
                                const contentMsg: ConversationMessage = {
                                    id: uuid(),
                                    role: 'assistant',
                                    content: block.text,
                                    groupId,
                                    timestamp: new Date().toISOString(),
                                    status: 'streaming',
                                };
                                await sendAndSaveMessage(connection, taskId, projectPath, contentMsg);
                            }
                        } else if (block.type === 'tool_use') {
                            const toolName = block.name;
                            const toolInput = block.input;
                            const toolUseId = block.id;  // Store the tool_use_id for matching
                            const toolMsgId = uuid();

                            // Use tool_use_id as key since tool_result uses tool_use_id to match
                            pendingToolCalls.set(toolUseId, {
                                name: toolName,
                                input: toolInput,
                                msgId: toolMsgId,
                            });
                            console.log(`[Execution] tool_use:`, toolName, 'id:', toolUseId);

                            // Send tool_call_start message and save
                            const toolMsg: ConversationMessage = {
                                id: toolMsgId,
                                role: 'assistant',
                                toolCall: {
                                    name: toolName,
                                    input: toolInput,
                                    status: 'pending',
                                },
                                groupId,
                                timestamp: new Date().toISOString(),
                            };
                            await sendAndSaveMessage(connection, taskId, projectPath, toolMsg);
                        }
                    }
                }
            }

            // Handle user messages (tool results)
            else if (sdkMessage.type === 'user') {
                console.log('[Execution] User message received, checking for tool_result...');
                const content = (sdkMessage as any).message?.content;
                console.log('[Execution] User message content is array:', Array.isArray(content), 'length:', content?.length);
                if (Array.isArray(content)) {
                    for (const block of content) {
                        if (block.type === 'tool_result') {
                            const toolUseId = block.tool_use_id;  // Use tool_use_id to match
                            console.log('[Execution] tool_result for tool_use_id:', toolUseId);
                            const pendingTool = pendingToolCalls.get(toolUseId);
                            if (pendingTool) {
                                const isError = block.is_error || false;
                                const output = typeof block.content === 'string'
                                    ? block.content
                                    : JSON.stringify(block.content);

                                console.log(`[Execution] tool_result:`, pendingTool.name, 'status:', isError ? 'error' : 'success');

                                // Plan A: Send single message with output and final status
                                // Use the same message id so frontend can update instead of adding new
                                const toolMsg: ConversationMessage = {
                                    id: pendingTool.msgId,
                                    role: 'assistant',
                                    toolCall: {
                                        name: pendingTool.name,
                                        input: pendingTool.input,
                                        output,
                                        status: isError ? 'error' : 'success',
                                    },
                                    groupId,
                                    timestamp: new Date().toISOString(),
                                };
                                await sendAndSaveMessage(connection, taskId, projectPath, toolMsg);

                                pendingToolCalls.delete(toolUseId);
                            } else {
                                console.log('[Execution] No pending tool found for tool_use_id:', toolUseId, 'pending tools:', Array.from(pendingToolCalls.keys()));
                            }
                        }
                    }
                }
            }

            // Handle result
            else if (sdkMessage.type === 'result') {
                console.log(`[Execution] ${laneName} execution completed`);

                // Mark any remaining pending tools as complete
                if (pendingToolCalls.size > 0) {
                    console.log(`[Execution] Marking ${pendingToolCalls.size} pending tools as complete`);
                    for (const [toolUseId, pendingTool] of pendingToolCalls) {
                        console.log(`[Execution] Completing tool:`, pendingTool.name);

                        // Send tool_call_output message with success status
                        const toolMsg: ConversationMessage = {
                            id: pendingTool.msgId,
                            role: 'assistant',
                            toolCall: {
                                name: pendingTool.name,
                                input: pendingTool.input,
                                output: 'Tool executed',
                                status: 'success',
                            },
                            groupId,
                            timestamp: new Date().toISOString(),
                        };
                        await sendAndSaveMessage(connection, taskId, projectPath, toolMsg);
                    }
                    pendingToolCalls.clear();
                }

                // Also update any pending tool calls in the conversation storage
                // This ensures all tools are marked as complete even if tracking was missed
                try {
                    const conversation = await conversationStorage.load(project.path, taskId);
                    if (conversation) {
                        let updated = false;
                        for (const msg of conversation.messages) {
                            if (msg.role === 'assistant' && (msg as any).toolCall) {
                                const toolCall = (msg as any).toolCall as ToolCall;
                                if (toolCall.status === 'pending') {
                                    console.log(`[Execution] Updating pending tool in storage:`, toolCall.name);
                                    toolCall.status = 'success';
                                    toolCall.output = toolCall.output || 'Tool executed';
                                    updated = true;
                                }
                            }
                        }
                        if (updated) {
                            await conversationStorage.save(project.path, conversation);
                            console.log(`[Execution] Saved updated conversation with completed tool statuses`);
                        }
                    }
                } catch (err) {
                    console.error('[Execution] Failed to update pending tools in conversation:', err);
                }

                // Check for structured output
                if ((sdkMessage as any).structured_output) {
                    console.log(`[Execution] Structured output received`);

                    const outputType = getOutputTypeForLane(task.laneId);
                    task.structuredOutput = {
                        type: outputType,
                        schemaVersion: '1.0',
                        data: (sdkMessage as any).structured_output,
                        timestamp: new Date().toISOString(),
                    } as StructuredOutput;
                    await writeProjectData(project.path, data);

                    connection.socket.send(JSON.stringify({
                        type: 'structured-output',
                        taskId,
                        output: (sdkMessage as any).structured_output,
                    } as ConversationWsMessage));
                }

                // Update task status to completed/idle and move lane
                task.status = 'idle';
                task.updatedAt = new Date().toISOString();

                // Auto-move through lanes: develop -> test -> pending-merge
                if (task.laneId === 'develop') {
                    task.laneId = 'test';
                } else if (task.laneId === 'test') {
                    task.laneId = 'pending-merge';
                }

                await writeProjectData(project.path, data);
                console.log(`[Execution] ${laneName} task completed, status: idle, lane: ${task.laneId}`);

                // Send status update notification
                if (connection.socket.readyState === 1) {
                    connection.socket.send(JSON.stringify({
                        type: 'task_status',
                        taskId,
                        status: 'idle',
                        laneId: task.laneId,
                    } as ConversationWsMessage));
                }

                // Send chunk_end
                connection.socket.send(JSON.stringify({
                    type: 'conversation.chunk_end',
                    taskId,
                    groupId,
                } as ConversationWsMessage));

                // Add completion message
                const completeMessage: ConversationMessage = {
                    id: uuid(),
                    role: 'system',
                    content: `[系统] ${laneName}任务已完成`,
                    type: 'info',
                    timestamp: new Date().toISOString(),
                };
                await sendAndSaveMessage(connection, taskId, projectPath, completeMessage);

                connection.socket.send(JSON.stringify({
                    type: 'conversation.execute_complete',
                    taskId,
                    structuredOutput: task.structuredOutput,
                    content: completeMessage.content,
                } as ConversationWsMessage));

                console.log(`[Execution] ${laneName} execution completed successfully`);
            }
        }
    } catch (error: any) {
        console.error(`[Execution] ${laneName} execution error:`, error);

        // Update task status to failed
        const result = await findTask(taskId);
        if (result) {
            result.task.status = 'failed';
            result.task.updatedAt = new Date().toISOString();
            await writeProjectData(result.project.path, result.data);
            console.log(`[Execution] ${laneType} task ${taskId} status set to failed`);
        }

        // Save error to conversation
        const errorMessage: ConversationMessage = {
            id: uuid(),
            role: 'system',
            content: `错误: ${error.message}`,
            type: 'error',
            timestamp: new Date().toISOString(),
        };
        await sendAndSaveMessage(connection, taskId, projectPath, errorMessage);

        connection.socket.send(JSON.stringify({
            type: 'conversation.error',
            taskId,
            error: error.message,
        } as ConversationWsMessage));
    } finally {
        // Always clear the execution tracking when done
        runningLaneExecutions.delete(taskId);
        console.log(`[Execution] Cleared lane execution tracking for task: ${taskId}`);
    }
}

/**
 * Parse design markdown content to structured output
 */
function parseDesignToStructuredOutput(content: string, task: Task): StructuredOutput | null {
    // Simple extraction of key sections from markdown
    const sections: Record<string, string> = {};

    // Extract headers and their content
    const lines = content.split('\n');
    let currentSection = '';
    let currentContent: string[] = [];

    for (const line of lines) {
        const headerMatch = line.match(/^#{2,4}\s+(.+)$/);
        if (headerMatch) {
            // Save previous section
            if (currentSection && currentContent.length > 0) {
                sections[currentSection] = currentContent.join('\n').trim();
            }
            currentSection = headerMatch[1];
            currentContent = [];
        } else if (currentSection) {
            currentContent.push(line);
        }
    }

    // Save last section
    if (currentSection && currentContent.length > 0) {
        sections[currentSection] = currentContent.join('\n').trim();
    }

    // Build structured output
    if (Object.keys(sections).length > 0) {
        return {
            type: 'design',
            schemaVersion: '1.0',
            timestamp: new Date().toISOString(),
            data: {
                task: {
                    id: task.id,
                    title: task.title,
                },
                sections,
                summary: `设计方案包含 ${Object.keys(sections).length} 个部分`,
            }
        };
    }

    return null;
}
