import { useState, useEffect, useRef, useCallback } from 'react';
import { connectionManager } from '../services/ConnectionManager';
import type { ConversationMessage } from '@antiwarden/shared';
import { fetchConversation, clearConversation as apiClearConversation } from '../api/conversation';

interface UseConversationOptions {
    taskId: string;
    projectId: string;
}

export function useConversation({ taskId, projectId }: UseConversationOptions) {
    const [messages, setMessages] = useState<ConversationMessage[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const currentMessageRef = useRef<Map<string, string>>(new Map());

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
            console.log('[useConversation] Received message:', message.type, 'taskId:', message.taskId, 'expected taskId:', taskId);

            if (message.taskId !== taskId) {
                console.log('[useConversation] Skipping message - taskId mismatch');
                return;
            }

            console.log('[useConversation] Processing message type:', message.type);

            switch (message.type) {
                case 'conversation.chunk_start':
                    console.log('[useConversation] chunk_start, messageId:', message.messageId);
                    setIsStreaming(true);
                    // Add placeholder message
                    setMessages(prev => {
                        const newMessages = [...prev, {
                            id: message.messageId,
                            role: 'assistant' as const,
                            content: '',
                            timestamp: new Date().toISOString(),
                            status: 'streaming' as const,
                        }];
                        console.log('[useConversation] Added placeholder message, total messages:', newMessages.length);
                        return newMessages;
                    });
                    currentMessageRef.current.set(message.messageId, '');
                    break;

                case 'conversation.chunk':
                    const existing = currentMessageRef.current.get(message.messageId) || '';
                    const updated = existing + (message.content || '');
                    currentMessageRef.current.set(message.messageId, updated);
                    console.log('[useConversation] chunk, messageId:', message.messageId, 'content preview:', updated.slice(0, 50));
                    setMessages(prev => {
                        const result = prev.map(msg =>
                            msg.id === message.messageId
                                ? { ...msg, content: updated }
                                : msg
                        );
                        console.log('[useConversation] Updated message, found match:', result.some(m => m.id === message.messageId));
                        return result;
                    });
                    break;

                case 'conversation.chunk_end':
                    console.log('[useConversation] chunk_end, messageId:', message.messageId, 'setting isStreaming to false');
                    setIsStreaming(false);
                    setMessages(prev => {
                        const result = prev.map(msg =>
                            msg.id === message.messageId
                                ? { ...msg, status: 'complete' as const }
                                : msg
                        );
                        console.log('[useConversation] Marked message as complete, messages:', result.length);
                        return result;
                    });
                    break;

                case 'conversation.thinking_start':
                    setMessages(prev => [...prev, {
                        id: `thinking-${Date.now()}`,
                        role: 'system',
                        content: message.content || '',
                        type: 'info' as const,
                        timestamp: new Date().toISOString(),
                    }]);
                    break;

                case 'conversation.tool_call':
                    setMessages(prev => {
                        const lastMsg = prev[prev.length - 1];
                        if (lastMsg && lastMsg.role === 'assistant') {
                            const assistantMsg = lastMsg as any;
                            return prev.map((msg, i) =>
                                i === prev.length - 1
                                    ? {
                                        ...msg,
                                        toolCalls: [...(assistantMsg.toolCalls || []), message.toolCall],
                                    } as any
                                    : msg
                            );
                        }
                        return prev;
                    });
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

        // Ensure WebSocket is connected
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

        // Send via WebSocket
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
