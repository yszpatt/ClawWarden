# Claude Code 项目级配置

> 通用项目初始化配置 - 适用于个人/小团队，支持多语言和项目类型

---

## 配置概述

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        开发流程图                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  1️⃣ 计划与设计 ──► 2️⃣ 开发 ──► 3️⃣ 测试 ──► 4️⃣ 合并 ──► 5️⃣ 文档              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 完整清单

### Agents (10 个)

| Agent | 阶段 | 技术栈 | 说明 |
|:------|:----:|:------|:-----|
| `architect` | 计划与设计 | 通用/Web | 系统架构设计、技术选型 |
| `planner` | 计划与设计 | 通用 | 实现计划、任务拆解、风险识别 |
| `tdd-guide` | 开发 | 通用 | 测试驱动开发（红-绿-重构） |
| `build-error-resolver` | 开发 | TS/JS | 快速修复构建/类型错误 |
| `code-reviewer` | 测试 | 通用 | 代码质量检查（安全/性能/可维护性） |
| `security-reviewer` | 测试 | Web 应用 | 安全漏洞检查（OWASP Top 10） |
| `database-reviewer` | 测试 | PostgreSQL | 数据库查询优化、Schema 设计 |
| `e2e-runner` | 测试 | Web 应用 | E2E 测试（Playwright） |
| `refactor-cleaner` | 合并 | TS/JS | 死代码检测、依赖清理 |
| `doc-updater` | 文档 | TypeScript | 生成 CodeMap、更新文档 |

---

### Commands (9 个)

| Command | 阶段 | 说明 |
|:--------|:----:|:-----|
| `/brainstorm` | 计划与设计 | 需求探索和设计讨论 |
| `/plan` | 计划与设计 | 创建详细实现计划 |
| `/tdd` | 开发 | 测试驱动开发 |
| `/build-fix` | 开发 | 修复构建错误 |
| `/code-review` | 测试 | 代码安全与质量审查 |
| `/verify` | 测试 | 完整验证（构建/类型/测试） |
| `/e2e` | 测试 | 端到端测试 |
| `/refactor-clean` | 合并 | 死代码清理 |
| `/update-docs` | 文档 | 更新文档 |

---

### Skills (9 个)

#### 核心工作流
| Skill | 来源 | 说明 |
|:------|:-----|:-----|
| `brainstorming` | superpowers | 创意工作前的需求探索 |
| `writing-plans` | superpowers | 创建详细实现计划 |
| `finishing-a-development-branch` | superpowers | 合并决策（本地/PR/保留/丢弃） |

#### 开发流程
| Skill | 来源 | 说明 |
|:------|:-----|:-----|
| `test-driven-development` | superpowers | TDD 工作流（红-绿-重构） |
| `systematic-debugging` | superpowers | 系统化调试（找根因） |
| `verification-before-completion` | superpowers | 完成前强制验证 |
| `coding-standards` | everything-claude-code | TS/JS/React/Node 通用标准 |

#### 测试与安全
| Skill | 来源 | 说明 |
|:------|:-----|:-----|
| `tdd-workflow` | everything-claude-code | TDD 工作流指导（80%+覆盖率） |
| `security-review` | everything-claude-code | 安全检查清单 |

---

### Rules (8 个)

| Rule | 说明 |
|:-----|:-----|
| `agents.md` | Agent 编排规则、并行执行 |
| `coding-style.md` | 不可变性、文件组织、错误处理 |
| `git-workflow.md` | Git 工作流、提交信息、PR 流程 |
| `hooks.md` | Hooks 系统（PreToolUse/PostToolUse/Stop） |
| `patterns.md` | API 响应、自定义 Hooks、Repository 模式 |
| `performance.md` | 模型选择、上下文管理、Ultrathink |
| `security.md` | 密钥管理、输入验证、安全响应 |
| `testing.md` | 80% 覆盖率、TDD 工作流 |

---

## 内容关系说明

### Agent / Skill / Command 的区别

| 类型 | 角色 | 使用方式 |
|:-----|:-----|:--------|
| **Agent** | 主动执行的专家 | 自动触发或通过 Command 调用 |
| **Skill** | 工作流原则和指导 | 被动遵循，按需激活 |
| **Command** | 快捷调用方式 | 用户主动输入 |

### 功能重叠说明

部分功能看似重复，实际是**互补关系**：

| 功能 | 重叠组件 | 关系 |
|:-----|:---------|:-----|
| **TDD** | `tdd-guide` Agent + `test-driven-development` Skill + `tdd-workflow` Skill | Agent 主动审查，Skill 提供不同深度的指导 |
| **安全审查** | `security-reviewer` Agent + `security-review` Skill | Agent 主动扫描，Skill 提供检查清单 |
| **验证** | `/verify` Command + `verification-before-completion` Skill | Command 执行验证步骤，Skill 是原则指导 |
| **规划** | `planner` Agent + `/plan` Command | Command 调用 Agent |
| **代码审查** | `code-reviewer` Agent + `/code-review` Command | Command 调用 Agent |
| **E2E** | `e2e-runner` Agent + `/e2e` Command | Command 调用 Agent |
| **文档更新** | `doc-updater` Agent + `/update-docs` Command | Command 调用 Agent |
| **重构清理** | `refactor-cleaner` Agent + `/refactor-clean` Command | Command 调用 Agent |

**结论**：无完全重复内容，全部保留。

---

## 配置文件说明

```
.claude/
├── settings.json       # 项目级配置（插件、MCP、权限）
├── agents/             # 10 个 Agent 文档
├── commands/           # 9 个 Command 文档
├── skills/             # 9 个 Skill 文档
└── rules/              # 8 个规则文件
```

---

## 快速开始

### 新功能开发流程

```
1. /brainstorm  → 探索需求和设计
2. /plan        → 创建实现计划
3. /tdd         → 测试驱动开发
4. /code-review → 代码审查
5. /verify      → 验证所有检查
```

### Bug 修复流程

```
1. systematic-debugging skill → 找根因
2. /tdd                       → 写测试+修复
3. /code-review               → 验证修复
4. /verify                    → 确认通过
```

---

## 使用示例

### 示例 1：添加新功能

```
你: 我想给项目添加用户认证功能

Claude: 使用 brainstorming skill 探索需求...
      [提问 1] 支持哪些登录方式？
      [提问 2] 需要记住登录状态吗？
      ...

你: /plan

Claude: [planner agent] 创建实现计划...
      # 实现计划：用户认证功能
      ## 阶段 1：数据库 Schema
      ## 阶段 2：认证服务
      ## 阶段 3：前端集成
      确认执行？

你: yes

Claude: [tdd-guide agent] 开始 TDD 开发...
      ## Step 1: 写失败测试 (RED)
      ## Step 2: 写最小实现 (GREEN)
      ## Step 3: 重构 (REFACTOR)

Claude: [code-reviewer agent] 代码审查完成，无问题

Claude: [verification] 构建✓ 类型✓ 测试✓
      Ready for PR: YES
```

### 示例 2：修复 Bug

```
你: 用户登录后状态丢失了

Claude: [systematic-debugging skill] 开始调试...
      ## Phase 1: 根因调查
      - 检查 Cookie 配置... 发现 SameSite 未设置
      - 检查存储方式... 使用 localStorage（不安全）

      根因：未使用 httpOnly Cookie

你: /tdd

Claude: [tdd-guide agent]
      ## RED: 写测试验证 Cookie 设置
      ## GREEN: 实现修复
      ## REFACTOR: 清理代码

Claude: [verification] 验证通过
```

### 示例 3：代码审查

```
你: /code-review

Claude: [code-reviewer agent]
      ## 审查报告

      ### CRITICAL (必须修复)
      - src/auth.ts:45 - 硬编码密钥

      ### HIGH (建议修复)
      - src/api.ts:78 - 缺少错误处理

      ### MEDIUM (可选)
      - src/utils.ts:23 - 函数超过 50 行

      状态：阻塞提交（CRITICAL 问题需修复）
```

---

## 安装与使用

### 复制到新项目

#### 方式一：直接复制

```bash
cp -r /home/yszpat/clawconfig/.claude /path/to/new-project/
```

#### 方式二：使用脚本

创建 `~/.local/bin/clone-claude-config`：

```bash
#!/bin/bash
# Claude Code 配置复制脚本

CLAUDE_CONFIG_SOURCE="/home/yszpat/clawconfig/.claude"

if [ $# -eq 0 ]; then
  echo "用法: clone-claude-config <项目路径>"
  exit 1
fi

PROJECT_PATH="$1/.claude"

if [ -d "$PROJECT_PATH" ]; then
  echo "目标已存在 .claude 目录，是否覆盖？(y/n)"
  read -r answer
  if [ "$answer" != "y" ]; then
    exit 0
  fi
  rm -rf "$PROJECT_PATH"
fi

cp -r "$CLAUDE_CONFIG_SOURCE" "$PROJECT_PATH"
echo "✓ Claude Code 配置已复制到 $PROJECT_PATH"
```

使用：

```bash
chmod +x ~/.local/bin/clone-claude-config
clone-claude-config /path/to/new-project
```

---

## 插件配置

### 启用的插件
```json
{
  "everything-claude-code@everything-claude-code": true,
  "superpowers@superpowers-dev": true,
  "document-skills@anthropic-agent-skills": true
}
```

### 插件来源

| 插件 | 功能 |
|:-----|:-----|
| `everything-claude-code` | 提供开发链路 Agents/Skills/Commands |
| `superpowers` | 提供高级工作流技能 |
| `document-skills` | 提供文档处理技能 |

---

## MCP 服务器

### 已配置
| MCP | 用途 |
|:----|:-----|
| `memory` | 跨会话持久化记忆 |

### 可选添加
| MCP | 用途 |
|:----|:-----|
| `filesystem` | 文件系统操作 |
| `github` | GitHub 操作（PRs、issues） |
| `supabase` | Supabase 数据库操作 |
| `vercel` | Vercel 部署 |

---

## 版本

- **创建日期**: 2025-02-08
- **更新日期**: 2025-02-08
- **配置方案**: 完整版
- **适用场景**: 个人/小团队，多语言通用项目
- **统计**: 10 Agents / 9 Commands / 9 Skills / 8 Rules

---

## 配置来源

本配置基于以下用户级配置提炼：
- 插件：everything-claude-code, superpowers, document-skills
- 规则：agents.md, coding-style.md, git-workflow.md, hooks.md, patterns.md, performance.md, security.md, testing.md
