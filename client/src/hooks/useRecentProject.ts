import { useEffect } from "react";

const RECENT_PROJECT_KEY = "recentProjectId";
const RECENT_PROJECT_SLUG_KEY = "recentProjectSlug";

export function useRecentProject() {
  const isLocalStorageAvailable = () => {
    try {
      const testKey = '__test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  };

  const getRecentProject = () => {
    if (!isLocalStorageAvailable()) {
      return { id: null, slug: null };
    }
    try {
      return {
        id: localStorage.getItem(RECENT_PROJECT_KEY),
        slug: localStorage.getItem(RECENT_PROJECT_SLUG_KEY)
      };
    } catch {
      return { id: null, slug: null };
    }
  };

  const setRecentProject = (projectId: string, projectSlug: string) => {
    if (!isLocalStorageAvailable()) return;
    try {
      localStorage.setItem(RECENT_PROJECT_KEY, projectId);
      localStorage.setItem(RECENT_PROJECT_SLUG_KEY, projectSlug);
    } catch (error) {
      console.warn('Failed to save recent project:', error);
    }
  };

  const clearRecentProject = () => {
    if (!isLocalStorageAvailable()) return;
    try {
      localStorage.removeItem(RECENT_PROJECT_KEY);
      localStorage.removeItem(RECENT_PROJECT_SLUG_KEY);
    } catch (error) {
      console.warn('Failed to clear recent project:', error);
    }
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