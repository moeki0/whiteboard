import { useEffect } from "react";

const RECENT_PROJECT_KEY = "recentProjectId";
const RECENT_PROJECT_SLUG_KEY = "recentProjectSlug";

export function useRecentProject() {
  const getRecentProject = () => {
    return {
      id: localStorage.getItem(RECENT_PROJECT_KEY),
      slug: localStorage.getItem(RECENT_PROJECT_SLUG_KEY)
    };
  };

  const setRecentProject = (projectId: string, projectSlug: string) => {
    localStorage.setItem(RECENT_PROJECT_KEY, projectId);
    localStorage.setItem(RECENT_PROJECT_SLUG_KEY, projectSlug);
  };

  const clearRecentProject = () => {
    localStorage.removeItem(RECENT_PROJECT_KEY);
    localStorage.removeItem(RECENT_PROJECT_SLUG_KEY);
  };

  return {
    getRecentProject,
    setRecentProject,
    clearRecentProject
  };
}

export function useTrackProjectAccess(projectId: string | null, projectSlug: string | null) {
  const { setRecentProject } = useRecentProject();

  useEffect(() => {
    if (projectId && projectSlug) {
      setRecentProject(projectId, projectSlug);
    }
  }, [projectId, projectSlug, setRecentProject]);
}