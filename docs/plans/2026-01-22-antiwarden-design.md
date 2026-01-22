# AntiWarden - Claude Code 任务看板系统设计

> 日期: 2026-01-22
> 状态: 设计完成，待实现

## 概述

AntiWarden 是一个 Web 端看板系统，用于监控和编排 Claude Code CLI 的开发任务。支持项目管理、任务卡片拖拽、实时日志交互，以及 Claude 自动创建任务卡片的双向工作流。

## 目标用户

- **V1**: 个人开发者
- **架构预留**: 团队协作扩展性

---

## 系统架构

```
┌───────────────────────────────────────────────────────────────────────┐
│                     AntiWarden 双向系统架构                            │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────┐         WebSocket          ┌─────────────────┐ │
│  │   Web Frontend   │ ◄──────────────────────►   │   Local Agent   │ │
│  │  (React + TS)    │   双向通信 / 实时日志         │   (Node.js)     │ │
│  └──────────────────┘                            └────────┬────────┘ │
│           ▲                                               │          │
│           │              文件变更通知                       │          │
│           └───────────────────────────────────────────────┘          │
│                                                                       │
│                         ┌─────────────────────┐                       │
│                         │   Claude Code CLI   │                       │
│                         └──────────┬──────────┘                       │
│                                    │                                  │
│                      ┌─────────────┴─────────────┐                    │
│                      ▼                           ▼                    │
│              ┌──────────────┐            ┌──────────────────┐         │
│              │  Hook 触发   │───────────►│  AntiWarden      │         │
│              │  (任务完成)   │            │   Skill          │         │
│              └──────────────┘            └────────┬─────────┘         │
│                                                   ▼                   │
│                                          ┌──────────────────┐         │
│                                          │ .antiwarden/     │         │
│                                          │   tasks.json     │         │
│                                          └──────────────────┘         │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 技术栈

| 层级 | 技术选型 |
|------|----------|
| **前端** | React 18 + TypeScript, Vite, @dnd-kit, xterm.js, Zustand |
| **后端** | Node.js + TypeScript, Fastify, ws, node-pty, chokidar |
| **数据存储** | JSON 文件（便于 Claude 直接读写） |
| **构建工具** | pnpm workspace (Monorepo) |

---

## 数据模型

### 全局配置 (`~/.antiwarden/config.json`)

```typescript
interface GlobalConfig {
  version: string;
  projects: ProjectRef[];
  settings: {
    agentPort: number;
    theme: 'light' | 'dark';
  };
}

interface ProjectRef {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  lastOpenedAt: string;
}
```

### 项目任务 (`<project>/.antiwarden/tasks.json`)

```typescript
interface ProjectData {
  projectId: string;
  lanes: Lane[];
  tasks: Task[];
}

interface Lane {
  id: string;
  name: string;      // 设计/开发/测试/待合并/已归档/已废弃
  order: number;
  color: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  prompt?: string;
  laneId: string;
  order: number;
  status: 'idle' | 'running' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  createdBy: 'user' | 'claude';
  executionLogs?: ExecutionLog[];
  worktree?: {
    path: string;
    branch: string;
    createdAt: string;
  };
  metadata?: Record<string, any>;
}
```

---

## 泳道与功能

| 泳道 | Git 操作 | V1 功能 | 未来扩展 |
|------|----------|---------|----------|
| **设计** | 无 worktree | 编辑 prompt、关联文档 | AI 需求拆分 |
| **开发** | `git worktree add` | 执行/停止、实时日志、交互 | 自动测试建议 |
| **测试** | 在 worktree 中测试 | 查看执行结果 | 覆盖率展示 |
| **待合并** | `git merge` | 查看 diff | PR 集成 |
| **已归档** | `git worktree remove` | 只读查看 | 搜索、统计 |
| **已废弃** | `git worktree remove` | 废弃原因 | 复活功能 |

---

## 界面设计

```
┌───────────────────────────────────────────────────────────┬─────────────────────┐
│  AntiWarden                        [项目选择器 ▼]  [设置] │  任务详情 (侧边栏)   │
├───────────────────────────────────────────────────────────┤                     │
│                                                           │  标题: xxx          │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐  │                     │
│  │  设计  │ │  开发  │ │  测试  │ │ 待合并 │ │ 已归档 │  │  [泳道特定功能区]   │
│  ├────────┤ ├────────┤ ├────────┤ ├────────┤ ├────────┤  │                     │
│  │ 卡片   │ │ 卡片   │ │        │ │        │ │        │  │  执行日志 (终端)    │
│  │ 卡片   │ │        │ │        │ │        │ │        │  │  ┌─────────────────┐│
│  │        │ │        │ │        │ │        │ │        │  │  │$ claude "..."   ││
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘  │  │> _              ││
└───────────────────────────────────────────────────────────┴─────────────────────┘
```

---

## 项目结构

```
AntiWarden/
├── packages/
│   ├── web/                      # 前端 React 应用
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── stores/
│   │   │   ├── services/
│   │   │   └── types/
│   │   └── package.json
│   │
│   ├── agent/                    # 后端 Local Agent
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   ├── websocket/
│   │   │   └── utils/
│   │   └── package.json
│   │
│   └── shared/                   # 共享类型
│       ├── types/
│       └── schemas/
│
├── skills/                       # AntiWarden Skills 模板
│   ├── antiwarden-task-create/
│   └── antiwarden-task-update/
│
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

---

## AntiWarden Skills

### `antiwarden-task-create`

- **用途**: Claude 完成任务后创建优化建议卡片
- **默认泳道**: design（需人工审核）
- **标记**: `createdBy: 'claude'`

### `antiwarden-task-update`

- **用途**: 更新任务状态或内容

### 项目初始化自动安装

项目注册到 AntiWarden 时，自动将 skills 复制到项目的 `.agent/skills/` 目录。

---

## 关键工作流

### 1. 正向流程（用户驱动）
1. 用户在 Web 创建任务卡片 → 设计泳道
2. 编辑 prompt，拖到开发泳道 → 创建 git worktree
3. 点击执行 → Agent 调用 Claude CLI
4. 实时查看日志，必要时交互输入
5. 完成后拖到测试 → 待合并 → 已归档

### 2. 反向流程（Claude 驱动）
1. Claude 执行任务时发现优化点
2. 通过 hook 调用 `antiwarden-task-create`
3. 新卡片写入 `tasks.json` → 设计泳道
4. Agent 监听文件变更 → 推送到前端
5. 用户审核后决定是否执行

---

## 验证计划

### 自动化测试
- 单元测试: JSON 读写、任务状态流转
- 集成测试: WebSocket 通信、Claude CLI 调用
- E2E 测试: 看板拖拽、任务执行全流程

### 手动验证
- 多任务并行 worktree 管理
- Claude 自动创建卡片流程
- 断线重连场景
