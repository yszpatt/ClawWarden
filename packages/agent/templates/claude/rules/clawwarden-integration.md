# ClawWarden Integration

This project is managed by **ClawWarden** - a Kanban-style task management dashboard for orchestrating Claude Code CLI workflows.

## Kanban Workflow

Tasks progress through these lanes:

| Lane | Purpose | Recommended Model |
|------|---------|-------------------|
| **Plan** | Initial planning, requirements gathering, architecture design | opus |
| **Develop** | Active development work, implementation | sonnet |
| **Test** | Testing, bug fixes, quality assurance | sonnet |
| **Pending Merge** | Code review, ready for integration | sonnet |
| **Archived** | Completed tasks | haiku |
| **Deprecated** | Abandoned or outdated tasks | - |

## Worktree Management

ClawWarden automatically creates isolated git worktrees for concurrent task execution. Each task works in its own worktree to prevent conflicts.

## Task Synchronization

When working on tasks managed by ClawWarden:

1. **Maintain task.md** - Keep the task file updated with current progress
2. **Update status** - Change task status through the dashboard or API
3. **Use summaries** - Create task summaries for handoffs between lanes
4. **Follow lane conventions** - Each lane has specific prompts and behaviors

## ClawWarden Skills

This project includes ClawWarden-specific skills:

- `/clawwarden-task-create` - Create a new task from the dashboard
- `/clawwarden-task-update` - Update task progress and status

## Configuration

Project-specific ClawWarden settings are in `.claude/settings.json`.

For more information, see [ClawWarden Documentation](https://github.com/yszpat/ClawWarden).
