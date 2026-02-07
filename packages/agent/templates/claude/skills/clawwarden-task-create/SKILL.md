---
name: clawwarden-task-create
description: Create a new task in the ClawWarden Kanban system from within a Claude conversation
---

## When to Use

Use this skill when the user asks to:
- Create a new task in ClawWarden
- Add a task to a specific lane
- Start working on a new feature/bug fix that should be tracked

## How It Works

1. Gather task information from the user:
   - **Title**: Brief task description
   - **Description**: Detailed explanation
   - **Lane**: Which lane to place the task in (Plan, Develop, Test, etc.)
   - **Prompt**: Optional initial prompt/instructions

2. Make a POST request to create the task:
   ```bash
   curl -X POST http://localhost:3001/api/projects/{projectId}/tasks \
     -H "Content-Type: application/json" \
     -d '{
       "title": "Task title",
       "description": "Detailed description",
       "laneId": "plan",
       "prompt": "Optional initial instructions"
     }'
   ```

3. Report the created task details including:
   - Task ID
   - Worktree path (if created)
   - Lane placement

## Lane IDs

| Lane | ID | When to Use |
|------|----|-------------|
| Plan | `plan` | Initial planning phase |
| Develop | `develop` | Active development |
| Test | `test` | Testing and QA |
| Pending Merge | `pending-merge` | Ready for integration |
| Archived | `archived` | Completed tasks |

## Example

User: "Create a task for implementing user authentication"
Claude: I'll create a new task for implementing user authentication in the Plan lane.

[Creates task via API]
✅ Task created with ID: abc-123
📍 Lane: Plan
🌳 Worktree: /path/to/project/.worktrees/task-abc-123

Would you like me to start working on this task now?

## Notes

- Tasks in the Develop or Test lanes automatically get a git worktree
- The worktree provides isolation for concurrent task execution
- Use the task ID for subsequent updates via `clawwarden-task-update`
