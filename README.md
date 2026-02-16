# VibeWarden

![VibeWarden Logo](docs/logo-pixel.png)

[![English](https://img.shields.io/badge/lang-English-blue.svg)](#)
[![简体中文](https://img.shields.io/badge/lang-简体中文-red.svg)](README.zh-CN.md)

VibeWarden is a sophisticated Kanban-style task management dashboard designed to orchestrate and monitor **Claude Code CLI** workflows. It provides a visual interface for managing complex development tasks, featuring automated worktree isolation, incremental task summaries, and a native conversational interaction model.

---

## ✨ Key Features

- **📋 Kanban Workflow**: Manage tasks through distinct stages (Plan, Develop, Test, etc.).
- **📝 Incremental Summaries**: Hierarchical, accordion-style task progression logs with Markdown support.
- **🗣️ Conversational Interaction**: Native chat interface for direct instruction and feedback during task execution.
- **🛠️ Worktree Management**: Automated `git worktree` isolation for concurrent task execution.
- **🤖 AI-Assisted Merge**: Automated Git branch merging and conflict resolution powered by Claude Agents.
- **🔄 Lane-Specific Logic**: Synchronized themes, icons, and specialized actions for each development lane.
- **🎨 Modern UI**: Sleek React-based interface with dark mode, deep glassmorphism, and drag-and-drop support.
- **📜 [Changelog](CHANGELOG.md)**: Explore the latest updates and project milestones.

---

## 🏗️ Architecture

VibeWarden is built as a monorepo containing three main components:

- **`packages/web`**: The frontend React dashboard.
- **`packages/agent`**: The backend Fastify server that coordinates Claude Code and the filesystem.
- **`packages/shared`**: Common TypeScript types and utilities.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Zustand, @dnd-kit, React Markdown
- **Backend**: Node.js, Fastify, WebSocket, Claude Agent SDK
- **Package Manager**: pnpm

---

## 🚀 Getting Started

### Prerequisites

- [pnpm](https://pnpm.io/) installed.
- [Claude Code CLI](https://github.com/anthropics/claude-code) installed and configured.

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd VibeWarden
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

### Running the Project

Start both the agent (backend) and the web dashboard in development mode:

```bash
pnpm dev
```

The web interface will be available at `http://localhost:5173` (or the port specified by Vite), and the agent will run on `http://localhost:4001`.

---

## 📂 Project Structure

```text
VibeWarden/
├── packages/
│   ├── web/      # React frontend
│   ├── agent/    # Fastify backend
│   └── shared/   # Shared types
├── skills/       # Custom Claude Code skills
└── docs/         # Plan and implementation docs
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
