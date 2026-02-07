import { EventEmitter } from 'events';
import { query, createSdkMcpServer, Options, McpSdkServerConfigWithInstance, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { TaskStatus } from '@clawwarden/shared';
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

import type { ToolCall } from '@clawwarden/shared';

export interface AgentCallbacks {
    onLog: (message: string) => void;
    onOutput: (data: string) => void;
    onError: (error: Error) => void;
    onStatusUpdate?: (status: TaskStatus, moveTo?: string) => void;
    onSessionStart?: (sessionId: string) => void;
    onStructuredOutput?: (output: unknown) => void;
    // Conversation callbacks
    onConversationChunk?: (messageId: string, content: string) => void;
    onConversationThinkingStart?: (content: string) => void;
    onConversationThinkingEnd?: () => void;
    onConversationToolCall?: (toolCall: ToolCall) => void;
    onConversationComplete?: (messageId: string) => void;
}

export class AgentManager extends EventEmitter {
    private ready: Promise<void>;

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
                        // console.log(`[AgentManager] Loaded env var from settings: ${key}`);
                    }
                }
            }
        } catch (error) {
            // Ignore if file doesn't exist or is invalid
            // console.warn('[AgentManager] Failed to load global settings:', error);
        }
    }

    /**
     * Generate a plan document for a task using the Agent SDK.
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
            console.log(`[AgentManager] generatePlan called for task: ${taskId}`);
            console.log(`[AgentManager] projectPath: ${projectPath}`);
            console.log(`[AgentManager] userPrompt length: ${userPrompt?.length || 0}`);
            console.log(`[AgentManager] systemPrompt length: ${systemPrompt?.length || 0}`);
            console.log(`[AgentManager] outputFormat:`, outputFormat ? 'enabled' : 'none');
            callbacks?.onLog(`[AgentManager] Starting plan generation for task: ${taskId}`);


            const prompt = systemPrompt
                ? `${systemPrompt}\n\n---\n\n${userPrompt}`
                : userPrompt;

            const queryOptions: Record<string, unknown> = {
                allowedTools: ['Read', 'Glob', 'Grep'],
                settingSources: ['project'],
                cwd: projectPath,
            };

            if (outputFormat) {
                queryOptions.outputFormat = outputFormat;
            }

            console.log(`[AgentManager] Calling SDK query() for plan...`);
            const stream = query({
                prompt,
                options: queryOptions
            });
            console.log(`[AgentManager] SDK query() returned, starting message loop...`);

            // Register temporary session for output buffering
            this.sessions.set(taskId, {
                queryInstance: stream as any,
                inputQueue: [],
                inputNotify: null,
                inputStream: null,
                outputBuffer: ''
            });
            this.initializingTasks.delete(taskId);

            let messageCount = 0;
            let sdkSessionId: string | undefined;
            for await (const message of stream) {
                messageCount++;
                console.log(`[AgentManager] Plan Message #${messageCount}: type=${message.type}, has_session_id=${!!(message as any).session_id}`);

                // Capture SDK session ID from first message
                if (!sdkSessionId && (message as any).session_id) {
                    sdkSessionId = (message as any).session_id as string;
                    console.log(`[AgentManager] Captured SDK session ID: ${sdkSessionId}`);
                    if (callbacks?.onSessionStart) {
                        callbacks.onSessionStart(sdkSessionId);
                    }
                    // Update session store with SDK's session ID
                    const session = this.sessions.get(taskId);
                    if (session) session.claudeSessionId = sdkSessionId;
                }

                // Handle streaming text events
                if (message.type === 'stream_event') {
                    const event = message.event;
                    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                        const text = event.delta.text;
                        content += text;
                        callbacks?.onOutput(text);
                        // Update buffer
                        const session = this.sessions.get(taskId);
                        if (session) session.outputBuffer += text;
                    }
                }
                // Handle Tool Use (Assistant)
                else if (message.type === 'assistant') {
                    if (message.message.content) {
                        for (const block of message.message.content) {
                            if (block.type === 'tool_use') {
                                const toolUseMsg = `[Plan Agent] Reading: ${block.name} ${JSON.stringify(block.input)}\r\n`;
                                console.log(`[AgentManager] Tool use: ${block.name}`);
                                callbacks?.onLog(toolUseMsg); // Use log for plan steps to distinguish from content
                                // Update buffer
                                const session = this.sessions.get(taskId);
                                if (session) session.outputBuffer += `\x1b[36m${toolUseMsg}\x1b[0m`;
                            } else if (block.type === 'text') {
                                // Text blocks in assistant messages
                                console.log(`[AgentManager] Assistant text block, length: ${block.text?.length || 0}`);
                                content += block.text;
                                // Don't stream markdown to terminal for plan generation
                                // The content will be displayed in the plan preview panel
                                callbacks?.onLog(`[Plan] Generating content... (${content.length} chars)`);
                                const session = this.sessions.get(taskId);
                                if (session) session.outputBuffer += block.text;
                            }
                        }
                    }
                }
                // Handle user messages (tool results)
                else if (message.type === 'user') {
                    console.log(`[AgentManager] User message, content blocks: ${(message.message as any).content?.length || 0}`);
                }
                // Handle result messages
                else if (message.type === 'result') {
                    console.log(`[AgentManager] Result message: subtype=${message.subtype}`);
                    // Check for structured output
                    if ((message as any).structured_output) {
                        console.log(`[AgentManager] Structured output received:`, JSON.stringify((message as any).structured_output, null, 2));
                        callbacks?.onStructuredOutput?.((message as any).structured_output);
                    }
                    if (message.subtype === 'error_during_execution') {
                        console.log(`[AgentManager] Execution errors:`, (message as any).errors);
                        callbacks?.onError(new Error((message as any).errors?.join('\n') || 'Unknown error'));
                    } else if (message.subtype === 'success') {
                        console.log(`[AgentManager] Plan generation completed successfully`);
                    }
                }
                // Log unknown message types
                else {
                    console.log(`[AgentManager] Unknown message type: ${message.type}`);
                }
            }

            console.log(`[AgentManager] Plan message loop ended. Total messages: ${messageCount}, Content length: ${content.length}`);
            callbacks?.onLog(`[AgentManager] Generation complete. Content length: ${content.length}`);
            return content;

        } catch (error: any) {
            this.initializingTasks.delete(taskId);
            console.error(`[AgentManager] Plan generation error for task ${taskId}:`, error);
            console.error(`[AgentManager] Error message: ${error?.message}`);
            console.error(`[AgentManager] Error stack: ${error?.stack}`);
            // Ignore process exit error if we got content
            if (!error.message?.includes('Process exited') || !content) {
                if (callbacks?.onError) {
                    callbacks.onError(error);
                }
                throw error;
            }
            return content;
        } finally {
            // Mark session as completed instead of deleting, so frontend can still view historical output
            const session = this.sessions.get(taskId);
            if (session) {
                session.completed = true;
                console.log(`[AgentManager] Marked task ${taskId} session as completed, keeping output buffer`);
            }
        }
    }

    /**
     * Execute a task using the full Agent SDK capabilities.
     * Returns a session controller to manage input and cancellation.
     */

    private sessions: Map<string, {
        queryInstance: ReturnType<typeof query>;
        inputQueue: SDKUserMessage[];
        inputNotify: (() => void) | null;
        inputStream: any;
        claudeSessionId?: string;
        outputBuffer: string;
        completed?: boolean;  // Mark as completed to allow historical output viewing
    }> = new Map();

    private initializingTasks = new Set<string>();

    getSessionOutput(taskId: string): string | undefined {
        if (this.initializingTasks.has(taskId)) {
            return '';
        }
        return this.sessions.get(taskId)?.outputBuffer;
    }

    getSessionInfo(taskId: string): { claudeSessionId?: string } | undefined {
        return this.sessions.get(taskId);
    }

    /**
     * Execute a task using the full Agent SDK capabilities.
     * Manages the session internally and emits events.
     */
    async startTaskExecution(
        taskId: string,
        projectPath: string,
        prompt: string,
        resumeSessionId?: string,
        outputFormat?: { type: 'json_schema'; schema: Record<string, unknown> }
    ): Promise<string> { // Returns Claude Session ID
        // Mark as initializing immediately to prevent race conditions
        this.initializingTasks.add(taskId);

        console.log(`[AgentManager] startTaskExecution called:`);
        console.log(`  - taskId: ${taskId}`);
        console.log(`  - projectPath: ${projectPath}`);
        console.log(`  - resumeSessionId: ${resumeSessionId || 'none'}`);
        console.log(`  - existing session in Map: ${this.sessions.has(taskId)}`);

        try {
            await this.ready;
            if (this.sessions.has(taskId)) {
                this.initializingTasks.delete(taskId);
                this.emit('log', { taskId, message: 'Resuming existing in-memory session...' });
                console.log(`[AgentManager] Reusing existing in-memory session for task: ${taskId}`);
                return this.sessions.get(taskId)?.claudeSessionId || '';
            }

            this.emit('log', { taskId, message: `[AgentManager] Starting execution for task: ${taskId}` });
            if (resumeSessionId) {
                this.emit('log', { taskId, message: `[AgentManager] Attempting to resume Claude session: ${resumeSessionId}` });
                console.log(`[AgentManager] Will resume with SDK session ID: ${resumeSessionId}`);
            }

            // Input stream mechanism
            const inputQueue: SDKUserMessage[] = [];
            let inputNotify: (() => void) | null = null;

            const inputStream = {
                [Symbol.asyncIterator]() {
                    return {
                        async next() {
                            if (inputQueue.length === 0) {
                                await new Promise<void>(resolve => { inputNotify = resolve; });
                            }
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
                    description: 'Update the status of the current task in ClawWarden. Use this when you start working, complete a task, or encounter a failure. You can also move the task to a different lane.',
                    inputSchema: z.object({
                        status: z.enum(['idle', 'running', 'completed', 'failed', 'pending-dev', 'pending-merge']).describe('The new status of the task.'),
                        moveTo: z.enum(['plan', 'develop', 'test', 'pending-merge', 'archived']).optional().describe('Move the task to a new Kanban lane.'),
                        description: z.string().optional().describe('A brief description of the update.')
                    }),
                    handler: async (args) => {
                        const { status, moveTo, description } = args;
                        this.emit('log', { taskId, message: `[AgentManager] Skill Triggered: Status=${status}, MoveTo=${moveTo || 'N/A'}` });
                        this.emit('statusUpdate', { taskId, status, moveTo });
                        return {
                            content: [{ type: 'text', text: `Task updated successfully. Status: ${status}, Lane: ${moveTo || 'Unchanged'}` }]
                        };
                    }
                }]
            });

            const mcpServers: Record<string, McpSdkServerConfigWithInstance> = {
                'antiwarden-local': antiWardenServer
            };

            const options: Options = {
                allowedTools: ['Bash', 'Read', 'Edit', 'Glob', 'Grep', 'Find', 'Write', 'antiwarden_update'],
                settingSources: ['project'],
                cwd: projectPath,
                mcpServers,
                resume: resumeSessionId,
                permissionMode: 'default'
            };

            // Add outputFormat if provided
            if (outputFormat) {
                (options as any).outputFormat = outputFormat;
            }

            console.log(`[AgentManager] SDK Options:`, {
                allowedTools: options.allowedTools,
                cwd: options.cwd,
                resume: options.resume || 'none',
                permissionMode: options.permissionMode,
                mcpServers: Object.keys(options.mcpServers || {}),
                outputFormat: outputFormat ? 'enabled' : 'none'
            });

            let queryInstance: ReturnType<typeof query>;
            try {
                console.log(`[AgentManager] Calling SDK query()...`);
                queryInstance = query({
                    prompt,
                    options
                });
                console.log(`[AgentManager] SDK query() returned successfully`);
            } catch (err: any) {
                this.initializingTasks.delete(taskId);
                this.emit('error', { taskId, error: err });
                throw err;
            }

            // Store session
            this.sessions.set(taskId, {
                queryInstance,
                inputQueue,
                inputNotify,
                inputStream,
                claudeSessionId: resumeSessionId,
                outputBuffer: ''
            });

            // Initialization complete
            this.initializingTasks.delete(taskId);

            // Run the loop in background
            (async () => {
                let taskSuccess = false;
                try {
                    // Capture session ID
                    let currentStateSessionId = resumeSessionId || '';
                    let sessionStartEmitted = !!resumeSessionId; // Already have session ID, will emit after setup

                    console.log(`[AgentManager] Starting message loop for task: ${taskId}`);
                    console.log(`[AgentManager] Initial currentStateSessionId: ${currentStateSessionId || 'none'}`);

                    queryInstance.streamInput(inputStream as any);

                    // Emit sessionStart for resume case
                    if (sessionStartEmitted && currentStateSessionId) {
                        console.log(`[AgentManager] Emitting sessionStart for resumed session: ${currentStateSessionId}`);
                        this.emit('sessionStart', { taskId, sessionId: currentStateSessionId });
                    }

                    let messageCount = 0;
                    for await (const message of queryInstance) {
                        messageCount++;
                        console.log(`[AgentManager] Message #${messageCount} type: ${message.type}, has session_id: ${!!message.session_id}`);

                        // Capture session ID from first message if not set
                        if (!currentStateSessionId && message.session_id) {
                            currentStateSessionId = message.session_id;
                            console.log(`[AgentManager] Captured session ID from message: ${currentStateSessionId}`);
                            // Update session store
                            const session = this.sessions.get(taskId);
                            if (session) session.claudeSessionId = currentStateSessionId;
                            this.emit('sessionStart', { taskId, sessionId: currentStateSessionId });
                        } else if (currentStateSessionId && message.session_id && message.session_id !== currentStateSessionId) {
                            console.log(`[AgentManager] Session ID changed from ${currentStateSessionId} to ${message.session_id}`);
                        }

                        if (message.type === 'assistant') {
                            // Check for tool use
                            if (message.message.content) {
                                for (const block of message.message.content) {
                                    if (block.type === 'tool_use') {
                                        const toolUseMsg = `[Tool Use] ${block.name}: ${JSON.stringify(block.input)}\r\n`;
                                        const coloredMsg = `\x1b[36m${toolUseMsg}\x1b[0m`; // Cyan
                                        this.emit('output', { taskId, data: coloredMsg });
                                        const session = this.sessions.get(taskId);
                                        if (session) session.outputBuffer += coloredMsg;
                                    } else if (block.type === 'text') {
                                        // Ensure text is printed if not streamed
                                        this.emit('output', { taskId, data: block.text });
                                        const session = this.sessions.get(taskId);
                                        if (session) session.outputBuffer += block.text;
                                    }
                                }
                            }
                        } else if (message.type === 'user') {
                            // Check for tool results
                            if (message.message.content) {
                                for (const block of message.message.content) {
                                    if (block.type === 'tool_result') {
                                        let output = '';
                                        let coloredOutput = '';
                                        if (block.is_error) {
                                            output = `[Tool Error] ${block.content || 'Unknown error'}\r\n`;
                                            coloredOutput = `\x1b[31m${output}\x1b[0m`; // Red
                                            this.emit('output', { taskId, data: coloredOutput });
                                        } else {
                                            if (typeof block.content === 'string') {
                                                output = `[Tool Result] ${block.content}\r\n`;
                                            } else if (Array.isArray(block.content)) {
                                                output = `[Tool Result] (Multimedia content)\r\n`;
                                            }
                                            if (output) {
                                                coloredOutput = `\x1b[90m${output}\x1b[0m`; // Gray
                                                this.emit('output', { taskId, data: coloredOutput });
                                            }
                                        }
                                        if (coloredOutput) {
                                            const session = this.sessions.get(taskId);
                                            if (session) session.outputBuffer += coloredOutput;
                                        }
                                    }
                                }
                            }
                        } else if (message.type === 'stream_event') {
                            const event = message.event;
                            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                                const text = event.delta.text;
                                this.emit('output', { taskId, data: text });
                                // Update buffer
                                const session = this.sessions.get(taskId);
                                if (session) session.outputBuffer += text;
                            }
                        } else if (message.type === 'tool_use_summary') {
                            this.emit('log', { taskId, message: `[AgentManager] Tool Summary: ${message.summary}` });
                            console.log(`[AgentManager] Tool use summary for task ${taskId}:`, message.summary);
                        } else if (message.type === 'result') {
                            console.log(`[AgentManager] Result message for task ${taskId}:`, {
                                subtype: message.subtype,
                                hasErrors: !!(message as any).errors,
                                hasStructuredOutput: !!(message as any).structured_output
                            });
                            // Check for structured output
                            if ((message as any).structured_output) {
                                console.log(`[AgentManager] Structured output received for task ${taskId}:`, JSON.stringify((message as any).structured_output, null, 2));
                                this.emit('structuredOutput', { taskId, output: (message as any).structured_output });
                            }
                            if (message.subtype === 'success') {
                                taskSuccess = true;
                                this.emit('log', { taskId, message: `[AgentManager] Task Completed.` });
                                this.emit('statusUpdate', { taskId, status: 'completed' });
                            } else {
                                const resultError = message as any;
                                console.log(`[AgentManager] Result errors:`, resultError.errors);
                                this.emit('error', { taskId, error: new Error(resultError.errors?.join('\n') || 'Execution failed') });
                            }
                        }
                    }
                } catch (error: any) {
                    console.log(`[AgentManager] Error in message loop for task ${taskId}:`, error.message);
                    // Ignore process exit error if task was successful
                    // The SDK might throw 'Process exited with code 1' even on success if cleanup is messy
                    if (!error.message?.includes('Process exited') || !taskSuccess) {
                        this.emit('error', { taskId, error });
                    }
                } finally {
                    // Mark session as completed instead of deleting, so frontend can still view historical output
                    const session = this.sessions.get(taskId);
                    if (session) {
                        session.completed = true;
                        console.log(`[AgentManager] Marked task ${taskId} session as completed (execution), keeping output buffer`);
                    }
                    this.emit('exit', { taskId, code: 0 }); // rough approximation
                }
            })();

            return resumeSessionId || ''; // will be updated async
        } catch (error) {
            this.initializingTasks.delete(taskId);
            throw error;
        }
    }

    stopTask(taskId: string) {
        const session = this.sessions.get(taskId);
        if (session) {
            session.queryInstance.close();
            session.completed = true;
            console.log(`[AgentManager] Marked task ${taskId} session as completed (stopped), keeping output buffer`);
            // Emit status update to change running -> idle
            this.emit('statusUpdate', { taskId, status: 'idle' });
        }
    }

    sendInput(taskId: string, text: string) {
        const session = this.sessions.get(taskId);
        if (session) {
            const msg: SDKUserMessage = {
                type: 'user',
                message: {
                    role: 'user',
                    content: [{ type: 'text', text }]
                },
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

    /**
     * Send a user message for conversation panel streaming
     * Returns a promise that resolves when complete or rejects on error
     */
    async sendUserMessage(
        taskId: string,
        projectPath: string,
        userMessage: string,
        callbacks?: AgentCallbacks,
        existingSessionId?: string
    ): Promise<string> {
        console.log(`[AgentManager] sendUserMessage for task: ${taskId}`);

        const resumeSessionId = existingSessionId || this.getSessionId(taskId);

        const queryOptions: Record<string, unknown> = {
            allowedTools: ['Read', 'Glob', 'Grep', 'Bash'],
            settingSources: ['project'],
            cwd: projectPath,
        };

        try {
            let messageId = this.generateMessageId();
            let isThinking = false;
            const pendingToolCalls = new Map<string, ToolCall>();

            for await (const message of query({
                prompt: userMessage,
                options: { ...queryOptions, resume: resumeSessionId },
            })) {
                console.log('[AgentManager] sendUserMessage received message type:', message.type, 'event:', (message as any).event?.type);

                // Store session ID
                if ((message as any).session_id && !this.getSessionId(taskId)) {
                    this.setSessionId(taskId, (message as any).session_id);
                    callbacks?.onSessionStart?.((message as any).session_id);
                }

                // Handle stream events (most content comes through here)
                if (message.type === 'stream_event') {
                    const event = (message as any).event;

                    // Text content streaming
                    if (event?.type === 'content_block_start' && event.block?.type === 'text') {
                        console.log('[AgentManager] content_block_start, messageId:', messageId);
                        callbacks?.onConversationChunk?.(messageId, '');
                    } else if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                        const delta = event.delta.text || '';
                        console.log('[AgentManager] text_delta:', delta.slice(0, 50));
                        callbacks?.onConversationChunk?.(messageId, delta);
                    } else if (event?.type === 'content_block_stop') {
                        console.log('[AgentManager] content_block_stop');
                        callbacks?.onConversationComplete?.(messageId);
                        messageId = this.generateMessageId();
                        pendingToolCalls.clear();
                    }
                }

                // Handle assistant messages (tool use, text blocks)
                else if (message.type === 'assistant') {
                    const content = (message as any).message?.content;
                    if (Array.isArray(content)) {
                        for (const block of content) {
                            if (block.type === 'text') {
                                console.log('[AgentManager] assistant text block:', block.text?.slice(0, 50));
                                callbacks?.onConversationChunk?.(messageId, block.text || '');
                            } else if (block.type === 'tool_use') {
                                const toolName = block.name;
                                const toolInput = block.input;
                                const toolId = `${messageId}-${toolName}`;

                                const toolCall: ToolCall = {
                                    name: toolName,
                                    input: toolInput,
                                    status: 'pending',
                                };
                                pendingToolCalls.set(toolId, toolCall);
                                console.log('[AgentManager] tool_use:', toolName);
                                callbacks?.onConversationToolCall?.(toolCall);
                            }
                        }
                    }
                }

                // Handle user messages (tool results)
                else if (message.type === 'user') {
                    const content = (message as any).message?.content;
                    if (Array.isArray(content)) {
                        for (const block of content) {
                            if (block.type === 'tool_result') {
                                const toolName = block.name;
                                const toolId = `${messageId}-${toolName}`;
                                const toolCall = pendingToolCalls.get(toolId);
                                if (toolCall) {
                                    toolCall.status = block.is_error ? 'error' : 'success';
                                    toolCall.output = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
                                    console.log('[AgentManager] tool_result:', toolName, 'status:', toolCall.status);
                                    callbacks?.onConversationToolCall?.(toolCall);
                                }
                            }
                        }
                    }
                }

                // Handle completion
                else if (message.type === 'result') {
                    // Always call onConversationComplete when result is received to end streaming
                    console.log('[AgentManager] result received, calling onConversationComplete');
                    callbacks?.onConversationComplete?.(messageId);

                    if ((message as any).subtype === 'success') {
                        console.log('[AgentManager] sendUserMessage completed successfully');
                    } else if ((message as any).subtype === 'error_during_execution') {
                        const error = new Error((message as any).errors?.join('\n') || 'Unknown error');
                        if (callbacks?.onError) {
                            callbacks.onError(error);
                        } else {
                            throw error;
                        }
                    }
                }
            }

            return resumeSessionId || '';

        } catch (error: any) {
            console.error('[AgentManager] sendUserMessage error:', error);
            if (callbacks?.onError) {
                callbacks.onError(error);
            } else {
                throw error;
            }
            return '';
        }
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
                outputBuffer: '',
            });
        }
    }

    private getSessionId(taskId: string): string | undefined {
        return this.sessions.get(taskId)?.claudeSessionId;
    }
}

export const agentManager = new AgentManager();
