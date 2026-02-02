# 🦀 ClawWarden

[![English](https://img.shields.io/badge/lang-English-blue.svg)](#)
[![简体中文](https://img.shields.io/badge/lang-简体中文-red.svg)](README.zh-CN.md)

ClawWarden is a sophisticated Kanban-style task management dashboard designed to orchestrate and monitor **Claude Code CLI** workflows. It provides a visual interface for managing complex development tasks, featuring integrated terminals, worktree management, and bidirectional synchronization with Claude Code.

---

## ✨ Key Features

- **📋 Kanban Workflow**: Manage tasks through distinct stages (Design, Develop, Test, etc.).
- **💻 Integrated Terminal**: Interactive Xterm.js terminal for direct Claude Code CLI communication.
- **🛠️ Worktree Management**: Automated `git worktree` isolation for concurrent task execution.
- **🔄 Bidirectional Sync**: Tasks can be created via the UI or automatically by Claude using custom skills.
- **🎨 Modern UI**: Sleek React-based interface with dark mode and drag-and-drop support.
- **🚀 Monorepo Architecture**: Scalable structure built with pnpm workspaces.

---

## 🏗️ Architecture

ClawWarden is built as a monorepo containing three main components:

- **`packages/web`**: The frontend React dashboard.
- **`packages/agent`**: The backend Fastify server that coordinates Claude Code and the filesystem.
- **`packages/shared`**: Common TypeScript types and utilities.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Zustand, @dnd-kit, Xterm.js
- **Backend**: Node.js, Fastify, WebSocket, node-pty, Claude Agent SDK
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
   cd ClawWarden
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
ClawWarden/
├── packages/
│   ├── web/      # React frontend
│   ├── agent/    # Fastify backend
│   └── shared/   # Shared types
├── skills/       # Custom Claude Code skills
└── docs/         # Design and implementation plans
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
