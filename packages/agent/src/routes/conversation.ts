import { FastifyInstance } from 'fastify';
import { conversationStorage } from '../services/conversation-storage';
import { readGlobalConfig } from '../utils/json-store';
import type { Conversation, ConversationMessage, AssistantMessage } from '@antiwarden/shared';

export async function conversationRoutes(fastify: FastifyInstance) {
    // Get conversation for a task
    fastify.get<{
        Params: { projectId: string; taskId: string };
    }>('/api/projects/:projectId/tasks/:taskId/conversation', async (request) => {
        const { projectId, taskId } = request.params;

        const config = await readGlobalConfig();
        const project = config.projects.find(p => p.id === projectId);
        if (!project) {
            throw { statusCode: 404, message: 'Project not found' };
        }

        const conversation = await conversationStorage.load(project.path, taskId);
        return { conversation };
    });

    // Append message to conversation
    fastify.post<{
        Params: { projectId: string; taskId: string };
        Body: { message: ConversationMessage };
    }>('/api/projects/:projectId/tasks/:taskId/conversation/messages', async (request) => {
        const { projectId, taskId } = request.params;
        const { message } = request.body;

        const config = await readGlobalConfig();
        const project = config.projects.find(p => p.id === projectId);
        if (!project) {
            throw { statusCode: 404, message: 'Project not found' };
        }

        await conversationStorage.appendMessage(project.path, taskId, message);
        return { success: true };
    });

    // Clear conversation
    fastify.delete<{
        Params: { projectId: string; taskId: string };
    }>('/api/projects/:projectId/tasks/:taskId/conversation', async (request) => {
        const { projectId, taskId } = request.params;

        const config = await readGlobalConfig();
        const project = config.projects.find(p => p.id === projectId);
        if (!project) {
            throw { statusCode: 404, message: 'Project not found' };
        }

        await conversationStorage.clear(project.path, taskId);
        return { success: true };
    });

    // Export conversation as Markdown
    fastify.get<{
        Params: { projectId: string; taskId: string };
    }>('/api/projects/:projectId/tasks/:taskId/conversation/export', async (request, reply) => {
        const { projectId, taskId } = request.params;

        const config = await readGlobalConfig();
        const project = config.projects.find(p => p.id === projectId);
        if (!project) {
            throw { statusCode: 404, message: 'Project not found' };
        }

        const conversation = await conversationStorage.load(project.path, taskId);
        if (!conversation) {
            throw { statusCode: 404, message: 'Conversation not found' };
        }

        const markdown = conversationToMarkdown(conversation);
        reply.type('text/markdown');
        return markdown;
    });
}

function conversationToMarkdown(conversation: Conversation): string {
    let md = `# Conversation - ${conversation.taskId}\n\n`;
    md += `Created: ${new Date(conversation.createdAt).toLocaleString()}\n`;
    md += `Updated: ${new Date(conversation.updatedAt).toLocaleString()}\n\n---\n\n`;

    for (const message of conversation.messages) {
        const timestamp = new Date(message.timestamp).toLocaleTimeString();

        if (message.role === 'user') {
            md += `## User (${timestamp})\n\n${message.content}\n\n`;
        } else if (message.role === 'assistant') {
            const assistantMsg = message as AssistantMessage;
            md += `## Assistant (${timestamp})\n\n`;
            if (assistantMsg.content) {
                md += `${assistantMsg.content}\n\n`;
            }
            if (assistantMsg.thinking) {
                md += `<details>\n<summary>Thinking Process</summary>\n\n${assistantMsg.thinking}\n\n</details>\n\n`;
            }
            // Note: toolCalls is the old format, new format uses toolCall
            if ((assistantMsg as any).toolCalls && (assistantMsg as any).toolCalls.length > 0) {
                const toolCalls = (assistantMsg as any).toolCalls;
                md += `<details>\n<summary>Tool Calls (${toolCalls.length})</summary>\n\n`;
                for (const tool of toolCalls) {
                    md += `- **${tool.name}**: ${JSON.stringify(tool.input)}\n`;
                }
                md += `\n</details>\n\n`;
            }
            if (assistantMsg.toolCall) {
                const tool = assistantMsg.toolCall;
                md += `<details>\n<summary>Tool Call: ${tool.name}</summary>\n\n`;
                if (tool.input) {
                    md += `**Input:**\n\`\`\`\n${typeof tool.input === 'string' ? tool.input : JSON.stringify(tool.input, null, 2)}\n\`\`\`\n\n`;
                }
                if (tool.output) {
                    md += `**Output:**\n\`\`\`\n${tool.output}\n\`\`\`\n\n`;
                }
                md += `**Status:** ${tool.status}\n\n</details>\n\n`;
            }
        } else if (message.role === 'system') {
            md += `> ${message.content}\n\n`;
        }
    }

    return md;
}
