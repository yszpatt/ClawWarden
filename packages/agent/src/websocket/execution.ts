import type { FastifyInstance } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { readGlobalConfig, readProjectData, writeProjectData } from '../utils/json-store';
import { agentManager } from '../services/agent-manager';
import { worktreeManager } from '../services/worktree-manager';
import { conversationStorage } from '../services/conversation-storage.js';
import { getSchemaForLane, getOutputTypeForLane } from '../services/schemas';
import type { TaskStatus, Lane, ProjectData, StructuredOutput, ConversationWsMessage, ConversationMessage, Task } from '@antiwarden/shared';
import { getLanePrompt } from '@antiwarden/shared';

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

type ClientMessage = ExecuteMessage | InputMessage | StopMessage | ResizeMessage | AttachMessage | ConversationUserInputMessage | ConversationDesignStartMessage;

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

        const statusUpdateListener = (event: { taskId: string, status: TaskStatus, moveTo?: string }) => {
            if (currentTaskId && event.taskId === currentTaskId) {
                // Update DB
                updateTaskStatus(event.taskId, event.status, event.moveTo).catch(console.error);

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

function handleStop(taskId: string) {
    agentManager.stopTask(taskId);
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
    await conversationStorage.appendMessage(taskId, userMessage);

    // Create assistant message placeholder
    const assistantMessageId = uuid();
    const assistantMessage: ConversationMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        status: 'streaming',
        toolCalls: [],
    };
    await conversationStorage.appendMessage(taskId, assistantMessage);

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
                type: 'conversation.thinking_start',
                taskId,
                content: thinkingContent,
            } as ConversationWsMessage));
        },

        onConversationThinkingEnd: async () => {
            console.log('[Execution] onConversationThinkingEnd');
            connection.socket.send(JSON.stringify({
                type: 'conversation.thinking_end',
                taskId,
            } as ConversationWsMessage));
        },

        onConversationToolCall: async (toolCall: any) => {
            // Track tool calls by name for updating
            const key = `${assistantMessageId}-${toolCall.name}`;
            toolCallsMap.set(key, toolCall);
            console.log('[Execution] onConversationToolCall:', toolCall.name);

            connection.socket.send(JSON.stringify({
                type: 'conversation.tool_call',
                taskId,
                toolCall,
            } as ConversationWsMessage));
        },

        onConversationComplete: async (msgId: string) => {
            console.log('[Execution] onConversationComplete:', assistantMessageId, 'total content length:', accumulatedContent.length);
            connection.socket.send(JSON.stringify({
                type: 'conversation.chunk_end',
                taskId,
                messageId: assistantMessageId,
            } as ConversationWsMessage));

            // Mark message as complete and save final state
            const conversation = await conversationStorage.load(taskId);
            if (conversation) {
                const msg = conversation.messages.find(m => m.id === assistantMessageId);
                if (msg && msg.role === 'assistant') {
                    (msg as any).status = 'complete';
                    msg.content = accumulatedContent;
                    if (toolCallsMap.size > 0) {
                        (msg as any).toolCalls = Array.from(toolCallsMap.values());
                    }
                }
                await conversationStorage.save(taskId, conversation);
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
 * Streams the design process in the conversation
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
    const workingDir = task.worktree?.path || project.path;
    const sessionId = task.claudeSession?.id;

    // Get or create conversation
    let conversation = await conversationStorage.load(taskId);
    if (!conversation) {
        conversation = {
            taskId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: [],
        };
    }

    // Create and save system message indicating design is starting
    const systemMessageId = uuid();
    const systemMessage: ConversationMessage = {
        id: systemMessageId,
        role: 'system',
        content: '[系统] 正在生成设计方案...',
        type: 'info',
        timestamp: new Date().toISOString(),
    };
    conversation.messages.push(systemMessage);
    await conversationStorage.save(taskId, conversation);

    // Send system message via WebSocket
    connection.socket.send(JSON.stringify({
        type: 'conversation.chunk_start',
        taskId,
        messageId: systemMessageId,
        content: '',
    } as ConversationWsMessage));

    connection.socket.send(JSON.stringify({
        type: 'conversation.chunk',
        taskId,
        messageId: systemMessageId,
        content: systemMessage.content + '\n',
    } as ConversationWsMessage));

    connection.socket.send(JSON.stringify({
        type: 'conversation.chunk_end',
        taskId,
        messageId: systemMessageId,
    } as ConversationWsMessage));

    // Create assistant message placeholder for the design response
    const assistantMessageId = uuid();
    const assistantMessage: ConversationMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        status: 'streaming',
    };
    conversation.messages.push(assistantMessage);
    await conversationStorage.save(taskId, conversation);

    connection.socket.send(JSON.stringify({
        type: 'conversation.chunk_start',
        taskId,
        messageId: assistantMessageId,
    } as ConversationWsMessage));

    let designContent = '';

    // Build user prompt from task data
    // Use task.prompt as the primary user prompt, fallback to title + description
    const userPrompt = task.prompt || `## 任务需求\n\n**标题**: ${task.title}\n\n**描述**:\n${task.description}`;

    const config = await readGlobalConfig();
    // Use lane prompt as system prompt (configured in settings)
    const lanePrompt = getLanePrompt('design', data, config.settings.lanePrompts || {});

    // Debug: log lane configuration
    console.log('[Execution] Lane config:', {
        laneId: 'design',
        projectLanes: data.lanes.map((l: any) => ({ id: l.id, name: l.name, hasSystemPrompt: !!l.systemPrompt })),
        globalLanePrompts: Object.keys(config.settings.lanePrompts || {}),
        lanePromptLength: lanePrompt.length,
        lanePromptPreview: lanePrompt ? lanePrompt.slice(0, 100) : '(empty)',
    });

    // Combine system prompt with user prompt (same approach as agentManager.generateDesign)
    const prompt = lanePrompt
        ? `${lanePrompt}\n\n---\n\n${userPrompt}`
        : userPrompt;

    console.log('[Execution] Starting design generation with streaming, sessionId:', sessionId);
    console.log('[Execution] Lane prompt length:', lanePrompt.length, 'User prompt length:', userPrompt.length, 'Final prompt length:', prompt.length);

    // Use query() for streaming design, maintaining session continuity
    try {
        for await (const sdkMessage of query({
            prompt,
            options: {
                allowedTools: ['Read', 'Glob', 'Grep'],
                settingSources: ['project'],
                cwd: workingDir,
                resume: sessionId,  // Resume existing session to maintain conversation context
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
                    connection.socket.send(JSON.stringify({
                        type: 'conversation.chunk',
                        taskId,
                        messageId: assistantMessageId,
                        content: '',
                    } as ConversationWsMessage));
                } else if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                    const delta = event.delta.text || '';
                    designContent += delta;
                    connection.socket.send(JSON.stringify({
                        type: 'conversation.chunk',
                        taskId,
                        messageId: assistantMessageId,
                        content: delta,
                    } as ConversationWsMessage));
                } else if (event?.type === 'content_block_stop') {
                    // Block completed, update conversation storage
                    const conv = await conversationStorage.load(taskId);
                    if (conv) {
                        const msg = conv.messages.find(m => m.id === assistantMessageId);
                        if (msg && msg.role === 'assistant') {
                            (msg as any).content = designContent;
                            (msg as any).status = 'streaming';
                            await conversationStorage.save(taskId, conv);
                        }
                    }
                }
            }

            // Handle assistant messages
            else if (sdkMessage.type === 'assistant') {
                const content = (sdkMessage as any).message?.content;
                if (Array.isArray(content)) {
                    for (const block of content) {
                        if (block.type === 'text') {
                            designContent += block.text || '';
                            connection.socket.send(JSON.stringify({
                                type: 'conversation.chunk',
                                taskId,
                                messageId: assistantMessageId,
                                content: block.text || '',
                            } as ConversationWsMessage));
                        }
                    }
                }
            }

            // Handle result
            else if (sdkMessage.type === 'result') {
                console.log('[Execution] Design generation completed, content length:', designContent.length);

                // Mark assistant message as complete
                const conv = await conversationStorage.load(taskId);
                if (conv) {
                    const msg = conv.messages.find(m => m.id === assistantMessageId);
                    if (msg && msg.role === 'assistant') {
                        (msg as any).content = designContent;
                        (msg as any).status = 'complete';
                        await conversationStorage.save(taskId, conv);
                    }
                }

                connection.socket.send(JSON.stringify({
                    type: 'conversation.chunk_end',
                    taskId,
                    messageId: assistantMessageId,
                } as ConversationWsMessage));

                // Save design to file
                const designsDir = path.join(workingDir, '.antiwarden', 'designs');
                await fs.mkdir(designsDir, { recursive: true });
                const designFileName = `${task.id}-design.md`;
                const designPath = path.join(designsDir, designFileName);
                await fs.writeFile(designPath, designContent, 'utf-8');

                // Update task status
                task.status = 'pending-dev';
                task.designPath = path.relative(workingDir, designPath);
                task.updatedAt = new Date().toISOString();
                await writeProjectData(project.path, data);

                // Add completion system message to conversation
                const completeMessage: ConversationMessage = {
                    id: uuid(),
                    role: 'system',
                    content: `[系统] 设计方案已生成并保存到: ${task.designPath}`,
                    type: 'info',
                    timestamp: new Date().toISOString(),
                };
                const finalConv = await conversationStorage.load(taskId);
                if (finalConv) {
                    finalConv.messages.push(completeMessage);
                    await conversationStorage.save(taskId, finalConv);
                }

                // Send design complete message
                connection.socket.send(JSON.stringify({
                    type: 'conversation.design_complete',
                    taskId,
                    designPath: task.designPath,
                    content: completeMessage.content,
                } as ConversationWsMessage));

                // Also send structured-output if design contains structured data
                const structuredOutput = parseDesignToStructuredOutput(designContent, task);
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
            }
        }
    } catch (error: any) {
        console.error('[Execution] Design generation error:', error);

        // Save error to conversation
        const conv = await conversationStorage.load(taskId);
        if (conv) {
            const errorMessage: ConversationMessage = {
                id: uuid(),
                role: 'system',
                content: `错误: ${error.message}`,
                type: 'error',
                timestamp: new Date().toISOString(),
            };
            conv.messages.push(errorMessage);
            await conversationStorage.save(taskId, conv);
        }

        connection.socket.send(JSON.stringify({
            type: 'conversation.error',
            taskId,
            error: error.message,
        } as ConversationWsMessage));
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
