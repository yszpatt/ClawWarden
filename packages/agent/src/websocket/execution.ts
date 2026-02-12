import type { FastifyInstance } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { readGlobalConfig, readProjectData, writeProjectData, writeTaskSummary, patchTask, findTask } from '../utils/json-store';
import { agentManager } from '../services/agent-manager';
import { worktreeManager } from '../services/worktree-manager';
import { conversationStorage } from '../services/conversation-storage';
import { getSchemaForLane, getOutputTypeForLane } from '../services/schemas';
import { getMergedLaneConfig } from '../utils/lane-config-loader';
import type { TaskStatus, Lane, ProjectData, StructuredOutput, ConversationWsMessage, ConversationMessage, Task, ToolCall, AssistantMessage, LaneActionConfig } from '@clawwarden/shared';
import { getLanePrompt, getLaneConfig } from '@clawwarden/shared';

// Track running lane executions for stop functionality
// Maps taskId to an abort controller or stop flag
const runningLaneExecutions = new Map<string, { stopped: boolean; connection: SocketStream }>();

// Auto-execution: concurrency control
const MAX_CONCURRENT_AUTO_EXECUTIONS = 2;
const MAX_AUTO_TRANSITIONS = 5;
const activeAutoExecutions = new Set<string>();

/**
 * Auto-execution: schedule next lane action after a delay.
 * Safety guards: concurrency limit, WebSocket alive check, transition count limit.
 */
async function scheduleNextLaneExecution(
    connection: SocketStream,
    taskId: string,
    projectPath: string,
    targetLaneId: string
): Promise<void> {
    setTimeout(async () => {
        try {
            // Concurrency limit
            if (activeAutoExecutions.size >= MAX_CONCURRENT_AUTO_EXECUTIONS) {
                console.warn(`[AutoExec] Max concurrent limit reached, pausing task ${taskId}`);
                await patchTask(taskId, { status: 'awaiting-review' });
                if (connection.socket.readyState === 1) {
                    connection.socket.send(JSON.stringify({ type: 'task_status', taskId, status: 'awaiting-review', laneId: targetLaneId }));
                }
                return;
            }

            // WebSocket alive check
            if (connection.socket.readyState !== 1) {
                console.warn(`[AutoExec] WebSocket disconnected, stopping auto-execution for task ${taskId}`);
                await patchTask(taskId, { status: 'awaiting-review' });
                return;
            }

            const result = await findTask(taskId);
            if (!result) return;
            const { task, data } = result;

            // Verify task is in expected state
            if (task.laneId !== targetLaneId || task.status === 'running') return;
            if (!task.autoExecute) return;

            // Transition count limit (loop prevention)
            const count = (task.metadata?.autoTransitionCount as number) || 0;
            if (count >= MAX_AUTO_TRANSITIONS) {
                console.error(`[AutoExec] Max transitions (${MAX_AUTO_TRANSITIONS}) reached for task ${taskId}`);
                await patchTask(taskId, { status: 'failed' });
                if (connection.socket.readyState === 1) {
                    connection.socket.send(JSON.stringify({ type: 'task_status', taskId, status: 'failed', laneId: targetLaneId }));
                }
                return;
            }
            await patchTask(taskId, { metadata: { ...task.metadata, autoTransitionCount: count + 1 } });

            const laneConfig = await getMergedLaneConfig(targetLaneId, result.project.path);
            const primaryAction = laneConfig.primaryActions[0];
            if (!primaryAction) {
                console.warn(`[AutoExec] No primary action found for lane ${targetLaneId}`);
                return;
            }

            console.log(`[AutoExec] Scheduling action '${primaryAction.id}' in lane '${targetLaneId}' for task ${taskId}`);

            activeAutoExecutions.add(taskId);
            try {
                await handleLaneAction(connection, {
                    type: 'conversation.lane_action_start',
                    taskId,
                    projectId: data.projectId || '',
                    laneId: targetLaneId,
                    actionId: primaryAction.id
                });
            } finally {
                activeAutoExecutions.delete(taskId);
            }
        } catch (error) {
            console.error(`[AutoExec] Failed to schedule next lane execution:`, error);
            await patchTask(taskId, { status: 'failed' });
            if (connection.socket.readyState === 1) {
                connection.socket.send(JSON.stringify({ type: 'task_status', taskId, status: 'failed' }));
            }
        }
    }, 1500);
}

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
        // System messages always use conversation.error type — the frontend handler
        // for this type correctly creates role:'system' messages in the UI
        wsMessage.type = 'conversation.error';
        wsMessage.messageId = message.id;
        wsMessage.content = (message as any).content;
        wsMessage.error = (message as any).content;
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
            if (tool.status === 'pending' && !tool.output) {
                wsMessage.type = 'conversation.tool_call_start';
                wsMessage.groupId = assistantMsg.groupId;
                wsMessage.messageId = message.id;
                wsMessage.toolCall = tool;
            } else {
                wsMessage.type = 'conversation.tool_call_output';
                wsMessage.groupId = assistantMsg.groupId;
                wsMessage.messageId = message.id;
                wsMessage.toolCall = tool;
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
    const groupId = `group - ${Date.now()} -${Math.random().toString(36).slice(2, 9)} `;
    return {
        groupId,
        chunkStartMsg: {
            type: 'conversation.chunk_start',
            groupId,
        } as ConversationWsMessage,
    };
}

interface ExecuteMessage { type: 'execute'; taskId: string; projectId: string; }
interface InputMessage { type: 'input'; taskId: string; data: string; }
interface StopMessage { type: 'stop'; taskId: string; }
interface ResizeMessage { type: 'resize'; sessionId: string; cols: number; rows: number; }
interface AttachMessage { type: 'attach'; taskId: string; projectId: string; }
interface ConversationUserInputMessage { type: 'conversation.user_input'; taskId: string; content: string; }
interface ConversationPlanStartMessage { type: 'conversation.plan_start'; taskId: string; projectId: string; }
interface ConversationExecuteStartMessage { type: 'conversation.execute_start'; taskId: string; projectId: string; }
interface ConversationLaneActionStartMessage {
    type: 'conversation.lane_action_start';
    taskId: string;
    projectId: string;
    laneId: string;
    actionId: string;
}

type ClientMessage = ExecuteMessage | InputMessage | StopMessage | ResizeMessage | AttachMessage | ConversationUserInputMessage | ConversationPlanStartMessage | ConversationExecuteStartMessage | ConversationLaneActionStartMessage;

/**
 * 统一的泳道操作处理入口
 */
async function handleLaneAction(
    connection: SocketStream,
    message: ConversationLaneActionStartMessage
) {
    const { taskId, projectId, laneId, actionId } = message;
    console.log(`[Execution] handleLaneAction: lane = ${laneId}, action = ${actionId}, task = ${taskId} `);

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

    // Get merged lane configuration
    const defaultConfig = getLaneConfig(laneId) || { id: laneId, name: laneId, primaryActions: [], color: '#6B7280', order: 99 } as any;
    const laneConfig = await getMergedLaneConfig(laneId, project.path, defaultConfig);
    const actionConfig = laneConfig.primaryActions.find(a => a.id === actionId);

    if (!actionConfig && laneId !== 'pending-merge') {
        throw new Error(`Action ${actionId} not found in lane ${laneId} `);
    }

    await patchTask(taskId, { status: 'running' });

    const executionContext = { stopped: false, connection };
    runningLaneExecutions.set(taskId, executionContext);

    if (connection.socket.readyState === 1) {
        connection.socket.send(JSON.stringify({
            type: 'task_status',
            taskId: taskId,
            status: 'running',
            laneId: task.laneId
        }));
    }

    // Record Action Start in history
    const startMsg: ConversationMessage = {
        id: uuid(),
        role: 'system',
        content: `[系统] 开始执行动作: ${actionConfig?.name || actionId} `,
        type: 'info',
        timestamp: new Date().toISOString()
    };
    await sendAndSaveMessage(connection, taskId, projectPath, startMsg);

    let conversation = await conversationStorage.load(project.path, taskId);
    if (!conversation) {
        conversation = { taskId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] };
        await conversationStorage.save(project.path, conversation);
    }

    // Generate a unique ID for the user message
    const userMsgId = uuid();
    const userContent = task.prompt || `## 任务需求\n\n ** 标题 **: ${task.title} \n\n ** 描述 **: \n${task.description} `;
    const userMessage: ConversationMessage = {
        id: userMsgId,
        role: 'user',
        content: userContent,
        timestamp: new Date().toISOString(),
    };
    await sendAndSaveMessage(connection, taskId, projectPath, userMessage);

    const config = await readGlobalConfig();
    const lanePrompt = getLanePrompt(laneId, data, config.settings.lanePrompts || {});
    // ... existing prompt logic continues below via prompt switching ...

    const baseSystemPrompt = actionConfig?.systemPrompt || laneConfig.systemPrompt || lanePrompt;

    let prompt: string;
    // ... existing switch (laneConfig.promptSource) ...
    switch (laneConfig.promptSource) {
        case 'user':
            prompt = `${baseSystemPrompt} \n\n-- -\n\n${userContent} `;
            break;
        case 'plan-doc':
            if (task.planPath) {
                let planRef = task.planPath;
                if (task.worktree?.path) {
                    const planFileName = task.planPath.split('/').pop();
                    planRef = `../../.clawwarden / plans / ${planFileName} `;
                }
                prompt = `${baseSystemPrompt} \n\n请按照 @${planRef} 中的计划方案执行任务。`;
            } else {
                prompt = baseSystemPrompt;
            }
            break;
        case 'lane-only': prompt = baseSystemPrompt; break;
        case 'custom':
            prompt = (laneConfig.customPromptTemplate || '{lanePrompt}\n\n{userPrompt}')
                .replace('{lanePrompt}', baseSystemPrompt)
                .replace('{userPrompt}', task.prompt || '')
                .replace('{planPath}', task.planPath || '');
            break;
        default: prompt = baseSystemPrompt;
    }

    const outputFormat = actionConfig?.outputSchema ? {
        type: (actionConfig.outputFormat || 'json_schema') as any,
        schema: actionConfig.outputSchema
    } : getSchemaForLane(laneId);

    const { groupId, chunkStartMsg } = createMessageGroup();
    chunkStartMsg.taskId = taskId;
    connection.socket.send(JSON.stringify(chunkStartMsg));

    let currentTextContent = '';
    let fullTextAccumulator = '';
    let taskSdkStructuredOutput: any = null;
    let toolCallCounter = 0;

    const callbacks = {
        onLog: (message: string) => { },
        onOutput: (data: string) => { },
        onError: async (error: Error) => {
            const errorMsg: ConversationMessage = {
                id: uuid(),
                role: 'system',
                content: `[执行错误] ${error.message} `,
                type: 'error',
                timestamp: new Date().toISOString()
            };
            await sendAndSaveMessage(connection, taskId, projectPath, errorMsg);
        },
        onSessionStart: async (newSessionId: string) => {
            if (!task.claudeSession || task.claudeSession.id !== newSessionId) {
                await patchTask(taskId, {
                    claudeSession: { id: newSessionId, createdAt: new Date().toISOString() }
                });
            }
        },
        onConversationChunk: async (msgId: string, chunk: string) => {
            currentTextContent += chunk;
            fullTextAccumulator += chunk;
            connection.socket.send(JSON.stringify({ type: 'conversation.chunk', taskId, messageId: msgId, groupId, content: chunk } as ConversationWsMessage));
        },
        onConversationThinkingStart: async (content: string) => {
            const thinkingMsg: AssistantMessage = {
                id: uuid(),
                role: 'assistant',
                thinking: content,
                groupId,
                timestamp: new Date().toISOString()
            };
            await sendAndSaveMessage(connection, taskId, projectPath, thinkingMsg);
        },
        onConversationToolCall: async (toolCall: any) => {
            const isComplete = toolCall.output !== undefined;
            const messageType = isComplete ? 'conversation.tool_call_output' : 'conversation.tool_call_start';

            if (!isComplete) {
                // Tool call START — assign a unique ID and save to disk
                toolCallCounter++;
                const toolMessageId = `${groupId} -tool - ${toolCallCounter} -${toolCall.name} `;
                toolCall._messageId = toolMessageId; // Attach ID so we can find it on completion

                const toolMsg: AssistantMessage = {
                    id: toolMessageId,
                    role: 'assistant',
                    toolCall: { ...toolCall, status: 'pending' } as ToolCall,
                    groupId,
                    timestamp: new Date().toISOString()
                };

                connection.socket.send(JSON.stringify({ type: messageType, taskId, messageId: toolMessageId, groupId, toolCall: { ...toolCall, status: 'pending' } } as unknown as ConversationWsMessage));
                await conversationStorage.appendMessage(projectPath, taskId, toolMsg);
            } else {
                // Tool call COMPLETE — update the existing message
                const toolMessageId = toolCall._messageId || `${groupId} -tool - ${toolCallCounter} -${toolCall.name} `;

                connection.socket.send(JSON.stringify({ type: messageType, taskId, messageId: toolMessageId, groupId, toolCall } as unknown as ConversationWsMessage));

                const updated = await conversationStorage.updateMessage(projectPath, taskId, toolMessageId, (msg) => {
                    const assistantMsg = msg as AssistantMessage;
                    return {
                        ...assistantMsg,
                        toolCall: {
                            ...assistantMsg.toolCall!,
                            output: toolCall.output,
                            status: toolCall.status || 'success',
                        }
                    };
                });

                // Fallback: if message not found (shouldn't happen), append it
                if (!updated) {
                    console.warn(`[Execution] Tool call message ${toolMessageId} not found for update, appending`);
                    const toolMsg: AssistantMessage = {
                        id: toolMessageId,
                        role: 'assistant',
                        toolCall: toolCall as ToolCall,
                        groupId,
                        timestamp: new Date().toISOString()
                    };
                    await conversationStorage.appendMessage(projectPath, taskId, toolMsg);
                }
            }
        },
        onStructuredOutput: async (output: any) => {
            console.log(`[Execution] onStructuredOutput for task ${taskId}: `, JSON.stringify(output).substring(0, 100) + '...');
            taskSdkStructuredOutput = output;

            // Record in conversation for visibility
            const summaryMsg: ConversationMessage = {
                id: uuid(),
                role: 'system',
                content: `[系统] 已生成自动总结`,
                type: 'info',
                timestamp: new Date().toISOString()
            };
            await sendAndSaveMessage(connection, taskId, projectPath, summaryMsg);

            // The actual broadcast to the summary tab and disk saving is handled by the 
            // global agentManager listener in executionHandler to avoid duplication
            // and ensure it works even if this specific session is closed.
        },
        onConversationChunkEnd: async (msgId: string) => {
            connection.socket.send(JSON.stringify({ type: 'conversation.chunk_end', taskId, groupId, messageId: msgId } as ConversationWsMessage));

            if (currentTextContent) {
                const assistantMsg: AssistantMessage = {
                    id: msgId,
                    role: 'assistant',
                    content: currentTextContent,
                    groupId,
                    timestamp: new Date().toISOString()
                };
                await conversationStorage.appendMessage(projectPath, taskId, assistantMsg);
                currentTextContent = ''; // Clear for next chunk if any
            }
        },
        onConversationComplete: async (msgId: string, finalStructuredOutput?: any) => {
            console.log(`[Execution] onConversationComplete for task ${taskId}, remaining text length: ${currentTextContent.length} `);

            // Use passed structured output if available, fallback to internal accumulator
            if (finalStructuredOutput) {
                console.log(`[Execution] Using final structured output from completion message`);
                taskSdkStructuredOutput = finalStructuredOutput;
            }

            // Common completion state update
            let finalStatus: TaskStatus = 'idle';
            let finalLaneId = task.laneId;
            let finalPlanPath = task.planPath;
            const currentLaneId = laneId; // The lane we just finished executing

            // Summary Fallback: Smart reconstruction if agent didn't provide structured output
            if (!taskSdkStructuredOutput && fullTextAccumulator.trim().length > 10) {
                console.log(`[Execution] Attempting smart summary reconstruction for task ${taskId} in lane ${currentLaneId}`);

                let fallbackData: any = null;

                // 1. Try to find a JSON block first (Models often output JSON in markdown)
                const jsonMatch = fullTextAccumulator.match(/```json\s*([\s\S]*?)\s*```/);
                if (jsonMatch) {
                    try {
                        const parsed = JSON.parse(jsonMatch[1]);
                        if (parsed && typeof parsed === 'object') {
                            fallbackData = parsed;
                            console.log(`[Execution] Successfully parsed JSON block from text for summary`);
                        }
                    } catch (e) { }
                }

                // 2. If no JSON, extract semantically
                if (!fallbackData) {
                    const text = fullTextAccumulator.trim();
                    const lines = text.split('\n').filter(l => l.trim().length > 0);

                    // Try to find a "Conclusion" or "Summary" section at the end
                    const sections = text.split(/\n#{1,4}\s+|(?:\n|^)(?:总结|结论|结果|Summary|Conclusion|Result):\s*/i);
                    const lastSection = sections.length > 1 ? sections[sections.length - 1] : text;

                    // Heuristic for summary line: first substantial line that isn't a header or code
                    const summaryLine = lines.find(l => l.length > 20 && !l.startsWith('#') && !l.includes('`')) || lines[0];

                    fallbackData = {
                        summary: summaryLine.substring(0, 150),
                        details: lastSection.length > 50 ? lastSection.substring(0, 3000) : text.substring(0, 3000),
                        result: 'success'
                    };

                    // 3. Lane-aware field completion to satisfy UI schemas
                    if (currentLaneId === 'develop') {
                        fallbackData.changedFiles = fallbackData.changedFiles || [];
                        fallbackData.nextSteps = fallbackData.nextSteps || "待后续确认";
                    } else if (currentLaneId === 'test') {
                        fallbackData.issuesFound = fallbackData.issuesFound || [];
                        if (!fallbackData.testResults) {
                            const passMatch = text.match(/(\d+)\s*(?:passed|通过|成功)/i);
                            const failMatch = text.match(/(\d+)\s*(?:failed|失败)/i);
                            if (passMatch || failMatch) {
                                fallbackData.testResults = {
                                    passed: parseInt(passMatch?.[1] || '0'),
                                    failed: parseInt(failMatch?.[1] || '0')
                                };
                            }
                        }
                    }
                }

                taskSdkStructuredOutput = fallbackData;

                // Trigger global persistence and broadcast
                agentManager.emit('structuredOutput', {
                    taskId,
                    output: taskSdkStructuredOutput,
                    laneId: currentLaneId
                });
            }

            if (laneConfig.generatesPlan) {
                const hasCompleteMarker = /<!--\s*PLAN_COMPLETE\s*-->|\[PLAN_COMPLETE\]|计划完成|设计完成|方案完成|方案已生成/i.test(fullTextAccumulator);
                const hasStructuredOutput = taskSdkStructuredOutput && typeof taskSdkStructuredOutput === 'object';

                if (hasCompleteMarker || hasStructuredOutput) {
                    const plansDir = path.join(project.path, '.clawwarden', 'plans');
                    await fs.mkdir(plansDir, { recursive: true });
                    const planFileName = `${task.id}-plan.md`;

                    let planContent = fullTextAccumulator;

                    if (planContent.trim().length < 50 && hasStructuredOutput) {
                        console.log(`[Execution] Reconstructing plan from structured output for task ${taskId}`);
                        const so = taskSdkStructuredOutput;
                        planContent = `# ${task.title}\n\n`;
                        if (so.summary) planContent += `## 总结\n${so.summary}\n\n`;
                        if (so.approach) planContent += `## 技术方案\n${so.approach}\n\n`;
                        if (so.components && Array.isArray(so.components)) {
                            planContent += `## 组件设计\n`;
                            so.components.forEach((c: any) => {
                                planContent += `### ${c.name}\n${c.description}\n`;
                                if (c.files) planContent += `涉及文件: ${c.files.join(', ')}\n`;
                                planContent += `\n`;
                            });
                        }
                    }

                    await fs.writeFile(path.join(plansDir, planFileName), planContent, 'utf-8');
                    finalPlanPath = `.clawwarden/plans/${planFileName}`;

                    if (connection.socket.readyState === 1) {
                        connection.socket.send(JSON.stringify({
                            type: 'conversation.plan_complete',
                            taskId,
                            planPath: finalPlanPath,
                            content: planContent
                        }));
                    }

                    // Auto-execution check for plan lane
                    if (task.autoExecute && laneConfig.onCompleteLane) {
                        finalLaneId = laneConfig.onCompleteLane;
                        console.log(`[AutoExec] Plan complete, auto-moving to: ${finalLaneId}`);
                        scheduleNextLaneExecution(connection, taskId, projectPath, finalLaneId);
                    } else if (laneConfig.onCompleteLane) {
                        // Manual mode: stay in current lane, mark awaiting-review
                        // Summary is saved independently via global structuredOutput listener
                        finalStatus = 'awaiting-review';
                        console.log(`[Execution] Plan complete (manual mode), awaiting review`);
                    }
                }
            } else if (laneConfig.onCompleteLane) {
                if (task.autoExecute) {
                    finalLaneId = laneConfig.onCompleteLane;
                    console.log(`[AutoExec] Action complete, auto-moving to: ${finalLaneId}`);
                    // Don't auto-execute in pending-merge — it's the stopping point
                    if (finalLaneId !== 'pending-merge') {
                        scheduleNextLaneExecution(connection, taskId, projectPath, finalLaneId);
                    }
                } else {
                    // Manual mode: stay in current lane, mark awaiting-review
                    // Summary is saved independently via global structuredOutput listener
                    finalStatus = 'awaiting-review';
                    console.log(`[Execution] Action complete (manual mode), awaiting review`);
                }
            }

            // Perform atomic update using helper to avoid race conditions with global listeners
            await patchTask(taskId, {
                status: finalStatus,
                laneId: finalLaneId,
                planPath: finalPlanPath
            });

            if (connection.socket.readyState === 1) {
                connection.socket.send(JSON.stringify({
                    type: 'task_status',
                    taskId,
                    status: finalStatus,
                    laneId: finalLaneId,
                    planPath: finalPlanPath
                }));
            }

            // Record Completion in history
            const endMsg: ConversationMessage = {
                id: uuid(),
                role: 'system',
                content: `[系统] 动作执行完成: ${actionConfig?.name || actionId}`,
                type: 'info',
                timestamp: new Date().toISOString()
            };
            await sendAndSaveMessage(connection, taskId, projectPath, endMsg);
        }
    };

    try {
        await agentManager.sendUserMessage(
            taskId,
            workingDir,
            prompt,
            callbacks,
            sessionId,
            {
                allowedTools: laneConfig.allowedTools || ['Bash', 'Read', 'Edit', 'Glob', 'Grep', 'Find', 'Write'],
                outputFormat,
                laneId: laneId
            }
        );

        // After sending finishes, ensures we are in idle state if not explicitly stopped
        // BUT only if onConversationComplete hasn't already set a specific status (e.g., awaiting-review)
        if (!executionContext.stopped) {
            const currentTask = await findTask(taskId);
            const currentStatus = currentTask?.task?.status;
            if (currentStatus === 'running') {
                await patchTask(taskId, { status: 'idle' });
            }
        }
    } catch (error: any) {
        await patchTask(taskId, { status: 'failed' });
        connection.socket.send(JSON.stringify({ type: 'task_status', taskId, status: 'failed' }));

        const errorMsg: ConversationMessage = {
            id: uuid(),
            role: 'system',
            content: `[严重错误] ${error.message} `,
            type: 'error',
            timestamp: new Date().toISOString()
        };
        await sendAndSaveMessage(connection, taskId, projectPath, errorMsg);
    } finally {
        runningLaneExecutions.delete(taskId);
    }
} // Closing handleLaneAction

export async function executionHandler(fastify: FastifyInstance) {
    // Register global persistence listener (runs once for the entire server lifecycle)
    // This ensures summaries are saved even if no one is watching, and avoids duplicate saves from multiple connections
    agentManager.on('structuredOutput', async (event: { taskId: string, output: unknown, laneId?: string }) => {
        try {
            const res = await findTask(event.taskId);
            if (res) {
                const laneId = event.laneId || res.task.laneId;
                const outputType = getOutputTypeForLane(laneId);
                const structuredOutput: StructuredOutput = {
                    type: outputType as any,
                    schemaVersion: '1.0',
                    data: event.output,
                    timestamp: new Date().toISOString()
                };
                await writeTaskSummary(res.project.path, event.taskId, structuredOutput);
                await patchTask(event.taskId, { updatedAt: new Date().toISOString() });
                console.log(`[Execution] Saved structured output for task ${event.taskId}`);
            }
        } catch (err) {
            console.error('[Execution] Global structuredOutput listener error:', err);
        }
    });

    fastify.get('/ws/execute', { websocket: true }, (connection, _request) => {
        let currentTaskId: string | null = null;

        const errorListener = (event: { taskId: string, error: Error }) => {
            if (currentTaskId && event.taskId === currentTaskId && connection.socket.readyState === 1) {
                connection.socket.send(JSON.stringify({ type: 'error', message: event.error.message }));
            }
        };

        const statusUpdateListener = async (event: { taskId: string, status: TaskStatus, moveTo?: string }) => {
            let targetLane = event.moveTo;

            // If there's an active lane action, handleConversationLaneActionStart will handle the completion logic
            // providing plan saving and smarter lane movement. We only fallback to automatic lane movement
            // if we're not currently in an interactive execution handler (though usually we are).
            if (!targetLane && event.status === 'completed') {
                const config = await readGlobalConfig();
                for (const proj of config.projects) {
                    const data = await readProjectData(proj.path);
                    const task = data.tasks.find(t => t.id === event.taskId);
                    if (task) {
                        if (task.autoExecute) {
                            const laneConfig = await getMergedLaneConfig(task.laneId, proj.path);
                            if (laneConfig.onCompleteLane) targetLane = laneConfig.onCompleteLane;
                        } else {
                            // Manual mode: don't move, mark awaiting-review
                            event.status = 'awaiting-review' as TaskStatus;
                        }
                        break;
                    }
                }
            }
            const patch: any = { status: event.status };
            if (targetLane) patch.laneId = targetLane;

            await patchTask(event.taskId, patch);
            if (connection.socket.readyState === 1) {
                connection.socket.send(JSON.stringify({
                    type: 'task_status',
                    taskId: event.taskId,
                    status: event.status,
                    laneId: targetLane || undefined
                }));
            }
            if (event.status === 'completed' || event.status === 'failed') {
                if (connection.socket.readyState === 1) {
                    connection.socket.send(JSON.stringify({ type: 'exit', taskId: event.taskId, exitCode: event.status === 'completed' ? 0 : 1 }));
                }
            }
        };

        const sessionStartListener = async (event: { taskId: string, sessionId: string }) => {
            if (currentTaskId && event.taskId === currentTaskId) {
                if (connection.socket.readyState === 1) {
                    connection.socket.send(JSON.stringify({ type: 'started', taskId: event.taskId, sessionId: event.sessionId }));
                }
                const res = await findTask(event.taskId);
                if (res && res.task.claudeSession?.id !== event.sessionId) {
                    await patchTask(event.taskId, {
                        claudeSession: { id: event.sessionId, createdAt: new Date().toISOString() }
                    });
                }
            }
        };

        const structuredOutputListener = async (event: { taskId: string, output: unknown, laneId?: string }) => {
            if (currentTaskId && event.taskId === currentTaskId) {
                const res = await findTask(event.taskId);
                if (res && connection.socket.readyState === 1) {
                    const laneId = event.laneId || res.task.laneId;
                    const outputType = getOutputTypeForLane(laneId);
                    const structuredOutput: StructuredOutput = {
                        type: outputType as any,
                        schemaVersion: '1.0',
                        data: event.output,
                        timestamp: new Date().toISOString()
                    };
                    connection.socket.send(JSON.stringify({
                        type: 'structured-output',
                        taskId: event.taskId,
                        output: structuredOutput
                    }));
                }
            }
        };

        agentManager.on('error', errorListener);
        agentManager.on('statusUpdate', statusUpdateListener);
        agentManager.on('sessionStart', sessionStartListener);
        agentManager.on('structuredOutput', structuredOutputListener);

        connection.socket.on('message', async (rawMessage) => {
            try {
                const message = JSON.parse(rawMessage.toString()) as ClientMessage;
                switch (message.type) {
                    case 'execute': currentTaskId = message.taskId; await handleExecute(connection, message); break;
                    case 'stop': if (message.taskId) await handleStop(message.taskId, connection); break;
                    case 'attach': currentTaskId = (message as any).taskId; await handleAttach(connection, message as AttachMessage); break;
                    case 'conversation.user_input': currentTaskId = message.taskId; await handleConversationUserMessage(connection, message); break;
                    case 'conversation.lane_action_start': currentTaskId = message.taskId; await handleLaneAction(connection, message as ConversationLaneActionStartMessage); break;
                    case 'conversation.plan_start':
                        currentTaskId = (message as any).taskId;
                        await handleLaneAction(connection, { type: 'conversation.lane_action_start', taskId: (message as any).taskId, projectId: (message as any).projectId, laneId: 'plan', actionId: 'generate-plan' });
                        break;
                    case 'conversation.execute_start': {
                        currentTaskId = (message as any).taskId;
                        const res = await findTask((message as any).taskId);
                        if (res) {
                            const actionId = res.task.laneId === 'develop' ? 'auto-develop' : 'auto-test';
                            await handleLaneAction(connection, { type: 'conversation.lane_action_start', taskId: (message as any).taskId, projectId: (message as any).projectId, laneId: res.task.laneId, actionId });
                        }
                        break;
                    }
                }
            } catch (err) {
                console.error('Execution WebSocket error:', err);
                connection.socket.send(JSON.stringify({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' }));
            }
        });

        connection.socket.on('close', () => {
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

    const workingDir = task.worktree?.path || project.path;
    const laneConfig = await getMergedLaneConfig(task.laneId, project.path, getLaneConfig(task.laneId)!);
    const lanePrompt = getLanePrompt(task.laneId, data, config.settings.lanePrompts || {});
    let prompt: string;

    switch (laneConfig.promptSource) {
        case 'user': prompt = lanePrompt ? `${lanePrompt} \n\n-- -\n\n${task.prompt || task.title} ` : (task.prompt || task.title); break;
        case 'plan-doc': prompt = task.planPath ? `${lanePrompt} \n\n请按照 @${task.planPath} 继续执行任务。` : (lanePrompt || '请继续执行任务。'); break;
        case 'lane-only': prompt = lanePrompt || '请继续。'; break;
        case 'custom': prompt = (laneConfig.customPromptTemplate || '{lanePrompt}\n\n{userPrompt}').replace('{lanePrompt}', lanePrompt).replace('{userPrompt}', task.prompt || '').replace('{planPath}', task.planPath || ''); break;
        default: prompt = task.prompt || task.title;
    }

    task.status = 'running';
    task.updatedAt = new Date().toISOString();
    await writeProjectData(project.path, data);

    const primaryAction = laneConfig.primaryActions[0];
    const outputFormat = primaryAction?.outputSchema ? { type: (primaryAction.outputFormat || 'json_schema') as any, schema: primaryAction.outputSchema } : getSchemaForLane(task.laneId);
    await agentManager.startTaskExecution(
        task.id,
        workingDir,
        prompt,
        task.claudeSession?.id,
        outputFormat,
        task.laneId,
        {
            onLog: (msg) => {
                if (connection.socket.readyState === 1) {
                    connection.socket.send(JSON.stringify({ type: 'output', taskId: task.id, data: `\x1b[36m${msg}\x1b[0m` }));
                }
            },
            onOutput: (data) => {
                if (connection.socket.readyState === 1) {
                    connection.socket.send(JSON.stringify({ type: 'output', taskId: task.id, data }));
                }
            },
            onError: (err) => {
                if (connection.socket.readyState === 1) {
                    connection.socket.send(JSON.stringify({ type: 'output', taskId: task.id, data: `\x1b[31m[Error] ${err.message}\x1b[0m` }));
                }
            },
            onStatusUpdate: async (status, moveTo) => {
                await patchTask(task.id, { status, laneId: moveTo || task.laneId });
                if (connection.socket.readyState === 1) {
                    connection.socket.send(JSON.stringify({ type: 'task_status', taskId: task.id, status, laneId: moveTo || task.laneId }));
                }
            }
        }
    );

    // Register for stop functionality
    runningLaneExecutions.set(task.id, { stopped: false, connection });

    const buffered = agentManager.getSessionOutput(task.id);
    if (buffered) connection.socket.send(JSON.stringify({ type: 'output', taskId: task.id, data: buffered }));
}

async function handleAttach(connection: SocketStream, message: AttachMessage) {
    const buffered = agentManager.getSessionOutput(message.taskId);
    if (buffered !== undefined) {
        const session = agentManager.getSessionInfo(message.taskId);

        // Update connection for stop functionality and status broadcasts
        const existing = runningLaneExecutions.get(message.taskId);
        if (existing) {
            existing.connection = connection;
        } else {
            runningLaneExecutions.set(message.taskId, { stopped: false, connection });
        }

        connection.socket.send(JSON.stringify({ type: 'attached', taskId: message.taskId, sessionId: session?.claudeSessionId || null, bufferedOutput: buffered || '' }));
    } else {
        connection.socket.send(JSON.stringify({ type: 'output', taskId: message.taskId, data: '[System] No active session found.' }));
    }
}

async function handleStop(taskId: string, currentConnection?: SocketStream) {
    console.log(`[Execution] Stopping task ${taskId}`);
    agentManager.stopTask(taskId);

    // 1. Unconditionally patch database to idle so the UI reflects state accurately
    const result = await findTask(taskId);
    if (result) {
        await patchTask(taskId, { status: 'idle' });
        console.log(`[Execution] Task ${taskId} patched to idle in database`);
    }

    // 2. Handle active execution reference
    const laneExecution = runningLaneExecutions.get(taskId);
    const connectionToNotify = currentConnection || laneExecution?.connection;

    if (laneExecution) {
        laneExecution.stopped = true;
        setTimeout(() => runningLaneExecutions.delete(taskId), 1000);
    }

    // 3. Notify the UI
    if (result && connectionToNotify) {
        const stopMessage: ConversationMessage = {
            id: uuid(),
            role: 'system',
            content: '[系统] 任务已被用户停止',
            type: 'info',
            timestamp: new Date().toISOString()
        };
        await sendAndSaveMessage(connectionToNotify, taskId, result.project.path, stopMessage);

        if (connectionToNotify.socket.readyState === 1) {
            connectionToNotify.socket.send(JSON.stringify({
                type: 'task_status',
                taskId,
                status: 'idle',
                laneId: result.task.laneId
            }));
        }
    }
}

async function handleConversationUserMessage(connection: SocketStream, message: ConversationUserInputMessage) {
    const { taskId, content } = message;
    const result = await findTask(taskId);
    if (!result) return;
    const { project, task } = result;
    const projectPath = project.path;
    const workingDir = task.worktree?.path || project.path;

    const userMessage: ConversationMessage = { id: uuid(), role: 'user', content, timestamp: new Date().toISOString() };
    await conversationStorage.appendMessage(project.path, taskId, userMessage);

    const { groupId, chunkStartMsg } = createMessageGroup();
    chunkStartMsg.taskId = taskId;
    connection.socket.send(JSON.stringify(chunkStartMsg));

    let accumulatedContent = '';
    let manualToolCallCounter = 0;
    const callbacks = {
        onLog: () => { },
        onOutput: () => { },
        onError: (error: Error) => {
            connection.socket.send(JSON.stringify({ type: 'conversation.error', taskId, error: error.message } as ConversationWsMessage));
        },
        onSessionStart: async (id: string) => {
            const res = await findTask(taskId);
            if (res && (!res.task.claudeSession || res.task.claudeSession.id !== id)) {
                res.task.claudeSession = { id, createdAt: new Date().toISOString() };
                await writeProjectData(res.project.path, res.data);
            }
        },
        onConversationChunk: async (id: string, chunk: string) => {
            accumulatedContent += chunk;
            connection.socket.send(JSON.stringify({ type: 'conversation.chunk', taskId, messageId: id, groupId, content: chunk } as ConversationWsMessage));
        },
        onConversationThinkingStart: async (thinking: string) => {
            const thinkingMsg: AssistantMessage = {
                id: uuid(),
                role: 'assistant',
                thinking,
                groupId,
                timestamp: new Date().toISOString()
            };
            await sendAndSaveMessage(connection, taskId, projectPath, thinkingMsg);
        },
        onConversationToolCall: async (toolCall: any) => {
            const isComplete = toolCall.output !== undefined;

            if (!isComplete) {
                manualToolCallCounter++;
                const toolMessageId = `${groupId} -tool - ${manualToolCallCounter} -${toolCall.name} `;
                toolCall._messageId = toolMessageId;

                const toolMsg: AssistantMessage = {
                    id: toolMessageId,
                    role: 'assistant',
                    toolCall: { ...toolCall, status: 'pending' } as ToolCall,
                    groupId,
                    timestamp: new Date().toISOString()
                };

                connection.socket.send(JSON.stringify({ type: 'conversation.tool_call_start', taskId, messageId: toolMessageId, groupId, toolCall: { ...toolCall, status: 'pending' } } as unknown as ConversationWsMessage));
                await conversationStorage.appendMessage(projectPath, taskId, toolMsg);
            } else {
                const toolMessageId = toolCall._messageId || `${groupId} -tool - ${manualToolCallCounter} -${toolCall.name} `;

                connection.socket.send(JSON.stringify({ type: 'conversation.tool_call_output', taskId, messageId: toolMessageId, groupId, toolCall } as unknown as ConversationWsMessage));

                const updated = await conversationStorage.updateMessage(projectPath, taskId, toolMessageId, (msg) => {
                    const assistantMsg = msg as AssistantMessage;
                    return {
                        ...assistantMsg,
                        toolCall: {
                            ...assistantMsg.toolCall!,
                            output: toolCall.output,
                            status: toolCall.status || 'success',
                        }
                    };
                });

                if (!updated) {
                    const toolMsg: AssistantMessage = {
                        id: toolMessageId,
                        role: 'assistant',
                        toolCall: toolCall as ToolCall,
                        groupId,
                        timestamp: new Date().toISOString()
                    };
                    await conversationStorage.appendMessage(projectPath, taskId, toolMsg);
                }
            }
        },
        onConversationChunkEnd: async (msgId: string) => {
            connection.socket.send(JSON.stringify({ type: 'conversation.chunk_end', taskId, groupId, messageId: msgId } as ConversationWsMessage));

            if (accumulatedContent) {
                const assistantMsg: AssistantMessage = {
                    id: msgId,
                    role: 'assistant',
                    content: accumulatedContent,
                    groupId,
                    timestamp: new Date().toISOString(),
                    status: 'complete'
                };
                await conversationStorage.appendMessage(projectPath, taskId, assistantMsg);
                accumulatedContent = '';
            }
        },
        onConversationComplete: async (msgId: string) => {
            console.log(`[Execution] Manual conversation complete for task ${taskId}, remaining text length: ${accumulatedContent.length} `);
            // Safety flush: save any remaining text that wasn't flushed by onConversationChunkEnd
            if (accumulatedContent) {
                console.log(`[Execution] Safety flush(manual): saving ${accumulatedContent.length} chars`);
                const assistantMsg: AssistantMessage = {
                    id: msgId,
                    role: 'assistant',
                    content: accumulatedContent,
                    groupId,
                    timestamp: new Date().toISOString(),
                    status: 'complete'
                };
                await conversationStorage.appendMessage(projectPath, taskId, assistantMsg);
                accumulatedContent = '';
            }
        }
    };

    try {
        await agentManager.sendUserMessage(taskId, workingDir, content, callbacks, task.claudeSession?.id, { laneId: task.laneId });
    } catch (error: any) {
        connection.socket.send(JSON.stringify({ type: 'conversation.error', taskId, error: error.message }));
    }
}
