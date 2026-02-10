# Project Rules

This directory contains project-specific rules that Claude Code will follow when working in this project.

## Rule Files

- `project-context.md` - Overview of the project, its purpose, and key concepts
- `clawwarden-integration.md` - ClawWarden-specific workflow rules
- `coding-standards.md` - Project coding style and conventions (optional)
- `api-patterns.md` - API design patterns and conventions (optional)
- `database-conventions.md` - Database schema and migration conventions (optional)

## Rule Precedence

1. Global user rules (`~/.claude/rules/`) - if `inheritGlobalSettings` is `true`
2. Project rules (this directory) - override global rules when present

## Adding New Rules

Create a new `.md` file in this directory. Claude Code will automatically load it.

Example rule file:

```markdown
# My Custom Rule

When working on feature X:
1. Always do Y first
2. Never do Z
```
