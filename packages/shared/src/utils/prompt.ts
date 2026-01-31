import type { Lane } from '../types/lane.js';
import type { ProjectData } from '../types/project.js';

/**
 * Get lane prompt with priority: project-level > global > empty
 * @param laneId - The lane ID to get prompt for
 * @param projectData - Project data containing lane configurations
 * @param globalLanePrompts - Global lane prompts from settings
 * @returns The system prompt for the lane, or empty string if not configured
 */
export function getLanePrompt(
    laneId: string,
    projectData: ProjectData,
    globalLanePrompts: Record<string, string>
): string {
    // 1. Check project-level lane configuration
    const lane = projectData.lanes.find((l: Lane) => l.id === laneId);
    if (lane?.systemPrompt) {
        return lane.systemPrompt;
    }

    // 2. Check global lane prompts configuration
    if (globalLanePrompts[laneId]) {
        return globalLanePrompts[laneId];
    }

    // 3. Return empty string - use task's prompt directly
    return '';
}
