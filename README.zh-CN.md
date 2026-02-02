# 🦀 ClawWarden

[![English](https://img.shields.io/badge/lang-English-blue.svg)](README.md)
[![简体中文](https://img.shields.io/badge/lang-简体中文-red.svg)](#)

ClawWarden 是一个为 **Claude Code CLI** 量身定制的任务看板管理系统。它为管理复杂的开发任务提供了一个可视化界面，集成了交互式终端、Git Worktree 管理，并支持与 Claude Code 的双向同步。

---

## ✨ 核心特性

- **📋 看板式工作流**: 通过清晰的阶段（设计、开发、测试等）管理任务。
- **💻 集成终端**: 使用 Xterm.js 实现的交互式终端，直接与 Claude Code CLI 通信。
- **🛠️ Worktree 管理**: 自动化的 `git worktree` 隔离，支持多任务并行开发。
- **🔄 双向同步**: 既可以通过 UI 创建任务，也可以由 Claude 使用自定义 Skill 自动生成任务。
- **🎨 现代 UI**: 基于 React 的简洁界面，支持深色模式和拖拽操作。
- **🚀 Monorepo 架构**: 使用 pnpm workspaces 构建，结构清晰易扩展。

---

## 🏗️ 系统架构

ClawWarden 采用 Monorepo 结构，包含三个核心组件：

- **`packages/web`**: 基于 React 的前端仪表盘。
- **`packages/agent`**: 基于 Fastify 的后端服务器，负责协调 Claude Code 和文件系统。
- **`packages/shared`**: 共享的 TypeScript 类型定义和实用工具。

---

## 🛠️ 技术栈

- **前端**: React 19, TypeScript, Vite, Zustand, @dnd-kit, Xterm.js
- **后端**: Node.js, Fastify, WebSocket, node-pty, Claude Agent SDK
- **包管理器**: pnpm

---

## 🚀 快速上手

### 前置条件

- 已安装 [pnpm](https://pnpm.io/)。
- 已安装并配置好 [Claude Code CLI](https://github.com/anthropics/claude-code)。

### 安装

1. 克隆仓库：
   ```bash
   git clone <repository-url>
   cd ClawWarden
   ```

2. 安装依赖：
   ```bash
   pnpm install
   ```

### 运行项目

以开发模式同时启动 Agent（后端）和 Web 界面：

```bash
pnpm dev
```

Web 界面通常运行在 `http://localhost:5173`，Agent 运行在 `http://localhost:4001`。

---

## 📂 项目结构

```text
ClawWarden/
├── packages/
│   ├── web/      # React 前端
│   ├── agent/    # Fastify 后端
│   └── shared/   # 共享类型
├── skills/       # 自定义 Claude Code Skill
└── docs/         # 设计与实现文档
```

---

## 📄 开源协议

本项目基于 [MIT 协议](LICENSE) 开源。
