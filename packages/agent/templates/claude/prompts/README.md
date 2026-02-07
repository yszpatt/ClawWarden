# Prompt Templates

This directory contains reusable prompt templates for common tasks.

## Template Structure

Each template is a `.md` file that can be referenced or copied:

```
prompts/
└── my-template.md
```

## Using Templates

Templates can be used in two ways:

### 1. Direct Reference

```
"Use the code-review-template from .claude/prompts/"
```

### 2. Copy and Customize

Copy the template content and adapt for your specific needs.

## Example Templates

### code-review-template.md

```markdown
Please review the following code changes:

**Context**: [Brief description of what the code does]

**Files Changed**:
- [List of files]

**Review Checklist**:
- [ ] Code is readable and well-named
- [ ] Functions are small and focused
- [ ] Error handling is comprehensive
- [ ] No security vulnerabilities
- [ ] Tests are included
- [ ] Documentation is updated

**Feedback**:
[Provide specific, actionable feedback]
```

### pr-description-template.md

```markdown
## Summary
[1-2 sentence summary]

## Changes
- [Change 1]
- [Change 2]
- [Change 3]

## Test Plan
- [ ] Tests pass locally
- [ ] Manual testing completed
- [ ] Edge cases covered

## Screenshots (if applicable)
[Add screenshots]

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
```

## Creating Custom Templates

1. Create a new `.md` file in this directory
2. Use `{{placeholder}}` syntax for variable content
3. Document how to use the template at the top of the file
