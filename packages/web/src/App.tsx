import { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { KanbanBoard } from './components/KanbanBoard';
import { TaskDetail } from './components/TaskDetail';
import { TaskForm } from './components/TaskForm';
import { ProjectSelector } from './components/ProjectSelector';
import { SettingsModal } from './components/SettingsModal';
import { ConnectionProvider } from './context/ConnectionContext';
import { useAppStore } from './stores/appStore';
import { DEFAULT_LANES } from '@antiwarden/shared';
import type { Task } from '@antiwarden/shared';
import type { ProjectRef } from './api/projects';
import { fetchProjectData, createTask } from './api/projects';
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
    addTask,
    moveTask,
  } = useAppStore();

  const [loading, setLoading] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Load project data when a project is selected
  useEffect(() => {
    if (currentProject) {
      loadProjectData(currentProject.id);
    }
  }, [currentProject?.id]);

  const loadProjectData = async (projectId: string) => {
    try {
      setLoading(true);
      const { data } = await fetchProjectData(projectId);
      setProjectData(data);
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

  const handleAddTask = () => {
    setShowTaskForm(true);
  };

  const handleCreateTask = async (taskData: { title: string; description: string; prompt: string }) => {
    if (!currentProject) return;

    try {
      const newTask = await createTask(currentProject.id, {
        ...taskData,
        laneId: 'design', // Default to design lane
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
  const lanes = projectData?.lanes || DEFAULT_LANES;
  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  const handleTaskClick = (task: Task) => {
    selectTask(task.id);
  };

  return (
    <ConnectionProvider>
      <Layout
        projectName={currentProject.name}
        sidebarOpen={sidebarOpen}
        sidebarTitle={selectedTask ? '任务详情' : undefined}
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
