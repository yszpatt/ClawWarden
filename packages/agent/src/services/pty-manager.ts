import * as pty from 'node-pty';
import { EventEmitter } from 'events';

export interface PtySession {
    id: string;
    taskId: string;
    projectPath: string;
    pty: pty.IPty;
}

export interface PtyOutput {
    sessionId: string;
    taskId: string;
    type: 'stdout' | 'exit';
    data?: string;
    exitCode?: number;
}

export class PtyManager extends EventEmitter {
    private sessions: Map<string, PtySession> = new Map();

    /**
     * Start a new PTY session for executing Claude CLI
     */
    startSession(taskId: string, projectPath: string, prompt: string): string {
        const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        // Determine shell based on platform
        const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash';

        const ptyProcess = pty.spawn(shell, [], {
            name: 'xterm-256color',
            cols: 120,
            rows: 30,
            cwd: projectPath,
            env: { ...process.env, TERM: 'xterm-256color' },
        });

        const session: PtySession = {
            id: sessionId,
            taskId,
            projectPath,
            pty: ptyProcess,
        };

        this.sessions.set(sessionId, session);

        // Listen for output
        ptyProcess.onData((data) => {
            this.emit('output', {
                sessionId,
                taskId,
                type: 'stdout',
                data,
            } as PtyOutput);
        });

        // Listen for exit
        ptyProcess.onExit(({ exitCode }) => {
            this.emit('output', {
                sessionId,
                taskId,
                type: 'exit',
                exitCode,
            } as PtyOutput);
            this.sessions.delete(sessionId);
        });

        // Execute the claude command with the prompt
        const escapedPrompt = prompt.replace(/'/g, "'\\''");
        ptyProcess.write(`claude '${escapedPrompt}'\n`);

        return sessionId;
    }

    /**
     * Send input to a PTY session (for interactive commands)
     */
    sendInput(sessionId: string, data: string): boolean {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return false;
        }
        session.pty.write(data);
        return true;
    }

    /**
     * Resize a PTY session
     */
    resize(sessionId: string, cols: number, rows: number): boolean {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return false;
        }
        session.pty.resize(cols, rows);
        return true;
    }

    /**
     * Kill a PTY session
     */
    killSession(sessionId: string): boolean {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return false;
        }
        session.pty.kill();
        this.sessions.delete(sessionId);
        return true;
    }

    /**
     * Get session by task ID
     */
    getSessionByTaskId(taskId: string): PtySession | undefined {
        for (const session of this.sessions.values()) {
            if (session.taskId === taskId) {
                return session;
            }
        }
        return undefined;
    }

    /**
     * Close all sessions
     */
    closeAll(): void {
        for (const session of this.sessions.values()) {
            session.pty.kill();
        }
        this.sessions.clear();
    }
}

export const ptyManager = new PtyManager();
