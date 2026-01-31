const API_BASE = 'http://localhost:4001';

import type {
    Conversation,
    ConversationMessage,
} from '@antiwarden/shared';

export async function fetchConversation(
    projectId: string,
    taskId: string
): Promise<{ conversation: Conversation | null }> {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}/conversation`);
    if (!res.ok) throw new Error('Failed to fetch conversation');
    return res.json();
}

export async function appendConversationMessage(
    projectId: string,
    taskId: string,
    message: ConversationMessage
): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}/conversation/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
    });
    if (!res.ok) throw new Error('Failed to append message');
    return res.json();
}

export async function clearConversation(
    projectId: string,
    taskId: string
): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}/conversation`, {
        method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to clear conversation');
    return res.json();
}

export async function exportConversationAsMarkdown(
    projectId: string,
    taskId: string
): Promise<string> {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}/conversation/export`);
    if (!res.ok) throw new Error('Failed to export conversation');
    return res.text();
}
