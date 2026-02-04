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
    output?: unknown;  // For structured-output
    planPath?: string;
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

export class ConnectionManager {
    private static instance: ConnectionManager;
    private ws: WebSocket | null = null;
    private subscribers = new Map<string, Set<MessageHandler>>();  // Multiple handlers per taskId
    private pendingMessages: object[] = [];
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000;
    private isConnecting = false;

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
     * Handle incoming WebSocket message
     */
    private handleMessage(message: WsMessage): void {
        // Log tool call related messages for debugging
        if (message.type === 'conversation.tool_call_start' || message.type === 'conversation.tool_call_output') {
            console.log('[ConnectionManager] Received:', message.type, 'messageId:', message.messageId, 'toolCall:', message.toolCall);
        }
        console.log('[ConnectionManager] Received message type:', message.type, 'taskId:', message.taskId);

        const taskId = message.taskId;

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
