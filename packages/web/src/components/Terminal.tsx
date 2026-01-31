import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { useTheme } from '../context/ThemeContext';
import { connectionManager } from '../services/ConnectionManager';
import 'xterm/css/xterm.css';

export interface TerminalRef {
    write: (data: string) => void;
    clear: () => void;
    cols: number;
    rows: number;
}

interface TerminalProps {
    sessionId?: string;
    onData?: (data: string) => void;
    onResize?: (cols: number, rows: number) => void;
}

export const Terminal = forwardRef<TerminalRef, TerminalProps>(({ onData, onResize }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<XTerm | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const isOpenedRef = useRef(false); // Track if terminal is opened

    // Use refs for callbacks to avoid re-initializing terminal when they change
    const onDataRef = useRef(onData);
    const onResizeRef = useRef(onResize);

    // Update refs on render
    onDataRef.current = onData;
    onResizeRef.current = onResize;

    const { theme } = useTheme();
    const [activeTab, setActiveTab] = useState<'terminal' | 'output' | 'debug'>('terminal');

    useImperativeHandle(ref, () => ({
        write: (data: string) => terminalRef.current?.write(data),
        clear: () => terminalRef.current?.clear(),
        get cols() { return terminalRef.current?.cols ?? 80; },
        get rows() { return terminalRef.current?.rows ?? 24; },
    }));

    // Initialize Terminal
    useEffect(() => {
        if (!containerRef.current || terminalRef.current) return;

        console.log('[Terminal] Initializing...');

        // Guard against race conditions where cleanup happens before async ops
        let isMounted = true;

        const terminal = new XTerm({
            theme: getTerminalTheme(theme),
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            fontSize: 13,
            cursorBlink: true,
            cursorStyle: 'block',
            allowProposedApi: true,
        });

        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);

        terminalRef.current = terminal;
        fitAddonRef.current = fitAddon;

        let resizeRafId: number | null = null;
        let openRafId: number | null = null;

        // Use ResizeObserver for robust layout handling
        const resizeObserver = new ResizeObserver((entries) => {
            if (!isMounted || !fitAddon || !terminalRef.current || !isOpenedRef.current) return;

            // Cancel previous pending resize if any
            if (resizeRafId) cancelAnimationFrame(resizeRafId);

            // Debounce fit call to next animation frame
            resizeRafId = requestAnimationFrame(() => {
                resizeRafId = null;
                // Double check validity safely
                if (!isMounted || !fitAddon || !terminalRef.current || !isOpenedRef.current) return;

                // Check if disposed (internal xterm check)
                // @ts-ignore - access internal state safely if possible or rely on try-catch
                if (terminal.element === undefined && terminalRef.current._core?._isDisposed) return;

                // Check if container has size
                const entry = entries[0];
                if (entry && (entry.contentRect.width === 0 || entry.contentRect.height === 0)) {
                    return;
                }

                try {
                    fitAddon.fit();
                } catch (e) {
                    // Suppress common resize errors during transition/unmount
                    console.warn('[Terminal] Resize fit error suppress:', e);
                }
            });
        });

        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        openRafId = requestAnimationFrame(() => {
            openRafId = null;
            if (!isMounted || !containerRef.current) return;

            try {
                terminal.open(containerRef.current);
                isOpenedRef.current = true; // Mark as opened

                // Initial fit
                try {
                    fitAddon.fit();
                } catch (e) {
                    console.warn('[Terminal] Initial fit error:', e);
                }

                console.log('[Terminal] Opened and fitted. Cols:', terminal.cols, 'Rows:', terminal.rows);

                // Report initial size
                onResizeRef.current?.(terminal.cols, terminal.rows);
            } catch (err) {
                console.error('Failed to open terminal:', err);
            }
        });

        terminal.onData((data) => {
            if (isMounted) onDataRef.current?.(data);
        });

        terminal.onResize(({ cols, rows }) => {
            if (isMounted) {
                console.log('[Terminal] Resized to:', cols, rows);
                onResizeRef.current?.(cols, rows);
            }
        });

        return () => {
            console.log('[Terminal] Cleaning up...');
            isMounted = false;
            isOpenedRef.current = false;

            if (resizeRafId) cancelAnimationFrame(resizeRafId);
            if (openRafId) cancelAnimationFrame(openRafId);

            resizeObserver.disconnect();

            try {
                terminal.dispose();
            } catch (e) {
                console.warn('Error disposing terminal:', e);
            }
            terminalRef.current = null;
        };
    }, []);

    // Update Theme
    useEffect(() => {
        if (terminalRef.current) {
            terminalRef.current.options.theme = getTerminalTheme(theme);
        }
    }, [theme]);

    return (
        <div className="terminal-container">
            {/* Header / Tabs */}
            <div className="terminal-header">
                <div className="terminal-tabs">
                    <div
                        className={`terminal-tab ${activeTab === 'terminal' ? 'active' : ''}`}
                        onClick={() => setActiveTab('terminal')}
                    >
                        Terminal
                    </div>
                    <div
                        className={`terminal-tab ${activeTab === 'output' ? 'active' : ''}`}
                        onClick={() => setActiveTab('output')}
                    >
                        Output
                    </div>
                    <div
                        className={`terminal-tab ${activeTab === 'debug' ? 'active' : ''}`}
                        onClick={() => setActiveTab('debug')}
                    >
                        Debug Console
                    </div>
                </div>
                <div className="terminal-actions">
                    <button className="terminal-action-btn" title="Split Terminal">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M14 2H2C1.44772 2 1 2.44772 1 3V13C1 13.5523 1.44772 14 2 14H14C14.5523 14 15 13.5523 15 13V3C15 2.44772 14.5523 2 14 2ZM8 13H2V3H8V13ZM14 13H9V3H14V13Z" />
                        </svg>
                    </button>
                    <button className="terminal-action-btn" title="Clear Terminal" onClick={() => terminalRef.current?.clear()}>
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M11 2H9C9 1.44772 8.55228 1 8 1C7.44772 1 7 1.44772 7 2H5C3.34315 2 2 3.34315 2 5V12C2 13.6569 3.34315 15 5 15H11C12.6569 15 14 13.6569 14 12V5C14 3.34315 12.6569 2 11 2ZM4 5C4 4.44772 4.44772 4 5 4H11C11.5523 4 12 4.44772 12 5V12C12 12.5523 11.5523 13 11 13H5C4.44772 13 4 12.5523 4 12V5Z" />
                        </svg>
                    </button>
                    <button className="terminal-action-btn" title="Close Panel">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Terminal Body */}
            <div className="terminal-body" ref={containerRef} />

            {/* Status Bar */}
            <div className="terminal-status-bar">
                <div className="terminal-status-left">
                    <div className="status-item">
                        <span>Argon • Ready</span>
                    </div>
                </div>
                <div className="terminal-status-right">
                    <div className="status-item">
                        <span>Ln 1, Col 1</span>
                    </div>
                    <div className="status-item">
                        <span>UTF-8</span>
                    </div>
                </div>
            </div>
        </div>
    );
});

function getTerminalTheme(mode: 'light' | 'dark') {
    if (mode === 'light') {
        return {
            background: '#ffffff',
            foreground: '#000000',
            cursor: '#000000',
            cursorAccent: '#ffffff',
            selectionBackground: 'rgba(0, 0, 0, 0.2)',
            black: '#000000',
            red: '#cd3131',
            green: '#0dbc79',
            yellow: '#e5e510',
            blue: '#2472c8',
            magenta: '#bc3fbc',
            cyan: '#11a8cd',
            white: '#e5e5e5',
            brightBlack: '#666666',
            brightRed: '#cd3131',
            brightGreen: '#14ce9c',
            brightYellow: '#f5f543',
            brightBlue: '#3b8eea',
            brightMagenta: '#d670d6',
            brightCyan: '#29b8db',
            brightWhite: '#e5e5e5',
        };
    } else {
        return {
            background: '#1e1e1e',
            foreground: '#e0e0e0',
            cursor: '#8B5CF6',
            cursorAccent: '#1e1e1e',
            selectionBackground: 'rgba(139, 92, 246, 0.3)',
            // Standard VS Code Dark+ approximated
        };
    }
}

// Hook for managing terminal + WebSocket connection (uses global ConnectionManager)
export function useTerminalConnection(
    projectId: string,
    taskId: string,
    callbacks?: {
        onDesignComplete?: (content: string, designPath: string) => void;
        onStatusChange?: (status: string) => void;
        onStructuredOutput?: (output: unknown) => void;
    }
) {
    const terminalRef = useRef<TerminalRef | null>(null);
    const sessionIdRef = useRef<string | null>(null);
    const prevTaskIdRef = useRef<string | null>(null);
    const hasReceivedBufferRef = useRef(false); // Local tracking for buffer deduplication

    // Use ref for callbacks to avoid re-subscribing when callbacks change
    const callbacksRef = useRef(callbacks);
    callbacksRef.current = callbacks;

    // Use the singleton directly (imported at module level avoids require())
    const manager = connectionManager;

    // Reset buffer received flag on mount - always allow receiving buffered output when panel opens
    useEffect(() => {
        console.log('[Terminal] useTerminalConnection mounted, resetting hasReceivedBufferRef');
        hasReceivedBufferRef.current = false;
    }, []); // Empty deps = only run on mount

    // Track when taskId changes to clear old task state, and clear pendingAttach on unmount
    useEffect(() => {
        // Clear old task's tracking when taskId changes
        if (prevTaskIdRef.current !== null && prevTaskIdRef.current !== taskId) {
            console.log('[Terminal] TaskId changed from', prevTaskIdRef.current, 'to', taskId, '- resetting local state');
            hasReceivedBufferRef.current = false;
        }
        prevTaskIdRef.current = taskId;

        // On unmount (component closed), clear pendingAttach so re-opening can attach again
        // But keep bufferReceived so we don't re-receive buffer on quick close/reopen
        return () => {
            console.log('[Terminal] Unmounting, clearing pendingAttach for:', taskId);
            // Only clear pendingAttach, not bufferReceived - buffer is still valid
            // Use public method to clear pending attach
            manager.clearPendingAttach(taskId);
        };
    }, [taskId]);

    // Subscribe to messages for this task
    useEffect(() => {
        const handleMessage = (message: any) => {
            if (message.type === 'started') {
                sessionIdRef.current = message.sessionId;
                console.log('[Terminal] Session started:', message.sessionId);
                // Mark buffer as received since we'll get live output, not buffered history
                hasReceivedBufferRef.current = true;
            } else if (message.type === 'attached') {
                sessionIdRef.current = message.sessionId;
                console.log('[Terminal] Attached to existing session:', message.sessionId);
                console.log('[Terminal] bufferedOutput:', message.bufferedOutput ? 'exists (length: ' + message.bufferedOutput.length + ')' : 'none');
                console.log('[Terminal] hasReceivedBufferRef.current:', hasReceivedBufferRef.current);
                if (terminalRef.current) {
                    terminalRef.current.write('\x1b[33m[System] Attached to running session.\x1b[0m\r\n');
                    // Immediately sync terminal size with PTY to fix ANSI escape sequences
                    const cols = terminalRef.current.cols;
                    const rows = terminalRef.current.rows;
                    console.log('[Terminal] Syncing terminal size after attach:', cols, 'x', rows);
                    manager.send({
                        type: 'resize',
                        sessionId: message.sessionId,
                        cols,
                        rows,
                    });
                }
                // Only write bufferedOutput if we haven't already received it for this task instance
                if (message.bufferedOutput && !hasReceivedBufferRef.current) {
                    console.log('[Terminal] Writing buffered output to terminal');
                    terminalRef.current?.write(message.bufferedOutput);
                    hasReceivedBufferRef.current = true;
                } else {
                    console.log('[Terminal] Skipped writing buffered output - hasReceivedBuffer:', hasReceivedBufferRef.current, ', has bufferedOutput:', !!message.bufferedOutput);
                }
            } else if (message.type === 'no-session') {
                console.log('[Terminal] No active session for task:', message.taskId);
                terminalRef.current?.write('\x1b[90m[System] No active session. Use execute to start.\x1b[0m\r\n');
            } else if (message.type === 'resumed') {
                sessionIdRef.current = message.sessionId;
                console.log('[Terminal] Resumed Claude session:', message.claudeSessionId, 'writing to terminal:', !!terminalRef.current);
                if (terminalRef.current) {
                    terminalRef.current.write('\x1b[33m[System] Resuming previous Claude session...\x1b[0m\r\n');
                    // Immediately sync terminal size with PTY to fix ANSI escape sequences
                    const cols = terminalRef.current.cols;
                    const rows = terminalRef.current.rows;
                    console.log('[Terminal] Syncing terminal size after resume:', cols, 'x', rows);
                    manager.send({
                        type: 'resize',
                        sessionId: message.sessionId,
                        cols,
                        rows,
                    });
                }
                // Mark buffer as received since resumed session will send output via live messages
                hasReceivedBufferRef.current = true;
            } else if (message.type === 'output' && message.data) {
                const preview = message.data.slice(0, 100).replace(/\x1b\[[0-9;]*m/g, '').replace(/\r|\n/g, '↵');
                console.log('[Terminal] Output received, length:', message.data.length, 'preview:', preview);
                terminalRef.current?.write(message.data);
            } else if (message.type === 'exit') {
                const color = message.exitCode === 0 ? '\x1b[32m' : '\x1b[31m';
                terminalRef.current?.write(`\r\n${color}[System] Process exited with code ${message.exitCode}\x1b[0m\r\n`);
            } else if (message.type === 'design-complete') {
                console.log('[Terminal] Design complete:', message.designPath);
                terminalRef.current?.write(`\r\n\x1b[32m[System] Design generation complete!\x1b[0m\r\n`);
                // Call the callback if provided
                if (callbacksRef.current?.onDesignComplete && message.content) {
                    callbacksRef.current.onDesignComplete(message.content, message.designPath);
                }
                if (callbacksRef.current?.onStatusChange) {
                    callbacksRef.current.onStatusChange('pending-dev');
                }
            } else if (message.type === 'structured-output') {
                console.log('[Terminal] Structured output received:', message.output);
                // Call the callback if provided
                if (callbacksRef.current?.onStructuredOutput && message.output) {
                    callbacksRef.current.onStructuredOutput(message.output);
                }
            } else if (message.type === 'error') {
                terminalRef.current?.write(`\r\n\x1b[31m[Error] ${message.message}\x1b[0m\r\n`);
            }
        };

        const unsubscribe = manager.subscribe(taskId, handleMessage);

        return () => {
            unsubscribe();
        };
    }, [taskId, manager]);



    const connect = (onReady?: () => void): (() => void) => {
        manager.connect();
        if (onReady) {
            return manager.onReady(onReady);  // Return cancel function
        }
        return () => { };  // No-op cancel if no callback
    };

    const execute = () => {
        manager.send({
            type: 'execute',
            projectId,
            taskId,
        });
    };

    const sendInput = (data: string) => {
        const sessionId = sessionIdRef.current || manager.getSessionId(taskId);
        if (sessionId) {
            manager.send({
                type: 'input',
                sessionId,
                data,
            });
        }
    };

    const handleResize = (cols: number, rows: number) => {
        const sessionId = sessionIdRef.current || manager.getSessionId(taskId);
        if (sessionId) {
            manager.send({
                type: 'resize',
                sessionId,
                cols,
                rows,
            });
        }
    };

    const stop = () => {
        manager.send({
            type: 'stop',
            taskId,
        });
    };

    const disconnect = () => {
        // No-op: we don't disconnect the global manager when component unmounts
        // This is the key change that prevents connection thrashing
        sessionIdRef.current = null;
    };

    const attach = () => {
        console.log('[Terminal] attach() called for taskId:', taskId);
        // Use global tracking in ConnectionManager to prevent duplicate attach calls
        const hasPending = manager.hasPendingAttach(taskId);
        console.log('[Terminal] hasPendingAttach:', hasPending);
        if (hasPending) {
            console.log('[Terminal] attach() skipped due to pendingAttach');
            return;
        }
        manager.markAttachSent(taskId);
        console.log('[Terminal] Sending attach message to server');
        manager.send({
            type: 'attach',
            projectId,
            taskId,
        });
    };

    return {
        connect,
        execute,
        attach,
        sendInput,
        handleResize,
        stop,
        disconnect,
        setTerminalRef: (ref: TerminalRef | null) => {
            terminalRef.current = ref;
        },
    };
}
