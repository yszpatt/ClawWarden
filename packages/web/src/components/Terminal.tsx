import { useEffect, useRef, useCallback } from 'react';
import { connectionManager } from '../services/ConnectionManager';

// Hook for managing task execution + WebSocket connection (uses global ConnectionManager)
export function useTerminalConnection(
    _projectId: string,
    taskId: string,
    callbacks?: {
        onDesignComplete?: (content: string, designPath: string) => void;
        onStatusChange?: (status: string) => void;
        onStructuredOutput?: (output: unknown) => void;
    }
) {
    const sessionIdRef = useRef<string | null>(null);
    const prevTaskIdRef = useRef<string | null>(null);

    // Use ref for callbacks to avoid re-subscribing when callbacks change
    const callbacksRef = useRef(callbacks);
    callbacksRef.current = callbacks;

    // Use the singleton directly
    const manager = connectionManager;

    // Track when taskId changes to clear old task state
    useEffect(() => {
        if (prevTaskIdRef.current && prevTaskIdRef.current !== taskId) {
            console.log('[TaskConnection] TaskId changed - resetting local state');
            sessionIdRef.current = null;
        }
        prevTaskIdRef.current = taskId;
    }, [taskId]);

    // Handle incoming messages from the manager for our specific taskId
    useEffect(() => {
        const handleMessage = (message: any) => {
            if (message.type === 'started') {
                console.log('[TaskConnection] Session started:', message.sessionId);
                sessionIdRef.current = message.sessionId;
            } else if (message.type === 'exit') {
                console.log('[TaskConnection] Process exited with code', message.exitCode);
                if (callbacksRef.current?.onStatusChange) {
                    callbacksRef.current.onStatusChange(message.exitCode === 0 ? 'completed' : 'failed');
                }
            } else if (message.type === 'design-complete') {
                console.log('[TaskConnection] Design complete:', message.designPath);
                if (callbacksRef.current?.onDesignComplete && message.content) {
                    callbacksRef.current.onDesignComplete(message.content, message.designPath);
                }
                if (callbacksRef.current?.onStatusChange) {
                    callbacksRef.current.onStatusChange('pending-dev');
                }
            } else if (message.type === 'structured-output') {
                console.log('[TaskConnection] Structured output received');
                if (callbacksRef.current?.onStructuredOutput && message.output) {
                    callbacksRef.current.onStructuredOutput(message.output);
                }
            } else if (message.type === 'task_status') {
                if (callbacksRef.current?.onStatusChange) {
                    callbacksRef.current.onStatusChange(message.status);
                }
            }
        };

        const unsubscribe = manager.subscribe(taskId, handleMessage);

        return () => {
            unsubscribe();
        };
    }, [taskId, manager]);

    const connect = useCallback((onReady?: () => void): (() => void) => {
        manager.connect();
        if (onReady) {
            return manager.onReady(onReady);
        }
        return () => { };
    }, [manager]);

    const stop = useCallback(() => {
        manager.send({
            type: 'stop',
            taskId,
        });
    }, [manager, taskId]);

    const disconnect = useCallback(() => {
        sessionIdRef.current = null;
    }, []);

    return {
        connect,
        stop,
        disconnect,
    };
}
