import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

interface TerminalProps {
    sessionId?: string;
    onData?: (data: string) => void;
    onResize?: (cols: number, rows: number) => void;
}

export function Terminal({ onData, onResize }: TerminalProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<XTerm | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);

    useEffect(() => {
        if (!containerRef.current || terminalRef.current) return;

        const terminal = new XTerm({
            theme: {
                background: '#0d0d0d',
                foreground: '#e0e0e0',
                cursor: '#8B5CF6',
                cursorAccent: '#0d0d0d',
                selectionBackground: 'rgba(139, 92, 246, 0.3)',
            },
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            fontSize: 13,
            cursorBlink: true,
            cursorStyle: 'block',
        });

        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);

        terminal.open(containerRef.current);
        fitAddon.fit();

        // Handle user input
        terminal.onData((data) => {
            onData?.(data);
        });

        // Handle resize
        terminal.onResize(({ cols, rows }) => {
            onResize?.(cols, rows);
        });

        terminalRef.current = terminal;
        fitAddonRef.current = fitAddon;

        // Resize on window resize
        const handleResize = () => {
            fitAddon.fit();
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            terminal.dispose();
            terminalRef.current = null;
            fitAddonRef.current = null;
        };
    }, [onData, onResize]);

    // Method to write data to terminal (called from parent via ref or effect)
    const write = (data: string) => {
        terminalRef.current?.write(data);
    };

    // Method to clear terminal
    const clear = () => {
        terminalRef.current?.clear();
    };

    // Expose methods through window for debugging
    useEffect(() => {
        (window as any).__terminal = { write, clear };
        return () => {
            delete (window as any).__terminal;
        };
    }, []);

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                height: '300px',
                backgroundColor: '#0d0d0d',
                borderRadius: '6px',
                overflow: 'hidden',
            }}
        />
    );
}

// Hook for managing terminal + WebSocket connection
export function useTerminalConnection(projectId: string, taskId: string) {
    const wsRef = useRef<WebSocket | null>(null);
    const terminalRef = useRef<{ write: (data: string) => void } | null>(null);

    const connect = () => {
        const ws = new WebSocket(`ws://localhost:3001/ws/execute`);

        ws.onopen = () => {
            console.log('Execution WebSocket connected');
        };

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);

            if (message.type === 'output' && message.data) {
                terminalRef.current?.write(message.data);
            } else if (message.type === 'exit') {
                terminalRef.current?.write(`\r\n[Process exited with code ${message.exitCode}]\r\n`);
            } else if (message.type === 'error') {
                terminalRef.current?.write(`\r\n[Error: ${message.message}]\r\n`);
            }
        };

        ws.onerror = (error) => {
            console.error('Execution WebSocket error:', error);
        };

        ws.onclose = () => {
            console.log('Execution WebSocket closed');
        };

        wsRef.current = ws;
    };

    const execute = () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'execute',
                projectId,
                taskId,
            }));
        }
    };

    const sendInput = (data: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'input',
                data,
            }));
        }
    };

    const stop = () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'stop',
                taskId,
            }));
        }
    };

    const disconnect = () => {
        wsRef.current?.close();
        wsRef.current = null;
    };

    return {
        connect,
        execute,
        sendInput,
        stop,
        disconnect,
        setTerminalRef: (ref: { write: (data: string) => void }) => {
            terminalRef.current = ref;
        },
    };
}
