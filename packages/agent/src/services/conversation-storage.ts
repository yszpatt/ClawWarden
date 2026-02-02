import fs from 'fs/promises';
import path from 'path';
import type { Conversation, ConversationMessage } from '@clawwarden/shared';

/**
 * File-based conversation storage
 * Stores conversations at {projectPath}/.antiwarden/sessions/{taskId}.json
 */
export class ConversationStorage {
    /**
     * Get session file path for a task in a project
     */
    getSessionPath(projectPath: string, taskId: string): string {
        return path.join(projectPath, '.antiwarden', 'sessions', `${taskId}.json`);
    }

    /**
     * Get sessions directory for a project
     */
    getSessionsDir(projectPath: string): string {
        return path.join(projectPath, '.antiwarden', 'sessions');
    }

    /**
     * Load conversation for a task in a project
     */
    async load(projectPath: string, taskId: string): Promise<Conversation | null> {
        const filePath = this.getSessionPath(projectPath, taskId);
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(content) as Conversation;
        } catch {
            return null;
        }
    }

    /**
     * Save conversation for a task in a project
     */
    async save(projectPath: string, conversation: Conversation): Promise<void> {
        const filePath = this.getSessionPath(projectPath, conversation.taskId);
        const dir = path.dirname(filePath);

        await fs.mkdir(dir, { recursive: true });
        conversation.updatedAt = new Date().toISOString();

        await fs.writeFile(filePath, JSON.stringify(conversation, null, 2));
    }

    /**
     * Append a message to a conversation
     */
    async appendMessage(projectPath: string, taskId: string, message: ConversationMessage): Promise<void> {
        const conversation = await this.load(projectPath, taskId) || this.createEmpty(taskId);
        conversation.messages.push(message);
        await this.save(projectPath, conversation);
    }

    /**
     * Clear all messages in a conversation
     */
    async clear(projectPath: string, taskId: string): Promise<void> {
        const conversation = await this.load(projectPath, taskId);
        if (conversation) {
            conversation.messages = [];
            await this.save(projectPath, conversation);
        }
    }

    /**
     * Delete conversation file for a task
     */
    async delete(projectPath: string, taskId: string): Promise<void> {
        const filePath = this.getSessionPath(projectPath, taskId);
        try {
            await fs.unlink(filePath);
            // Try to remove empty parent directories
            const sessionsDir = this.getSessionsDir(projectPath);
            try {
                const files = await fs.readdir(sessionsDir);
                if (files.length === 0) {
                    await fs.rmdir(sessionsDir);
                }
            } catch {
                // Ignore if directory already removed or has issues
            }
        } catch {
            // Ignore if file doesn't exist
        }
    }

    /**
     * List all session files in a project
     */
    async listSessions(projectPath: string): Promise<string[]> {
        const sessionsDir = this.getSessionsDir(projectPath);
        try {
            const files = await fs.readdir(sessionsDir);
            return files
                .filter(f => f.endsWith('.json'))
                .map(f => f.replace('.json', ''));
        } catch {
            return [];
        }
    }

    /**
     * Check if a session exists for a task
     */
    async exists(projectPath: string, taskId: string): Promise<boolean> {
        const filePath = this.getSessionPath(projectPath, taskId);
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    private createEmpty(taskId: string): Conversation {
        return {
            taskId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: [],
        };
    }
}

// Singleton instance
export const conversationStorage = new ConversationStorage();
