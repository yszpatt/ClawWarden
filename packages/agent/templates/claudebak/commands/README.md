# Project Commands

This directory contains custom slash commands for Claude Code.

## Command Structure

Each command is a `.md` file that defines a slash command:

```
commands/
└── my-command.md
```

## Command Definition

The filename (without `.md`) becomes the command name.

Example `test-all.md` creates the `/test-all` command:

```markdown
Run all tests in the project with coverage reporting.

First, run the unit tests:
```bash
npm test
```

Then run the integration tests:
```bash
npm run test:integration
```

Finally, generate a coverage report:
```bash
npm run test:coverage
```

Report the overall test results and highlight any failures.
```

## Command Usage

Once defined, use commands in Claude Code:

```
User: /test-all
Claude: [Runs the test command as defined]
```

## Examples

| File | Command | Purpose |
|------|---------|---------|
| `test-all.md` | `/test-all` | Run all tests |
| `deploy-staging.md` | `/deploy-staging` | Deploy to staging |
| `db-migrate.md` | `/db-migrate` | Run database migrations |

## Tips

- Keep commands focused on a single task
- Include clear instructions for what to do
- Use code blocks for CLI commands
- Document expected output format
