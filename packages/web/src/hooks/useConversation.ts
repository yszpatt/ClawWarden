import { useState, useEffect, useRef, useCallback } from 'react';
import { connectionManager } from '../services/ConnectionManager';
import type { ConversationMessage, AssistantMessage, ToolCall } from '@antiwarden/shared';
import type { WsMessage } from '../services/ConnectionManager';
import { fetchConversation, clearConversation as apiClearConversation } from '../api/conversation';

interface UseConversationOptions {
    taskId: string;
    projectId: string;
}

// Helper to convert Partial<ToolCall> to ToolCall with defaults
function toToolCall(partial: Partial<ToolCall> | undefined): ToolCall | undefined {
    if (!partial || !partial.name) return undefined;
    return {
        name: partial.name,
        input: partial.input ?? {},
        output: partial.output,
        status: partial.status ?? 'pending',
        duration: partial.duration,
    };
}

export function useConversation({ taskId, projectId }: UseConversationOptions) {
    const [messages, setMessages] = useState<ConversationMessage[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const currentGroupIdRef = useRef<string | undefined>(undefined);

    // Load conversation on mount
    useEffect(() => {
        fetchConversation(projectId, taskId)
            .then(({ conversation }) => {
                if (conversation) {
                    setMessages(conversation.messages);
                }
            })
            .catch(err => {
                console.error('[useConversation] Failed to load conversation:', err);
            });
    }, [taskId, projectId]);

    // Subscribe to WebSocket messages
    useEffect(() => {
        const handleMessage = (message: WsMessage) => {
            if (message.taskId !== taskId) return;

            switch (message.type) {
                case 'conversation.chunk_start':
                    // Start of a new assistant response group
                    setIsStreaming(true);
                    currentGroupIdRef.current = message.groupId || `group-${Date.now()}`;
                    break;

                case 'conversation.chunk':
                    // Text content chunk - append to current text message or create new one
                    setMessages(prev => {
                        const lastMsg = prev[prev.length - 1];
                        const groupId = message.groupId ?? currentGroupIdRef.current;

                        // If last message is an assistant text message in the same group, append to it
                        if (lastMsg?.role === 'assistant' && (lastMsg as AssistantMessage).content && !(lastMsg as AssistantMessage).status) {
                            const updated = [...prev];
                            const lastAssistantMsg = updated[updated.length - 1] as AssistantMessage;
                            lastAssistantMsg.content = (lastAssistantMsg.content || '') + (message.content ?? '');
                            return updated;
                        }

                        // Otherwise, create a new text message
                        const newMessage: ConversationMessage = {
                            id: message.messageId ?? `msg-${Date.now()}`,
                            role: 'assistant',
                            content: message.content ?? '',
                            groupId,
                            timestamp: new Date().toISOString(),
                        };
                        return [...prev, newMessage];
                    });
                    break;

                case 'conversation.thinking':
                    // Thinking content - new message
                    setMessages(prev => {
                        // Remove previous thinking message in the same group if any
                        const groupId = message.groupId ?? currentGroupIdRef.current;
                        const filtered = prev.filter(m =>
                            !((m as AssistantMessage).thinking && (m as AssistantMessage).groupId === groupId)
                        );

                        const newMessage: ConversationMessage = {
                            id: `thinking-${Date.now()}`,
                            role: 'assistant',
                            thinking: message.content ?? '',
                            groupId,
                            timestamp: new Date().toISOString(),
                        };
                        return [...filtered, newMessage];
                    });
                    break;

                case 'conversation.tool_call_start':
                    // Tool call starts - add tool message with pending status
                    setMessages(prev => {
                        const groupId = message.groupId ?? currentGroupIdRef.current;
                        const tool = toToolCall(message.toolCall);
                        if (!tool) return prev;
                        console.log('[useConversation] tool_call_start:', { messageId: message.messageId, toolName: tool.name, groupId });
                        const newMessage: ConversationMessage = {
                            id: message.messageId ?? `tool-${tool.name}-${Date.now()}`,
                            role: 'assistant',
                            toolCall: { ...tool, status: 'pending' },
                            groupId,
                            timestamp: new Date().toISOString(),
                        };
                        return [...prev, newMessage];
                    });
                    break;

                case 'conversation.tool_call_output':
                    // Tool call completed - update the existing tool message by id
                    setMessages(prev => {
                        const msgId = message.messageId;
                        if (!msgId) {
                            console.log('[useConversation] tool_call_output: no messageId!', message);
                            return prev;
                        }

                        console.log('[useConversation] tool_call_output:', { msgId, status: message.toolCall?.status, toolName: message.toolCall?.name });

                        return prev.map(msg => {
                            if (msg.id === msgId) {
                                const assistantMsg = msg as AssistantMessage;
                                console.log('[useConversation] Found message to update:', msgId);
                                return {
                                    ...msg,
                                    toolCall: {
                                        ...assistantMsg.toolCall!,
                                        output: message.toolCall?.output,
                                        status: message.toolCall?.status ?? assistantMsg.toolCall?.status ?? 'success',
                                    },
                                };
                            }
                            return msg;
                        });
                    });
                    break;

                case 'conversation.chunk_end':
                    // Mark the last message as complete
                    setMessages(prev => {
                        const groupId = message.groupId ?? currentGroupIdRef.current;
                        return prev.map(msg => {
                            if (msg.role === 'assistant' && (msg as AssistantMessage).groupId === groupId) {
                                return { ...msg, status: 'complete' as const };
                            }
                            return msg;
                        });
                    });
                    setIsStreaming(false);
                    currentGroupIdRef.current = undefined;
                    break;

                case 'conversation.error':
                    setIsStreaming(false);
                    setMessages(prev => [...prev, {
                        id: `error-${Date.now()}`,
                        role: 'system',
                        content: message.error ?? 'An error occurred',
                        type: 'error',
                        timestamp: new Date().toISOString(),
                    }]);
                    break;
            }
        };

        connectionManager.connect();
        const unsubscribe = connectionManager.subscribe(taskId, handleMessage);
        return () => unsubscribe();
    }, [taskId]);

    const sendMessage = useCallback(async (content: string, metadata?: Record<string, unknown>) => {
        if (isStreaming) return;

        const userMessage: ConversationMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content,
            timestamp: new Date().toISOString(),
            metadata,
        };

        setMessages(prev => [...prev, userMessage]);

        connectionManager.send({
            type: 'conversation.user_input',
            taskId,
            content,
        });
    }, [taskId, isStreaming]);

    const clearMessages = useCallback(async () => {
        setMessages([]);
        await apiClearConversation(projectId, taskId);
    }, [projectId, taskId]);

    return {
        messages,
        isStreaming,
        sendMessage,
        clearMessages,
    };
}
