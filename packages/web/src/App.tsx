import { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { KanbanBoard } from './components/KanbanBoard';
import { TaskDetail } from './components/TaskDetail';
import { TaskForm } from './components/TaskForm';
import { ProjectSelector } from './components/ProjectSelector';
import { SettingsModal } from './components/SettingsModal';
import { ConnectionProvider } from './context/ConnectionContext';
import { useAppStore } from './stores/appStore';
import { DEFAULT_LANES } from '@clawwarden/shared';
import type { Task } from '@clawwarden/shared';
import type { ProjectRef } from './api/projects';
import { fetchProjectData, fetchLaneConfigs, createTask } from './api/projects';
import { connectionManager } from './services/ConnectionManager';
import './index.css';

function App() {
  const {
    selectedTaskId,
    sidebarOpen,
    selectTask,
    closeSidebar,
    currentProject,
    setCurrentProject,
    projectData,
    setProjectData,
    setLaneConfigs,
    addTask,
    moveTask,
    syncTaskUpdate,
    laneConfigs,
  } = useAppStore();

  const [loading, setLoading] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Listen to global WebSocket messages for status updates
  useEffect(() => {
    const unsubscribe = connectionManager.subscribe('*', (message) => {
      if (message.type === 'task_status' && message.taskId) {
        syncTaskUpdate(message.taskId, {
          status: message.status as Task['status'],
          laneId: message.laneId,
        });
      } else if (message.type === 'project-update' && message.data) {
        // Full project refresh from server-side file watcher
        console.log('[WebSocket] Received project-update', message.projectId);
        setProjectData(message.data);
      }
    });
    return unsubscribe;
  }, [syncTaskUpdate, setProjectData]);

  // Load project data when a project is selected
  useEffect(() => {
    if (currentProject) {
      loadProjectData(currentProject.id);

      // Subscribe to real-time updates for this project
      connectionManager.subscribeToProject(currentProject.id);
    } else {
      connectionManager.subscribeToProject(null);
    }
  }, [currentProject?.id]);

  const loadProjectData = async (projectId: string) => {
    try {
      setLoading(true);
      const [{ data }, laneConfigs] = await Promise.all([
        fetchProjectData(projectId),
        fetchLaneConfigs(projectId)
      ]);
      setProjectData(data);
      setLaneConfigs(laneConfigs);
    } catch (err) {
      console.error('Failed to load project data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectProject = (project: ProjectRef) => {
    setCurrentProject(project);
  };

  const handleBackToProjects = () => {
    setCurrentProject(null);
    setProjectData(null);
  };

  const handleAddTask = (laneId: string) => {
    // Store the target laneId for task creation
    setShowTaskForm(true);
    (window as any).targetLaneId = laneId;
  };

  const handleCreateTask = async (taskData: { title: string; description: string; prompt: string; autoExecute?: boolean }) => {
    if (!currentProject) return;

    // Get the target laneId (default to 'plan' if not set)
    const targetLaneId = (window as any).targetLaneId || 'plan';
    // Clear the stored laneId
    delete (window as any).targetLaneId;

    try {
      const newTask = await createTask(currentProject.id, {
        ...taskData,
        laneId: targetLaneId,
      });
      addTask(newTask);
      setShowTaskForm(false);
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  };

  // Show project selector if no project is selected
  if (!currentProject) {
    return <ProjectSelector onSelectProject={handleSelectProject} />;
  }

  const tasks: Task[] = projectData?.tasks || [];
  const lanes = laneConfigs ? Object.entries(laneConfigs).map(([id, cfg]) => ({
    id,
    name: cfg.name,
    color: cfg.color,
    order: cfg.order || 0
  })).sort((a, b) => a.order - b.order) : (projectData?.lanes || DEFAULT_LANES);
  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  const handleTaskClick = (task: Task) => {
    selectTask(task.id);
  };

  return (
    <ConnectionProvider>
      <Layout
        projectName={currentProject.name}
        sidebarOpen={sidebarOpen}
        sidebarTitle={selectedTask ? `任务ID： #${selectedTask.id}` : undefined}
        onSidebarClose={closeSidebar}
        onBackToProjects={handleBackToProjects}
        onSettingsClick={() => setShowSettings(true)}
        sidebarWide={!!selectedTask}
        sidebarContent={
          selectedTask ? (
            <TaskDetail
              task={selectedTask}
              projectId={currentProject!.id}
              onStatusChange={(status) => {
                // Update local status immediately
                // In a real app we might rely on the file watcher or refetch
                console.log('Task status changed:', status);
              }}
            />
          ) : null
        }
      >
        {loading ? (
          <div className="loading-state">加载项目数据...</div>
        ) : (
          <KanbanBoard
            lanes={lanes}
            tasks={tasks}
            selectedTaskId={selectedTaskId || undefined}
            onTaskClick={handleTaskClick}
            onAddTask={handleAddTask}
            onMoveTask={moveTask}
          />
        )}
      </Layout>

      {showTaskForm && (
        <TaskForm
          onSubmit={handleCreateTask}
          onClose={() => setShowTaskForm(false)}
        />
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </ConnectionProvider>
  );
}

export default App;
