# Project Skills

This directory contains project-specific skills for Claude Code.

## Skill Structure

Each skill is a directory containing a `SKILL.md` file:

```
skills/
└── my-skill/
    └── SKILL.md
```

## Creating a Skill

1. Create a new directory with a descriptive name
2. Add a `SKILL.md` file with the skill definition

Example `SKILL.md`:

```markdown
---
name: my-skill
description: Use when you need to do X
---

## When to Use

Use this skill when:
- Condition 1
- Condition 2

## How It Works

1. Step one
2. Step two
3. Step three

## Examples

User: "Help me with X"
Assistant: [Uses skill to accomplish X]
```

## ClawWarden Skills

ClawWarden automatically installs these skills:

- `clawwarden-task-create` - Create tasks from dashboard
- `clawwarden-task-update` - Update task progress

## Documentation

See [Claude Code Skills Documentation](https://docs.anthropic.com/en/docs/claude-code/skills) for more details.
