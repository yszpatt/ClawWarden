import { useState, useEffect, useRef, useCallback } from 'react';
import { connectionManager } from '../services/ConnectionManager';
import type { ConversationMessage, AssistantMessage } from '@antiwarden/shared';
import { fetchConversation, clearConversation as apiClearConversation } from '../api/conversation';

interface UseConversationOptions {
    taskId: string;
    projectId: string;
}

export function useConversation({ taskId, projectId }: UseConversationOptions) {
    const [messages, setMessages] = useState<ConversationMessage[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const currentGroupIdRef = useRef<string | null>(null);

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
        const handleMessage = (message: any) => {
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
                        const groupId = message.groupId || currentGroupIdRef.current;

                        // If last message is an assistant text message in the same group, append to it
                        if (lastMsg?.role === 'assistant' && (lastMsg as AssistantMessage).content && !lastMsg.status) {
                            const updated = [...prev];
                            (updated[updated.length - 1] as AssistantMessage).content =
                                (lastMsg as AssistantMessage).content! + (message.content || '');
                            return updated;
                        }

                        // Otherwise, create a new text message
                        return [...prev, {
                            id: message.messageId || `msg-${Date.now()}`,
                            role: 'assistant' as const,
                            content: message.content || '',
                            groupId,
                            timestamp: new Date().toISOString(),
                        }];
                    });
                    break;

                case 'conversation.thinking':
                    // Thinking content - new message
                    setMessages(prev => {
                        // Remove previous thinking message in the same group if any
                        const groupId = message.groupId || currentGroupIdRef.current;
                        const filtered = prev.filter(m =>
                            !((m as AssistantMessage).thinking && (m as AssistantMessage).groupId === groupId)
                        );

                        return [...filtered, {
                            id: `thinking-${Date.now()}`,
                            role: 'assistant' as const,
                            thinking: message.content || '',
                            groupId,
                            timestamp: new Date().toISOString(),
                        }];
                    });
                    break;

                case 'conversation.tool_call_start':
                    // Tool call starts - add tool message with pending status
                    setMessages(prev => {
                        const groupId = message.groupId || currentGroupIdRef.current;
                        return [...prev, {
                            id: `tool-${message.toolCall?.name}-${Date.now()}`,
                            role: 'assistant' as const,
                            toolCall: { ...message.toolCall!, status: 'pending' },
                            groupId,
                            timestamp: new Date().toISOString(),
                        }];
                    });
                    break;

                case 'conversation.tool_call_output':
                    // Tool call has output - update the tool message
                    setMessages(prev => {
                        return prev.map(msg => {
                            const assistantMsg = msg as AssistantMessage;
                            if (assistantMsg.toolCall && assistantMsg.toolCall.name === message.toolCall?.name) {
                                return {
                                    ...msg,
                                    toolCall: {
                                        ...assistantMsg.toolCall,
                                        output: message.toolCall?.output,
                                    },
                                };
                            }
                            return msg;
                        });
                    });
                    break;

                case 'conversation.tool_call_end':
                    // Tool call completed - update status
                    setMessages(prev => {
                        return prev.map(msg => {
                            const assistantMsg = msg as AssistantMessage;
                            if (assistantMsg.toolCall && assistantMsg.toolCall.name === message.toolCall?.name) {
                                return {
                                    ...msg,
                                    toolCall: {
                                        ...assistantMsg.toolCall,
                                        status: message.toolCall?.status || 'success',
                                        duration: message.toolCall?.duration,
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
                        const groupId = message.groupId || currentGroupIdRef.current;
                        return prev.map(msg => {
                            if (msg.role === 'assistant' && (msg as AssistantMessage).groupId === groupId) {
                                return { ...msg, status: 'complete' as const };
                            }
                            return msg;
                        });
                    });
                    setIsStreaming(false);
                    currentGroupIdRef.current = null;
                    break;

                case 'conversation.error':
                    setIsStreaming(false);
                    setMessages(prev => [...prev, {
                        id: `error-${Date.now()}`,
                        role: 'system',
                        content: message.error || 'An error occurred',
                        type: 'error' as const,
                        timestamp: new Date().toISOString(),
                    }]);
                    break;
            }
        };

        connectionManager.connect();
        const unsubscribe = connectionManager.subscribe(taskId, handleMessage);
        return () => unsubscribe();
    }, [taskId]);

    const sendMessage = useCallback(async (content: string, metadata?: any) => {
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
