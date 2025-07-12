import { createContext, useContext, useState, useEffect } from "react";

const ProjectContext = createContext();

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used within a ProjectProvider");
  }
  return context;
}

export function ProjectProvider({ children }) {
  const [currentProjectId, setCurrentProjectId] = useState(() => {
    // Get from sessionStorage on initialization
    return sessionStorage.getItem("currentProjectId") || null;
  });

  const updateCurrentProject = (projectId) => {
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

  const value = {
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