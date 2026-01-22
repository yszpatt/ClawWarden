import { useState } from 'react';
import { Layout } from './components/Layout';
import { KanbanBoard } from './components/KanbanBoard';
import { TaskDetail } from './components/TaskDetail';
import { useAppStore } from './stores/appStore';
import { DEFAULT_LANES } from '@antiwarden/shared';
import type { Task } from '@antiwarden/shared';
import './index.css';

// Demo data for initial development
const demoTasks: Task[] = [
  {
    id: '1',
    title: '设计登录页面',
    description: '创建一个现代化的登录页面，支持邮箱和社交登录',
    prompt: '请设计一个现代化的登录页面，包含邮箱登录和社交登录选项',
    laneId: 'design',
    order: 0,
    status: 'idle',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: 'user',
  },
  {
    id: '2',
    title: '实现用户认证 API',
    description: '后端用户认证接口，包含注册、登录、密码重置',
    prompt: '请实现用户认证相关的 REST API，包含注册、登录、密码重置功能',
    laneId: 'develop',
    order: 0,
    status: 'running',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: 'user',
  },
  {
    id: '3',
    title: '优化数据库查询',
    description: 'Claude 建议：发现 N+1 查询问题，建议添加索引和批量加载',
    laneId: 'design',
    order: 1,
    status: 'idle',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: 'claude',
  },
];

function App() {
  const { selectedTaskId, sidebarOpen, selectTask, closeSidebar } = useAppStore();
  const [tasks] = useState<Task[]>(demoTasks);

  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  const handleTaskClick = (task: Task) => {
    selectTask(task.id);
  };

  const handleAddTask = () => {
    // TODO: Open task creation modal
    console.log('Add task clicked');
  };

  return (
    <Layout
      projectName="AntiWarden Demo"
      sidebarOpen={sidebarOpen}
      sidebarTitle={selectedTask ? '任务详情' : undefined}
      onSidebarClose={closeSidebar}
      sidebarContent={
        selectedTask ? (
          <TaskDetail
            task={selectedTask}
            onExecute={() => console.log('Execute task:', selectedTask.id)}
            onStop={() => console.log('Stop task:', selectedTask.id)}
          />
        ) : null
      }
    >
      <KanbanBoard
        lanes={DEFAULT_LANES}
        tasks={tasks}
        selectedTaskId={selectedTaskId || undefined}
        onTaskClick={handleTaskClick}
        onAddTask={handleAddTask}
      />
    </Layout>
  );
}

export default App;
