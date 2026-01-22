import { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { KanbanBoard } from './components/KanbanBoard';
import { TaskDetail } from './components/TaskDetail';
import { ProjectSelector } from './components/ProjectSelector';
import { useAppStore } from './stores/appStore';
import { DEFAULT_LANES } from '@antiwarden/shared';
import type { Task } from '@antiwarden/shared';
import type { ProjectRef } from './api/projects';
import { fetchProjectData } from './api/projects';
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
  } = useAppStore();

  const [loading, setLoading] = useState(false);

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

  const handleAddTask = () => {
    // TODO: Open task creation modal
    console.log('Add task clicked');
  };

  return (
    <Layout
      projectName={currentProject.name}
      sidebarOpen={sidebarOpen}
      sidebarTitle={selectedTask ? '任务详情' : undefined}
      onSidebarClose={closeSidebar}
      onBackToProjects={handleBackToProjects}
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
      {loading ? (
        <div className="loading-state">加载项目数据...</div>
      ) : (
        <KanbanBoard
          lanes={lanes}
          tasks={tasks}
          selectedTaskId={selectedTaskId || undefined}
          onTaskClick={handleTaskClick}
          onAddTask={handleAddTask}
        />
      )}
    </Layout>
  );
}

export default App;
