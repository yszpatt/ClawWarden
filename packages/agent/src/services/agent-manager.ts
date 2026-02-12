import { EventEmitter } from 'events';
import { query, createSdkMcpServer, Options, McpSdkServerConfigWithInstance, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { TaskStatus, ToolCall } from '@clawwarden/shared';
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { v4 as uuid } from 'uuid';
import { patchTask } from '../utils/json-store';

export interface AgentCallbacks {
    onLog: (message: string) => void;
    onOutput: (data: string) => void;
    onError: (error: Error) => void;
    onStatusUpdate?: (status: TaskStatus, moveTo?: string) => void | Promise<void>;
    onSessionStart?: (sessionId: string) => void | Promise<void>;
    onStructuredOutput?: (output: unknown) => void | Promise<void>;
    // Conversation callbacks
    onConversationChunk?: (messageId: string, content: string) => void | Promise<void>;
    onConversationThinkingStart?: (content: string) => void | Promise<void>;
    onConversationThinkingEnd?: () => void | Promise<void>;
    onConversationToolCall?: (toolCall: ToolCall) => void | Promise<void>;
    onConversationChunkEnd?: (messageId: string) => void | Promise<void>;
    onConversationComplete?: (messageId: string, output?: any) => void | Promise<void>;
}

export class AgentManager extends EventEmitter {
    private ready: Promise<void>;
    private sessions: Map<string, {
        queryInstance: ReturnType<typeof query>;
        inputQueue: SDKUserMessage[];
        inputNotify: (() => void) | null;
        inputStream: any;
        claudeSessionId?: string;
        outputBuffer: string;
        completed?: boolean;
        laneId?: string;
    }> = new Map();

    private initializingTasks = new Set<string>();

    constructor() {
        super();
        this.ready = this.loadGlobalSettings();
    }

    private async loadGlobalSettings() {
        try {
            const settingsPath = join(homedir(), '.claude', 'settings.json');
            const data = await readFile(settingsPath, 'utf-8');
            const settings = JSON.parse(data);

            if (settings.env) {
                for (const [key, value] of Object.entries(settings.env)) {
                    if (!process.env[key] && typeof value === 'string') {
                        process.env[key] = value;
                    }
                }
            }
        } catch (error) {
            // Ignore settings load errors
        }
    }

    /**
     * Generate a plan document for a task
     */
    async generatePlan(
        taskId: string,
        projectPath: string,
        userPrompt: string,
        systemPrompt?: string,
        callbacks?: AgentCallbacks,
        outputFormat?: { type: 'json_schema'; schema: Record<string, unknown> }
    ): Promise<string> {
        this.initializingTasks.add(taskId);
        let content = '';
        try {
            await this.ready;
            console.log(`[AgentManager] generatePlan for task: ${taskId}`);

            const prompt = systemPrompt ? `${systemPrompt}\n\n---\n\n${userPrompt}` : userPrompt;
            const queryOptions: Record<string, unknown> = {
                allowedTools: ['Read', 'Glob', 'Grep'],
                settingSources: ['project'],
                cwd: projectPath,
            };

            if (outputFormat) queryOptions.outputFormat = outputFormat;

            const stream = query({ prompt, options: queryOptions });
            this.sessions.set(taskId, {
                queryInstance: stream as any,
                inputQueue: [],
                inputNotify: null,
                inputStream: null,
                outputBuffer: ''
            });
            this.initializingTasks.delete(taskId);

            let sdkSessionId: string | undefined;
            for await (const message of stream) {
                if (!sdkSessionId && (message as any).session_id) {
                    sdkSessionId = (message as any).session_id as string;
                    const session = this.sessions.get(taskId);
                    if (session) session.claudeSessionId = sdkSessionId;
                    await patchTask(taskId, {
                        claudeSession: { id: sdkSessionId, createdAt: new Date().toISOString() }
                    });
                    callbacks?.onSessionStart?.(sdkSessionId);
                }

                if (message.type === 'stream_event') {
                    const event = message.event;
                    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                        const text = event.delta.text;
                        content += text;
                        callbacks?.onOutput(text);
                        const session = this.sessions.get(taskId);
                        if (session) session.outputBuffer += text;
                    }
                } else if (message.type === 'assistant') {
                    if (message.message.content) {
                        for (const block of message.message.content) {
                            if (block.type === 'tool_use') {
                                const toolMsg = `[Plan Agent] Reading: ${block.name}\r\n`;
                                callbacks?.onLog(toolMsg);
                                const session = this.sessions.get(taskId);
                                if (session) session.outputBuffer += `\x1b[36m${toolMsg}\x1b[0m`;
                            } else if (block.type === 'text') {
                                content += block.text;
                                callbacks?.onLog(`[Plan] Generating content...`);
                                const session = this.sessions.get(taskId);
                                if (session) session.outputBuffer += block.text;
                            }
                        }
                    }
                } else if (message.type === 'result') {
                    if ((message as any).structured_output) {
                        await callbacks?.onStructuredOutput?.((message as any).structured_output);
                    }
                    if (message.subtype === 'error_during_execution') {
                        callbacks?.onError(new Error((message as any).errors?.join('\n') || 'Unknown error'));
                    }
                }
            }
            return content;
        } catch (error: any) {
            this.initializingTasks.delete(taskId);
            if (!error.message?.includes('Process exited') || !content) {
                callbacks?.onError?.(error);
                throw error;
            }
            return content;
        } finally {
            const session = this.sessions.get(taskId);
            if (session) session.completed = true;
        }
    }

    /**
     * Start task execution loop in background
     */
    async startTaskExecution(
        taskId: string,
        projectPath: string,
        prompt: string,
        resumeSessionId?: string,
        outputFormat?: { type: 'json_schema'; schema: Record<string, unknown> },
        laneId?: string,
        callbacks?: AgentCallbacks
    ): Promise<string> {
        this.initializingTasks.add(taskId);
        try {
            await this.ready;
            if (this.sessions.has(taskId)) {
                this.initializingTasks.delete(taskId);
                return this.sessions.get(taskId)?.claudeSessionId || '';
            }

            await patchTask(taskId, { status: 'running' });

            const inputQueue: SDKUserMessage[] = [];
            let inputNotify: (() => void) | null = null;
            const inputStream = {
                [Symbol.asyncIterator]() {
                    return {
                        async next() {
                            if (inputQueue.length === 0) {
                                await new Promise<void>(resolve => { inputNotify = resolve; });
                            }
                            // Check if closed while waiting
                            if (inputQueue.length === 0) return { value: undefined as any, done: true };
                            const value = inputQueue.shift();
                            return { value: value!, done: false };
                        }
                    };
                }
            };

            const antiWardenServer = createSdkMcpServer({
                name: 'ClawWarden-Tools',
                version: '1.0.0',
                tools: [{
                    name: 'antiwarden_update',
                    description: 'Update task status and lane.',
                    inputSchema: z.object({
                        status: z.enum(['idle', 'running', 'completed', 'failed', 'pending-dev', 'pending-merge', 'awaiting-review']),
                        moveTo: z.enum(['plan', 'develop', 'test', 'pending-merge', 'archived']).optional(),
                        description: z.string().optional()
                    }),
                    handler: async (args) => {
                        const { status, moveTo } = args;
                        await patchTask(taskId, { status, laneId: moveTo });
                        await callbacks?.onStatusUpdate?.(status as TaskStatus, moveTo as string | undefined);
                        return { content: [{ type: 'text', text: `Updated to ${status}` }] };
                    }
                }]
            });

            const queryOptions: Options = {
                allowedTools: ['Bash', 'Read', 'Edit', 'Glob', 'Grep', 'Find', 'Write', 'antiwarden_update'],
                settingSources: ['project'],
                cwd: projectPath,
                mcpServers: { 'antiwarden-local': antiWardenServer },
                resume: resumeSessionId,
                permissionMode: 'default'
            };

            if (outputFormat) (queryOptions as any).outputFormat = outputFormat;

            const queryInstance = query({ prompt, options: queryOptions });
            this.sessions.set(taskId, {
                queryInstance,
                inputQueue,
                inputNotify,
                inputStream,
                claudeSessionId: resumeSessionId,
                outputBuffer: '',
                laneId
            });
            this.initializingTasks.delete(taskId);

            // Execute loop in background
            (async () => {
                let taskSuccess = false;
                try {
                    queryInstance.streamInput(inputStream as any);
                    let currentSessionId = resumeSessionId || '';

                    if (currentSessionId) {
                        await patchTask(taskId, {
                            claudeSession: { id: currentSessionId, createdAt: new Date().toISOString() }
                        });
                        this.emit('sessionStart', { taskId, sessionId: currentSessionId });
                        callbacks?.onSessionStart?.(currentSessionId);
                    }

                    for await (const message of queryInstance) {
                        if (!currentSessionId && message.session_id) {
                            currentSessionId = message.session_id;
                            const session = this.sessions.get(taskId);
                            if (session) session.claudeSessionId = currentSessionId;
                            await patchTask(taskId, {
                                claudeSession: { id: currentSessionId, createdAt: new Date().toISOString() }
                            });
                            this.emit('sessionStart', { taskId, sessionId: currentSessionId });
                            callbacks?.onSessionStart?.(currentSessionId);
                        }

                        if (message.type === 'assistant') {
                            if (message.message.content) {
                                for (const block of message.message.content) {
                                    if (block.type === 'tool_use') {
                                        const msg = `\x1b[36m[Tool Use] ${block.name}: ${JSON.stringify(block.input)}\r\n\x1b[0m`;
                                        this.emit('output', { taskId, data: msg });
                                        const session = this.sessions.get(taskId);
                                        if (session) session.outputBuffer += msg;
                                    } else if (block.type === 'text') {
                                        this.emit('output', { taskId, data: block.text });
                                        const session = this.sessions.get(taskId);
                                        if (session) session.outputBuffer += block.text;
                                    }
                                }
                            }
                        } else if (message.type === 'stream_event') {
                            const event = message.event;
                            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                                this.emit('output', { taskId, data: event.delta.text });
                                const session = this.sessions.get(taskId);
                                if (session) session.outputBuffer += event.delta.text;
                            }
                        } else if (message.type === 'result') {
                            if ((message as any).structured_output) {
                                const session = this.sessions.get(taskId);
                                await callbacks?.onStructuredOutput?.((message as any).structured_output);
                                this.emit('structuredOutput', { taskId, output: (message as any).structured_output, laneId: session?.laneId });
                            }
                            if (message.subtype === 'success') {
                                taskSuccess = true;
                                await patchTask(taskId, { status: 'completed' });
                                await callbacks?.onStatusUpdate?.('completed');
                                await callbacks?.onConversationComplete?.(`msg-end-${Date.now()}`, (message as any).structured_output);
                                this.emit('statusUpdate', { taskId, status: 'completed' });
                            } else {
                                await patchTask(taskId, { status: 'failed' });
                                await callbacks?.onError?.(new Error((message as any).errors?.join('\n') || 'Failed'));
                            }
                        }
                    }
                } catch (err) {
                    if (!taskSuccess) {
                        const session = this.sessions.get(taskId);
                        if (!session?.completed) {
                            await patchTask(taskId, { status: 'failed' });
                            this.emit('error', { taskId, error: err });
                        }
                    }
                } finally {
                    const session = this.sessions.get(taskId);
                    if (session) session.completed = true;
                    this.emit('exit', { taskId, code: 0 });
                }
            })();

            return resumeSessionId || '';
        } catch (error) {
            this.initializingTasks.delete(taskId);
            await patchTask(taskId, { status: 'failed' });
            throw error;
        }
    }

    async sendUserMessage(
        taskId: string,
        projectPath: string,
        userMessage: string,
        callbacks?: AgentCallbacks,
        existingSessionId?: string,
        options?: {
            allowedTools?: string[];
            outputFormat?: { type: 'json_schema'; schema: Record<string, unknown> };
            laneId?: string;
        }
    ): Promise<string> {
        const resumeSessionId = existingSessionId || this.getSessionId(taskId);
        const queryOptions: Record<string, unknown> = {
            allowedTools: options?.allowedTools || ['Read', 'Glob', 'Grep', 'Bash'],
            settingSources: ['project'],
            cwd: projectPath,
            resume: resumeSessionId
        };
        if (options?.outputFormat) queryOptions.outputFormat = options.outputFormat;

        try {
            let messageId = this.generateMessageId();
            const pendingToolCalls = new Map<string, ToolCall>();

            const queryInstance = query({ prompt: userMessage, options: queryOptions as any });
            const session = this.sessions.get(taskId);
            if (session) {
                session.queryInstance = queryInstance;
            } else {
                this.sessions.set(taskId, {
                    queryInstance,
                    inputQueue: [],
                    inputNotify: null,
                    inputStream: null,
                    claudeSessionId: resumeSessionId,
                    outputBuffer: '',
                    laneId: options?.laneId
                });
            }

            for await (const message of queryInstance) {
                if (message.session_id && !this.getSessionId(taskId)) {
                    this.setSessionId(taskId, message.session_id);
                    callbacks?.onSessionStart?.(message.session_id);
                }

                if (message.type === 'stream_event') {
                    const event = (message as any).event;
                    if (event?.type === 'content_block_start') {
                        callbacks?.onConversationChunk?.(messageId, '');
                    } else if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                        callbacks?.onConversationChunk?.(messageId, event.delta.text);
                    } else if (event?.type === 'content_block_stop') {
                        callbacks?.onConversationChunkEnd?.(messageId);
                        messageId = this.generateMessageId();
                    }
                } else if (message.type === 'assistant') {
                    const content = (message as any).message?.content;
                    if (Array.isArray(content)) {
                        for (const block of content) {
                            if (block.type === 'text') {
                                callbacks?.onConversationChunk?.(messageId, block.text);
                            } else if (block.type === 'tool_use') {
                                const toolCall: ToolCall = { name: block.name, input: block.input, status: 'pending' };
                                pendingToolCalls.set(`${messageId}-${block.name}`, toolCall);
                                callbacks?.onConversationToolCall?.(toolCall);
                            }
                        }
                    }
                } else if (message.type === 'user') {
                    const content = (message as any).message?.content;
                    if (Array.isArray(content)) {
                        for (const block of content) {
                            if (block.type === 'tool_result') {
                                const toolId = `${messageId}-${block.name}`;
                                const toolCall = pendingToolCalls.get(toolId);
                                if (toolCall) {
                                    toolCall.status = block.is_error ? 'error' : 'success';
                                    toolCall.output = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
                                    callbacks?.onConversationToolCall?.(toolCall);
                                }
                            }
                        }
                    }
                } else if (message.type === 'result') {
                    if ((message as any).structured_output) {
                        const session = this.sessions.get(taskId);
                        await callbacks?.onStructuredOutput?.((message as any).structured_output);
                        this.emit('structuredOutput', { taskId, output: (message as any).structured_output, laneId: options?.laneId || session?.laneId });
                    }
                    await callbacks?.onConversationChunkEnd?.(messageId);
                    await callbacks?.onConversationComplete?.(messageId, (message as any).structured_output);
                }
            }
            return resumeSessionId || '';
        } catch (error: any) {
            callbacks?.onError?.(error);
            throw error;
        }
    }

    sendInput(taskId: string, text: string) {
        const session = this.sessions.get(taskId);
        if (session) {
            const msg: SDKUserMessage = {
                type: 'user',
                message: { role: 'user', content: [{ type: 'text', text }] },
                parent_tool_use_id: null,
                session_id: session.claudeSessionId || 'unknown'
            };
            session.inputQueue.push(msg);
            if (session.inputNotify) {
                const notify = session.inputNotify;
                session.inputNotify = null;
                notify();
            }
        }
    }

    stopTask(taskId: string) {
        const session = this.sessions.get(taskId);
        if (session) {
            if (session.queryInstance && typeof session.queryInstance.close === 'function') {
                try {
                    session.queryInstance.close();
                } catch (e) {
                    console.error(`[AgentManager] Error closing query for ${taskId}:`, e);
                }
            }
            if (session.inputNotify) {
                const notify = session.inputNotify;
                session.inputNotify = null;
                notify(); // Wake up any hanging next() calls
            }
            session.completed = true;
            this.emit('statusUpdate', { taskId, status: 'idle' });
        }
    }

    getSessionOutput(taskId: string): string | undefined {
        return this.sessions.get(taskId)?.outputBuffer;
    }

    getSessionId(taskId: string): string | undefined {
        return this.sessions.get(taskId)?.claudeSessionId;
    }

    getSessionInfo(taskId: string): { claudeSessionId?: string, laneId?: string, outputBuffer?: string, completed?: boolean } | undefined {
        return this.sessions.get(taskId);
    }

    private generateMessageId(): string {
        return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    private setSessionId(taskId: string, sessionId: string): void {
        const session = this.sessions.get(taskId);
        if (session) {
            session.claudeSessionId = sessionId;
        } else {
            this.sessions.set(taskId, {
                queryInstance: null as any,
                inputQueue: [],
                inputNotify: null,
                inputStream: null,
                claudeSessionId: sessionId,
                outputBuffer: ''
            });
        }
    }
}

export const agentManager = new AgentManager();
