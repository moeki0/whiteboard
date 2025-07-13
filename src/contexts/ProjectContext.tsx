import { createContext, useContext, useState, ReactNode } from "react";

interface ProjectContextValue {
  currentProjectId: string | null;
  updateCurrentProject: (projectId: string | null) => void;
  clearCurrentProject: () => void;
}

const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used within a ProjectProvider");
  }
  return context;
}

interface ProjectProviderProps {
  children: ReactNode;
}

export function ProjectProvider({ children }: ProjectProviderProps) {
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(() => {
    // Get from sessionStorage on initialization
    return sessionStorage.getItem("currentProjectId") || null;
  });

  const updateCurrentProject = (projectId: string | null) => {
    setCurrentProjectId(projectId);
    if (projectId) {
      sessionStorage.setItem("currentProjectId", projectId);
    } else {
      sessionStorage.removeItem("currentProjectId");
    }
  };

  const clearCurrentProject = () => {
    setCurrentProjectId(null);
    sessionStorage.removeItem("currentProjectId");
  };

  const value: ProjectContextValue = {
    currentProjectId,
    updateCurrentProject,
    clearCurrentProject
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}