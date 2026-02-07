---
name: clawwarden-task-update
description: Update task progress and status in the ClawWarden Kanban system
---

## When to Use

Use this skill when:
- User asks to update task status
- Completing a task or milestone
- Moving task to a different lane
- Recording progress/summary

## How It Works

1. Identify the task to update (by ID or context)
2. Determine what fields to update:
   - `status`: idle, running, completed, failed
   - `laneId`: plan, develop, test, pending-merge, archived
   - `title`: Update task title
   - `description`: Update description

3. Make a PATCH request:
   ```bash
   curl -X PATCH http://localhost:3001/api/projects/{projectId}/tasks/{taskId} \
     -H "Content-Type: application/json" \
     -d '{
       "status": "completed",
       "laneId": "archived"
     }'
   ```

## Task Status Values

| Status | Description |
|--------|-------------|
| `idle` | Task is not currently being worked on |
| `running` | Task is actively being executed |
| `completed` | Task work is complete |
| `failed` | Task execution failed |

## Task Workflow

Typical progression:
```
Plan → Develop → Test → Pending Merge → Archived
  ↓        ↓        ↓         ↓            ↓
idle    running   running    idle       completed
```

## Updating Task Summary

To add a summary of work completed:

```bash
# Write summary to .clawwarden/summaries/{taskId}.md
echo "## Work Completed

### Changes Made
- Implemented feature X
- Fixed bug Y

### Testing
- All tests passing
- Manual testing completed" > /path/to/project/.clawwarden/summaries/{taskId}.md
```

## Example

User: "Mark this task as complete and move to archived"
Claude: I'll update the task status to completed and move it to the Archived lane.

[Updates task via API]
✅ Task updated:
- Status: completed
- Lane: Archived

## Notes

- Running tasks cannot be moved between lanes (stop the task first)
- Summaries help with task handoffs and documentation
- Worktrees are cleaned up when tasks are deleted
