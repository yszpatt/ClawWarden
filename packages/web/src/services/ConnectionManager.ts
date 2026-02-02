/**
 * Global WebSocket Manager (Singleton)
 *
 * Maintains a single WebSocket connection to /ws/execute
 * and routes messages to subscribed task handlers.
 */

import type { ToolCall } from '@clawwarden/shared';

export interface WsMessage {
    type: string;
    sessionId?: string;
    taskId?: string;
    data?: string;
    exitCode?: number;
    bufferedOutput?: string;
    claudeSessionId?: string;
    message?: string;
    output?: unknown;  // For structured-output
    designPath?: string;
    content?: string;  // For design-complete
    // Conversation message fields
    messageId?: string;
    groupId?: string;  // Group multiple assistant messages together
    toolCall?: Partial<ToolCall>;  // Partial because some fields may be missing
    error?: string;
    // Task status update fields
    status?: string;
    laneId?: string;
    structuredOutput?: unknown;
}

type MessageHandler = (message: WsMessage) => void;

// Maximum log cache size per task (50KB)
const MAX_LOG_CACHE_SIZE = 50 * 1024;

export class ConnectionManager {
    private static instance: ConnectionManager;
    private ws: WebSocket | null = null;
    private subscribers = new Map<string, Set<MessageHandler>>();  // Multiple handlers per taskId
    private logCache = new Map<string, string>();
    private sessionIdByTask = new Map<string, string>();
    private pendingMessages: object[] = [];
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000;
    private isConnecting = false;
    private attachedTasks = new Set<string>();  // Track tasks that received bufferedOutput
    private pendingAttach = new Set<string>();  // Track tasks with pending/sent attach

    private constructor() { }

    static getInstance(): ConnectionManager {
        if (!ConnectionManager.instance) {
            ConnectionManager.instance = new ConnectionManager();
        }
        return ConnectionManager.instance;
    }

    /**
     * Initialize WebSocket connection
     */
    connect(): void {
        if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
            return;
        }

        this.isConnecting = true;
        console.log('[ConnectionManager] Connecting to WebSocket...');

        const ws = new WebSocket('ws://localhost:4001/ws/execute');

        ws.onopen = () => {
            console.log('[ConnectionManager] WebSocket connected');
            this.isConnecting = false;
            this.reconnectAttempts = 0;

            // Send any pending messages
            while (this.pendingMessages.length > 0) {
                const msg = this.pendingMessages.shift();
                if (msg) {
                    ws.send(JSON.stringify(msg));
                }
            }
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data) as WsMessage;
                this.handleMessage(message);
            } catch (err) {
                console.error('[ConnectionManager] Failed to parse message:', err);
            }
        };

        ws.onerror = (error) => {
            console.error('[ConnectionManager] WebSocket error:', error);
            this.isConnecting = false;
        };

        ws.onclose = (event) => {
            console.log('[ConnectionManager] WebSocket closed:', event.code, event.reason);
            this.ws = null;
            this.isConnecting = false;

            // Auto-reconnect unless it was a clean close
            if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                const delay = this.reconnectDelay * this.reconnectAttempts;
                console.log(`[ConnectionManager] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
                setTimeout(() => this.connect(), delay);
            }
        };

        this.ws = ws;
    }

    /**
     * Close WebSocket connection
     */
    disconnect(): void {
        if (this.ws) {
            this.ws.onclose = null; // Prevent reconnect
            this.ws.close(1000, 'Client disconnect');
            this.ws = null;
        }
    }

    /**
     * Subscribe to messages for a specific task (supports multiple subscribers)
     */
    subscribe(taskId: string, handler: MessageHandler): () => void {
        if (!this.subscribers.has(taskId)) {
            this.subscribers.set(taskId, new Set());
        }
        this.subscribers.get(taskId)!.add(handler);

        console.log('[ConnectionManager] Subscribed to task:', taskId, 'total handlers:', this.subscribers.get(taskId)!.size);

        // Return unsubscribe function
        return () => {
            const handlers = this.subscribers.get(taskId);
            if (handlers) {
                handlers.delete(handler);
                if (handlers.size === 0) {
                    this.subscribers.delete(taskId);
                }
            }
        };
    }

    /**
     * Send a message through WebSocket
     */
    send(message: object): void {
        console.log('[ConnectionManager] Sending message:', message);
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
            console.log('[ConnectionManager] Message sent successfully');
        } else {
            console.log('[ConnectionManager] WebSocket not ready, queuing message. State:', this.ws?.readyState);
            // Queue message for when connection is ready
            this.pendingMessages.push(message);
            this.connect();
        }
    }

    /**
     * Get cached log output for a task
     */
    getLogCache(taskId: string): string {
        return this.logCache.get(taskId) || '';
    }

    /**
     * Get session ID for a task
     */
    getSessionId(taskId: string): string | null {
        return this.sessionIdByTask.get(taskId) || null;
    }

    /**
     * Check if WebSocket is connected
     */
    isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    /**
     * Wait for connection to be ready, then call callback.
     * Returns a cancel function to stop the polling.
     */
    onReady(callback: () => void): () => void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            callback();
            return () => { }; // No-op cancel
        }

        let cancelled = false;

        const checkConnection = () => {
            if (cancelled) return; // Cancelled, stop polling
            if (this.ws?.readyState === WebSocket.OPEN) {
                callback();
            } else {
                setTimeout(checkConnection, 50);
            }
        };

        this.connect();
        setTimeout(checkConnection, 50);

        // Return cancel function
        return () => {
            cancelled = true;
        };
    }

    /**
     * Check if a task has already received bufferedOutput (to prevent duplicates)
     */
    hasReceivedBuffer(taskId: string): boolean {
        return this.attachedTasks.has(taskId);
    }

    /**
     * Mark a task as having received bufferedOutput
     */
    markBufferReceived(taskId: string): void {
        this.attachedTasks.add(taskId);
    }

    /**
     * Clear buffer received flag (e.g., when starting fresh)
     */
    clearBufferReceived(taskId: string): void {
        console.log('[ConnectionManager] clearBufferReceived:', taskId);
        this.attachedTasks.delete(taskId);
        this.pendingAttach.delete(taskId);  // Also clear pending attach
    }

    /**
     * Check if attach has already been sent for this task (prevents duplicate attach calls)
     */
    hasPendingAttach(taskId: string): boolean {
        const has = this.pendingAttach.has(taskId);
        console.log('[ConnectionManager] hasPendingAttach:', taskId, '=', has, 'set:', Array.from(this.pendingAttach));
        return has;
    }

    /**
     * Mark attach as sent for this task
     */
    markAttachSent(taskId: string): void {
        console.log('[ConnectionManager] markAttachSent:', taskId);
        this.pendingAttach.add(taskId);
    }

    /**
     * Clear pending attach status (e.g. when component unmounts)
     */
    clearPendingAttach(taskId: string): void {
        console.log('[ConnectionManager] clearPendingAttach:', taskId);
        this.pendingAttach.delete(taskId);
    }

    /**
     * Handle incoming WebSocket message
     */
    private handleMessage(message: WsMessage): void {
        // Log tool call related messages for debugging
        if (message.type === 'conversation.tool_call_start' || message.type === 'conversation.tool_call_output') {
            console.log('[ConnectionManager] Received:', message.type, 'messageId:', message.messageId, 'toolCall:', message.toolCall);
        }
        console.log('[ConnectionManager] Received message type:', message.type, 'taskId:', message.taskId);

        const taskId = message.taskId;

        // Track session IDs
        if (message.type === 'started' || message.type === 'attached' || message.type === 'resumed') {
            if (message.sessionId && taskId) {
                this.sessionIdByTask.set(taskId, message.sessionId);
            }
        }

        // Cache output data
        if (message.type === 'output' && message.data && taskId) {
            const existing = this.logCache.get(taskId) || '';
            let newCache = existing + message.data;
            if (newCache.length > MAX_LOG_CACHE_SIZE) {
                newCache = newCache.slice(-MAX_LOG_CACHE_SIZE);
            }
            this.logCache.set(taskId, newCache);
        }

        // Cache buffered output from attach
        if (message.type === 'attached' && message.bufferedOutput && taskId) {
            this.logCache.set(taskId, message.bufferedOutput);
        }

        // Dispatch to all subscribers for this task
        if (taskId) {
            const handlers = this.subscribers.get(taskId);
            if (handlers && handlers.size > 0) {
                console.log('[ConnectionManager] Dispatching', message.type, 'to', handlers.size, 'handler(s) for task:', taskId);
                handlers.forEach(handler => {
                    try {
                        handler(message);
                    } catch (err) {
                        console.error('[ConnectionManager] Handler error:', err);
                    }
                });
            } else {
                console.log('[ConnectionManager] No handlers found for task:', taskId, 'subscribers:', Array.from(this.subscribers.keys()));
            }
        }

        // Also dispatch to all global subscribers (taskId = '*')
        const globalHandlers = this.subscribers.get('*');
        if (globalHandlers && globalHandlers.size > 0) {
            console.log('[ConnectionManager] Dispatching', message.type, 'to', globalHandlers.size, 'global handler(s)');
            globalHandlers.forEach(handler => {
                try {
                    handler(message);
                } catch (err) {
                    console.error('[ConnectionManager] Global handler error:', err);
                }
            });
        }
    }
}

// Export singleton accessor
export const connectionManager = ConnectionManager.getInstance();
