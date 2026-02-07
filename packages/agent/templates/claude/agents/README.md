# Project Agents

This directory contains project-specific agent definitions for Claude Code.

## Agent Structure

Each agent is a `.md` file defining how the agent should behave:

```
agents/
└── my-agent.md
```

## Agent Definition

Example agent:

```markdown
# My Agent

You are a specialist agent for [specific purpose].

## Responsibilities

- [Task 1]
- [Task 2]
- [Task 3]

## Guidelines

1. [Guideline 1]
2. [Guideline 2]

## Output Format

Your output should be in the following format:
```
[Expected output format]
```
```

## Common Agent Types

- **code-reviewer** - Reviews code for quality, security, and maintainability
- **architect** - Designs system architecture and makes technical decisions
- **tester** - Writes tests and validates functionality
- **debugger** - Diagnoses and fixes bugs

## ClawWarden Integration

ClawWarden may use these agents for specialized tasks within the Kanban workflow.
