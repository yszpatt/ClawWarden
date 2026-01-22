# AntiWarden Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a web-based Kanban system to monitor and orchestrate Claude Code CLI tasks with real-time logging, interactive execution, and bidirectional Claude integration.

**Architecture:** Monorepo with three packages (web, agent, shared). Web frontend uses React + TypeScript with dnd-kit for drag-drop. Local Agent runs as Node.js service with Fastify for HTTP and ws for WebSocket. JSON files store project and task data.

**Tech Stack:** React 18, TypeScript, Vite, @dnd-kit, xterm.js, Zustand, Node.js, Fastify, ws, node-pty, chokidar

---

## Task 1: Initialize Monorepo Structure

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`

**Step 1: Create root package.json**

```json
{
  "name": "antiwarden",
  "private": true,
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint"
  },
  "devDependencies": {
    "typescript": "^5.3.0"
  }
}
```

**Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - 'packages/*'
```

**Step 3: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

**Step 4: Create .gitignore**

```
node_modules/
dist/
.env
*.log
```

**Step 5: Install pnpm and initialize**

Run: `pnpm install`
Expected: Creates pnpm-lock.yaml

**Step 6: Commit**

```bash
git add .
git commit -m "chore: initialize monorepo structure"
```

---

## Task 2: Create Shared Types Package

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/types/config.ts`
- Create: `packages/shared/src/types/project.ts`
- Create: `packages/shared/src/types/task.ts`
- Create: `packages/shared/src/types/lane.ts`

**Step 1: Create package.json**

```json
{
  "name": "@antiwarden/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

**Step 3: Create types/lane.ts**

```typescript
export interface Lane {
  id: string;
  name: string;
  order: number;
  color: string;
}

export const DEFAULT_LANES: Lane[] = [
  { id: 'design', name: '设计', order: 0, color: '#8B5CF6' },
  { id: 'develop', name: '开发', order: 1, color: '#3B82F6' },
  { id: 'test', name: '测试', order: 2, color: '#10B981' },
  { id: 'pending-merge', name: '待合并', order: 3, color: '#F59E0B' },
  { id: 'archived', name: '已归档', order: 4, color: '#6B7280' },
  { id: 'deprecated', name: '已废弃', order: 5, color: '#EF4444' },
];
```

**Step 4: Create types/task.ts**

```typescript
export type TaskStatus = 'idle' | 'running' | 'completed' | 'failed';
export type TaskCreator = 'user' | 'claude';

export interface ExecutionLog {
  timestamp: string;
  type: 'stdout' | 'stderr' | 'input' | 'system';
  content: string;
}

export interface Worktree {
  path: string;
  branch: string;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  prompt?: string;
  laneId: string;
  order: number;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: TaskCreator;
  executionLogs?: ExecutionLog[];
  worktree?: Worktree;
  metadata?: Record<string, unknown>;
}
```

**Step 5: Create types/project.ts**

```typescript
import type { Lane } from './lane';
import type { Task } from './task';

export interface ProjectRef {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  lastOpenedAt: string;
}

export interface ProjectData {
  projectId: string;
  lanes: Lane[];
  tasks: Task[];
}
```

**Step 6: Create types/config.ts**

```typescript
import type { ProjectRef } from './project';

export interface GlobalSettings {
  agentPort: number;
  theme: 'light' | 'dark';
}

export interface GlobalConfig {
  version: string;
  projects: ProjectRef[];
  settings: GlobalSettings;
}
```

**Step 7: Create src/index.ts**

```typescript
export * from './types/config';
export * from './types/project';
export * from './types/task';
export * from './types/lane';
```

**Step 8: Build and commit**

```bash
cd packages/shared && pnpm build
git add .
git commit -m "feat(shared): add shared type definitions"
```

---

## Task 3: Initialize Agent Package

**Files:**
- Create: `packages/agent/package.json`
- Create: `packages/agent/tsconfig.json`
- Create: `packages/agent/src/index.ts`
- Create: `packages/agent/src/server.ts`

**Step 1: Create package.json**

```json
{
  "name": "@antiwarden/agent",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@antiwarden/shared": "workspace:*",
    "fastify": "^4.25.0",
    "@fastify/cors": "^8.4.0",
    "@fastify/websocket": "^8.3.0",
    "chokidar": "^3.5.3",
    "node-pty": "^1.0.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@types/uuid": "^9.0.0",
    "tsx": "^4.7.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

**Step 3: Create src/server.ts**

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';

export async function createServer() {
  const fastify = Fastify({ logger: true });

  await fastify.register(cors, { origin: true });
  await fastify.register(websocket);

  fastify.get('/health', async () => ({ status: 'ok' }));

  return fastify;
}
```

**Step 4: Create src/index.ts**

```typescript
import { createServer } from './server';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

async function main() {
  const server = await createServer();
  
  try {
    await server.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Agent running on http://localhost:${PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
```

**Step 5: Install dependencies and test**

```bash
pnpm install
cd packages/agent && pnpm dev
```
Expected: Server starts on http://localhost:3001

**Step 6: Commit**

```bash
git add .
git commit -m "feat(agent): initialize agent package with Fastify"
```

---

## Task 4: Initialize Web Package

**Files:**
- Create: `packages/web/` (via Vite)

**Step 1: Create Vite React app**

```bash
cd packages && pnpm create vite web --template react-ts
```

**Step 2: Update package.json to use shared types**

Add to dependencies:
```json
{
  "dependencies": {
    "@antiwarden/shared": "workspace:*"
  }
}
```

**Step 3: Install additional dependencies**

```bash
cd packages/web
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities zustand xterm xterm-addon-fit
```

**Step 4: Install and verify**

```bash
pnpm install
cd packages/web && pnpm dev
```
Expected: Vite dev server starts on http://localhost:5173

**Step 5: Commit**

```bash
git add .
git commit -m "feat(web): initialize web package with Vite + React"
```

---

## Task 5: Implement JSON Store Utilities

**Files:**
- Create: `packages/agent/src/utils/json-store.ts`
- Create: `packages/agent/src/utils/paths.ts`

**Step 1: Create paths.ts**

```typescript
import { homedir } from 'os';
import { join } from 'path';

export const GLOBAL_CONFIG_DIR = join(homedir(), '.antiwarden');
export const GLOBAL_CONFIG_FILE = join(GLOBAL_CONFIG_DIR, 'config.json');

export function getProjectConfigDir(projectPath: string): string {
  return join(projectPath, '.antiwarden');
}

export function getProjectTasksFile(projectPath: string): string {
  return join(getProjectConfigDir(projectPath), 'tasks.json');
}
```

**Step 2: Create json-store.ts**

```typescript
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import type { GlobalConfig, ProjectData } from '@antiwarden/shared';
import { GLOBAL_CONFIG_FILE, getProjectTasksFile } from './paths';
import { DEFAULT_LANES } from '@antiwarden/shared';

export async function ensureDir(filePath: string): Promise<void> {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

export async function readGlobalConfig(): Promise<GlobalConfig> {
  if (!existsSync(GLOBAL_CONFIG_FILE)) {
    const defaultConfig: GlobalConfig = {
      version: '1.0.0',
      projects: [],
      settings: { agentPort: 3001, theme: 'dark' },
    };
    await writeGlobalConfig(defaultConfig);
    return defaultConfig;
  }
  const content = await readFile(GLOBAL_CONFIG_FILE, 'utf-8');
  return JSON.parse(content);
}

export async function writeGlobalConfig(config: GlobalConfig): Promise<void> {
  await ensureDir(GLOBAL_CONFIG_FILE);
  await writeFile(GLOBAL_CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function readProjectData(projectPath: string): Promise<ProjectData> {
  const filePath = getProjectTasksFile(projectPath);
  if (!existsSync(filePath)) {
    throw new Error(`Project not initialized: ${projectPath}`);
  }
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

export async function writeProjectData(projectPath: string, data: ProjectData): Promise<void> {
  const filePath = getProjectTasksFile(projectPath);
  await ensureDir(filePath);
  await writeFile(filePath, JSON.stringify(data, null, 2));
}

export async function initializeProject(projectPath: string, projectId: string): Promise<ProjectData> {
  const data: ProjectData = {
    projectId,
    lanes: DEFAULT_LANES,
    tasks: [],
  };
  await writeProjectData(projectPath, data);
  return data;
}
```

**Step 3: Commit**

```bash
git add .
git commit -m "feat(agent): add JSON store utilities"
```

---

## Task 6: Implement Project Routes

**Files:**
- Create: `packages/agent/src/routes/projects.ts`
- Modify: `packages/agent/src/server.ts`

**Step 1: Create projects.ts**

```typescript
import type { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import { readGlobalConfig, writeGlobalConfig, initializeProject, readProjectData } from '../utils/json-store';
import type { ProjectRef } from '@antiwarden/shared';

export async function projectRoutes(fastify: FastifyInstance) {
  // List all projects
  fastify.get('/api/projects', async () => {
    const config = await readGlobalConfig();
    return config.projects;
  });

  // Register a new project
  fastify.post<{ Body: { name: string; path: string } }>('/api/projects', async (request) => {
    const { name, path } = request.body;
    const config = await readGlobalConfig();
    
    const project: ProjectRef = {
      id: uuid(),
      name,
      path,
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
    };
    
    await initializeProject(path, project.id);
    config.projects.push(project);
    await writeGlobalConfig(config);
    
    return project;
  });

  // Get project data
  fastify.get<{ Params: { id: string } }>('/api/projects/:id', async (request) => {
    const config = await readGlobalConfig();
    const project = config.projects.find(p => p.id === request.params.id);
    if (!project) throw { statusCode: 404, message: 'Project not found' };
    
    const data = await readProjectData(project.path);
    return { project, data };
  });
}
```

**Step 2: Update server.ts**

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { projectRoutes } from './routes/projects';

export async function createServer() {
  const fastify = Fastify({ logger: true });

  await fastify.register(cors, { origin: true });
  await fastify.register(websocket);
  await fastify.register(projectRoutes);

  fastify.get('/health', async () => ({ status: 'ok' }));

  return fastify;
}
```

**Step 3: Test endpoints**

Run: `cd packages/agent && pnpm dev`
Test: `curl http://localhost:3001/api/projects`
Expected: `[]`

**Step 4: Commit**

```bash
git add .
git commit -m "feat(agent): add project CRUD routes"
```

---

## Task 7: Implement Task Routes

**Files:**
- Create: `packages/agent/src/routes/tasks.ts`
- Modify: `packages/agent/src/server.ts`

**Step 1: Create tasks.ts**

```typescript
import type { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import { readGlobalConfig, readProjectData, writeProjectData } from '../utils/json-store';
import type { Task } from '@antiwarden/shared';

export async function taskRoutes(fastify: FastifyInstance) {
  // Create task
  fastify.post<{
    Params: { projectId: string };
    Body: { title: string; description: string; prompt?: string; laneId: string };
  }>('/api/projects/:projectId/tasks', async (request) => {
    const config = await readGlobalConfig();
    const project = config.projects.find(p => p.id === request.params.projectId);
    if (!project) throw { statusCode: 404, message: 'Project not found' };

    const data = await readProjectData(project.path);
    const laneTasks = data.tasks.filter(t => t.laneId === request.body.laneId);

    const task: Task = {
      id: uuid(),
      title: request.body.title,
      description: request.body.description,
      prompt: request.body.prompt,
      laneId: request.body.laneId,
      order: laneTasks.length,
      status: 'idle',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'user',
    };

    data.tasks.push(task);
    await writeProjectData(project.path, data);
    return task;
  });

  // Update task
  fastify.patch<{
    Params: { projectId: string; taskId: string };
    Body: Partial<Task>;
  }>('/api/projects/:projectId/tasks/:taskId', async (request) => {
    const config = await readGlobalConfig();
    const project = config.projects.find(p => p.id === request.params.projectId);
    if (!project) throw { statusCode: 404, message: 'Project not found' };

    const data = await readProjectData(project.path);
    const taskIndex = data.tasks.findIndex(t => t.id === request.params.taskId);
    if (taskIndex === -1) throw { statusCode: 404, message: 'Task not found' };

    data.tasks[taskIndex] = {
      ...data.tasks[taskIndex],
      ...request.body,
      updatedAt: new Date().toISOString(),
    };
    
    await writeProjectData(project.path, data);
    return data.tasks[taskIndex];
  });

  // Delete task
  fastify.delete<{
    Params: { projectId: string; taskId: string };
  }>('/api/projects/:projectId/tasks/:taskId', async (request) => {
    const config = await readGlobalConfig();
    const project = config.projects.find(p => p.id === request.params.projectId);
    if (!project) throw { statusCode: 404, message: 'Project not found' };

    const data = await readProjectData(project.path);
    data.tasks = data.tasks.filter(t => t.id !== request.params.taskId);
    await writeProjectData(project.path, data);
    return { success: true };
  });
}
```

**Step 2: Register routes in server.ts**

Add import and register:
```typescript
import { taskRoutes } from './routes/tasks';
// ...
await fastify.register(taskRoutes);
```

**Step 3: Commit**

```bash
git add .
git commit -m "feat(agent): add task CRUD routes"
```

---

## Task 8: Web Frontend - Basic Layout

**Files:**
- Create: `packages/web/src/components/Layout.tsx`
- Create: `packages/web/src/components/Sidebar.tsx`
- Create: `packages/web/src/components/Header.tsx`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/index.css`

**Step 1: Create Layout.tsx**

```tsx
import { ReactNode } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: ReactNode;
  sidebarContent?: ReactNode;
  sidebarOpen: boolean;
}

export function Layout({ children, sidebarContent, sidebarOpen }: LayoutProps) {
  return (
    <div className="app-layout">
      <Header />
      <div className="app-content">
        <main className="main-content">{children}</main>
        {sidebarOpen && <Sidebar>{sidebarContent}</Sidebar>}
      </div>
    </div>
  );
}
```

**Step 2: Create Header.tsx**

```tsx
export function Header() {
  return (
    <header className="app-header">
      <h1>AntiWarden</h1>
      <div className="header-actions">
        <select className="project-selector">
          <option>选择项目...</option>
        </select>
        <button className="settings-btn">⚙️</button>
      </div>
    </header>
  );
}
```

**Step 3: Create Sidebar.tsx**

```tsx
import { ReactNode } from 'react';

interface SidebarProps {
  children: ReactNode;
}

export function Sidebar({ children }: SidebarProps) {
  return <aside className="app-sidebar">{children}</aside>;
}
```

**Step 4: Update index.css with base styles**

```css
:root {
  --bg-primary: #0f0f0f;
  --bg-secondary: #1a1a1a;
  --bg-tertiary: #252525;
  --text-primary: #ffffff;
  --text-secondary: #a0a0a0;
  --border-color: #333;
  --accent: #8B5CF6;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.app-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.main-content {
  flex: 1;
  overflow: auto;
  padding: 1rem;
}

.app-sidebar {
  width: 400px;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
  overflow: auto;
}
```

**Step 5: Update App.tsx**

```tsx
import { useState } from 'react';
import { Layout } from './components/Layout';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <Layout sidebarOpen={sidebarOpen}>
      <div>Kanban Board Placeholder</div>
    </Layout>
  );
}

export default App;
```

**Step 6: Verify and commit**

```bash
cd packages/web && pnpm dev
# Verify layout renders correctly
git add .
git commit -m "feat(web): add basic layout structure"
```

---

## Verification Plan

### Automated Tests

**Agent API Tests:**
```bash
# Start agent
cd packages/agent && pnpm dev

# Test health endpoint
curl http://localhost:3001/health
# Expected: {"status":"ok"}

# Test empty projects list
curl http://localhost:3001/api/projects
# Expected: []

# Test create project
curl -X POST http://localhost:3001/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Project","path":"/tmp/test-project"}'
# Expected: {"id":"...","name":"Test Project",...}
```

### Manual Verification

1. **Monorepo 验证**: 运行 `pnpm install` 后检查所有包正确链接
2. **Agent 验证**: 启动 agent 后访问 `/health` 返回 ok
3. **Web 验证**: 启动 web 后页面正确显示 header 和 layout
4. **类型共享验证**: web 和 agent 都能正确导入 `@antiwarden/shared` 的类型

---

> **下一步**: 完成 Task 1-8 后，继续实现看板组件、拖拽功能、WebSocket 通信和 Claude CLI 执行。
