import { createContext, useContext, useState, ReactNode } from "react";

interface ProjectContextValue {
  currentProjectId: string | null;
  currentProjectName: string | null;
  updateCurrentProject: (projectId: string | null, projectName?: string | null) => void;
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

  const [currentProjectName, setCurrentProjectName] = useState<string | null>(() => {
    // Get from sessionStorage on initialization
    return sessionStorage.getItem("currentProjectName") || null;
  });

  const updateCurrentProject = (projectId: string | null, projectName?: string | null) => {
    setCurrentProjectId(projectId);
    setCurrentProjectName(projectName || null);
    
    if (projectId) {
      sessionStorage.setItem("currentProjectId", projectId);
    } else {
      sessionStorage.removeItem("currentProjectId");
    }
    
    if (projectName) {
      sessionStorage.setItem("currentProjectName", projectName);
    } else {
      sessionStorage.removeItem("currentProjectName");
    }
  };

  const clearCurrentProject = () => {
    setCurrentProjectId(null);
    setCurrentProjectName(null);
    sessionStorage.removeItem("currentProjectId");
    sessionStorage.removeItem("currentProjectName");
  };

  const value: ProjectContextValue = {
    currentProjectId,
    currentProjectName,
    updateCurrentProject,
    clearCurrentProject
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}