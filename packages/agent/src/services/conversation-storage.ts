import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { Conversation, ConversationMessage } from '@antiwarden/shared';

/**
 * File-based conversation storage
 * Stores conversations at ~/.antiwarden/tasks/{taskId}/conversation.json
 */
export class ConversationStorage {
    private getBaseDir(): string {
        return path.join(os.homedir(), '.antiwarden', 'tasks');
    }

    private getConversationPath(taskId: string): string {
        return path.join(this.getBaseDir(), taskId, 'conversation.json');
    }

    async load(taskId: string): Promise<Conversation | null> {
        const filePath = this.getConversationPath(taskId);
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(content) as Conversation;
        } catch {
            return null;
        }
    }

    async save(taskId: string, conversation: Conversation): Promise<void> {
        const filePath = this.getConversationPath(taskId);
        const dir = path.dirname(filePath);

        await fs.mkdir(dir, { recursive: true });
        conversation.updatedAt = new Date().toISOString();

        await fs.writeFile(filePath, JSON.stringify(conversation, null, 2));
    }

    async appendMessage(taskId: string, message: ConversationMessage): Promise<void> {
        const conversation = await this.load(taskId) || this.createEmpty(taskId);
        conversation.messages.push(message);
        await this.save(taskId, conversation);
    }

    async clear(taskId: string): Promise<void> {
        const conversation = await this.load(taskId);
        if (conversation) {
            conversation.messages = [];
            await this.save(taskId, conversation);
        }
    }

    async delete(taskId: string): Promise<void> {
        const filePath = this.getConversationPath(taskId);
        try {
            await fs.unlink(filePath);
        } catch {
            // Ignore if file doesn't exist
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
